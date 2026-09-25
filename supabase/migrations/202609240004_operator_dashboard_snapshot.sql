create index if not exists orders_finalized_dashboard_idx
on public.orders (
  restaurant_id,
  operational_day_started_at,
  (coalesce(delivered_at, cancelled_at)) desc,
  id desc
)
where status in ('DELIVERED', 'CANCELLED');

create or replace function public.get_operator_dashboard_snapshot(
  requested_restaurant_id bigint,
  requested_limit integer default 25,
  requested_before_closed_at timestamptz default null,
  requested_before_id bigint default null,
  requested_query text default null,
  requested_status public.order_status default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected_restaurant public.restaurants;
  local_now timestamp;
  local_start timestamp;
  day_start timestamptz;
  day_end timestamptz;
  counts jsonb;
  active_orders jsonb;
  finalized_orders jsonb;
  average_preparation_seconds bigint;
  average_pickup_seconds bigint;
  has_more boolean;
  next_cursor jsonb;
begin
  if auth.uid() is null or not public.is_restaurant_member(requested_restaurant_id) then
    raise exception 'FORBIDDEN';
  end if;
  if requested_limit not between 1 and 100 then
    raise exception 'VALIDATION_ERROR';
  end if;
  if (requested_before_closed_at is null) <> (requested_before_id is null) then
    raise exception 'INVALID_CURSOR';
  end if;
  if requested_status is not null and requested_status not in ('DELIVERED', 'CANCELLED') then
    raise exception 'INVALID_STATUS_FILTER';
  end if;

  select * into selected_restaurant
  from public.restaurants
  where id = requested_restaurant_id;
  if selected_restaurant.id is null then
    raise exception 'FORBIDDEN';
  end if;

  local_now := now() at time zone selected_restaurant.timezone;
  local_start := date_trunc('day', local_now) + selected_restaurant.operational_cutoff;
  if local_now < local_start then
    local_start := local_start - interval '1 day';
  end if;
  day_start := local_start at time zone selected_restaurant.timezone;
  day_end := (local_start + interval '1 day') at time zone selected_restaurant.timezone;

  select jsonb_build_object(
    'received', count(*) filter (where status = 'RECEIVED'),
    'preparing', count(*) filter (where status = 'PREPARING'),
    'ready', count(*) filter (where status = 'READY'),
    'delivered', count(*) filter (where status = 'DELIVERED'),
    'cancelled', count(*) filter (where status = 'CANCELLED'),
    'totalCreated', count(*),
    'totalActive', count(*) filter (where status in ('RECEIVED', 'PREPARING', 'READY'))
  ) into counts
  from public.orders
  where restaurant_id = requested_restaurant_id
    and operational_day_started_at = day_start;

  select
    round(avg(extract(epoch from (ready_at - preparing_at))) filter (
      where status <> 'CANCELLED'
        and preparing_at is not null
        and ready_at >= day_start
        and ready_at < day_end
    ))::bigint,
    round(avg(extract(epoch from (delivered_at - ready_at))) filter (
      where status = 'DELIVERED'
        and ready_at is not null
        and delivered_at >= day_start
        and delivered_at < day_end
    ))::bigint
  into average_preparation_seconds, average_pickup_seconds
  from public.orders
  where restaurant_id = requested_restaurant_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'orderNumber', order_number,
      'status', status,
      'estimatedReadyAt', estimated_ready_at,
      'createdAt', created_at,
      'readyAt', ready_at
    ) order by created_at
  ), '[]'::jsonb)
  into active_orders
  from public.orders
  where restaurant_id = requested_restaurant_id
    and operational_day_started_at = day_start
    and status in ('RECEIVED', 'PREPARING', 'READY');

  with ranked as (
    select
      target.id,
      target.order_number,
      target.status,
      target.created_at,
      target.preparing_at,
      target.ready_at,
      target.delivered_at,
      target.cancelled_at,
      coalesce(target.delivered_at, target.cancelled_at) as closed_at,
      case
        when target.preparing_at is not null and target.ready_at is not null
          then extract(epoch from (target.ready_at - target.preparing_at))::bigint
        else null
      end as preparation_seconds,
      case
        when target.status = 'DELIVERED' and target.ready_at is not null and target.delivered_at is not null
          then extract(epoch from (target.delivered_at - target.ready_at))::bigint
        else null
      end as pickup_seconds
    from public.orders target
    where target.restaurant_id = requested_restaurant_id
      and target.operational_day_started_at = day_start
      and target.status in ('DELIVERED', 'CANCELLED')
      and (requested_status is null or target.status = requested_status)
      and (
        requested_query is null
        or trim(requested_query) = ''
        or position(lower(trim(requested_query)) in lower(target.order_number)) > 0
      )
      and (
        requested_before_closed_at is null
        or coalesce(target.delivered_at, target.cancelled_at) < requested_before_closed_at
        or (
          coalesce(target.delivered_at, target.cancelled_at) = requested_before_closed_at
          and target.id < requested_before_id
        )
      )
    order by closed_at desc, target.id desc
    limit requested_limit + 1
  ), visible as (
    select * from ranked
    order by closed_at desc, id desc
    limit requested_limit
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'orderNumber', order_number,
        'status', status,
        'createdAt', created_at,
        'closedAt', closed_at,
        'preparationSeconds', preparation_seconds,
        'pickupSeconds', pickup_seconds
      ) order by closed_at desc, id desc)
      from visible
    ), '[]'::jsonb),
    (select count(*) > requested_limit from ranked),
    (select jsonb_build_object('closedAt', closed_at, 'id', id)
      from visible order by closed_at asc, id asc limit 1)
  into finalized_orders, has_more, next_cursor;

  if not has_more then
    next_cursor := null;
  end if;

  return jsonb_build_object(
    'restaurantId', selected_restaurant.id,
    'restaurantName', selected_restaurant.name,
    'timezone', selected_restaurant.timezone,
    'operationalDayStartedAt', day_start,
    'operationalDayEndedAt', day_end,
    'serverTime', now(),
    'counts', counts,
    'averagePreparationSeconds', average_preparation_seconds,
    'averagePickupSeconds', average_pickup_seconds,
    'activeOrders', active_orders,
    'finalizedOrders', finalized_orders,
    'hasMore', has_more,
    'nextCursor', next_cursor
  );
