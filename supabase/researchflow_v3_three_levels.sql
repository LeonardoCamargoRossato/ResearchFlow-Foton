-- ResearchFlow Foton V3 — Three functional levels
-- Apply AFTER researchflow_v1.sql and researchflow_v2_governance.sql.
-- Functional hierarchy: Director -> Laboratory Coordinator -> Researcher.
-- Projects and laboratories are the same managed unit; public.laboratories remains the source of truth.

create extension if not exists pgcrypto;

-- 1. Collapse functional roles to exactly three levels.
update public.memberships
set status = 'revoked', updated_at = now()
where role = 'vertical_coordinator' and status <> 'revoked';

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check
  check (role in ('researcher','lab_coordinator','director'));

-- 2. Internal organizational container. It is not a V3 functional workspace.
insert into public.research_verticals(name, slug, description, active)
values ('Instituto Foton — Pesquisa', 'foton-pesquisa', 'Contêiner organizacional interno do ResearchFlow.', true)
on conflict (slug) do update set active = true;

-- 3. Three-level authorization helpers.
create or replace function public.researchflow_current_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.memberships
  where auth_user_id = auth.uid() and status = 'active'
  limit 1
$$;

create or replace function public.researchflow_current_laboratory_id()
returns uuid language sql stable security definer set search_path = public as $$
  select laboratory_id from public.memberships
  where auth_user_id = auth.uid() and status = 'active'
  limit 1
$$;

create or replace function public.researchflow_is_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.memberships where auth_user_id = auth.uid() and status = 'active')
$$;

create or replace function public.researchflow_can_read_user(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.researchflow_current_role()
    when 'director' then true
    when 'lab_coordinator' then exists (
      select 1 from public.memberships target
      where target.auth_user_id = p_user_id
        and target.role = 'researcher'
        and target.laboratory_id = public.researchflow_current_laboratory_id()
    )
    when 'researcher' then p_user_id = auth.uid()
    else false
  end
$$;

create or replace function public.researchflow_can_read_user_text(p_user_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.researchflow_current_role() = 'director' then true
    else exists (
      select 1 from public.memberships target
      where target.auth_user_id::text = p_user_id
        and public.researchflow_can_read_user(target.auth_user_id)
    )
  end
$$;

grant execute on function public.researchflow_current_role() to authenticated;
grant execute on function public.researchflow_current_laboratory_id() to authenticated;
grant execute on function public.researchflow_is_active_member() to authenticated;
grant execute on function public.researchflow_can_read_user(uuid) to authenticated;
grant execute on function public.researchflow_can_read_user_text(text) to authenticated;

-- 4. First-login membership linking.
create or replace function public.researchflow_claim_membership()
returns table (
  membership_id uuid, email text, full_name text, role text,
  laboratory_id uuid, laboratory_name text, vertical_id uuid, vertical_name text, status text
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt()->>'email','')));
  v_membership public.memberships%rowtype;
begin
  if v_uid is null or v_email = '' then return; end if;

  select * into v_membership
  from public.memberships
  where lower(email) = v_email
    and status = 'active'
    and role in ('researcher','lab_coordinator','director')
  limit 1 for update;

  if not found then return; end if;
  if v_membership.auth_user_id is not null and v_membership.auth_user_id <> v_uid then
    raise exception 'Membership already linked to another authenticated account';
  end if;

  if v_membership.auth_user_id is null then
    update public.memberships set auth_user_id = v_uid, updated_at = now() where id = v_membership.id;
  end if;

  return query
  select m.id, m.email, m.full_name, m.role,
         m.laboratory_id, l.name,
         l.vertical_id, v.name,
         m.status
  from public.memberships m
  left join public.laboratories l on l.id = m.laboratory_id
  left join public.research_verticals v on v.id = l.vertical_id
  where m.id = v_membership.id;
end;
$$;

grant execute on function public.researchflow_claim_membership() to authenticated;

