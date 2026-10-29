-- ResearchFlow Foton V2 — institutional access governance
-- Apply AFTER supabase/researchflow_v1.sql.
-- Designed to be safely rerunnable where practical.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organizational structure
-- ---------------------------------------------------------------------------
create table if not exists public.research_verticals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.laboratories (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references public.research_verticals(id),
  name text not null,
  slug text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists laboratories_vertical_idx on public.laboratories(vertical_id);

-- ---------------------------------------------------------------------------
-- Membership registry: runtime authorization source of truth
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null,
  full_name text,
  role text not null check (role in ('researcher','lab_coordinator','vertical_coordinator','director')),
  laboratory_id uuid references public.laboratories(id),
  vertical_id uuid references public.research_verticals(id),
  status text not null default 'invited' check (status in ('invited','active','suspended','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id)
);

create unique index if not exists memberships_email_lower_unique on public.memberships(lower(email));
create index if not exists memberships_auth_user_idx on public.memberships(auth_user_id);
create index if not exists memberships_lab_idx on public.memberships(laboratory_id);
create index if not exists memberships_vertical_idx on public.memberships(vertical_id);

create or replace function public.researchflow_normalize_membership_email()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists memberships_normalize_email on public.memberships;
create trigger memberships_normalize_email before insert or update on public.memberships
for each row execute function public.researchflow_normalize_membership_email();

-- ---------------------------------------------------------------------------
-- Access requests
-- ---------------------------------------------------------------------------
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  message text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text
);

create index if not exists access_requests_email_idx on public.access_requests(lower(email));
create index if not exists access_requests_status_idx on public.access_requests(status);
create unique index if not exists access_requests_one_pending_per_user
  on public.access_requests(auth_user_id) where status = 'pending';

create or replace function public.researchflow_normalize_access_request_email()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists access_requests_normalize_email on public.access_requests;
create trigger access_requests_normalize_email before insert or update on public.access_requests
for each row execute function public.researchflow_normalize_access_request_email();

-- ---------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER avoids recursive membership RLS lookups.
-- ---------------------------------------------------------------------------
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

create or replace function public.researchflow_current_vertical_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(m.vertical_id, l.vertical_id)
  from public.memberships m
  left join public.laboratories l on l.id = m.laboratory_id
  where m.auth_user_id = auth.uid() and m.status = 'active'
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
    when 'vertical_coordinator' then exists (
      select 1 from public.memberships target
      left join public.laboratories lab on lab.id = target.laboratory_id
      where target.auth_user_id = p_user_id and target.status = 'active'
        and coalesce(target.vertical_id, lab.vertical_id) = public.researchflow_current_vertical_id()
    )
    when 'lab_coordinator' then exists (
      select 1 from public.memberships target
      where target.auth_user_id = p_user_id and target.status = 'active'
        and target.laboratory_id = public.researchflow_current_laboratory_id()
    )
    when 'researcher' then p_user_id = auth.uid()
    else false
  end
$$;

create or replace function public.researchflow_can_read_user_text(p_user_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships target
    where target.auth_user_id::text = p_user_id
      and public.researchflow_can_read_user(target.auth_user_id)
  )
$$;

-- First-login membership linking. The verified JWT email is authoritative.
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

  select * into v_membership from public.memberships
  where lower(email) = v_email and status = 'active'
  limit 1 for update;

  if not found then return; end if;
  if v_membership.auth_user_id is not null and v_membership.auth_user_id <> v_uid then
    raise exception 'Membership already linked to another authenticated account';
  end if;

  if v_membership.auth_user_id is null then
    update public.memberships set auth_user_id = v_uid, updated_at = now()
    where id = v_membership.id;
  end if;

  return query
  select m.id, m.email, m.full_name, m.role,
         m.laboratory_id, l.name,
         coalesce(m.vertical_id,l.vertical_id), v.name,
         m.status
  from public.memberships m
  left join public.laboratories l on l.id = m.laboratory_id
  left join public.research_verticals v on v.id = coalesce(m.vertical_id,l.vertical_id)
  where m.id = v_membership.id;
end;
$$;

grant execute on function public.researchflow_claim_membership() to authenticated;
grant execute on function public.researchflow_current_role() to authenticated;
grant execute on function public.researchflow_can_read_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Evolve reports without destroying V1
-- ---------------------------------------------------------------------------
alter table public.research_reports add column if not exists deleted_at timestamptz;
create index if not exists research_reports_user_idx on public.research_reports(user_id);
create index if not exists research_reports_created_idx on public.research_reports(created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: organizational tables
-- ---------------------------------------------------------------------------
alter table public.research_verticals enable row level security;
alter table public.laboratories enable row level security;
alter table public.memberships enable row level security;
alter table public.access_requests enable row level security;

-- Active members may resolve names required by their UI. Report/member data remains scoped separately.
drop policy if exists "Active members can read vertical metadata" on public.research_verticals;
create policy "Active members can read vertical metadata" on public.research_verticals for select
to authenticated using (public.researchflow_is_active_member());

drop policy if exists "Active members can read laboratory metadata" on public.laboratories;
create policy "Active members can read laboratory metadata" on public.laboratories for select
to authenticated using (public.researchflow_is_active_member());

drop policy if exists "Membership hierarchy read" on public.memberships;
create policy "Membership hierarchy read" on public.memberships for select to authenticated using (
  auth_user_id = auth.uid()
  or public.researchflow_current_role() = 'director'
  or (public.researchflow_current_role() = 'lab_coordinator' and laboratory_id = public.researchflow_current_laboratory_id())
  or (public.researchflow_current_role() = 'vertical_coordinator' and coalesce(vertical_id, (select vertical_id from public.laboratories l where l.id = laboratory_id)) = public.researchflow_current_vertical_id())
);

-- Requests: identity can read/create its own; directors can review all.
drop policy if exists "Users read own access requests" on public.access_requests;
create policy "Users read own access requests" on public.access_requests for select to authenticated using (
  auth_user_id = auth.uid() or public.researchflow_current_role() = 'director'
);

drop policy if exists "Users request own access" on public.access_requests;
create policy "Users request own access" on public.access_requests for insert to authenticated with check (
  auth_user_id = auth.uid()
  and lower(email) = lower(coalesce(auth.jwt()->>'email',''))
  and status = 'pending'
);

-- ---------------------------------------------------------------------------
-- RLS: reports. Reads follow role/scope; writes remain researcher-owned.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can read own reports" on public.research_reports;
drop policy if exists "Users can insert own reports" on public.research_reports;
drop policy if exists "Users can update own reports" on public.research_reports;
drop policy if exists "ResearchFlow hierarchical report read" on public.research_reports;
drop policy if exists "Researchers insert own reports" on public.research_reports;
drop policy if exists "Researchers update own reports" on public.research_reports;

create policy "ResearchFlow hierarchical report read" on public.research_reports for select to authenticated
using (public.researchflow_can_read_user(user_id));

create policy "Researchers insert own reports" on public.research_reports for insert to authenticated
with check (user_id = auth.uid() and public.researchflow_current_role() = 'researcher');

create policy "Researchers update own reports" on public.research_reports for update to authenticated
using (user_id = auth.uid() and public.researchflow_current_role() = 'researcher')
with check (user_id = auth.uid() and public.researchflow_current_role() = 'researcher');

-- ---------------------------------------------------------------------------
-- Storage RLS. Bucket remains private; hierarchy is derived from owner folder.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can read own research audio" on storage.objects;
drop policy if exists "Users can upload own research audio" on storage.objects;
drop policy if exists "Users can update own research audio" on storage.objects;
drop policy if exists "Users can delete own research audio" on storage.objects;
drop policy if exists "ResearchFlow hierarchical audio read" on storage.objects;
drop policy if exists "Researchers upload own research audio" on storage.objects;
drop policy if exists "Researchers update own research audio" on storage.objects;
drop policy if exists "Researchers delete own research audio" on storage.objects;

create policy "ResearchFlow hierarchical audio read" on storage.objects for select to authenticated using (
  bucket_id = 'research-audio'
  and public.researchflow_can_read_user_text((storage.foldername(name))[1])
);

create policy "Researchers upload own research audio" on storage.objects for insert to authenticated with check (
  bucket_id = 'research-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.researchflow_current_role() = 'researcher'
);

create policy "Researchers update own research audio" on storage.objects for update to authenticated using (
  bucket_id = 'research-audio' and (storage.foldername(name))[1] = auth.uid()::text and public.researchflow_current_role() = 'researcher'
) with check (
  bucket_id = 'research-audio' and (storage.foldername(name))[1] = auth.uid()::text and public.researchflow_current_role() = 'researcher'
);

create policy "Researchers delete own research audio" on storage.objects for delete to authenticated using (
  bucket_id = 'research-audio' and (storage.foldername(name))[1] = auth.uid()::text and public.researchflow_current_role() = 'researcher'
);

-- ---------------------------------------------------------------------------
-- Director-only request approval/rejection RPC. No service-role in frontend.
-- ---------------------------------------------------------------------------
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
  if public.researchflow_current_role() <> 'director' then
    raise exception 'Director role required';
  end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;

  select * into req from public.access_requests where id = p_request_id and status = 'pending' for update;
  if not found then raise exception 'Pending request not found'; end if;

  if p_decision = 'rejected' then
    update public.access_requests set status='rejected', reviewed_at=now(), reviewed_by=auth.uid(), review_notes=p_notes where id=req.id;
    return;
  end if;

  if p_role not in ('researcher','lab_coordinator','vertical_coordinator','director') then raise exception 'Valid role required'; end if;
  if p_role in ('researcher','lab_coordinator') and p_laboratory_id is null then raise exception 'Laboratory required for this role'; end if;
  if p_role = 'vertical_coordinator' and p_vertical_id is null then raise exception 'Vertical required for this role'; end if;

  if p_laboratory_id is not null then select vertical_id into effective_vertical from public.laboratories where id=p_laboratory_id; end if;
  effective_vertical := coalesce(p_vertical_id, effective_vertical);

  select * into existing from public.memberships where lower(email)=lower(req.email) limit 1 for update;
  if found and existing.auth_user_id is not null and existing.auth_user_id <> req.auth_user_id then
    raise exception 'Membership email is already linked to another account';
  end if;

  insert into public.memberships(auth_user_id,email,full_name,role,laboratory_id,vertical_id,status,approved_at,approved_by)
  values(req.auth_user_id,lower(req.email),req.full_name,p_role,p_laboratory_id,effective_vertical,'active',now(),auth.uid())
  on conflict (lower(email)) do update set
    auth_user_id=excluded.auth_user_id,
    full_name=coalesce(excluded.full_name,public.memberships.full_name),
    role=excluded.role,
    laboratory_id=excluded.laboratory_id,
    vertical_id=excluded.vertical_id,
    status='active', approved_at=now(), approved_by=auth.uid(), updated_at=now();

  update public.access_requests set status='approved', reviewed_at=now(), reviewed_by=auth.uid(), review_notes=p_notes where id=req.id;
end;
$$;

grant execute on function public.researchflow_review_access_request(uuid,text,text,uuid,uuid,text) to authenticated;

-- Optional initial vertical seed. It does not hardcode authorization to LAI.
insert into public.research_verticals(name,slug,description,active)
values ('Círculo de Pesquisa / LAI','lai','Vertical inicial de pesquisa do Instituto Foton',true)
on conflict (slug) do nothing;
