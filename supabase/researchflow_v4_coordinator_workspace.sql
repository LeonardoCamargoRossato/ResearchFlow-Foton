-- ResearchFlow Foton V4 — Laboratory Coordinator workspace
-- Apply AFTER V3.3. Safely rerunnable where practical.
-- Scope: coordinator laboratory, researchers, reports, own weekly reports and private audio.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Report authorship is explicit. Existing V1/V2/V3 reports are researchers.
-- ---------------------------------------------------------------------------
alter table public.research_reports
  add column if not exists report_type text not null default 'researcher';

alter table public.research_reports
  drop constraint if exists research_reports_report_type_check;

alter table public.research_reports
  add constraint research_reports_report_type_check
  check (report_type in ('researcher','coordinator'));

update public.research_reports
set report_type = 'researcher'
where report_type is null or report_type not in ('researcher','coordinator');

create index if not exists research_reports_type_created_idx
  on public.research_reports(report_type, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Ensure the initial laboratory and memberships are linked in the database.
-- ---------------------------------------------------------------------------
do $$
declare
  v_vertical_id uuid;
  v_lab_id uuid;
begin
  select id into v_vertical_id
  from public.research_verticals
  where slug = 'foton-pesquisa'
  limit 1;

  if v_vertical_id is null then
    insert into public.research_verticals(name, slug, description, active)
    values ('Instituto Foton — Pesquisa', 'foton-pesquisa', 'Contêiner organizacional interno do ResearchFlow.', true)
    returning id into v_vertical_id;
  end if;

  insert into public.laboratories(vertical_id,name,slug,description,active)
  values(v_vertical_id,'Quântica nos Negócios','quantica-nos-negocios','Laboratório/projeto inicial do ResearchFlow.',true)
  on conflict (slug) do update set
    name = excluded.name,
    vertical_id = excluded.vertical_id,
    active = true
  returning id into v_lab_id;

  insert into public.memberships(email,full_name,role,laboratory_id,vertical_id,status,approved_at)
  values('leonardo.rossato.coordenador@gmail.com','Leonardo Rossato — Coordenador','lab_coordinator',v_lab_id,v_vertical_id,'active',now())
  on conflict (lower(email)) do update set
    full_name = excluded.full_name,
    role = 'lab_coordinator',
    laboratory_id = v_lab_id,
    vertical_id = v_vertical_id,
    status = 'active',
    approved_at = coalesce(public.memberships.approved_at,now()),
    updated_at = now();

  insert into public.memberships(email,full_name,role,laboratory_id,vertical_id,status,approved_at)
  values('leo.c.rossato@gmail.com','Leonardo Rossato','researcher',v_lab_id,v_vertical_id,'active',now())
  on conflict (lower(email)) do update set
    full_name = excluded.full_name,
    role = 'researcher',
    laboratory_id = v_lab_id,
    vertical_id = v_vertical_id,
    status = 'active',
    approved_at = coalesce(public.memberships.approved_at,now()),
    updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Three-level helper update: coordinator sees own rows + researchers in lab.
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
-- 4. Coordinator read RPCs. SECURITY DEFINER but strictly caller-scoped.
-- These avoid coupling the UI to several independent PostgREST/RLS queries.
-- ---------------------------------------------------------------------------
create or replace function public.researchflow_coordinator_laboratory()
returns setof public.laboratories
language sql
stable
security definer
set search_path = public
as $$
  select l.*
  from public.laboratories l
  where public.researchflow_current_role() = 'lab_coordinator'
    and l.id = public.researchflow_current_laboratory_id()
  limit 1
$$;

revoke all on function public.researchflow_coordinator_laboratory() from public;
grant execute on function public.researchflow_coordinator_laboratory() to authenticated;

create or replace function public.researchflow_coordinator_members()
returns setof public.memberships
language sql
stable
security definer
set search_path = public
as $$
  select m.*
  from public.memberships m
  where public.researchflow_current_role() = 'lab_coordinator'
    and m.laboratory_id = public.researchflow_current_laboratory_id()
    and m.role = 'researcher'
  order by m.full_name nulls last, m.email
$$;

revoke all on function public.researchflow_coordinator_members() from public;
grant execute on function public.researchflow_coordinator_members() to authenticated;

create or replace function public.researchflow_coordinator_reports()
returns setof public.research_reports
language sql
stable
security definer
set search_path = public
as $$
  select r.*
  from public.research_reports r
  join public.memberships owner_m on owner_m.auth_user_id = r.user_id
  where public.researchflow_current_role() = 'lab_coordinator'
    and owner_m.laboratory_id = public.researchflow_current_laboratory_id()
    and (
      owner_m.role = 'researcher'
      or owner_m.auth_user_id = auth.uid()
    )
  order by r.created_at desc
  limit 500
$$;

revoke all on function public.researchflow_coordinator_reports() from public;
grant execute on function public.researchflow_coordinator_reports() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Coordinator own report creation/update.
-- ---------------------------------------------------------------------------
create or replace function public.researchflow_create_coordinator_report(
  p_id uuid,
  p_author_name text,
  p_created_at timestamptz,
  p_recording_date timestamptz,
  p_duration_seconds integer,
  p_audio_path text,
  p_audio_mime_type text,
  p_transcript text,
  p_transcript_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_tag text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lab uuid := public.researchflow_current_laboratory_id();
begin
  if v_uid is null or public.researchflow_current_role() <> 'lab_coordinator' or v_lab is null then
    raise exception 'Active laboratory coordinator membership required';
  end if;

  if p_audio_path is null or p_audio_path not like (v_uid::text || '/%') then
    raise exception 'Invalid coordinator audio path';
  end if;

  if p_transcript_status not in ('pending','generated','edited') then
    raise exception 'Invalid transcript status';
  end if;

  insert into public.research_reports(
    id,user_id,researcher_name,created_at,recording_date,duration_seconds,
    audio_path,audio_mime_type,transcript,transcript_status,status,period_type,
    period_start,period_end,tag,deleted_by_researcher,report_type
  ) values (
    p_id,v_uid,p_author_name,p_created_at,p_recording_date,greatest(coalesce(p_duration_seconds,0),0),
    p_audio_path,p_audio_mime_type,coalesce(p_transcript,''),p_transcript_status,'saved','weekly',
    p_period_start,p_period_end,p_tag,false,'coordinator'
  );

  return p_id;
end;
$$;

revoke all on function public.researchflow_create_coordinator_report(uuid,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz,timestamptz,text) from public;
grant execute on function public.researchflow_create_coordinator_report(uuid,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz,timestamptz,text) to authenticated;

create or replace function public.researchflow_update_coordinator_transcript(
  p_report_id uuid,
  p_transcript text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.researchflow_current_role() <> 'lab_coordinator' then
    raise exception 'Laboratory coordinator role required';
  end if;

  update public.research_reports r
  set transcript = coalesce(p_transcript,''),
      transcript_status = 'edited'
  where r.id = p_report_id
    and r.user_id = auth.uid()
    and r.report_type = 'coordinator';

  if not found then raise exception 'Coordinator report not found'; end if;
end;
$$;

revoke all on function public.researchflow_update_coordinator_transcript(uuid,text) from public;
grant execute on function public.researchflow_update_coordinator_transcript(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Report RLS: coordinator can read lab researchers + self and write only self.
-- ---------------------------------------------------------------------------
drop policy if exists "ResearchFlow V3 report read" on public.research_reports;
create policy "ResearchFlow V4 report read"
on public.research_reports for select to authenticated
using (public.researchflow_can_read_user(user_id));

-- Preserve researcher V3.3 policy and add coordinator own report insert/update.
drop policy if exists "Coordinator insert own reports" on public.research_reports;
create policy "Coordinator insert own reports"
on public.research_reports for insert to authenticated
with check (
  user_id = auth.uid()
  and report_type = 'coordinator'
  and public.researchflow_current_role() = 'lab_coordinator'
  and public.researchflow_current_laboratory_id() is not null
);

drop policy if exists "Coordinator update own reports" on public.research_reports;
create policy "Coordinator update own reports"
on public.research_reports for update to authenticated
using (
  user_id = auth.uid()
  and report_type = 'coordinator'
  and public.researchflow_current_role() = 'lab_coordinator'
)
with check (
  user_id = auth.uid()
  and report_type = 'coordinator'
  and public.researchflow_current_role() = 'lab_coordinator'
);

-- ---------------------------------------------------------------------------
-- 7. Private Storage: read lab researcher audio + own coordinator audio.
-- ---------------------------------------------------------------------------
drop policy if exists "ResearchFlow V3 audio read" on storage.objects;
drop policy if exists "ResearchFlow V4 audio read" on storage.objects;
create policy "ResearchFlow V4 audio read"
on storage.objects for select to authenticated
using (
  bucket_id = 'research-audio'
  and public.researchflow_can_read_user_text((storage.foldername(name))[1])
);

drop policy if exists "Coordinator upload own research audio" on storage.objects;
create policy "Coordinator upload own research audio"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'research-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.researchflow_current_role() = 'lab_coordinator'
  and public.researchflow_current_laboratory_id() is not null
);

drop policy if exists "Coordinator update own research audio" on storage.objects;
create policy "Coordinator update own research audio"
on storage.objects for update to authenticated
using (
  bucket_id = 'research-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.researchflow_current_role() = 'lab_coordinator'
)
with check (
  bucket_id = 'research-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.researchflow_current_role() = 'lab_coordinator'
);

drop policy if exists "Coordinator delete own research audio" on storage.objects;
create policy "Coordinator delete own research audio"
on storage.objects for delete to authenticated
using (
  bucket_id = 'research-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.researchflow_current_role() = 'lab_coordinator'
);
