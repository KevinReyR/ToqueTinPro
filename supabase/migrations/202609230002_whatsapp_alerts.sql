create type private.consent_controller as enum ('RESTAURANT', 'TOQUETIN');
create type private.consent_decision as enum ('GRANTED', 'DECLINED', 'REVOKED');

create table private.whatsapp_opt_in_challenges (
  id bigint generated always as identity primary key,
  public_id uuid not null default extensions.gen_random_uuid() unique,
  tracking_session_id bigint not null references public.tracking_sessions(id) on delete restrict,
  code_digest text not null unique check (length(code_digest) = 64),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '10 minutes')
);
create index whatsapp_challenges_session_idx
  on private.whatsapp_opt_in_challenges(tracking_session_id, expires_at desc);

create table private.customer_contacts (
  id bigint generated always as identity primary key,
  public_id uuid not null default extensions.gen_random_uuid() unique,
  whatsapp_id_ciphertext text not null,
  whatsapp_id_digest text not null unique check (length(whatsapp_id_digest) = 64),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  anonymized_at timestamptz
);

create table private.restaurant_contacts (
  id bigint generated always as identity primary key,
  public_id uuid not null default extensions.gen_random_uuid() unique,
  restaurant_id bigint not null references public.restaurants(id) on delete restrict,
  contact_id bigint not null references private.customer_contacts(id) on delete restrict,
  first_order_id bigint not null references public.orders(id) on delete restrict,
  last_order_id bigint not null references public.orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (restaurant_id, contact_id)
);
create index restaurant_contacts_restaurant_idx on private.restaurant_contacts(restaurant_id, last_seen_at desc);

create table private.contact_consents (
  id bigint generated always as identity primary key,
  contact_id bigint not null references private.customer_contacts(id) on delete restrict,
  controller private.consent_controller not null,
  restaurant_id bigint references public.restaurants(id) on delete restrict,
  decision private.consent_decision not null,
  policy_version text not null check (length(trim(policy_version)) between 1 and 40),
  source_order_id bigint references public.orders(id) on delete restrict,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (controller = 'RESTAURANT' and restaurant_id is not null)
    or (controller = 'TOQUETIN' and restaurant_id is null)
  ),
  check (
    (decision = 'GRANTED' and granted_at is not null and revoked_at is null)
    or (decision = 'DECLINED' and granted_at is null and revoked_at is null)
    or (decision = 'REVOKED' and revoked_at is not null)
  )
);
create unique index contact_restaurant_consent_unique
  on private.contact_consents(contact_id, restaurant_id)
  where controller = 'RESTAURANT';
create unique index contact_toquetin_consent_unique
  on private.contact_consents(contact_id)
  where controller = 'TOQUETIN';

create table private.contact_consent_events (
  id bigint generated always as identity primary key,
  consent_id bigint not null references private.contact_consents(id) on delete restrict,
  contact_id bigint not null references private.customer_contacts(id) on delete restrict,
  controller private.consent_controller not null,
  restaurant_id bigint references public.restaurants(id) on delete restrict,
  decision private.consent_decision not null,
  policy_version text not null,
  source_order_id bigint references public.orders(id) on delete restrict,
  source text not null default 'WHATSAPP',
  occurred_at timestamptz not null default now()
);
create index contact_consent_events_contact_idx on private.contact_consent_events(contact_id, occurred_at desc);

create table private.integration_webhook_events (
  id bigint generated always as identity primary key,
  source text not null,
  event_id text not null,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (source, event_id)
);
create index integration_webhook_events_created_idx on private.integration_webhook_events(created_at);

alter table private.delivery_channels
  add column customer_contact_id bigint references private.customer_contacts(id) on delete restrict;
alter table private.delivery_attempts
  add column provider_message_id text,
  add column provider_status text,
  add column provider_status_at timestamptz;

create or replace function private.sync_delivery_channel_lifetime()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.delivery_channels set
    expires_at = new.expires_at,
    revoked_at = case when new.revoked_at is not null then coalesce(revoked_at, new.revoked_at) else revoked_at end,
    updated_at = now()
  where tracking_session_id = new.id;
  return new;
end;
$$;

create trigger tracking_session_sync_delivery_channels
after update of expires_at, revoked_at on public.tracking_sessions
for each row execute function private.sync_delivery_channel_lifetime();

update private.delivery_channels endpoint set
  expires_at = session.expires_at,
  revoked_at = case when session.revoked_at is not null then coalesce(endpoint.revoked_at, session.revoked_at) else endpoint.revoked_at end,
  updated_at = now()
from public.tracking_sessions session
where session.id = endpoint.tracking_session_id;

