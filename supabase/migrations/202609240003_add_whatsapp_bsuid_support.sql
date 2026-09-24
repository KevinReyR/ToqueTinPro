create type private.whatsapp_identifier_type as enum ('PHONE', 'BSUID');

create table private.customer_contact_identifiers (
  id bigint generated always as identity primary key,
  contact_id bigint not null references private.customer_contacts(id) on delete restrict,
  identifier_type private.whatsapp_identifier_type not null,
  identifier_ciphertext text not null,
  identifier_digest text not null unique check (length(identifier_digest) = 64),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  anonymized_at timestamptz
);

alter table private.customer_contact_identifiers enable row level security;

create index customer_contact_identifiers_contact_idx
  on private.customer_contact_identifiers(contact_id, identifier_type)
  where anonymized_at is null;

insert into private.customer_contact_identifiers (
  contact_id,
  identifier_type,
  identifier_ciphertext,
  identifier_digest,
  created_at,
  last_seen_at
)
select
  contact.id,
  'PHONE',
  contact.whatsapp_id_ciphertext,
  contact.whatsapp_id_digest,
  contact.created_at,
  contact.last_seen_at
from private.customer_contacts as contact
where contact.anonymized_at is null
on conflict (identifier_digest) do nothing;

create or replace function public.consume_whatsapp_challenge_v2(
  requested_code_digest text,
  requested_recipient_ciphertext text,
  requested_recipient_digest text,
  requested_phone_ciphertext text,
  requested_phone_digest text,
  requested_bsuid_ciphertext text,
  requested_bsuid_digest text,
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
  commercial_consent private.contact_consents;
  identifier_id bigint;
  matched_contacts integer;
  identifier_digests text[];
begin
  if length(requested_code_digest) <> 64
    or length(requested_recipient_digest) <> 64
    or length(trim(requested_recipient_ciphertext)) = 0
    or (requested_phone_digest is null) <> (requested_phone_ciphertext is null)
    or (requested_bsuid_digest is null) <> (requested_bsuid_ciphertext is null)
    or (requested_phone_digest is not null and length(requested_phone_digest) <> 64)
    or (requested_bsuid_digest is not null and length(requested_bsuid_digest) <> 64)
    or (requested_phone_digest is null and requested_bsuid_digest is null)
    or requested_recipient_digest not in (
      coalesce(requested_phone_digest, requested_recipient_digest),
      coalesce(requested_bsuid_digest, requested_recipient_digest)
    ) then
    raise exception 'IDENTIFIER_INVALID';
  end if;

  identifier_digests := array_remove(
    array[requested_recipient_digest, requested_phone_digest, requested_bsuid_digest],
    null
  );

  select candidate.* into challenge
  from private.whatsapp_opt_in_challenges as candidate
  where candidate.code_digest = requested_code_digest
  for update;

  if challenge.id is null or challenge.consumed_at is not null or challenge.expires_at <= now() then
    raise exception 'CHALLENGE_INVALID';
  end if;

  select candidate.* into session
  from public.tracking_sessions as candidate
  where candidate.id = challenge.tracking_session_id
    and candidate.revoked_at is null
    and (candidate.expires_at is null or candidate.expires_at > now());
  if session.id is null then raise exception 'CHALLENGE_INVALID'; end if;

  select candidate.* into target
  from public.orders as candidate
  where candidate.id = session.order_id;

  select candidate.* into restaurant
  from public.restaurants as candidate
  where candidate.id = target.restaurant_id;

  select count(distinct candidate.id) into matched_contacts
  from private.customer_contacts as candidate
  where candidate.whatsapp_id_digest = any(identifier_digests)
    or exists (
      select 1
      from private.customer_contact_identifiers as identifier
      where identifier.contact_id = candidate.id
        and identifier.identifier_digest = any(identifier_digests)
    );

  if matched_contacts > 1 then raise exception 'CONTACT_CONFLICT'; end if;

  select candidate.* into contact
  from private.customer_contacts as candidate
  where candidate.whatsapp_id_digest = any(identifier_digests)
    or exists (
      select 1
      from private.customer_contact_identifiers as identifier
      where identifier.contact_id = candidate.id
        and identifier.identifier_digest = any(identifier_digests)
    )
  order by
    case when candidate.whatsapp_id_digest = requested_recipient_digest then 0 else 1 end,
    candidate.id
  limit 1
  for update;

  if contact.id is null then
    insert into private.customer_contacts as customer_contact (
      whatsapp_id_ciphertext,
      whatsapp_id_digest
    ) values (
      requested_recipient_ciphertext,
      requested_recipient_digest
    )
    returning customer_contact.* into contact;
  else
    update private.customer_contacts as customer_contact set
      whatsapp_id_ciphertext = requested_recipient_ciphertext,
      whatsapp_id_digest = requested_recipient_digest,
      last_seen_at = now(),
      anonymized_at = null
    where customer_contact.id = contact.id
    returning customer_contact.* into contact;
  end if;

  if requested_phone_digest is not null then
    identifier_id := null;
    insert into private.customer_contact_identifiers as identifier (
      contact_id,
      identifier_type,
      identifier_ciphertext,
      identifier_digest
    ) values (
      contact.id,
      'PHONE',
      requested_phone_ciphertext,
      requested_phone_digest
    )
    on conflict (identifier_digest) do update set
      identifier_ciphertext = excluded.identifier_ciphertext,
      last_seen_at = now(),
      anonymized_at = null
    where identifier.contact_id = excluded.contact_id
    returning identifier.id into identifier_id;
    if identifier_id is null then raise exception 'CONTACT_CONFLICT'; end if;
  end if;

  if requested_bsuid_digest is not null then
    identifier_id := null;
    insert into private.customer_contact_identifiers as identifier (
      contact_id,
      identifier_type,
      identifier_ciphertext,
      identifier_digest
    ) values (
      contact.id,
      'BSUID',
      requested_bsuid_ciphertext,
      requested_bsuid_digest
    )
    on conflict (identifier_digest) do update set
      identifier_ciphertext = excluded.identifier_ciphertext,
      last_seen_at = now(),
      anonymized_at = null
    where identifier.contact_id = excluded.contact_id
    returning identifier.id into identifier_id;
    if identifier_id is null then raise exception 'CONTACT_CONFLICT'; end if;
  end if;

  insert into private.restaurant_contacts as restaurant_contact (
    restaurant_id,
    contact_id,
    first_order_id,
    last_order_id
  ) values (
    restaurant.id,
    contact.id,
    target.id,
    target.id
  )
  on conflict (restaurant_id, contact_id) do update set
    last_order_id = excluded.last_order_id,
    last_seen_at = now()
  returning restaurant_contact.* into association;

  insert into private.delivery_channels as delivery_channel (
    tracking_session_id,
    channel,
    token_ciphertext,
    token_digest,
    capabilities,
    customer_contact_id,
    expires_at,
    revoked_at,
    last_seen_at,
    updated_at
  ) values (
    session.id,
    'WHATSAPP',
    requested_recipient_ciphertext,
    requested_recipient_digest,
    jsonb_build_object(
      'contactPublicId', contact.public_id,
      'policyVersion', requested_policy_version,
      'recipientType', case
        when requested_recipient_digest = requested_bsuid_digest then 'BSUID'
        else 'PHONE'
      end
    ),
    contact.id,
    session.expires_at,
    null,
    now(),
    now()
  )
  on conflict (tracking_session_id, channel, token_digest) do update set
    token_ciphertext = excluded.token_ciphertext,
    capabilities = excluded.capabilities,
    customer_contact_id = excluded.customer_contact_id,
    expires_at = excluded.expires_at,
    revoked_at = null,
    last_seen_at = now(),
    updated_at = now()
  returning delivery_channel.* into endpoint;

  select consent.* into commercial_consent
  from private.contact_consents as consent
  where consent.contact_id = contact.id
    and consent.controller = 'TOQUETIN'
    and consent.restaurant_id is null;

  update private.whatsapp_opt_in_challenges as consumed_challenge
  set consumed_at = now()
  where consumed_challenge.id = challenge.id;

  return jsonb_build_object(
    'channelPublicId', endpoint.public_id,
    'contactContextId', association.public_id,
    'restaurantName', restaurant.name,
    'orderNumber', target.order_number,
    'status', target.status,
    'commercialConsentDecision', commercial_consent.decision
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
  from private.restaurant_contacts as link
  join private.customer_contacts as contact on contact.id = link.contact_id
  where link.public_id = requested_context_id
    and (
      contact.whatsapp_id_digest = requested_whatsapp_digest
      or exists (
        select 1
        from private.customer_contact_identifiers as identifier
        where identifier.contact_id = contact.id
          and identifier.identifier_digest = requested_whatsapp_digest
      )
    );
  if association.id is null then raise exception 'CONSENT_INVALID'; end if;

  consent_restaurant_id := case
    when requested_controller = 'RESTAURANT' then association.restaurant_id
    else null
  end;

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
  select contact.id into target_contact_id
  from private.customer_contacts as contact
  where contact.whatsapp_id_digest = requested_whatsapp_digest
    or exists (
      select 1
      from private.customer_contact_identifiers as identifier
      where identifier.contact_id = contact.id
        and identifier.identifier_digest = requested_whatsapp_digest
    )
  limit 1;

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
    from private.customer_contacts as contact
    where contact.anonymized_at is null
      and not exists (
        select 1 from private.contact_consents as consent
        where consent.contact_id = contact.id and consent.decision = 'GRANTED'
      )
      and not exists (
        select 1 from private.delivery_channels as endpoint
        where endpoint.customer_contact_id = contact.id
          and endpoint.revoked_at is null
          and (endpoint.expires_at is null or endpoint.expires_at > now())
      )
  ), scrubbed_identifiers as (
    update private.customer_contact_identifiers as identifier set
      identifier_ciphertext = 'ANONYMIZED',
      identifier_digest = encode(
        extensions.digest(identifier.id::text || ':' || identifier.contact_id::text, 'sha256'),
        'hex'
      ),
      anonymized_at = now(),
      last_seen_at = now()
    from candidates
    where identifier.contact_id = candidates.id
    returning identifier.id
  ), scrubbed_channels as (
    update private.delivery_channels as endpoint set
      token_ciphertext = 'ANONYMIZED',
      token_digest = encode(extensions.digest(endpoint.public_id::text, 'sha256'), 'hex'),
      updated_at = now()
    from candidates
    where endpoint.customer_contact_id = candidates.id
    returning endpoint.id
  )
  update private.customer_contacts as contact set
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

revoke all on table private.customer_contact_identifiers from public, anon, authenticated;
revoke all on function public.consume_whatsapp_challenge_v2(
  text, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.record_whatsapp_consent(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.revoke_whatsapp_contact(text, text)
  from public, anon, authenticated;
revoke all on function public.cleanup_expired_whatsapp_contacts()
  from public, anon, authenticated;

grant execute on function public.consume_whatsapp_challenge_v2(
  text, text, text, text, text, text, text, text
) to service_role;
grant execute on function public.record_whatsapp_consent(uuid, text, text, text, text)
  to service_role;
grant execute on function public.revoke_whatsapp_contact(text, text)
  to service_role;
grant execute on function public.cleanup_expired_whatsapp_contacts()
  to service_role;
