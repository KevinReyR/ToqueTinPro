create table public.nfc_tags (
  id bigint generated always as identity primary key,
  restaurant_id bigint not null references public.restaurants(id) on delete restrict,
  label text not null check (length(trim(label)) between 1 and 48),
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, label)
);

create index nfc_tags_restaurant_idx on public.nfc_tags(restaurant_id, active, label);

create table public.nfc_tag_assignments (
  id bigint generated always as identity primary key,
  nfc_tag_id bigint not null references public.nfc_tags(id) on delete restrict,
  order_id bigint not null references public.orders(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  consumed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  constraint nfc_assignment_end_valid check (
    (consumed_at is null and released_at is null and release_reason is null)
    or (consumed_at is not null and released_at is null and release_reason = 'CONSUMED')
    or (consumed_at is null and released_at is not null and release_reason in ('REASSIGNED', 'TAG_DISABLED', 'TOKEN_ROTATED', 'ORDER_UNAVAILABLE'))
  )
);

create unique index nfc_assignment_active_tag_idx
  on public.nfc_tag_assignments(nfc_tag_id)
  where consumed_at is null and released_at is null;
create unique index nfc_assignment_active_order_idx
  on public.nfc_tag_assignments(order_id)
  where consumed_at is null and released_at is null;
create index nfc_assignment_order_history_idx
  on public.nfc_tag_assignments(order_id, assigned_at desc);

alter table public.nfc_tags enable row level security;
alter table public.nfc_tag_assignments enable row level security;

create policy nfc_tags_member_select on public.nfc_tags
  for select to authenticated
  using (public.is_restaurant_member(restaurant_id));

create policy nfc_assignments_member_select on public.nfc_tag_assignments
  for select to authenticated
  using (
    exists (
      select 1
      from public.nfc_tags tag
      where tag.id = nfc_tag_assignments.nfc_tag_id
        and public.is_restaurant_member(tag.restaurant_id)
    )
  );

create or replace function public.list_nfc_tags(requested_restaurant_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tags jsonb;
  order_states jsonb;
begin
  if auth.uid() is null or not public.is_restaurant_member(requested_restaurant_id) then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', tag.id,
    'label', tag.label,
    'active', tag.active,
    'createdAt', tag.created_at,
    'assignment', case when assignment.id is null then null else jsonb_build_object(
      'id', assignment.id,
      'orderId', assignment.order_id,
      'orderNumber', target.order_number,
      'assignedAt', assignment.assigned_at
    ) end
  ) order by tag.label, tag.id), '[]'::jsonb)
  into tags
  from public.nfc_tags tag
  left join public.nfc_tag_assignments assignment
    on assignment.nfc_tag_id = tag.id
    and assignment.consumed_at is null
    and assignment.released_at is null
  left join public.orders target on target.id = assignment.order_id
  where tag.restaurant_id = requested_restaurant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'orderId', latest.order_id,
    'tagId', latest.nfc_tag_id,
    'tagLabel', latest.tag_label,
    'status', latest.assignment_status,
    'assignedAt', latest.assigned_at,
    'endedAt', latest.ended_at
  )), '[]'::jsonb)
  into order_states
  from (
    select distinct on (assignment.order_id)
      assignment.order_id,
      assignment.nfc_tag_id,
      tag.label as tag_label,
      assignment.assigned_at,
      coalesce(assignment.consumed_at, assignment.released_at) as ended_at,
      case
        when assignment.consumed_at is not null then 'CONSUMED'
        when assignment.released_at is not null then 'RELEASED'
        else 'PENDING'
      end as assignment_status
    from public.nfc_tag_assignments assignment
    join public.nfc_tags tag on tag.id = assignment.nfc_tag_id
    join public.orders target on target.id = assignment.order_id
    where tag.restaurant_id = requested_restaurant_id
      and target.status in ('RECEIVED', 'PREPARING', 'READY')
    order by assignment.order_id, assignment.assigned_at desc, assignment.id desc
  ) latest;

  return jsonb_build_object('tags', tags, 'orderStates', order_states);
end;
$$;

