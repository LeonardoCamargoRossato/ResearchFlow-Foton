-- ResearchFlow Foton V1: Auth-scoped weekly reports + private audio storage

create extension if not exists pgcrypto;

create table if not exists public.research_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  researcher_name text not null,
  created_at timestamptz not null default now(),
  recording_date timestamptz not null default now(),
  duration_seconds integer not null default 0,
  audio_path text,
  audio_mime_type text,
  transcript text not null default '',
  transcript_status text not null default 'pending' check (transcript_status in ('pending','generated','edited')),
  status text not null default 'saved' check (status in ('saved','archived','deleted')),
  period_type text not null default 'weekly' check (period_type = 'weekly'),
  period_start timestamptz,
  period_end timestamptz,
  tag text not null unique,
  deleted_by_researcher boolean not null default false
);

create index if not exists research_reports_user_created_idx
  on public.research_reports(user_id, created_at desc);

alter table public.research_reports enable row level security;

drop policy if exists "Users can read own reports" on public.research_reports;
create policy "Users can read own reports"
  on public.research_reports for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own reports" on public.research_reports;
create policy "Users can insert own reports"
  on public.research_reports for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own reports" on public.research_reports;
create policy "Users can update own reports"
  on public.research_reports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('research-audio', 'research-audio', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can read own research audio" on storage.objects;
create policy "Users can read own research audio"
  on storage.objects for select
  using (
    bucket_id = 'research-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can upload own research audio" on storage.objects;
create policy "Users can upload own research audio"
  on storage.objects for insert
  with check (
    bucket_id = 'research-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own research audio" on storage.objects;
create policy "Users can update own research audio"
  on storage.objects for update
  using (
    bucket_id = 'research-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own research audio" on storage.objects;
create policy "Users can delete own research audio"
  on storage.objects for delete
  using (
    bucket_id = 'research-audio'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
