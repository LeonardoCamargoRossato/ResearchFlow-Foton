-- ResearchFlow Foton V4.1 — Director email correction
-- Apply AFTER researchflow_v4_coordinator_workspace.sql.
-- New active Director: institutofotonmais@gmail.com
-- Former Director membership is revoked.

do $$
declare
  v_new_email text := 'institutofotonmais@gmail.com';
  v_old_email text := 'leonardo.rossato@institutofoton.com.br';
  v_new_uid uuid;
begin
  -- If the new Google account has already authenticated in Supabase, bind it immediately.
  select u.id
    into v_new_uid
  from auth.users u
  where lower(u.email) = v_new_email
  order by u.created_at desc
  limit 1;

  insert into public.memberships(
    auth_user_id,
    email,
    full_name,
    role,
    laboratory_id,
    vertical_id,
    status,
    approved_at,
    updated_at
  ) values (
    v_new_uid,
    v_new_email,
    'Instituto Foton Mais',
    'director',
    null,
    null,
    'active',
    now(),
    now()
  )
  on conflict (lower(email)) do update set
    auth_user_id = coalesce(public.memberships.auth_user_id, excluded.auth_user_id),
    full_name = coalesce(public.memberships.full_name, excluded.full_name),
    role = 'director',
    laboratory_id = null,
    vertical_id = null,
    status = 'active',
    approved_at = coalesce(public.memberships.approved_at, now()),
    updated_at = now();

  -- The previous address must no longer authorize Director access.
  update public.memberships
  set status = 'revoked',
      updated_at = now()
  where lower(email) = v_old_email
    and role = 'director';

  -- If the new address had a pending access request, mark it approved.
  update public.access_requests
  set status = 'approved',
      reviewed_at = coalesce(reviewed_at, now()),
      review_notes = coalesce(review_notes, 'Director membership activated by ResearchFlow V4.1.')
  where lower(email) = v_new_email
    and status = 'pending';

  -- Safety assertions: migration fails instead of silently leaving the wrong state.
  if not exists (
    select 1
    from public.memberships
    where lower(email) = v_new_email
      and role = 'director'
      and status = 'active'
  ) then
    raise exception 'V4.1 validation failed: new Director membership is not active';
  end if;

  if exists (
    select 1
    from public.memberships
    where lower(email) = v_old_email
      and role = 'director'
      and status = 'active'
  ) then
    raise exception 'V4.1 validation failed: previous Director membership is still active';
  end if;
end;
$$;

-- Validation result shown in Supabase SQL Editor.
select
  email,
  full_name,
  role,
  status,
  auth_user_id,
  approved_at,
  updated_at
from public.memberships
where lower(email) in (
  'institutofotonmais@gmail.com',
  'leonardo.rossato@institutofoton.com.br'
)
order by lower(email);