create or replace function public.create_whatsapp_challenge(
  requested_tracking_session_id bigint,
  requested_code_digest text,
  requested_expires_at timestamptz
)
returns table(public_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(requested_code_digest) <> 64
    or requested_expires_at <= now()
    or requested_expires_at > now() + interval '10 minutes'
    or not exists (
      select 1 from public.tracking_sessions session
      where session.id = requested_tracking_session_id
        and session.revoked_at is null
        and (session.expires_at is null or session.expires_at > now())
    ) then
    raise exception 'CHALLENGE_INVALID';
  end if;

  update private.whatsapp_opt_in_challenges
  set expires_at = least(expires_at, now())
  where tracking_session_id = requested_tracking_session_id
    and consumed_at is null
    and expires_at > now();

  return query
  insert into private.whatsapp_opt_in_challenges(tracking_session_id, code_digest, expires_at)
  values (requested_tracking_session_id, requested_code_digest, requested_expires_at)
  returning whatsapp_opt_in_challenges.public_id, whatsapp_opt_in_challenges.expires_at;
end;
$$;

create or replace function public.list_delivery_channels(requested_tracking_session_id bigint)
returns table(public_id uuid, channel public.delivery_channel, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select endpoint.public_id, endpoint.channel, endpoint.expires_at
  from private.delivery_channels endpoint
  where endpoint.tracking_session_id = requested_tracking_session_id
    and endpoint.channel in ('WEB_PUSH', 'WHATSAPP')
    and endpoint.revoked_at is null
    and (endpoint.expires_at is null or endpoint.expires_at > now())
  order by endpoint.created_at;
$$;

create or replace function public.consume_whatsapp_challenge(
  requested_code_digest text,
  requested_whatsapp_ciphertext text,
  requested_whatsapp_digest text,
  requested_policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge private.whatsapp_opt_in_challenges;
  contact private.customer_contacts;
  association private.restaurant_contacts;
  session public.tracking_sessions;
  target public.orders;
  restaurant public.restaurants;
  endpoint private.delivery_channels;
begin
  select * into challenge
  from private.whatsapp_opt_in_challenges
  where code_digest = requested_code_digest
  for update;

  if challenge.id is null or challenge.consumed_at is not null or challenge.expires_at <= now() then
    raise exception 'CHALLENGE_INVALID';
  end if;

  select * into session from public.tracking_sessions
  where id = challenge.tracking_session_id
    and revoked_at is null
    and (expires_at is null or expires_at > now());
  if session.id is null then raise exception 'CHALLENGE_INVALID'; end if;

  select * into target from public.orders where id = session.order_id;
  select * into restaurant from public.restaurants where id = target.restaurant_id;

  insert into private.customer_contacts(whatsapp_id_ciphertext, whatsapp_id_digest)
  values (requested_whatsapp_ciphertext, requested_whatsapp_digest)
  on conflict (whatsapp_id_digest) do update set
    whatsapp_id_ciphertext = excluded.whatsapp_id_ciphertext,
    last_seen_at = now(),
    anonymized_at = null
  returning * into contact;

  insert into private.restaurant_contacts(restaurant_id, contact_id, first_order_id, last_order_id)
  values (restaurant.id, contact.id, target.id, target.id)
  on conflict (restaurant_id, contact_id) do update set
    last_order_id = excluded.last_order_id,
    last_seen_at = now()
  returning * into association;

  insert into private.delivery_channels(
    tracking_session_id, channel, token_ciphertext, token_digest, capabilities,
    customer_contact_id, expires_at, revoked_at, last_seen_at, updated_at
  ) values (
    session.id, 'WHATSAPP', requested_whatsapp_ciphertext, requested_whatsapp_digest,
    jsonb_build_object('contactPublicId', contact.public_id, 'policyVersion', requested_policy_version),
    contact.id, session.expires_at, null, now(), now()
  )
  on conflict (tracking_session_id, channel, token_digest) do update set
    token_ciphertext = excluded.token_ciphertext,
    capabilities = excluded.capabilities,
    customer_contact_id = excluded.customer_contact_id,
    expires_at = excluded.expires_at,
    revoked_at = null,
    last_seen_at = now(),
    updated_at = now()
  returning * into endpoint;

  update private.whatsapp_opt_in_challenges set consumed_at = now() where id = challenge.id;

  return jsonb_build_object(
    'channelPublicId', endpoint.public_id,
    'contactContextId', association.public_id,
    'restaurantName', restaurant.name,
    'orderNumber', target.order_number,
    'status', target.status
  );
end;
$$;

create or replace function public.record_whatsapp_consent(
  requested_context_id uuid,
  requested_whatsapp_digest text,
  requested_controller text,
  requested_decision text,
  requested_policy_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  association private.restaurant_contacts;
  consent private.contact_consents;
  consent_restaurant_id bigint;
begin
  if requested_controller not in ('RESTAURANT', 'TOQUETIN')
    or requested_decision not in ('GRANTED', 'DECLINED', 'REVOKED') then
    raise exception 'CONSENT_INVALID';
  end if;
  select link.* into association
  from private.restaurant_contacts link
  join private.customer_contacts contact on contact.id = link.contact_id
  where link.public_id = requested_context_id
    and contact.whatsapp_id_digest = requested_whatsapp_digest;
  if association.id is null then raise exception 'CONSENT_INVALID'; end if;
  consent_restaurant_id := case when requested_controller = 'RESTAURANT' then association.restaurant_id else null end;

  select * into consent
  from private.contact_consents
  where contact_id = association.contact_id
    and controller = requested_controller::private.consent_controller
    and restaurant_id is not distinct from consent_restaurant_id
  for update;

  if consent.id is null then
    insert into private.contact_consents(
      contact_id, controller, restaurant_id, decision, policy_version, source_order_id,
      granted_at, revoked_at
    ) values (
      association.contact_id, requested_controller::private.consent_controller, consent_restaurant_id,
      requested_decision::private.consent_decision, requested_policy_version, association.last_order_id,
      case when requested_decision = 'GRANTED' then now() else null end,
      case when requested_decision = 'REVOKED' then now() else null end
    ) returning * into consent;
  else
    update private.contact_consents set
      decision = requested_decision::private.consent_decision,
      policy_version = requested_policy_version,
      source_order_id = association.last_order_id,
      granted_at = case when requested_decision = 'GRANTED' then now() else null end,
      revoked_at = case when requested_decision = 'REVOKED' then now() else null end,
      updated_at = now()
    where id = consent.id returning * into consent;
  end if;

  insert into private.contact_consent_events(
    consent_id, contact_id, controller, restaurant_id, decision, policy_version, source_order_id
  ) values (
    consent.id, consent.contact_id, consent.controller, consent.restaurant_id,
    consent.decision, consent.policy_version, consent.source_order_id
  );

  return jsonb_build_object('ok', true, 'controller', consent.controller, 'decision', consent.decision);
end;
$$;

create or replace function public.claim_integration_webhook_event(
  requested_source text,
  requested_event_id text,
  requested_received_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_received_at < now() - interval '5 minutes'
    or requested_received_at > now() + interval '1 minute'
    or length(requested_event_id) not between 1 and 200 then
    return false;
  end if;
  insert into private.integration_webhook_events(source, event_id, received_at)
  values (requested_source, requested_event_id, requested_received_at)
  on conflict do nothing;
  return found;
end;
$$;

create or replace function public.revoke_whatsapp_contact(
  requested_whatsapp_digest text,
  requested_scope text default 'ALL'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_contact_id bigint;
  changed integer := 0;
begin
  select id into target_contact_id from private.customer_contacts
  where whatsapp_id_digest = requested_whatsapp_digest;
  if target_contact_id is null then return 0; end if;

  if requested_scope in ('ORDER', 'ALL') then
    update private.delivery_channels set revoked_at = now(), updated_at = now()
    where customer_contact_id = target_contact_id and channel = 'WHATSAPP' and revoked_at is null;
    get diagnostics changed = row_count;
  end if;

  if requested_scope in ('RESTAURANT', 'TOQUETIN', 'ALL') then
    with revoked as (
      update private.contact_consents set
        decision = 'REVOKED', granted_at = null, revoked_at = now(), updated_at = now()
      where contact_id = target_contact_id
        and decision <> 'REVOKED'
        and (requested_scope = 'ALL'
          or (requested_scope = 'RESTAURANT' and controller = 'RESTAURANT')
          or (requested_scope = 'TOQUETIN' and controller = 'TOQUETIN'))
      returning *
    )
    insert into private.contact_consent_events(
      consent_id, contact_id, controller, restaurant_id, decision, policy_version, source_order_id
    )
    select id, contact_id, controller, restaurant_id, decision, policy_version, source_order_id from revoked;
  end if;
  return changed;
end;
$$;

create or replace function public.cleanup_expired_whatsapp_contacts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  with candidates as (
    select contact.id, contact.public_id
    from private.customer_contacts contact
    where contact.anonymized_at is null
      and not exists (
        select 1 from private.contact_consents consent
        where consent.contact_id = contact.id and consent.decision = 'GRANTED'
      )
      and not exists (
        select 1 from private.delivery_channels endpoint
        where endpoint.customer_contact_id = contact.id
          and endpoint.revoked_at is null
          and (endpoint.expires_at is null or endpoint.expires_at > now())
      )
  ), scrubbed_channels as (
    update private.delivery_channels endpoint set
      token_ciphertext = 'ANONYMIZED',
      token_digest = encode(extensions.digest(endpoint.public_id::text, 'sha256'), 'hex'),
      updated_at = now()
    from candidates
    where endpoint.customer_contact_id = candidates.id
    returning endpoint.id
  )
  update private.customer_contacts contact set
    whatsapp_id_ciphertext = 'ANONYMIZED',
    whatsapp_id_digest = encode(extensions.digest(contact.public_id::text, 'sha256'), 'hex'),
    anonymized_at = now(),
    last_seen_at = now()
  from candidates
  where contact.id = candidates.id;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.record_whatsapp_delivery_status(
  requested_attempt_id bigint,
  requested_provider_message_id text,
  requested_status text,
  requested_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update private.delivery_attempts attempt set
    provider_message_id = left(requested_provider_message_id, 240),
    provider_status = left(requested_status, 40),
    provider_status_at = requested_occurred_at,
    updated_at = now()
  from private.delivery_channels endpoint
  where attempt.id = requested_attempt_id
    and endpoint.id = attempt.channel_id
    and endpoint.channel = 'WHATSAPP'
    and (attempt.provider_status_at is null or attempt.provider_status_at <= requested_occurred_at);
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function private.enqueue_order_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tracking_id bigint;
  event public.delivery_event_kind;
begin
  select id into tracking_id from public.tracking_sessions where order_id = new.id and revoked_at is null limit 1;
  if tracking_id is null then return new; end if;

  event := case
    when old.status is distinct from new.status and new.status = 'READY' then 'ORDER_READY'::public.delivery_event_kind
    when old.status is distinct from new.status and new.status in ('DELIVERED', 'CANCELLED') then 'ORDER_CLOSED'::public.delivery_event_kind
    when old.status is distinct from new.status then 'STATUS_CHANGED'::public.delivery_event_kind
    when old.estimated_ready_at is distinct from new.estimated_ready_at then 'ESTIMATE_CHANGED'::public.delivery_event_kind
    else null
  end;
  if event is null then return new; end if;

  insert into private.delivery_outbox(order_id, tracking_session_id, event_kind, order_version, payload)
  values (new.id, tracking_id, event, new.version, jsonb_build_object(
    'orderNumber', new.order_number,
    'publicNonce', (select public_nonce from public.tracking_sessions where id = tracking_id),
    'status', new.status,
    'estimatedReadyAt', new.estimated_ready_at,
    'version', new.version,
    'updatedAt', new.updated_at
  )) on conflict do nothing;

  insert into private.delivery_attempts(outbox_id, channel_id)
  select outbox.id, endpoint.id
  from private.delivery_outbox outbox
  join private.delivery_channels endpoint on endpoint.tracking_session_id = tracking_id
  where outbox.order_id = new.id and outbox.event_kind = event and outbox.order_version = new.version
    and endpoint.revoked_at is null
    and (event <> 'ESTIMATE_CHANGED' or endpoint.channel in ('APNS_LIVE_ACTIVITY', 'FCM_LIVE_UPDATE'))
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.create_whatsapp_challenge(bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.list_delivery_channels(bigint) from public, anon, authenticated;
revoke all on function public.consume_whatsapp_challenge(text, text, text, text) from public, anon, authenticated;
revoke all on function public.record_whatsapp_consent(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_integration_webhook_event(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_whatsapp_contact(text, text) from public, anon, authenticated;
revoke all on function public.record_whatsapp_delivery_status(bigint, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cleanup_expired_whatsapp_contacts() from public, anon, authenticated;
grant execute on function public.create_whatsapp_challenge(bigint, text, timestamptz) to service_role;
grant execute on function public.list_delivery_channels(bigint) to service_role;
grant execute on function public.consume_whatsapp_challenge(text, text, text, text) to service_role;
grant execute on function public.record_whatsapp_consent(uuid, text, text, text, text) to service_role;
grant execute on function public.claim_integration_webhook_event(text, text, timestamptz) to service_role;
grant execute on function public.revoke_whatsapp_contact(text, text) to service_role;
grant execute on function public.record_whatsapp_delivery_status(bigint, text, text, timestamptz) to service_role;
grant execute on function public.cleanup_expired_whatsapp_contacts() to service_role;
