-- ResearchFlow Foton V3.1 — Fix runtime ambiguity in researchflow_claim_membership()
-- Apply AFTER researchflow_v3_three_levels.sql if the V3 migration was already executed.
-- Safe to run repeatedly.

create or replace function public.researchflow_claim_membership()
returns table (
  membership_id uuid,
  email text,
  full_name text,
  role text,
  laboratory_id uuid,
  laboratory_name text,
  vertical_id uuid,
  vertical_name text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt()->>'email','')));
  v_membership public.memberships%rowtype;
begin
  if v_uid is null or v_email = '' then
    return;
  end if;

  select m.*
  into v_membership
  from public.memberships as m
  where lower(m.email) = v_email
    and m.status = 'active'
    and m.role in ('researcher','lab_coordinator','director')
  limit 1
  for update;

  if not found then
    return;
  end if;

  if v_membership.auth_user_id is not null
     and v_membership.auth_user_id <> v_uid then
    raise exception 'Membership already linked to another authenticated account';
  end if;

  if v_membership.auth_user_id is null then
    update public.memberships as m
    set auth_user_id = v_uid,
        updated_at = now()
    where m.id = v_membership.id;
  end if;

  return query
  select
    m.id,
    m.email,
    m.full_name,
    m.role,
    m.laboratory_id,
    l.name,
    l.vertical_id,
    v.name,
    m.status
  from public.memberships as m
  left join public.laboratories as l on l.id = m.laboratory_id
  left join public.research_verticals as v on v.id = l.vertical_id
  where m.id = v_membership.id;
end;
$$;

grant execute on function public.researchflow_claim_membership() to authenticated;

-- Optional verification after running this hotfix:
-- select id,email,role,status,laboratory_id,auth_user_id
-- from public.memberships
-- where lower(email) in (
--   'leo.c.rossato@gmail.com',
--   'leonardo.rossato.coordenador@gmail.com',
--   'leonardo.rossato@institutofoton.com.br'
-- );
