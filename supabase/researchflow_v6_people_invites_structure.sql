-- ResearchFlow Foton V6 — institutional people, multi-coordinator labs and secure invites
-- Apply AFTER V5. Safely rerunnable where practical.
-- IMPORTANT: per the latest project correction, the active Director login remains
-- institutofotonmais@gmail.com. The previous leonardo.rossato@institutofoton.com.br
-- Director membership remains revoked.

create extension if not exists pgcrypto;

grant usage on schema public to authenticated;
grant usage on schema public to anon;

-- ---------------------------------------------------------------------------
-- 1. Institutional people are separate from authenticated memberships.
-- ---------------------------------------------------------------------------
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  full_name text not null,
  title_prefix text,
  display_name text not null,
  institutional_role text not null check (institutional_role in ('director','lab_coordinator','researcher','other')),
  primary_laboratory_id uuid references public.laboratories(id) on delete set null,
  email text,
  auth_user_id uuid references auth.users(id) on delete set null,
  access_status text not null default 'not_invited'
    check (access_status in ('not_invited','invite_created','pending_acceptance','active','suspended','revoked')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists people_email_lower_unique
  on public.people(lower(email)) where email is not null;
create unique index if not exists people_auth_user_unique
  on public.people(auth_user_id) where auth_user_id is not null;
create index if not exists people_role_idx on public.people(institutional_role, active);

alter table public.memberships add column if not exists person_id uuid references public.people(id) on delete set null;
create unique index if not exists memberships_person_unique
  on public.memberships(person_id) where person_id is not null;

-- Laboratories gain institutional metadata without breaking previous rows.
alter table public.laboratories add column if not exists subtitle text;
alter table public.laboratories add column if not exists institutional boolean not null default false;

-- Multiple institutional coordinators per laboratory.
create table if not exists public.laboratory_coordinators (
  laboratory_id uuid not null references public.laboratories(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (laboratory_id, person_id)
);
create index if not exists laboratory_coordinators_person_idx on public.laboratory_coordinators(person_id);

-- Secure one-time invitation records. Only hashes are persisted.
create table if not exists public.researchflow_invites (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  intended_role text not null check (intended_role in ('director','lab_coordinator','researcher')),
  laboratory_id uuid references public.laboratories(id) on delete set null,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active','accepted','revoked','expired')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_auth_user_id uuid references auth.users(id),
  accepted_email text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id)
);
create index if not exists researchflow_invites_person_idx on public.researchflow_invites(person_id, created_at desc);
create index if not exists researchflow_invites_status_idx on public.researchflow_invites(status, expires_at);

-- ---------------------------------------------------------------------------
-- 2. Normalization helpers.
-- ---------------------------------------------------------------------------
create or replace function public.researchflow_normalize_person()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.email is not null then
    new.email := nullif(lower(trim(new.email)), '');
  end if;
  new.full_name := trim(new.full_name);
  new.display_name := trim(new.display_name);
  new.title_prefix := nullif(trim(coalesce(new.title_prefix,'')), '');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists people_normalize on public.people;
create trigger people_normalize before insert or update on public.people
for each row execute function public.researchflow_normalize_person();

-- ---------------------------------------------------------------------------
-- 3. Real institutional laboratory seed. Reuse the old testing lab ID for
-- "Quântica para Negócios" when possible, preserving test memberships/reports.
-- ---------------------------------------------------------------------------
do $$
declare
  v_vertical_id uuid;
  v_old_lab uuid;
  v_new_lab uuid;
begin
  insert into public.research_verticals(name,slug,description,active)
  values('Instituto Foton — Pesquisa','foton-pesquisa','Contêiner organizacional interno do ResearchFlow.',true)
  on conflict (slug) do update set active=true, name=excluded.name
  returning id into v_vertical_id;

  select id into v_old_lab from public.laboratories where slug='quantica-nos-negocios' limit 1;
  select id into v_new_lab from public.laboratories where slug='quantica-para-negocios' limit 1;

  if v_new_lab is null and v_old_lab is not null then
    update public.laboratories
      set name='Quântica para Negócios', slug='quantica-para-negocios',
          subtitle=null, vertical_id=v_vertical_id, active=true, institutional=true
    where id=v_old_lab;
    v_new_lab := v_old_lab;
  elsif v_new_lab is null then
    insert into public.laboratories(vertical_id,name,slug,description,active,institutional)
    values(v_vertical_id,'Quântica para Negócios','quantica-para-negocios','Laboratório institucional do Instituto Foton.',true,true)
    returning id into v_new_lab;
  elsif v_old_lab is not null and v_old_lab <> v_new_lab then
    update public.memberships set laboratory_id=v_new_lab, vertical_id=v_vertical_id, updated_at=now()
      where laboratory_id=v_old_lab;
    update public.laboratories set active=false, institutional=false where id=v_old_lab;
  end if;

  update public.laboratories set name='Quântica para Negócios', vertical_id=v_vertical_id,
    active=true, institutional=true where id=v_new_lab;

  insert into public.laboratories(vertical_id,name,slug,subtitle,description,active,institutional)
  values
    (v_vertical_id,'Computação Quântica','computacao-quantica','Hardware e Firmware','Laboratório institucional do Instituto Foton.',true,true),
    (v_vertical_id,'Comunicação & Criptografia Quântica','comunicacao-criptografia-quantica',null,'Laboratório institucional do Instituto Foton.',true,true),
    (v_vertical_id,'Sensores & Materiais Quânticos','sensores-materiais-quanticos',null,'Laboratório institucional do Instituto Foton.',true,true),
    (v_vertical_id,'Algoritmos & Otimização','algoritmos-otimizacao',null,'Laboratório institucional do Instituto Foton.',true,true)
  on conflict (slug) do update set
    name=excluded.name, subtitle=excluded.subtitle, vertical_id=excluded.vertical_id,
    active=true, institutional=true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Institutional people seed. Unknown emails remain NULL.
-- ---------------------------------------------------------------------------
insert into public.people(slug,full_name,title_prefix,display_name,institutional_role,email,access_status,active)
values
  ('denicesar-baldo','Denicesar Baldo','Dr.','Dr. Denicesar Baldo','lab_coordinator',null,'not_invited',true),
  ('wilson-o-da-fonseca','Wilson O. da Fonseca',null,'Wilson O. da Fonseca','lab_coordinator',null,'not_invited',true),
  ('marcelo-w-schiller','Marcelo W. Schiller','Dr.','Dr. Marcelo W. Schiller','lab_coordinator',null,'not_invited',true),
  ('suzieli-mendonca','Suzieli Mendonça','Dra.','Dra. Suzieli Mendonça','lab_coordinator',null,'not_invited',true),
  ('lucas-friedrich','Lucas Friedrich',null,'Lucas Friedrich','lab_coordinator',null,'not_invited',true),
  ('jorge-verschore','Jorge Verschore','Dr.','Dr. Jorge Verschore','lab_coordinator',null,'not_invited',true),
  ('viviane-t-stamm','Viviane T. Stamm','Msc.','Msc. Viviane T. Stamm','lab_coordinator',null,'not_invited',true),
  ('claudio','Cláudio',null,'Cláudio','director',null,'not_invited',true),
  ('dani','Dani',null,'Dani','director',null,'not_invited',true),
  ('rosangela-v-maraschin','Rosângela V. Maraschin',null,'Rosângela V. Maraschin','director',null,'not_invited',true),
  ('larissa-cristani','Larissa Cristani',null,'Larissa Cristani','director',null,'not_invited',true)
on conflict (slug) do update set
  full_name=excluded.full_name,
  title_prefix=excluded.title_prefix,
  display_name=excluded.display_name,
  institutional_role=excluded.institutional_role,
  active=true;

-- Current active Director uses the corrected login from the preceding project step.
do $$
declare
  v_person_id uuid;
  v_auth_id uuid;
begin
  select id into v_auth_id from auth.users
    where lower(email)='institutofotonmais@gmail.com' order by created_at asc limit 1;

  insert into public.people(slug,full_name,title_prefix,display_name,institutional_role,email,auth_user_id,access_status,active)
  values('leonardo-rossato-diretor','Leonardo Rossato',null,'Leonardo Rossato','director',
         'institutofotonmais@gmail.com',v_auth_id,'active',true)
  on conflict (slug) do update set
    full_name=excluded.full_name,
    display_name=excluded.display_name,
    institutional_role='director',
    email='institutofotonmais@gmail.com',
    auth_user_id=coalesce(public.people.auth_user_id,excluded.auth_user_id),
    access_status='active', active=true
  returning id into v_person_id;

  update public.memberships
  set person_id=v_person_id, role='director', laboratory_id=null, vertical_id=null,
      email='institutofotonmais@gmail.com', status='active', updated_at=now()
  where lower(email)='institutofotonmais@gmail.com';

  update public.memberships set status='revoked', updated_at=now()
  where lower(email)='leonardo.rossato@institutofoton.com.br' and role='director';
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Institutional multi-coordinator relationships.
-- ---------------------------------------------------------------------------
insert into public.laboratory_coordinators(laboratory_id,person_id,is_primary,active)
select l.id,p.id,true,true from public.laboratories l, public.people p
where l.slug='computacao-quantica' and p.slug='denicesar-baldo'
on conflict (laboratory_id,person_id) do update set is_primary=true,active=true;

insert into public.laboratory_coordinators(laboratory_id,person_id,is_primary,active)
select l.id,p.id,true,true from public.laboratories l, public.people p
where l.slug='comunicacao-criptografia-quantica' and p.slug='wilson-o-da-fonseca'
on conflict (laboratory_id,person_id) do update set is_primary=true,active=true;

insert into public.laboratory_coordinators(laboratory_id,person_id,is_primary,active)
select l.id,p.id,true,true from public.laboratories l, public.people p
where l.slug='sensores-materiais-quanticos' and p.slug='marcelo-w-schiller'
on conflict (laboratory_id,person_id) do update set is_primary=true,active=true;

insert into public.laboratory_coordinators(laboratory_id,person_id,is_primary,active)
select l.id,p.id,true,true from public.laboratories l, public.people p
where l.slug='algoritmos-otimizacao' and p.slug='suzieli-mendonca'
on conflict (laboratory_id,person_id) do update set is_primary=true,active=true;

insert into public.laboratory_coordinators(laboratory_id,person_id,is_primary,active)
select l.id,p.id,false,true from public.laboratories l, public.people p
where l.slug='algoritmos-otimizacao' and p.slug='lucas-friedrich'
on conflict (laboratory_id,person_id) do update set is_primary=false,active=true;

insert into public.laboratory_coordinators(laboratory_id,person_id,is_primary,active)
select l.id,p.id,true,true from public.laboratories l, public.people p
where l.slug='quantica-para-negocios' and p.slug='jorge-verschore'
on conflict (laboratory_id,person_id) do update set is_primary=true,active=true;

insert into public.laboratory_coordinators(laboratory_id,person_id,is_primary,active)
select l.id,p.id,false,true from public.laboratories l, public.people p
where l.slug='quantica-para-negocios' and p.slug='viviane-t-stamm'
on conflict (laboratory_id,person_id) do update set is_primary=false,active=true;

-- ---------------------------------------------------------------------------
-- 6. RLS. Invite possession alone never grants institutional data access.
-- ---------------------------------------------------------------------------
alter table public.people enable row level security;
alter table public.laboratory_coordinators enable row level security;
alter table public.researchflow_invites enable row level security;

grant select on public.people to authenticated;
grant select on public.laboratory_coordinators to authenticated;
grant select on public.researchflow_invites to authenticated;

drop policy if exists "ResearchFlow V6 people read" on public.people;
create policy "ResearchFlow V6 people read" on public.people for select to authenticated
using (public.researchflow_current_role()='director' or auth_user_id=auth.uid());

drop policy if exists "ResearchFlow V6 laboratory coordinators read" on public.laboratory_coordinators;
create policy "ResearchFlow V6 laboratory coordinators read" on public.laboratory_coordinators for select to authenticated
using (
  public.researchflow_current_role()='director'
  or laboratory_id=public.researchflow_current_laboratory_id()
);

drop policy if exists "ResearchFlow V6 invites read" on public.researchflow_invites;
create policy "ResearchFlow V6 invites read" on public.researchflow_invites for select to authenticated
using (
  public.researchflow_current_role()='director'
  or accepted_auth_user_id=auth.uid()
);

-- ---------------------------------------------------------------------------
-- 7. Director read RPCs for institutional structure.
-- ---------------------------------------------------------------------------
create or replace function public.researchflow_director_institutional_laboratories()
returns setof public.laboratories
language plpgsql stable security definer set search_path=public as $$
begin
  if public.researchflow_current_role()<>'director' then raise exception 'Director role required'; end if;
  return query select l.* from public.laboratories l where l.institutional=true and l.active=true order by l.name;
end; $$;

create or replace function public.researchflow_director_people()
returns setof public.people
language plpgsql stable security definer set search_path=public as $$
begin
  if public.researchflow_current_role()<>'director' then raise exception 'Director role required'; end if;
  return query select p.* from public.people p where p.active=true order by p.display_name;
end; $$;

create or replace function public.researchflow_director_laboratory_coordinators()
returns table(laboratory_id uuid, person_id uuid, is_primary boolean, active boolean)
language plpgsql stable security definer set search_path=public as $$
begin
  if public.researchflow_current_role()<>'director' then raise exception 'Director role required'; end if;
  return query select lc.laboratory_id,lc.person_id,lc.is_primary,lc.active
  from public.laboratory_coordinators lc where lc.active=true;
end; $$;

create or replace function public.researchflow_director_invites()
returns setof public.researchflow_invites
language plpgsql stable security definer set search_path=public as $$
begin
  if public.researchflow_current_role()<>'director' then raise exception 'Director role required'; end if;
  return query select i.* from public.researchflow_invites i order by i.created_at desc;
end; $$;

revoke all on function public.researchflow_director_institutional_laboratories() from public;
revoke all on function public.researchflow_director_people() from public;
revoke all on function public.researchflow_director_laboratory_coordinators() from public;
revoke all on function public.researchflow_director_invites() from public;
grant execute on function public.researchflow_director_institutional_laboratories() to authenticated;
grant execute on function public.researchflow_director_people() to authenticated;
grant execute on function public.researchflow_director_laboratory_coordinators() to authenticated;
grant execute on function public.researchflow_director_invites() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Director person/access management RPCs. No direct privileged frontend writes.
-- ---------------------------------------------------------------------------
create or replace function public.researchflow_director_update_person(
  p_person_id uuid,
  p_display_name text,
  p_title_prefix text default null,
  p_institutional_role text default null,
  p_email text default null,
  p_access_status text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_person public.people%rowtype;
  v_email text := nullif(lower(trim(coalesce(p_email,''))), '');
begin
  if public.researchflow_current_role()<>'director' then raise exception 'Director role required'; end if;
  select * into v_person from public.people where id=p_person_id for update;
  if not found then raise exception 'Person not found'; end if;
  if trim(coalesce(p_display_name,''))='' then raise exception 'Display name required'; end if;
  if p_institutional_role is not null and p_institutional_role not in ('director','lab_coordinator','researcher','other') then raise exception 'Invalid institutional role'; end if;
  if p_access_status is not null and p_access_status not in ('not_invited','invite_created','pending_acceptance','active','suspended','revoked') then raise exception 'Invalid access status'; end if;

  if v_email is not null and exists(select 1 from public.people p where lower(p.email)=v_email and p.id<>p_person_id) then
    raise exception 'Email is already linked to another institutional person';
  end if;

  if v_person.auth_user_id is not null and v_email is distinct from v_person.email then
    raise exception 'Active Google identity email cannot be changed directly. Revoke access and create a new invite.';
  end if;

  update public.people set
    display_name=trim(p_display_name),
    full_name=regexp_replace(trim(p_display_name),'^(Dr\\.|Dra\\.|Msc\\.)\\s+','','i'),
    title_prefix=nullif(trim(coalesce(p_title_prefix,'')),''),
    institutional_role=coalesce(p_institutional_role,institutional_role),
    email=v_email,
    access_status=coalesce(p_access_status,access_status),
    updated_at=now()
  where id=p_person_id;

  if v_person.auth_user_id is not null and p_access_status in ('active','suspended','revoked') then
    update public.memberships
      set status=case p_access_status when 'active' then 'active' when 'suspended' then 'suspended' else 'revoked' end,
          updated_at=now()
    where person_id=p_person_id;
  end if;
end; $$;

revoke all on function public.researchflow_director_update_person(uuid,text,text,text,text,text) from public;
grant execute on function public.researchflow_director_update_person(uuid,text,text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Server-side cryptographic invite generation/revocation.
-- Raw token is returned once; only SHA-256 hash is stored.
-- ---------------------------------------------------------------------------
create or replace function public.researchflow_create_invite(p_person_id uuid)
returns table(invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare
  v_person public.people%rowtype;
  v_token text;
  v_hash text;
  v_lab_id uuid;
  v_invite_id uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  if public.researchflow_current_role()<>'director' then raise exception 'Director role required'; end if;
  select * into v_person from public.people where id=p_person_id and active=true for update;
  if not found then raise exception 'Person not found'; end if;
  if v_person.institutional_role not in ('director','lab_coordinator','researcher') then raise exception 'Person does not have an inviteable ResearchFlow role'; end if;
  if v_person.access_status='active' then raise exception 'Person already has active ResearchFlow access'; end if;

  if v_person.institutional_role='lab_coordinator' then
    select lc.laboratory_id into v_lab_id
    from public.laboratory_coordinators lc
    where lc.person_id=v_person.id and lc.active=true
    order by lc.is_primary desc, lc.created_at asc limit 1;
    if v_lab_id is null then raise exception 'Coordinator has no laboratory relationship'; end if;
  elsif v_person.institutional_role='researcher' then
    v_lab_id := v_person.primary_laboratory_id;
    if v_lab_id is null then raise exception 'Researcher has no laboratory relationship'; end if;
  end if;

  update public.researchflow_invites set status='revoked',revoked_at=now(),revoked_by=auth.uid()
    where person_id=v_person.id and status='active';

  v_token := encode(gen_random_bytes(32),'hex');
  v_hash := encode(digest(v_token,'sha256'),'hex');

  insert into public.researchflow_invites(person_id,intended_role,laboratory_id,token_hash,status,created_by,expires_at)
  values(v_person.id,v_person.institutional_role,v_lab_id,v_hash,'active',auth.uid(),v_expires)
  returning id into v_invite_id;

  update public.people set access_status='invite_created',updated_at=now() where id=v_person.id;
  return query select v_invite_id,v_token,v_expires;
end; $$;

create or replace function public.researchflow_revoke_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_person_id uuid;
begin
  if public.researchflow_current_role()<>'director' then raise exception 'Director role required'; end if;
  update public.researchflow_invites set status='revoked',revoked_at=now(),revoked_by=auth.uid()
    where id=p_invite_id and status='active' returning person_id into v_person_id;
  if v_person_id is not null then
    update public.people set access_status='not_invited',updated_at=now()
      where id=v_person_id and access_status<>'active';
  end if;
end; $$;

revoke all on function public.researchflow_create_invite(uuid) from public;
revoke all on function public.researchflow_revoke_invite(uuid) from public;
grant execute on function public.researchflow_create_invite(uuid) to authenticated;
grant execute on function public.researchflow_revoke_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Public invite preview. It reveals only intended institutional identity,
-- never application data. Opening a valid invite marks it pending acceptance.
-- ---------------------------------------------------------------------------
create or replace function public.researchflow_invite_preview(p_token text)
returns table(
  valid boolean,
  invite_id uuid,
  person_id uuid,
  display_name text,
  title_prefix text,
  intended_role text,
  laboratory_id uuid,
  laboratory_name text,
  invite_status text,
  expires_at timestamptz
)
language plpgsql security definer set search_path=public as $$
declare
  v_hash text := encode(digest(coalesce(p_token,''),'sha256'),'hex');
  v_invite public.researchflow_invites%rowtype;
begin
  select * into v_invite from public.researchflow_invites where token_hash=v_hash limit 1 for update;
  if not found then
    return query select false,null::uuid,null::uuid,null::text,null::text,null::text,null::uuid,null::text,'invalid'::text,null::timestamptz;
    return;
  end if;

  if v_invite.status='active' and v_invite.expires_at<=now() then
    update public.researchflow_invites set status='expired' where id=v_invite.id;
    update public.people set access_status='not_invited',updated_at=now()
      where id=v_invite.person_id and access_status<>'active';
    v_invite.status := 'expired';
  elsif v_invite.status='active' then
    update public.people set access_status='pending_acceptance',updated_at=now()
      where id=v_invite.person_id and access_status in ('not_invited','invite_created');
  end if;

  return query
    select v_invite.status='active', v_invite.id, p.id, p.display_name, p.title_prefix,
           v_invite.intended_role, v_invite.laboratory_id, l.name, v_invite.status, v_invite.expires_at
    from public.people p
    left join public.laboratories l on l.id=v_invite.laboratory_id
    where p.id=v_invite.person_id;
end; $$;

revoke all on function public.researchflow_invite_preview(text) from public;
grant execute on function public.researchflow_invite_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. Authenticated one-time invite acceptance. Google JWT email is authoritative.
-- ---------------------------------------------------------------------------
create or replace function public.researchflow_accept_invite(p_token text)
returns table(display_name text, role text, laboratory_name text, verified_email text)
language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt()->>'email','')));
  v_hash text := encode(digest(coalesce(p_token,''),'sha256'),'hex');
  v_invite public.researchflow_invites%rowtype;
  v_person public.people%rowtype;
  v_vertical_id uuid;
  v_lab_name text;
begin
  if v_uid is null or v_email='' then raise exception 'Google authentication required'; end if;

  select * into v_invite from public.researchflow_invites
    where token_hash=v_hash for update;
  if not found then raise exception 'Invalid invitation'; end if;
  if v_invite.status<>'active' then raise exception 'Invitation is no longer active'; end if;
  if v_invite.expires_at<=now() then
    update public.researchflow_invites set status='expired' where id=v_invite.id;
    raise exception 'Invitation has expired';
  end if;

  select * into v_person from public.people where id=v_invite.person_id for update;
  if not found or not v_person.active then raise exception 'Institutional person not available'; end if;
  if v_person.auth_user_id is not null and v_person.auth_user_id<>v_uid then raise exception 'This person is already linked to another Google account'; end if;
  if exists(select 1 from public.people p where lower(p.email)=v_email and p.id<>v_person.id) then raise exception 'This Google email is already linked to another institutional person'; end if;
  if exists(select 1 from public.memberships m where lower(m.email)=v_email and coalesce(m.person_id,v_person.id)<>v_person.id) then raise exception 'This Google email is already used by another ResearchFlow identity'; end if;

  if v_invite.laboratory_id is not null then
    select vertical_id,name into v_vertical_id,v_lab_name from public.laboratories where id=v_invite.laboratory_id;
  end if;

  update public.people set email=v_email,auth_user_id=v_uid,access_status='active',updated_at=now()
    where id=v_person.id;

  -- Attach an existing matching membership when present; otherwise create one.
  if exists(select 1 from public.memberships where lower(email)=v_email) then
    update public.memberships set
      person_id=v_person.id,
      auth_user_id=v_uid,
      full_name=v_person.display_name,
      role=v_invite.intended_role,
      laboratory_id=v_invite.laboratory_id,
      vertical_id=v_vertical_id,
      status='active',
      approved_at=coalesce(approved_at,now()),
      updated_at=now()
    where lower(email)=v_email;
  else
    insert into public.memberships(person_id,auth_user_id,email,full_name,role,laboratory_id,vertical_id,status,approved_at,approved_by)
    values(v_person.id,v_uid,v_email,v_person.display_name,v_invite.intended_role,v_invite.laboratory_id,v_vertical_id,'active',now(),v_invite.created_by);
  end if;

  update public.researchflow_invites set
    status='accepted',accepted_at=now(),accepted_auth_user_id=v_uid,accepted_email=v_email
  where id=v_invite.id;

  return query select v_person.display_name,v_invite.intended_role,v_lab_name,v_email;
end; $$;

revoke all on function public.researchflow_accept_invite(text) from public;
grant execute on function public.researchflow_accept_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Validation: five institutional laboratories and expected people/links.
-- ---------------------------------------------------------------------------
do $$
declare v_count int;
begin
  select count(*) into v_count from public.laboratories where institutional=true and active=true;
  if v_count<>5 then raise exception 'V6 validation failed: expected exactly 5 active institutional laboratories, got %',v_count; end if;

  select count(*) into v_count from public.people where active=true and institutional_role='lab_coordinator';
  if v_count<7 then raise exception 'V6 validation failed: expected 7 institutional coordinator profiles'; end if;

  select count(*) into v_count from public.people where active=true and institutional_role='director';
  if v_count<5 then raise exception 'V6 validation failed: expected 5 institutional Director profiles'; end if;
end; $$;
