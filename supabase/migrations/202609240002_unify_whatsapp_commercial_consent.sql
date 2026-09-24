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
  commercial_consent private.contact_consents;
begin
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

  insert into private.customer_contacts as customer_contact (
    whatsapp_id_ciphertext,
    whatsapp_id_digest
  )
  values (requested_whatsapp_ciphertext, requested_whatsapp_digest)
  on conflict (whatsapp_id_digest) do update set
    whatsapp_id_ciphertext = excluded.whatsapp_id_ciphertext,
    last_seen_at = now(),
    anonymized_at = null
  returning customer_contact.* into contact;

  insert into private.restaurant_contacts as restaurant_contact (
    restaurant_id,
    contact_id,
    first_order_id,
    last_order_id
  )
  values (restaurant.id, contact.id, target.id, target.id)
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
  )
  values (
    session.id,
    'WHATSAPP',
    requested_whatsapp_ciphertext,
    requested_whatsapp_digest,
    jsonb_build_object('contactPublicId', contact.public_id, 'policyVersion', requested_policy_version),
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

revoke all on function public.consume_whatsapp_challenge(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_whatsapp_challenge(text, text, text, text)
  to service_role;
