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
      select 1
      from public.tracking_sessions session
      where session.id = requested_tracking_session_id
        and session.revoked_at is null
        and (session.expires_at is null or session.expires_at > now())
    ) then
    raise exception 'CHALLENGE_INVALID';
  end if;

  update private.whatsapp_opt_in_challenges as challenge
  set expires_at = least(challenge.expires_at, now())
  where challenge.tracking_session_id = requested_tracking_session_id
    and challenge.consumed_at is null
    and challenge.expires_at > now();

  return query
  insert into private.whatsapp_opt_in_challenges as challenge (
    tracking_session_id,
    code_digest,
    expires_at
  )
  values (
    requested_tracking_session_id,
    requested_code_digest,
    requested_expires_at
  )
  returning challenge.public_id, challenge.expires_at;
end;
$$;

revoke all on function public.create_whatsapp_challenge(bigint, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_whatsapp_challenge(bigint, text, timestamptz)
  to service_role;
