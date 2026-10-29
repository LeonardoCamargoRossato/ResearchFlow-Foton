-- ResearchFlow Foton V3.3 — researcher write + audio duration support backend hotfix
-- Apply AFTER researchflow_v3_2_personal_library_fix.sql.
-- This isolates researcher writes in SECURITY DEFINER RPCs that always scope
-- rows to auth.uid(), while preserving the three-level governance model.

create or replace function public.researchflow_is_active_researcher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.auth_user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'researcher'
  );
$$;

revoke all on function public.researchflow_is_active_researcher() from public;
grant execute on function public.researchflow_is_active_researcher() to authenticated;

create or replace function public.researchflow_create_my_report(
  p_id uuid,
  p_researcher_name text,
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
begin
  if v_uid is null or not public.researchflow_is_active_researcher() then
    raise exception 'Active researcher membership required';
  end if;

  if p_audio_path is null or p_audio_path not like (v_uid::text || '/%') then
    raise exception 'Invalid researcher audio path';
  end if;

  if p_transcript_status not in ('pending','generated','edited') then
    raise exception 'Invalid transcript status';
  end if;

  insert into public.research_reports (
    id, user_id, researcher_name, created_at, recording_date,
    duration_seconds, audio_path, audio_mime_type, transcript,
    transcript_status, status, period_type, period_start, period_end,
    tag, deleted_by_researcher
  ) values (
    p_id, v_uid, p_researcher_name, p_created_at, p_recording_date,
    greatest(coalesce(p_duration_seconds, 0), 0), p_audio_path,
    p_audio_mime_type, coalesce(p_transcript, ''), p_transcript_status,
    'saved', 'weekly', p_period_start, p_period_end, p_tag, false
  );

  return p_id;
end;
$$;

revoke all on function public.researchflow_create_my_report(uuid,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz,timestamptz,text) from public;
grant execute on function public.researchflow_create_my_report(uuid,text,timestamptz,timestamptz,integer,text,text,text,text,timestamptz,timestamptz,text) to authenticated;

create or replace function public.researchflow_update_my_transcript(
  p_report_id uuid,
  p_transcript text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.researchflow_is_active_researcher() then
    raise exception 'Active researcher membership required';
  end if;

  update public.research_reports r
  set transcript = coalesce(p_transcript, ''),
      transcript_status = 'edited'
  where r.id = p_report_id
    and r.user_id = auth.uid();

  if not found then raise exception 'Research report not found'; end if;
end;
$$;

revoke all on function public.researchflow_update_my_transcript(uuid,text) from public;
grant execute on function public.researchflow_update_my_transcript(uuid,text) to authenticated;

create or replace function public.researchflow_soft_delete_my_report(
  p_report_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.researchflow_is_active_researcher() then
    raise exception 'Active researcher membership required';
  end if;

  update public.research_reports r
  set status = 'deleted',
      deleted_by_researcher = true,
      deleted_at = now()
  where r.id = p_report_id
    and r.user_id = auth.uid();

  if not found then raise exception 'Research report not found'; end if;
end;
$$;

revoke all on function public.researchflow_soft_delete_my_report(uuid) from public;
grant execute on function public.researchflow_soft_delete_my_report(uuid) to authenticated;

-- Keep direct PostgREST writes safe as a fallback, but use the dedicated
-- researcher predicate instead of the broader hierarchical helper.
drop policy if exists "Researchers insert own reports" on public.research_reports;
create policy "Researchers insert own reports"
on public.research_reports for insert to authenticated
with check (
  user_id = auth.uid()
  and public.researchflow_is_active_researcher()
);

drop policy if exists "Researchers update own reports" on public.research_reports;
create policy "Researchers update own reports"
on public.research_reports for update to authenticated
using (
  user_id = auth.uid()
  and public.researchflow_is_active_researcher()
)
with check (
  user_id = auth.uid()
  and public.researchflow_is_active_researcher()
);

-- Recreate researcher Storage write policies with the same dedicated predicate.
drop policy if exists "Researchers upload own research audio" on storage.objects;
create policy "Researchers upload own research audio"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'research-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.researchflow_is_active_researcher()
);

drop policy if exists "Researchers update own research audio" on storage.objects;
create policy "Researchers update own research audio"
on storage.objects for update to authenticated
using (
  bucket_id = 'research-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.researchflow_is_active_researcher()
)
with check (
  bucket_id = 'research-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.researchflow_is_active_researcher()
);

drop policy if exists "Researchers delete own research audio" on storage.objects;
create policy "Researchers delete own research audio"
on storage.objects for delete to authenticated
using (
  bucket_id = 'research-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.researchflow_is_active_researcher()
);
