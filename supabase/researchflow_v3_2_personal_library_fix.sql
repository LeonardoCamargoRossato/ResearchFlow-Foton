-- ResearchFlow Foton V3.2 — personal researcher library hotfix
-- Apply AFTER researchflow_v3_1_claim_membership_fix.sql.
-- This keeps the hierarchical RLS for governance dashboards, while giving
-- the authenticated researcher a dedicated, strictly self-scoped library RPC.

create or replace function public.researchflow_list_my_reports()
returns setof public.research_reports
language sql
stable
security definer
set search_path = public
as $$
  select r.*
  from public.research_reports r
  where r.user_id = auth.uid()
    and coalesce(r.deleted_by_researcher, false) = false
    and r.status <> 'deleted'
  order by r.created_at desc;
$$;

revoke all on function public.researchflow_list_my_reports() from public;
grant execute on function public.researchflow_list_my_reports() to authenticated;

-- Direct own-read policy for personal reports. PostgreSQL ORs permissive SELECT
-- policies, so this does not broaden coordinator/director access and only
-- guarantees that a user can read rows whose user_id is exactly auth.uid().
drop policy if exists "ResearchFlow V3 researcher own report read" on public.research_reports;
create policy "ResearchFlow V3 researcher own report read"
on public.research_reports for select to authenticated
using (user_id = auth.uid());

-- Same guarantee for the private audio bucket: a user can read only objects
-- stored under their own auth.uid() folder.
drop policy if exists "ResearchFlow V3 researcher own audio read" on storage.objects;
create policy "ResearchFlow V3 researcher own audio read"
on storage.objects for select to authenticated
using (
  bucket_id = 'research-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);
