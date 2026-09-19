create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.order_status as enum ('RECEIVED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED');
create type public.delivery_channel as enum ('WEB_PUSH', 'APNS_LIVE_ACTIVITY', 'FCM_LIVE_UPDATE');
create type public.delivery_event_kind as enum ('TRACKING_STARTED', 'STATUS_CHANGED', 'ESTIMATE_CHANGED', 'ORDER_READY', 'ORDER_CLOSED', 'TRACKING_REVOKED');
create type private.delivery_status as enum ('PENDING', 'SENT', 'FAILED', 'EXPIRED');

create table public.organizations (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.restaurants (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  timezone text not null default 'America/Bogota',
  operational_cutoff time not null default '00:00',
  created_at timestamptz not null default now()
);
create index restaurants_organization_idx on public.restaurants(organization_id);

create table public.restaurant_users (
  restaurant_id bigint not null references public.restaurants(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (restaurant_id, auth_user_id)
);
create index restaurant_users_auth_idx on public.restaurant_users(auth_user_id) where active;

create table public.orders (
  id bigint generated always as identity primary key,
  restaurant_id bigint not null references public.restaurants(id) on delete restrict,
  operational_day_started_at timestamptz not null,
  operational_day_ended_at timestamptz not null,
  order_number text not null check (length(trim(order_number)) between 1 and 24),
  order_number_normalized text not null,
  status public.order_status not null default 'RECEIVED',
  estimated_ready_at timestamptz not null,
  estimate_updated_at timestamptz not null default now(),
  pickup_instructions text check (pickup_instructions is null or length(pickup_instructions) <= 240),
  cancellation_reason_code text,
  cancellation_reason_text text,
  preparing_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_operational_day_valid check (operational_day_started_at < operational_day_ended_at),
  constraint orders_number_unique unique (restaurant_id, operational_day_started_at, order_number_normalized),
  constraint orders_cancellation_valid check (
    (status <> 'CANCELLED' and cancellation_reason_code is null and cancellation_reason_text is null and cancelled_at is null)
    or
    (status = 'CANCELLED' and cancellation_reason_code is not null and cancelled_at is not null)
  )
);
create index orders_dashboard_idx on public.orders(restaurant_id, operational_day_started_at, status, created_at desc);
create index orders_ready_idx on public.orders(restaurant_id, ready_at);
alter publication supabase_realtime add table public.orders;

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete restrict,
  restaurant_id bigint not null references public.restaurants(id) on delete restrict,
  from_status public.order_status,
  to_status public.order_status not null,
  reason_code text,
  reason_text text,
  changed_by uuid not null references auth.users(id) on delete restrict,
  occurred_at timestamptz not null default now()
);
create index order_history_order_idx on public.order_status_history(order_id, occurred_at);
create index order_history_metrics_idx on public.order_status_history(restaurant_id, to_status, occurred_at);

create table public.tracking_sessions (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete restrict,
  public_nonce uuid not null default extensions.gen_random_uuid() unique,
  token_version smallint not null default 1,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index tracking_active_order_idx on public.tracking_sessions(order_id) where revoked_at is null;

create table private.delivery_channels (
  id bigint generated always as identity primary key,
  public_id uuid not null default extensions.gen_random_uuid() unique,
  tracking_session_id bigint not null references public.tracking_sessions(id) on delete restrict,
  channel public.delivery_channel not null,
  token_ciphertext text not null,
  token_digest text not null check (length(token_digest) = 64),
  capabilities jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tracking_session_id, channel, token_digest)
);
create index delivery_channels_tracking_idx on private.delivery_channels(tracking_session_id) where revoked_at is null;

create table private.delivery_outbox (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete restrict,
  tracking_session_id bigint not null references public.tracking_sessions(id) on delete restrict,
  event_kind public.delivery_event_kind not null,
  order_version bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (order_id, event_kind, order_version)
);
create index delivery_outbox_created_idx on private.delivery_outbox(created_at);

create table private.delivery_attempts (
  id bigint generated always as identity primary key,
  outbox_id bigint not null references private.delivery_outbox(id) on delete restrict,
  channel_id bigint not null references private.delivery_channels(id) on delete restrict,
  status private.delivery_status not null default 'PENDING',
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  latency_ms integer,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outbox_id, channel_id)
);
create index delivery_attempts_pending_idx on private.delivery_attempts(status, next_attempt_at) where status in ('PENDING', 'FAILED');