-- 5. RLS: laboratories, memberships and reports.
alter table public.laboratories enable row level security;
alter table public.memberships enable row level security;
alter table public.research_reports enable row level security;

drop policy if exists "Active members can read laboratory metadata" on public.laboratories;
drop policy if exists "ResearchFlow V3 laboratory read" on public.laboratories;
drop policy if exists "ResearchFlow V3 laboratory insert" on public.laboratories;
drop policy if exists "ResearchFlow V3 laboratory update" on public.laboratories;

create policy "ResearchFlow V3 laboratory read" on public.laboratories for select to authenticated
using (
  public.researchflow_current_role() = 'director'
  or id = public.researchflow_current_laboratory_id()
);

create policy "ResearchFlow V3 laboratory insert" on public.laboratories for insert to authenticated
with check (public.researchflow_current_role() = 'director');

create policy "ResearchFlow V3 laboratory update" on public.laboratories for update to authenticated
using (public.researchflow_current_role() = 'director')
with check (public.researchflow_current_role() = 'director');

drop policy if exists "Membership hierarchy read" on public.memberships;
drop policy if exists "ResearchFlow V3 membership read" on public.memberships;
create policy "ResearchFlow V3 membership read" on public.memberships for select to authenticated
using (
  auth_user_id = auth.uid()
  or public.researchflow_current_role() = 'director'
  or (
    public.researchflow_current_role() = 'lab_coordinator'
    and role = 'researcher'
    and laboratory_id = public.researchflow_current_laboratory_id()
  )
);

drop policy if exists "ResearchFlow hierarchical report read" on public.research_reports;
drop policy if exists "ResearchFlow V3 report read" on public.research_reports;
create policy "ResearchFlow V3 report read" on public.research_reports for select to authenticated
using (public.researchflow_can_read_user(user_id));

drop policy if exists "Researchers insert own reports" on public.research_reports;
create policy "Researchers insert own reports" on public.research_reports for insert to authenticated
with check (user_id = auth.uid() and public.researchflow_current_role() = 'researcher');

drop policy if exists "Researchers update own reports" on public.research_reports;
create policy "Researchers update own reports" on public.research_reports for update to authenticated
using (user_id = auth.uid() and public.researchflow_current_role() = 'researcher')
with check (user_id = auth.uid() and public.researchflow_current_role() = 'researcher');

-- 6. Storage remains private and follows the same hierarchy.
drop policy if exists "ResearchFlow hierarchical audio read" on storage.objects;
drop policy if exists "ResearchFlow V3 audio read" on storage.objects;
create policy "ResearchFlow V3 audio read" on storage.objects for select to authenticated
using (
  bucket_id = 'research-audio'
  and public.researchflow_can_read_user_text((storage.foldername(name))[1])
);
-- Existing researcher-only upload/update/delete policies from V2 remain in force.