end;
$$;

create or replace function public.get_operator_order_detail(requested_order_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.orders;
  history jsonb;
  cancellation_reason text;
begin
  select * into target
  from public.orders
  where id = requested_order_id;

  if target.id is null or auth.uid() is null or not public.is_restaurant_member(target.restaurant_id) then
    raise exception 'FORBIDDEN';
  end if;

  if target.status not in ('DELIVERED', 'CANCELLED') then
    raise exception 'ORDER_NOT_FINALIZED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'fromStatus', from_status,
    'toStatus', to_status,
    'occurredAt', occurred_at,
    'reasonCode', reason_code,
    'reasonText', reason_text
  ) order by occurred_at, id), '[]'::jsonb)
  into history
  from public.order_status_history
  where order_id = requested_order_id;

  cancellation_reason := coalesce(target.cancellation_reason_text, case target.cancellation_reason_code
    when 'CUSTOMER_REQUEST' then 'Solicitud del cliente'
    when 'UNAVAILABLE_ITEM' then 'Producto no disponible'
    when 'ORDER_ERROR' then 'Error en el pedido'
    when 'OPERATIONAL_ISSUE' then 'Problema operativo'
    when 'OTHER' then 'Otro'
    else null
  end);

  return jsonb_build_object(
    'id', target.id,
    'orderNumber', target.order_number,
    'status', target.status,
    'createdAt', target.created_at,
    'closedAt', coalesce(target.delivered_at, target.cancelled_at),
    'pickupInstructions', target.pickup_instructions,
    'cancellationReason', cancellation_reason,
    'preparationSeconds', case
      when target.preparing_at is not null and target.ready_at is not null
        then extract(epoch from (target.ready_at - target.preparing_at))::bigint
      else null
    end,
    'pickupSeconds', case
      when target.status = 'DELIVERED' and target.ready_at is not null and target.delivered_at is not null
        then extract(epoch from (target.delivered_at - target.ready_at))::bigint
      else null
    end,
    'totalSeconds', extract(epoch from (coalesce(target.delivered_at, target.cancelled_at) - target.created_at))::bigint,
    'history', history
  );
end;
$$;

revoke all on function public.get_operator_dashboard_snapshot(bigint, integer, timestamptz, bigint, text, public.order_status) from public, anon, authenticated;
revoke all on function public.get_operator_order_detail(bigint) from public, anon, authenticated;
grant execute on function public.get_operator_dashboard_snapshot(bigint, integer, timestamptz, bigint, text, public.order_status) to authenticated;
grant execute on function public.get_operator_order_detail(bigint) to authenticated;