create or replace function public.is_restaurant_member(requested_restaurant_id bigint)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.restaurant_users membership
    where membership.restaurant_id = requested_restaurant_id
      and membership.auth_user_id = auth.uid()
      and membership.active
  );
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
  select outbox.id, channel.id
  from private.delivery_outbox outbox
  join private.delivery_channels channel on channel.tracking_session_id = tracking_id
  where outbox.order_id = new.id and outbox.event_kind = event and outbox.order_version = new.version
    and channel.revoked_at is null
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.create_order(
  requested_restaurant_id bigint,
  requested_order_number text,
  requested_estimated_minutes integer,
  requested_pickup_instructions text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  restaurant public.restaurants;
  created_order public.orders;
  created_session public.tracking_sessions;
  local_now timestamp;
  local_start timestamp;
  day_start timestamptz;
  day_end timestamptz;
begin
  if auth.uid() is null or not public.is_restaurant_member(requested_restaurant_id) then raise exception 'FORBIDDEN'; end if;
  if length(trim(requested_order_number)) not between 1 and 24 or requested_estimated_minutes not between 1 and 240 then raise exception 'VALIDATION_ERROR'; end if;
  select * into restaurant from public.restaurants where id = requested_restaurant_id;
  local_now := now() at time zone restaurant.timezone;
  local_start := date_trunc('day', local_now) + restaurant.operational_cutoff;
  if local_now < local_start then local_start := local_start - interval '1 day'; end if;
  day_start := local_start at time zone restaurant.timezone;
  day_end := (local_start + interval '1 day') at time zone restaurant.timezone;

  insert into public.orders(
    restaurant_id, operational_day_started_at, operational_day_ended_at,
    order_number, order_number_normalized, estimated_ready_at,
    pickup_instructions, created_by, updated_by
  ) values (
    requested_restaurant_id, day_start, day_end, trim(requested_order_number), lower(trim(requested_order_number)),
    now() + make_interval(mins => requested_estimated_minutes), nullif(trim(requested_pickup_instructions), ''), auth.uid(), auth.uid()
  ) returning * into created_order;

  insert into public.order_status_history(order_id, restaurant_id, from_status, to_status, changed_by)
  values (created_order.id, created_order.restaurant_id, null, 'RECEIVED', auth.uid());
  insert into public.tracking_sessions(order_id) values (created_order.id) returning * into created_session;

  return jsonb_build_object('orderId', created_order.id, 'publicNonce', created_session.public_nonce, 'orderNumber', created_order.order_number, 'estimatedReadyAt', created_order.estimated_ready_at);
exception when unique_violation then
  raise exception 'DUPLICATE_ORDER_NUMBER';
end;
$$;

create trigger orders_enqueue_delivery
after update of status, estimated_ready_at on public.orders
for each row execute function private.enqueue_order_delivery();

create or replace function public.transition_order(
  requested_order_id bigint,
  expected_status public.order_status,
  target_status public.order_status
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders;
begin
  select * into current_order from public.orders where id = requested_order_id for update;
  if current_order.id is null or not public.is_restaurant_member(current_order.restaurant_id) then
    raise exception 'FORBIDDEN';
  end if;
  if current_order.status <> expected_status then raise exception 'CONFLICT'; end if;
  if not ((expected_status = 'RECEIVED' and target_status = 'PREPARING') or (expected_status = 'PREPARING' and target_status = 'READY') or (expected_status = 'READY' and target_status = 'DELIVERED')) then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.orders set
    status = target_status,
    preparing_at = case when target_status = 'PREPARING' then now() else preparing_at end,
    ready_at = case when target_status = 'READY' then now() else ready_at end,
    delivered_at = case when target_status = 'DELIVERED' then now() else delivered_at end,
    updated_by = auth.uid(), updated_at = now(), version = version + 1
  where id = requested_order_id returning * into current_order;

  insert into public.order_status_history(order_id, restaurant_id, from_status, to_status, changed_by)
  values (current_order.id, current_order.restaurant_id, expected_status, target_status, auth.uid());

  if target_status = 'DELIVERED' then
    update public.tracking_sessions set expires_at = now() + interval '24 hours' where order_id = current_order.id and revoked_at is null;
  end if;
  return current_order;
end;
$$;

create or replace function public.cancel_order(
  requested_order_id bigint,
  expected_status public.order_status,
  requested_reason_code text,
  requested_reason_text text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders;
  normalized_text text := nullif(trim(requested_reason_text), '');
begin
  select * into current_order from public.orders where id = requested_order_id for update;
  if current_order.id is null or not public.is_restaurant_member(current_order.restaurant_id) then
    raise exception 'FORBIDDEN';
  end if;
  if current_order.status <> expected_status then raise exception 'CONFLICT'; end if;
  if expected_status not in ('RECEIVED', 'PREPARING') then raise exception 'INVALID_TRANSITION'; end if;
  if requested_reason_code not in ('CUSTOMER_REQUEST', 'UNAVAILABLE_ITEM', 'ORDER_ERROR', 'OPERATIONAL_ISSUE', 'OTHER') then
    raise exception 'INVALID_CANCELLATION_REASON';
  end if;
  if requested_reason_code = 'OTHER' and normalized_text is null then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
  if normalized_text is not null and length(normalized_text) > 160 then raise exception 'VALIDATION_ERROR'; end if;

  update public.orders set
    status = 'CANCELLED',
    cancellation_reason_code = requested_reason_code,
    cancellation_reason_text = case when requested_reason_code = 'OTHER' then normalized_text else null end,
    cancelled_at = now(), updated_by = auth.uid(), updated_at = now(), version = version + 1
  where id = requested_order_id returning * into current_order;

  insert into public.order_status_history(order_id, restaurant_id, from_status, to_status, reason_code, reason_text, changed_by)
  values (current_order.id, current_order.restaurant_id, expected_status, 'CANCELLED', requested_reason_code, current_order.cancellation_reason_text, auth.uid());
  update public.tracking_sessions set expires_at = now() + interval '24 hours' where order_id = current_order.id and revoked_at is null;
  return current_order;
end;
$$;

create or replace function public.update_order_estimate(
  requested_order_id bigint,
  expected_version bigint,
  requested_estimated_ready_at timestamptz
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders;
begin
  select * into current_order from public.orders where id = requested_order_id for update;
  if current_order.id is null or not public.is_restaurant_member(current_order.restaurant_id) then raise exception 'FORBIDDEN'; end if;
  if current_order.version <> expected_version then raise exception 'CONFLICT'; end if;
  if current_order.status not in ('RECEIVED', 'PREPARING') then raise exception 'INVALID_TRANSITION'; end if;
  if requested_estimated_ready_at <= now() or requested_estimated_ready_at > now() + interval '4 hours' then raise exception 'VALIDATION_ERROR'; end if;
  update public.orders set estimated_ready_at = requested_estimated_ready_at, estimate_updated_at = now(),
    updated_by = auth.uid(), updated_at = now(), version = version + 1
  where id = requested_order_id returning * into current_order;
  return current_order;
end;
$$;

create or replace function public.public_tracking_snapshot(requested_nonce uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'restaurantName', restaurant.name,
    'orderNumber', target.order_number,
    'status', target.status,
    'estimatedReadyAt', target.estimated_ready_at,
    'estimateUpdatedAt', target.estimate_updated_at,
    'pickupInstructions', target.pickup_instructions,
    'cancellationReason', coalesce(target.cancellation_reason_text, case target.cancellation_reason_code
      when 'CUSTOMER_REQUEST' then 'Solicitud del cliente'
      when 'UNAVAILABLE_ITEM' then 'Producto no disponible'
      when 'ORDER_ERROR' then 'Error en el pedido'
      when 'OPERATIONAL_ISSUE' then 'Problema operativo'
      else null
    end),
    'serverTime', now(),
    'version', target.version,
    'activityExpiresAt', least(now() + interval '8 hours', coalesce(session.expires_at, now() + interval '8 hours')),
    'lastUpdatedAt', target.updated_at
  )
  from public.tracking_sessions session
  join public.orders target on target.id = session.order_id
  join public.restaurants restaurant on restaurant.id = target.restaurant_id
  where session.public_nonce = requested_nonce
    and session.revoked_at is null
    and (session.expires_at is null or session.expires_at > now());
$$;

create or replace function public.register_delivery_channel(
  requested_tracking_session_id bigint,
  requested_channel public.delivery_channel,
  requested_ciphertext text,
  requested_digest text,
  requested_capabilities jsonb,
  requested_expires_at timestamptz
)
returns table(public_id uuid, channel public.delivery_channel, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  insert into private.delivery_channels(tracking_session_id, channel, token_ciphertext, token_digest, capabilities, expires_at, revoked_at, last_seen_at, updated_at)
  values (requested_tracking_session_id, requested_channel, requested_ciphertext, requested_digest, requested_capabilities, requested_expires_at, null, now(), now())
  on conflict (tracking_session_id, channel, token_digest) do update set
    token_ciphertext = excluded.token_ciphertext,
    capabilities = excluded.capabilities,
    expires_at = excluded.expires_at,
    revoked_at = null,
    last_seen_at = now(),
    updated_at = now()
  returning delivery_channels.public_id, delivery_channels.channel, delivery_channels.expires_at;
end;
$$;

create or replace function public.refresh_delivery_channel_token(
  requested_public_id uuid,
  requested_tracking_session_id bigint,
  requested_ciphertext text,
  requested_digest text,
  requested_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update private.delivery_channels set
    token_ciphertext = requested_ciphertext,
    token_digest = requested_digest,
    expires_at = requested_expires_at,
    last_seen_at = now(),
    updated_at = now()
  where public_id = requested_public_id
    and tracking_session_id = requested_tracking_session_id
    and revoked_at is null;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.disable_delivery_channel(
  requested_public_id uuid,
  requested_tracking_session_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update private.delivery_channels set revoked_at = now(), updated_at = now()
  where public_id = requested_public_id
    and tracking_session_id = requested_tracking_session_id
    and revoked_at is null;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.claim_delivery_attempts(requested_limit integer default 25)
returns table(
  attempt_id bigint,
  channel public.delivery_channel,
  token_ciphertext text,
  capabilities jsonb,
  event_kind public.delivery_event_kind,
  payload jsonb,
  attempt_count smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select attempt.id
    from private.delivery_attempts attempt
    where attempt.status in ('PENDING', 'FAILED')
      and attempt.next_attempt_at <= now()
      and attempt.attempt_count < 3
    order by attempt.next_attempt_at
    for update skip locked
    limit greatest(1, least(requested_limit, 100))
  ), updated as (
    update private.delivery_attempts attempt
    set attempt_count = attempt.attempt_count + 1, status = 'PENDING', updated_at = now()
    from claimed
    where attempt.id = claimed.id
    returning attempt.*
  )
  select updated.id, endpoint.channel, endpoint.token_ciphertext, endpoint.capabilities,
    outbox.event_kind, outbox.payload, updated.attempt_count
  from updated
  join private.delivery_channels endpoint on endpoint.id = updated.channel_id
  join private.delivery_outbox outbox on outbox.id = updated.outbox_id
  where endpoint.revoked_at is null
    and (endpoint.expires_at is null or endpoint.expires_at > now());
end;
$$;

create or replace function public.complete_delivery_attempt(
  requested_attempt_id bigint,
  requested_success boolean,
  requested_latency_ms integer,
  requested_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.delivery_attempts
  set status = case
      when requested_success then 'SENT'::private.delivery_status
      when attempt_count >= 3 then 'EXPIRED'::private.delivery_status
      else 'FAILED'::private.delivery_status
    end,
    sent_at = case when requested_success then now() else null end,
    latency_ms = requested_latency_ms,
    last_error_code = case when requested_success then null else left(coalesce(requested_error_code, 'UNKNOWN'), 120) end,
    next_attempt_at = case when attempt_count = 1 then now() + interval '1 minute' else now() + interval '5 minutes' end,
    updated_at = now()
  where id = requested_attempt_id;
end;
$$;

alter table public.organizations enable row level security;
alter table public.restaurants enable row level security;
alter table public.restaurant_users enable row level security;
alter table public.orders enable row level security;
alter table public.order_status_history enable row level security;
alter table public.tracking_sessions enable row level security;

create policy restaurants_member_select on public.restaurants for select to authenticated using (public.is_restaurant_member(id));
create policy memberships_self_select on public.restaurant_users for select to authenticated using (auth_user_id = auth.uid() and active);
create policy orders_member_select on public.orders for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy orders_member_insert on public.orders for insert to authenticated with check (public.is_restaurant_member(restaurant_id) and created_by = auth.uid() and updated_by = auth.uid());
create policy orders_member_update on public.orders for update to authenticated using (public.is_restaurant_member(restaurant_id)) with check (public.is_restaurant_member(restaurant_id));
create policy history_member_select on public.order_status_history for select to authenticated using (public.is_restaurant_member(restaurant_id));
create policy tracking_member_select on public.tracking_sessions for select to authenticated using (exists (select 1 from public.orders where orders.id = tracking_sessions.order_id and public.is_restaurant_member(orders.restaurant_id)));

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on function public.public_tracking_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.register_delivery_channel(bigint, public.delivery_channel, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_delivery_channel_token(uuid, bigint, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.disable_delivery_channel(uuid, bigint) from public, anon, authenticated;
revoke all on function public.claim_delivery_attempts(integer) from public, anon, authenticated;
revoke all on function public.complete_delivery_attempt(bigint, boolean, integer, text) from public, anon, authenticated;
revoke all on function public.create_order(bigint, text, integer, text) from public, anon, authenticated;
revoke all on function public.transition_order(bigint, public.order_status, public.order_status) from public, anon, authenticated;
revoke all on function public.cancel_order(bigint, public.order_status, text, text) from public, anon, authenticated;
revoke all on function public.update_order_estimate(bigint, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.public_tracking_snapshot(uuid) to service_role;
grant execute on function public.register_delivery_channel(bigint, public.delivery_channel, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.refresh_delivery_channel_token(uuid, bigint, text, text, timestamptz) to service_role;
grant execute on function public.disable_delivery_channel(uuid, bigint) to service_role;
grant execute on function public.claim_delivery_attempts(integer) to service_role;
grant execute on function public.complete_delivery_attempt(bigint, boolean, integer, text) to service_role;
grant execute on function public.transition_order(bigint, public.order_status, public.order_status) to authenticated;
grant execute on function public.cancel_order(bigint, public.order_status, text, text) to authenticated;
grant execute on function public.update_order_estimate(bigint, bigint, timestamptz) to authenticated;
grant execute on function public.create_order(bigint, text, integer, text) to authenticated;
grant select on public.orders to authenticated;
grant select on public.restaurants, public.restaurant_users, public.order_status_history, public.tracking_sessions to authenticated;
revoke delete on public.orders, public.order_status_history from anon, authenticated;