create or replace function public.register_nfc_tag(
  requested_restaurant_id bigint,
  requested_label text,
  requested_token_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.nfc_tags;
begin
  if auth.uid() is null or not public.is_restaurant_member(requested_restaurant_id) then
    raise exception 'FORBIDDEN';
  end if;
  if length(trim(coalesce(requested_label, ''))) not between 1 and 48
    or requested_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'VALIDATION_ERROR';
  end if;

  insert into public.nfc_tags(restaurant_id, label, token_digest, created_by)
  values (requested_restaurant_id, trim(requested_label), requested_token_digest, auth.uid())
  returning * into created;

  return jsonb_build_object('id', created.id, 'label', created.label, 'active', created.active, 'createdAt', created.created_at);
exception when unique_violation then
  raise exception 'NFC_TAG_CONFLICT';
end;
$$;

create or replace function public.rotate_nfc_tag(
  requested_tag_id bigint,
  requested_token_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.nfc_tags;
begin
  select * into target from public.nfc_tags where id = requested_tag_id for update;
  if target.id is null or auth.uid() is null or not public.is_restaurant_member(target.restaurant_id) then
    raise exception 'FORBIDDEN';
  end if;
  if requested_token_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'VALIDATION_ERROR';
  end if;

  update public.nfc_tag_assignments
  set released_at = now(), release_reason = 'TOKEN_ROTATED'
  where nfc_tag_id = target.id and consumed_at is null and released_at is null;

  update public.nfc_tags
  set token_digest = requested_token_digest, updated_at = now()
  where id = target.id;

  return jsonb_build_object('id', target.id, 'label', target.label, 'active', target.active);
exception when unique_violation then
  raise exception 'NFC_TAG_CONFLICT';
end;
$$;

create or replace function public.set_nfc_tag_active(
  requested_tag_id bigint,
  requested_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.nfc_tags;
begin
  select * into target from public.nfc_tags where id = requested_tag_id for update;
  if target.id is null or auth.uid() is null or not public.is_restaurant_member(target.restaurant_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not requested_active then
    update public.nfc_tag_assignments
    set released_at = now(), release_reason = 'TAG_DISABLED'
    where nfc_tag_id = target.id and consumed_at is null and released_at is null;
  end if;

  update public.nfc_tags set active = requested_active, updated_at = now() where id = target.id;
  return true;
end;
$$;

create or replace function public.assign_nfc_tag(
  requested_tag_id bigint,
  requested_order_id bigint,
  requested_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tag public.nfc_tags;
  target public.orders;
  tag_assignment public.nfc_tag_assignments;
  order_assignment public.nfc_tag_assignments;
  created public.nfc_tag_assignments;
begin
  select * into tag from public.nfc_tags where id = requested_tag_id for update;
  select * into target from public.orders where id = requested_order_id for update;

  if tag.id is null or target.id is null or tag.restaurant_id <> target.restaurant_id
    or auth.uid() is null or not public.is_restaurant_member(tag.restaurant_id) then
    raise exception 'FORBIDDEN';
  end if;
  if not tag.active then raise exception 'NFC_TAG_DISABLED'; end if;
  if target.status not in ('RECEIVED', 'PREPARING', 'READY') then
    raise exception 'ORDER_NOT_ACTIVE';
  end if;

  select * into tag_assignment
  from public.nfc_tag_assignments
  where nfc_tag_id = tag.id and consumed_at is null and released_at is null
  for update;

  if tag_assignment.id is not null and tag_assignment.order_id = target.id then
    return jsonb_build_object('id', tag_assignment.id, 'tagId', tag.id, 'tagLabel', tag.label, 'orderId', target.id, 'orderNumber', target.order_number, 'assignedAt', tag_assignment.assigned_at);
  end if;
  if tag_assignment.id is not null and not requested_force then
    raise exception 'NFC_TAG_ALREADY_ASSIGNED';
  end if;

  select * into order_assignment
  from public.nfc_tag_assignments
  where order_id = target.id and consumed_at is null and released_at is null
  for update;

  if order_assignment.id is not null and not requested_force then
    raise exception 'ORDER_ALREADY_HAS_NFC_TAG';
  end if;

  update public.nfc_tag_assignments
  set released_at = now(), release_reason = 'REASSIGNED'
  where id in (tag_assignment.id, order_assignment.id)
    and consumed_at is null and released_at is null;

  insert into public.nfc_tag_assignments(nfc_tag_id, order_id, assigned_by)
  values (tag.id, target.id, auth.uid())
  returning * into created;

  return jsonb_build_object('id', created.id, 'tagId', tag.id, 'tagLabel', tag.label, 'orderId', target.id, 'orderNumber', target.order_number, 'assignedAt', created.assigned_at);
end;
$$;

create or replace function public.consume_nfc_tag(requested_token_digest text)
returns table(public_nonce uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_assignment_id bigint;
  selected_order_id bigint;
  selected_nonce uuid;
begin
  if requested_token_digest !~ '^[0-9a-f]{64}$' then return; end if;

  select assignment.id, assignment.order_id
  into selected_assignment_id, selected_order_id
  from public.nfc_tags tag
  join public.nfc_tag_assignments assignment on assignment.nfc_tag_id = tag.id
  where tag.token_digest = requested_token_digest
    and tag.active
    and assignment.consumed_at is null
    and assignment.released_at is null
  order by assignment.assigned_at desc, assignment.id desc
  for update of assignment skip locked
  limit 1;

  if selected_assignment_id is null then return; end if;

  select session.public_nonce into selected_nonce
  from public.orders target
  join public.tracking_sessions session on session.order_id = target.id
  where target.id = selected_order_id
    and target.status in ('RECEIVED', 'PREPARING', 'READY')
    and session.revoked_at is null
    and (session.expires_at is null or session.expires_at > now())
  limit 1;

  if selected_nonce is null then
    update public.nfc_tag_assignments
    set released_at = now(), release_reason = 'ORDER_UNAVAILABLE'
    where id = selected_assignment_id;
    return;
  end if;

  update public.nfc_tag_assignments
  set consumed_at = now(), release_reason = 'CONSUMED'
  where id = selected_assignment_id;

  return query select selected_nonce;
end;
$$;

revoke all on table public.nfc_tags, public.nfc_tag_assignments from public, anon, authenticated;
revoke all on function public.list_nfc_tags(bigint) from public, anon, authenticated;
revoke all on function public.register_nfc_tag(bigint, text, text) from public, anon, authenticated;
revoke all on function public.rotate_nfc_tag(bigint, text) from public, anon, authenticated;
revoke all on function public.set_nfc_tag_active(bigint, boolean) from public, anon, authenticated;
revoke all on function public.assign_nfc_tag(bigint, bigint, boolean) from public, anon, authenticated;
revoke all on function public.consume_nfc_tag(text) from public, anon, authenticated;

grant execute on function public.list_nfc_tags(bigint) to authenticated;
grant execute on function public.register_nfc_tag(bigint, text, text) to authenticated;
grant execute on function public.rotate_nfc_tag(bigint, text) to authenticated;
grant execute on function public.set_nfc_tag_active(bigint, boolean) to authenticated;
grant execute on function public.assign_nfc_tag(bigint, bigint, boolean) to authenticated;
grant execute on function public.consume_nfc_tag(text) to service_role;
