-- ResearchFlow Foton V5 — Director workspace integration
-- Apply AFTER V4/V4.1. Safely rerunnable where practical.
-- Current Director account: institutofotonmais@gmail.com
-- Scope: SQL privileges, Director RLS, institutional hierarchy, report typing,
-- private Storage read access and Director read/management RPC exposure.

create extension if not exists pgcrypto;

grant usage on schema public to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Stable organizational structure and current Director.
-- ---------------------------------------------------------------------------
do $$
declare
  v_vertical_id uuid;
  v_lab_id uuid;
  v_auth_id uuid;
begin
  insert into public.research_verticals(name, slug, description, active)
  values (
    'Instituto Foton — Pesquisa',
    'foton-pesquisa',
    'Contêiner organizacional interno do ResearchFlow.',
    true
  )
  on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    active = true
  returning id into v_vertical_id;

  insert into public.laboratories(vertical_id,name,slug,description,active)
  values(
    v_vertical_id,
    'Quântica nos Negócios',
    'quantica-nos-negocios',
    'Laboratório inicial do ResearchFlow.',
    true
  )
  on conflict (slug) do update set
    vertical_id = excluded.vertical_id,
    name = excluded.name,
    description = coalesce(public.laboratories.description, excluded.description),
    active = true
  returning id into v_lab_id;

  -- Current Director. Preserve an existing auth link and claim a matching auth.users row when available.
  select id into v_auth_id
  from auth.users
  where lower(email) = 'institutofotonmais@gmail.com'
  order by created_at asc
  limit 1;

  insert into public.memberships(email,full_name,role,laboratory_id,vertical_id,status,approved_at,auth_user_id)
  values(
    'institutofotonmais@gmail.com',
    'Instituto Foton Mais',
    'director',
    null,
    null,
    'active',
    now(),
    v_auth_id
  )
  on conflict (lower(email)) do update set
    full_name = excluded.full_name,
    role = 'director',
    laboratory_id = null,
    vertical_id = null,
    status = 'active',
    approved_at = coalesce(public.memberships.approved_at, now()),
    auth_user_id = coalesce(public.memberships.auth_user_id, excluded.auth_user_id),
    updated_at = now();

  -- The previous Director account must no longer carry Director authorization.
  update public.memberships
  set status = 'revoked', updated_at = now()
  where lower(email) = 'leonardo.rossato@institutofoton.com.br'
    and role = 'director';

  -- Initial Laboratory Coordinator.
  select id into v_auth_id
  from auth.users
  where lower(email) = 'leonardo.rossato.coordenador@gmail.com'
  order by created_at asc
  limit 1;

  insert into public.memberships(email,full_name,role,laboratory_id,vertical_id,status,approved_at,auth_user_id)
  values(
    'leonardo.rossato.coordenador@gmail.com',
    'Leonardo Rossato — Coordenador',
    'lab_coordinator',
    v_lab_id,
    v_vertical_id,
    'active',
    now(),
    v_auth_id
  )
  on conflict (lower(email)) do update set
    full_name = excluded.full_name,
    role = 'lab_coordinator',
    laboratory_id = v_lab_id,
    vertical_id = v_vertical_id,
    status = 'active',
    approved_at = coalesce(public.memberships.approved_at, now()),
    auth_user_id = coalesce(public.memberships.auth_user_id, excluded.auth_user_id),
    updated_at = now();

  -- Initial Researcher.
  select id into v_auth_id
  from auth.users
  where lower(email) = 'leo.c.rossato@gmail.com'
  order by created_at asc
  limit 1;

  insert into public.memberships(email,full_name,role,laboratory_id,vertical_id,status,approved_at,auth_user_id)
  values(
    'leo.c.rossato@gmail.com',
    'Leonardo Rossato',
    'researcher',
    v_lab_id,
    v_vertical_id,
    'active',
    now(),
    v_auth_id
  )
  on conflict (lower(email)) do update set
    full_name = excluded.full_name,
    role = 'researcher',
    laboratory_id = v_lab_id,
    vertical_id = v_vertical_id,
    status = 'active',
    approved_at = coalesce(public.memberships.approved_at, now()),
    auth_user_id = coalesce(public.memberships.auth_user_id, excluded.auth_user_id),
    updated_at = now();

  update public.access_requests
  set status = 'approved',
      reviewed_at = coalesce(reviewed_at, now()),
      review_notes = coalesce(review_notes, 'Membership activated by ResearchFlow V5 hierarchy seed.')
  where lower(email) in (
    'institutofotonmais@gmail.com',
    'leonardo.rossato.coordenador@gmail.com',
    'leo.c.rossato@gmail.com'
  ) and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Stable report authorship classification.