-- 7. Director RPC: create project/laboratory.
create or replace function public.researchflow_create_laboratory(
  p_name text,
  p_description text default null,
  p_coordinator_membership_id uuid default null,
  p_active boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lab_id uuid;
  v_vertical_id uuid;
  v_slug text;
  v_coord public.memberships%rowtype;
begin
  if public.researchflow_current_role() <> 'director' then raise exception 'Director role required'; end if;
  if trim(coalesce(p_name,'')) = '' then raise exception 'Project name is required'; end if;

  select id into v_vertical_id from public.research_verticals where slug = 'foton-pesquisa' limit 1;
  if v_vertical_id is null then raise exception 'Internal ResearchFlow vertical not found'; end if;

  v_slug := lower(trim(p_name));
  v_slug := translate(v_slug, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'projeto-' || substr(gen_random_uuid()::text,1,8); end if;

  insert into public.laboratories(vertical_id,name,slug,description,active)
  values(v_vertical_id,trim(p_name),v_slug,nullif(trim(coalesce(p_description,'')),''),coalesce(p_active,true))
  returning id into v_lab_id;

  if p_coordinator_membership_id is not null then
    select * into v_coord from public.memberships where id = p_coordinator_membership_id for update;
    if not found or v_coord.role <> 'lab_coordinator' then raise exception 'Coordinator membership required'; end if;

    update public.memberships set laboratory_id = v_lab_id, vertical_id = v_vertical_id, status = 'active', updated_at = now()
    where id = p_coordinator_membership_id;
  end if;

  return v_lab_id;
end;
$$;

grant execute on function public.researchflow_create_laboratory(text,text,uuid,boolean) to authenticated;

-- 8. Director RPC: edit project/laboratory.
create or replace function public.researchflow_update_laboratory(
  p_laboratory_id uuid,
  p_name text,
  p_description text default null,
  p_active boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.researchflow_current_role() <> 'director' then raise exception 'Director role required'; end if;
  if trim(coalesce(p_name,'')) = '' then raise exception 'Project name is required'; end if;

  update public.laboratories
  set name = trim(p_name), description = nullif(trim(coalesce(p_description,'')),''), active = coalesce(p_active,true)
  where id = p_laboratory_id;
  if not found then raise exception 'Laboratory not found'; end if;
end;
$$;

grant execute on function public.researchflow_update_laboratory(uuid,text,text,boolean) to authenticated;

-- 9. Director RPC: assign/change coordinator using a stable membership ID.
create or replace function public.researchflow_assign_coordinator(
  p_laboratory_id uuid,
  p_coordinator_membership_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_vertical_id uuid;
  v_coord public.memberships%rowtype;
begin
  if public.researchflow_current_role() <> 'director' then raise exception 'Director role required'; end if;

  select vertical_id into v_vertical_id from public.laboratories where id = p_laboratory_id;
  if v_vertical_id is null then raise exception 'Laboratory not found'; end if;

  select * into v_coord from public.memberships where id = p_coordinator_membership_id for update;
  if not found or v_coord.role <> 'lab_coordinator' then raise exception 'Lab coordinator membership required'; end if;

  update public.memberships set laboratory_id = null, updated_at = now()
  where role = 'lab_coordinator' and laboratory_id = p_laboratory_id and id <> p_coordinator_membership_id;

  update public.memberships
  set laboratory_id = p_laboratory_id, vertical_id = v_vertical_id, status = 'active', updated_at = now()
  where id = p_coordinator_membership_id;
end;
$$;

grant execute on function public.researchflow_assign_coordinator(uuid,uuid) to authenticated;

-- 10. Coordinator RPC: add/invite researcher to caller's own laboratory only.
create or replace function public.researchflow_add_researcher(
  p_full_name text,
  p_email text,
  p_status text default 'active'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lab_id uuid := public.researchflow_current_laboratory_id();
  v_vertical_id uuid;
  v_email text := lower(trim(coalesce(p_email,'')));
  v_existing public.memberships%rowtype;
  v_id uuid;
begin
  if public.researchflow_current_role() <> 'lab_coordinator' then raise exception 'Laboratory coordinator role required'; end if;
  if v_lab_id is null then raise exception 'Coordinator has no assigned laboratory'; end if;
  if v_email = '' then raise exception 'Researcher email is required'; end if;
  if p_status not in ('active','invited') then raise exception 'Invalid researcher status'; end if;

  select vertical_id into v_vertical_id from public.laboratories where id = v_lab_id;
  select * into v_existing from public.memberships where lower(email) = v_email limit 1 for update;

  if found then
    if v_existing.role <> 'researcher' then raise exception 'Email already belongs to another ResearchFlow role'; end if;
    if v_existing.laboratory_id is not null and v_existing.laboratory_id <> v_lab_id then
      raise exception 'Researcher is already assigned to another laboratory';
    end if;

    update public.memberships
    set full_name = coalesce(nullif(trim(coalesce(p_full_name,'')),''), full_name),
        laboratory_id = v_lab_id, vertical_id = v_vertical_id, status = p_status, updated_at = now()
    where id = v_existing.id returning id into v_id;
  else
    insert into public.memberships(email,full_name,role,laboratory_id,vertical_id,status)
    values(v_email,nullif(trim(coalesce(p_full_name,'')),''),'researcher',v_lab_id,v_vertical_id,p_status)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.researchflow_add_researcher(text,text,text) to authenticated;

-- 11. Coordinator/Director RPCs: update/remove researcher without deleting history.
create or replace function public.researchflow_update_researcher(
  p_membership_id uuid,
  p_full_name text,
  p_status text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_target public.memberships%rowtype;
  v_role text := public.researchflow_current_role();
begin
  if p_status not in ('invited','active','suspended','revoked') then raise exception 'Invalid membership status'; end if;
  select * into v_target from public.memberships where id = p_membership_id for update;
  if not found or v_target.role <> 'researcher' then raise exception 'Researcher membership not found'; end if;

  if v_role = 'lab_coordinator' then
    if v_target.laboratory_id <> public.researchflow_current_laboratory_id() then raise exception 'Researcher outside coordinator scope'; end if;
  elsif v_role <> 'director' then
    raise exception 'Insufficient permission';
  end if;

  update public.memberships
  set full_name = coalesce(nullif(trim(coalesce(p_full_name,'')),''), full_name), status = p_status, updated_at = now()
  where id = p_membership_id;
end;
$$;

grant execute on function public.researchflow_update_researcher(uuid,text,text) to authenticated;

create or replace function public.researchflow_remove_researcher(p_membership_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_target public.memberships%rowtype;
  v_role text := public.researchflow_current_role();
begin
  select * into v_target from public.memberships where id = p_membership_id for update;
  if not found or v_target.role <> 'researcher' then raise exception 'Researcher membership not found'; end if;

  if v_role = 'lab_coordinator' then
    if v_target.laboratory_id <> public.researchflow_current_laboratory_id() then raise exception 'Researcher outside coordinator scope'; end if;
  elsif v_role <> 'director' then
    raise exception 'Insufficient permission';
  end if;

  update public.memberships set status = 'revoked', updated_at = now() where id = p_membership_id;
end;
$$;

grant execute on function public.researchflow_remove_researcher(uuid) to authenticated;

create or replace function public.researchflow_update_membership_status(p_membership_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.researchflow_current_role() <> 'director' then raise exception 'Director role required'; end if;
  if p_status not in ('invited','active','suspended','revoked') then raise exception 'Invalid membership status'; end if;

  update public.memberships set status = p_status, updated_at = now() where id = p_membership_id;
  if not found then raise exception 'Membership not found'; end if;
end;
$$;

grant execute on function public.researchflow_update_membership_status(uuid,text) to authenticated;

-- 12. Access-request review stays Director-only and accepts only the three V3 roles.
create or replace function public.researchflow_review_access_request(
  p_request_id uuid,
  p_decision text,
  p_role text default null,
  p_laboratory_id uuid default null,
  p_vertical_id uuid default null,
  p_notes text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  req public.access_requests%rowtype;
  existing public.memberships%rowtype;
  effective_vertical uuid;
begin
  if public.researchflow_current_role() <> 'director' then raise exception 'Director role required'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;

  select * into req from public.access_requests where id = p_request_id and status = 'pending' for update;
  if not found then raise exception 'Pending request not found'; end if;

  if p_decision = 'rejected' then
    update public.access_requests set status='rejected', reviewed_at=now(), reviewed_by=auth.uid(), review_notes=p_notes where id=req.id;
    return;
  end if;

  if p_role not in ('researcher','lab_coordinator','director') then raise exception 'Valid V3 role required'; end if;
  if p_role in ('researcher','lab_coordinator') and p_laboratory_id is null then raise exception 'Laboratory required for this role'; end if;

  if p_laboratory_id is not null then
    select vertical_id into effective_vertical from public.laboratories where id=p_laboratory_id;
    if effective_vertical is null then raise exception 'Laboratory not found'; end if;
  end if;

  select * into existing from public.memberships where lower(email)=lower(req.email) limit 1 for update;
  if found and existing.auth_user_id is not null and existing.auth_user_id <> req.auth_user_id then
    raise exception 'Membership email is already linked to another account';
  end if;

  insert into public.memberships(auth_user_id,email,full_name,role,laboratory_id,vertical_id,status,approved_at,approved_by)
  values(req.auth_user_id,lower(req.email),req.full_name,p_role,p_laboratory_id,effective_vertical,'active',now(),auth.uid())
  on conflict (lower(email)) do update set
    auth_user_id = coalesce(public.memberships.auth_user_id, excluded.auth_user_id),
    full_name = coalesce(excluded.full_name,public.memberships.full_name),
    role = excluded.role,
    laboratory_id = excluded.laboratory_id,
    vertical_id = excluded.vertical_id,
    status = 'active', approved_at = now(), approved_by = auth.uid(), updated_at = now();

  update public.access_requests set status='approved', reviewed_at=now(), reviewed_by=auth.uid(), review_notes=p_notes where id=req.id;
end;
$$;

grant execute on function public.researchflow_review_access_request(uuid,text,text,uuid,uuid,text) to authenticated;

-- 13. Seed initial laboratory/project and test memberships.
do $$
declare
  v_vertical_id uuid;
  v_lab_id uuid;
begin
  select id into v_vertical_id from public.research_verticals where slug = 'foton-pesquisa' limit 1;

  insert into public.laboratories(vertical_id,name,slug,description,active)
  values(v_vertical_id,'Quântica nos Negócios','quantica-nos-negocios','Laboratório/projeto inicial do ResearchFlow.',true)
  on conflict (slug) do update set
    name = excluded.name,
    description = coalesce(public.laboratories.description, excluded.description),
    active = true
  returning id into v_lab_id;

  insert into public.memberships(email,full_name,role,laboratory_id,vertical_id,status,approved_at)
  values('leonardo.rossato@institutofoton.com.br','Leonardo Rossato','director',null,null,'active',now())
  on conflict (lower(email)) do update set
    full_name = excluded.full_name, role = 'director', laboratory_id = null, vertical_id = null,
    status = 'active', approved_at = coalesce(public.memberships.approved_at,now()), updated_at = now();

  insert into public.memberships(email,full_name,role,laboratory_id,vertical_id,status,approved_at)
  values('leonardo.rossato.coordenador@gmail.com','Leonardo Rossato — Coordenador','lab_coordinator',v_lab_id,v_vertical_id,'active',now())
  on conflict (lower(email)) do update set
    full_name = excluded.full_name, role = 'lab_coordinator', laboratory_id = v_lab_id, vertical_id = v_vertical_id,
    status = 'active', approved_at = coalesce(public.memberships.approved_at,now()), updated_at = now();

  insert into public.memberships(email,full_name,role,laboratory_id,vertical_id,status,approved_at)
  values('leo.c.rossato@gmail.com','Leonardo Rossato','researcher',v_lab_id,v_vertical_id,'active',now())
  on conflict (lower(email)) do update set
    full_name = excluded.full_name, role = 'researcher', laboratory_id = v_lab_id, vertical_id = v_vertical_id,
    status = 'active', approved_at = coalesce(public.memberships.approved_at,now()), updated_at = now();

  update public.access_requests
  set status = 'approved', reviewed_at = coalesce(reviewed_at,now()),
      review_notes = coalesce(review_notes,'Membership activated by ResearchFlow V3 seed.')
  where lower(email) in (
    'leonardo.rossato@institutofoton.com.br',
    'leonardo.rossato.coordenador@gmail.com',
    'leo.c.rossato@gmail.com'
  ) and status = 'pending';
end;
$$;
