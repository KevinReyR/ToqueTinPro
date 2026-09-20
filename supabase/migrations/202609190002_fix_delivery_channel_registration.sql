create or replace function public.register_delivery_channel(
  requested_tracking_session_id bigint,
  requested_channel public.delivery_channel,
  requested_ciphertext text,
  requested_digest text,
  requested_capabilities jsonb,
  requested_expires_at timestamptz
)
returns table(public_id uuid, channel public.delivery_channel, expires_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  insert into private.delivery_channels as endpoint(
    tracking_session_id,
    channel,
    token_ciphertext,
    token_digest,
    capabilities,
    expires_at,
    revoked_at,
    last_seen_at,
    updated_at
  )
  values (
    requested_tracking_session_id,
    requested_channel,
    requested_ciphertext,
    requested_digest,
    requested_capabilities,
    requested_expires_at,
    null,
    now(),
    now()
  )
  on conflict (tracking_session_id, channel, token_digest) do update set
    token_ciphertext = excluded.token_ciphertext,
    capabilities = excluded.capabilities,
    expires_at = excluded.expires_at,
    revoked_at = null,
    last_seen_at = now(),
    updated_at = now()
  returning endpoint.public_id, endpoint.channel, endpoint.expires_at;
$$;

revoke all on function public.register_delivery_channel(bigint, public.delivery_channel, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.register_delivery_channel(bigint, public.delivery_channel, text, text, jsonb, timestamptz) to service_role;