-- ---------------------------------------------------------------------------
alter table public.research_reports
  add column if not exists report_type text not null default 'researcher';

alter table public.research_reports
  drop constraint if exists research_reports_report_type_check;

alter table public.research_reports
  add constraint research_reports_report_type_check
  check (report_type in ('researcher','coordinator'));

update public.research_reports r
set report_type = case
  when m.role = 'lab_coordinator' then 'coordinator'
  else 'researcher'
end
from public.memberships m
where m.auth_user_id = r.user_id
  and m.role in ('researcher','lab_coordinator')
  and r.report_type is distinct from case when m.role = 'lab_coordinator' then 'coordinator' else 'researcher' end;

create index if not exists research_reports_type_created_idx
  on public.research_reports(report_type, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Table privileges required BEFORE RLS can authorize individual rows.
-- The app uses only SELECT directly; privileged writes remain behind RPCs.
-- ---------------------------------------------------------------------------
grant select on table public.research_verticals to authenticated;
grant select on table public.laboratories to authenticated;
grant select on table public.memberships to authenticated;
grant select on table public.research_reports to authenticated;
grant select on table public.access_requests to authenticated;

-- Unauthorized authenticated users still need to submit their own request.
grant insert on table public.access_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Three-level read helpers. Director is institution-wide; Coordinator and
-- Researcher scopes remain unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.researchflow_can_read_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.researchflow_current_role()
    when 'director' then true
    when 'lab_coordinator' then
      p_user_id = auth.uid()
      or exists (
        select 1
        from public.memberships target
        where target.auth_user_id = p_user_id
          and target.role = 'researcher'
          and target.status = 'active'
          and target.laboratory_id = public.researchflow_current_laboratory_id()
      )
    when 'researcher' then p_user_id = auth.uid()
    else false
  end
$$;

grant execute on function public.researchflow_can_read_user(uuid) to authenticated;

create or replace function public.researchflow_can_read_user_text(p_user_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.researchflow_current_role() = 'director' then true
    when p_user_id = auth.uid()::text then true
    else exists (
      select 1
      from public.memberships target
      where target.auth_user_id::text = p_user_id
        and public.researchflow_can_read_user(target.auth_user_id)
    )
  end
$$;

grant execute on function public.researchflow_can_read_user_text(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Explicit RLS. Direct API calls remain safe for all three roles.
-- ---------------------------------------------------------------------------
alter table public.research_verticals enable row level security;
alter table public.laboratories enable row level security;
alter table public.memberships enable row level security;
alter table public.research_reports enable row level security;
alter table public.access_requests enable row level security;

drop policy if exists "ResearchFlow V3 laboratory read" on public.laboratories;
drop policy if exists "ResearchFlow V5 laboratory read" on public.laboratories;
create policy "ResearchFlow V5 laboratory read"
on public.laboratories for select to authenticated
using (
  public.researchflow_current_role() = 'director'
  or id = public.researchflow_current_laboratory_id()
);

drop policy if exists "ResearchFlow V3 membership read" on public.memberships;
drop policy if exists "ResearchFlow V5 membership read" on public.memberships;
create policy "ResearchFlow V5 membership read"
on public.memberships for select to authenticated
using (
  auth_user_id = auth.uid()
  or public.researchflow_current_role() = 'director'
  or (
    public.researchflow_current_role() = 'lab_coordinator'
    and role = 'researcher'
    and laboratory_id = public.researchflow_current_laboratory_id()
  )
);

drop policy if exists "Users read own access requests" on public.access_requests;
drop policy if exists "ResearchFlow V5 access request read" on public.access_requests;
create policy "ResearchFlow V5 access request read"
on public.access_requests for select to authenticated
using (
  auth_user_id = auth.uid()
  or public.researchflow_current_role() = 'director'
);

drop policy if exists "ResearchFlow V4 report read" on public.research_reports;
drop policy if exists "ResearchFlow V3 report read" on public.research_reports;
drop policy if exists "ResearchFlow V5 report read" on public.research_reports;
create policy "ResearchFlow V5 report read"
on public.research_reports for select to authenticated
using (public.researchflow_can_read_user(user_id));

-- Keep the internal organizational container readable only as metadata for an
-- active member. It contains no report content.
drop policy if exists "Active members can read vertical metadata" on public.research_verticals;
drop policy if exists "ResearchFlow V5 vertical read" on public.research_verticals;
create policy "ResearchFlow V5 vertical read"
on public.research_verticals for select to authenticated
using (public.researchflow_is_active_member());

-- ---------------------------------------------------------------------------
-- 6. Private Storage. Director can read all ResearchFlow audio, Coordinator can
-- read self + own laboratory, Researcher can read self. Bucket remains private.
-- ---------------------------------------------------------------------------
drop policy if exists "ResearchFlow V3 audio read" on storage.objects;
drop policy if exists "ResearchFlow V4 audio read" on storage.objects;
drop policy if exists "ResearchFlow V5 audio read" on storage.objects;
create policy "ResearchFlow V5 audio read"
on storage.objects for select to authenticated
using (
  bucket_id = 'research-audio'
  and (
    public.researchflow_current_role() = 'director'
    or public.researchflow_can_read_user_text((storage.foldername(name))[1])
  )
);

-- ---------------------------------------------------------------------------
-- 7. Director read RPCs. These provide predictable Data API endpoints while
-- keeping direct SELECT + RLS available for mandatory security validation.
-- ---------------------------------------------------------------------------
create or replace function public.researchflow_director_laboratories()
returns setof public.laboratories
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.researchflow_current_role() <> 'director' then
    raise exception 'Director role required';
  end if;
  return query select l.* from public.laboratories l order by l.name;
end;
$$;

create or replace function public.researchflow_director_memberships()
returns setof public.memberships
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.researchflow_current_role() <> 'director' then
    raise exception 'Director role required';
  end if;
  return query
    select m.* from public.memberships m
    order by m.full_name nulls last, m.email;
end;
$$;

create or replace function public.researchflow_director_reports()
returns setof public.research_reports
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.researchflow_current_role() <> 'director' then
    raise exception 'Director role required';
  end if;
  return query
    select r.* from public.research_reports r
    order by r.created_at desc
    limit 1000;
end;
$$;

create or replace function public.researchflow_director_access_requests()
returns setof public.access_requests
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.researchflow_current_role() <> 'director' then
    raise exception 'Director role required';
  end if;
  return query
    select a.* from public.access_requests a
    order by a.requested_at desc;
end;
$$;

revoke all on function public.researchflow_director_laboratories() from public;
revoke all on function public.researchflow_director_memberships() from public;
revoke all on function public.researchflow_director_reports() from public;
revoke all on function public.researchflow_director_access_requests() from public;

grant execute on function public.researchflow_director_laboratories() to authenticated;
grant execute on function public.researchflow_director_memberships() to authenticated;
grant execute on function public.researchflow_director_reports() to authenticated;
grant execute on function public.researchflow_director_access_requests() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Director management RPC exposure. Definitions come from V3; the browser
-- never receives service_role and still cannot write reports directly.
-- ---------------------------------------------------------------------------
grant execute on function public.researchflow_create_laboratory(text,text,uuid,boolean) to authenticated;
grant execute on function public.researchflow_update_laboratory(uuid,text,text,boolean) to authenticated;
grant execute on function public.researchflow_assign_coordinator(uuid,uuid) to authenticated;
grant execute on function public.researchflow_update_researcher(uuid,text,text) to authenticated;
grant execute on function public.researchflow_remove_researcher(uuid) to authenticated;
grant execute on function public.researchflow_update_membership_status(uuid,text) to authenticated;
grant execute on function public.researchflow_review_access_request(uuid,text,text,uuid,uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Helpful validation. These raise during migration if the hierarchy is not
-- represented as expected.
-- ---------------------------------------------------------------------------
do $$
declare
  v_lab_count integer;
  v_director_count integer;
  v_coord_count integer;
  v_researcher_count integer;
begin
  select count(*) into v_lab_count
  from public.laboratories
  where slug = 'quantica-nos-negocios';

  select count(*) into v_director_count
  from public.memberships
  where lower(email) = 'institutofotonmais@gmail.com'
    and role = 'director' and status = 'active';

  select count(*) into v_coord_count
  from public.memberships m
  join public.laboratories l on l.id = m.laboratory_id
  where lower(m.email) = 'leonardo.rossato.coordenador@gmail.com'
    and m.role = 'lab_coordinator' and m.status = 'active'
    and l.slug = 'quantica-nos-negocios';

  select count(*) into v_researcher_count
  from public.memberships m
  join public.laboratories l on l.id = m.laboratory_id
  where lower(m.email) = 'leo.c.rossato@gmail.com'
    and m.role = 'researcher' and m.status = 'active'
    and l.slug = 'quantica-nos-negocios';

  if v_lab_count <> 1 then raise exception 'V5 validation failed: expected exactly one quantica-nos-negocios laboratory'; end if;
  if v_director_count <> 1 then raise exception 'V5 validation failed: current Director membership missing'; end if;
  if v_coord_count <> 1 then raise exception 'V5 validation failed: coordinator assignment missing'; end if;
  if v_researcher_count <> 1 then raise exception 'V5 validation failed: researcher assignment missing'; end if;
end;
$$;
