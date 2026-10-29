-- ResearchFlow Foton V6.1 — institutional person/laboratory management
-- Apply immediately AFTER researchflow_v6_people_invites_structure.sql.
-- This is intentionally small and rerunnable.

alter table public.people add column if not exists is_test boolean not null default false;

create or replace function public.researchflow_director_set_person_laboratory(
  p_person_id uuid,
  p_laboratory_id uuid default null
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_person public.people%rowtype;
  v_vertical_id uuid;
begin
  if public.researchflow_current_role()<>'director' then raise exception 'Director role required'; end if;
  select * into v_person from public.people where id=p_person_id for update;
  if not found then raise exception 'Person not found'; end if;

  if p_laboratory_id is not null then
    select vertical_id into v_vertical_id from public.laboratories where id=p_laboratory_id and active=true;
    if v_vertical_id is null then raise exception 'Laboratory not found'; end if;
  end if;

  if v_person.institutional_role='lab_coordinator' then
    update public.laboratory_coordinators set active=false where person_id=p_person_id;
    if p_laboratory_id is not null then
      insert into public.laboratory_coordinators(laboratory_id,person_id,is_primary,active)
      values(p_laboratory_id,p_person_id,true,true)
      on conflict (laboratory_id,person_id) do update set is_primary=true,active=true;
    end if;
  elsif v_person.institutional_role='researcher' then
    update public.people set primary_laboratory_id=p_laboratory_id,updated_at=now() where id=p_person_id;
  elsif v_person.institutional_role='director' then
    p_laboratory_id := null;
  end if;

  if v_person.auth_user_id is not null then
    update public.memberships
    set laboratory_id=case when v_person.institutional_role='director' then null else p_laboratory_id end,
        vertical_id=case when v_person.institutional_role='director' then null else v_vertical_id end,
        updated_at=now()
    where person_id=p_person_id;
  end if;
end; $$;

revoke all on function public.researchflow_director_set_person_laboratory(uuid,uuid) from public;
grant execute on function public.researchflow_director_set_person_laboratory(uuid,uuid) to authenticated;

-- V6 laboratory creation: new Director-created labs belong to the institutional list.
create or replace function public.researchflow_create_laboratory(
  p_name text,
  p_description text default null,
  p_coordinator_membership_id uuid default null,
  p_active boolean default true
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_lab_id uuid;
  v_vertical_id uuid;
  v_slug text;
  v_coord public.memberships%rowtype;
begin
  if public.researchflow_current_role()<>'director' then raise exception 'Director role required'; end if;
  if trim(coalesce(p_name,''))='' then raise exception 'Laboratory name is required'; end if;

  select id into v_vertical_id from public.research_verticals where slug='foton-pesquisa' limit 1;
  if v_vertical_id is null then raise exception 'Internal ResearchFlow vertical not found'; end if;

  v_slug := lower(trim(p_name));
  v_slug := translate(v_slug,'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn');
  v_slug := regexp_replace(v_slug,'[^a-z0-9]+','-','g');
  v_slug := trim(both '-' from v_slug);
  if v_slug='' then v_slug := 'laboratorio-'||substr(gen_random_uuid()::text,1,8); end if;

  insert into public.laboratories(vertical_id,name,slug,description,active,institutional)
  values(v_vertical_id,trim(p_name),v_slug,nullif(trim(coalesce(p_description,'')),''),coalesce(p_active,true),true)
  returning id into v_lab_id;

  if p_coordinator_membership_id is not null then
    select * into v_coord from public.memberships where id=p_coordinator_membership_id for update;
    if not found or v_coord.role<>'lab_coordinator' then raise exception 'Coordinator membership required'; end if;
    update public.memberships set laboratory_id=v_lab_id,vertical_id=v_vertical_id,status='active',updated_at=now()
      where id=p_coordinator_membership_id;
    if v_coord.person_id is not null then
      insert into public.laboratory_coordinators(laboratory_id,person_id,is_primary,active)
      values(v_lab_id,v_coord.person_id,true,true)
      on conflict (laboratory_id,person_id) do update set is_primary=true,active=true;
    end if;
  end if;

  return v_lab_id;
end; $$;

grant execute on function public.researchflow_create_laboratory(text,text,uuid,boolean) to authenticated;

-- Multiple coordinators per laboratory: assigning one no longer detaches another.
create or replace function public.researchflow_assign_coordinator(
  p_laboratory_id uuid,
  p_coordinator_membership_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_vertical_id uuid;
  v_coord public.memberships%rowtype;
begin
  if public.researchflow_current_role()<>'director' then raise exception 'Director role required'; end if;
  select vertical_id into v_vertical_id from public.laboratories where id=p_laboratory_id;
  if v_vertical_id is null then raise exception 'Laboratory not found'; end if;
  select * into v_coord from public.memberships where id=p_coordinator_membership_id for update;
  if not found or v_coord.role<>'lab_coordinator' then raise exception 'Lab coordinator membership required'; end if;

  update public.memberships set laboratory_id=p_laboratory_id,vertical_id=v_vertical_id,status='active',updated_at=now()
    where id=p_coordinator_membership_id;

  if v_coord.person_id is not null then
    insert into public.laboratory_coordinators(laboratory_id,person_id,is_primary,active)
    values(p_laboratory_id,v_coord.person_id,false,true)
    on conflict (laboratory_id,person_id) do update set active=true;
  end if;
end; $$;

grant execute on function public.researchflow_assign_coordinator(uuid,uuid) to authenticated;

-- Dedicated development invite profile. It is intentionally not a real Foton person.
do $$
declare v_lab_id uuid;
begin
  select id into v_lab_id from public.laboratories where slug='computacao-quantica' limit 1;
  insert into public.people(slug,full_name,display_name,institutional_role,primary_laboratory_id,email,access_status,active,is_test)
  values('researchflow-invite-test','Perfil de Teste ResearchFlow','Perfil de Teste ResearchFlow','researcher',v_lab_id,null,'not_invited',true,true)
  on conflict (slug) do update set
    display_name='Perfil de Teste ResearchFlow',
    institutional_role='researcher',
    primary_laboratory_id=v_lab_id,
    is_test=true,
    active=true;
end; $$;
