# Supabase setup — ResearchFlow Foton

## 1. Create/select a Supabase project

Use a dedicated project for ResearchFlow when possible.

## 2. Create database and private audio storage

Open **SQL Editor** in Supabase and execute the complete file:

`supabase/researchflow_v1.sql`

This creates:

- `public.research_reports`;
- Row Level Security (RLS) so each authenticated user can access only their own reports;
- private Storage bucket `research-audio`;
- Storage policies restricting files to the authenticated user's folder.

## 3. Enable Google login

In Supabase go to **Authentication → Providers → Google** and enable Google.

Create/configure a Google OAuth Web application and copy the Client ID and Client Secret into the Supabase Google provider.

The Google OAuth Authorized redirect URI must be the callback URI shown by Supabase, normally:

`https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

## 4. Configure application URLs in Supabase

In **Authentication → URL Configuration** set:

Site URL:

`https://leonardocamargorossato.github.io/ResearchFlow-Foton/`

Add the same URL to **Redirect URLs**.

For local development also add:

`http://localhost:5173/ResearchFlow-Foton/`

## 5. Get project credentials

In the Supabase project settings/API area copy:

- Project URL
- anon/public key (or publishable key, depending on the current Supabase dashboard terminology)

Never use the service-role key in this frontend application.

## 6. Add GitHub Actions secrets

In GitHub open:

**ResearchFlow-Foton → Settings → Secrets and variables → Actions → New repository secret**

Create:

- `VITE_SUPABASE_URL` = Supabase Project URL
- `VITE_SUPABASE_ANON_KEY` = Supabase anon/public key

The GitHub Pages workflow already maps these two secrets into the Vite build.

## 7. Redeploy

After adding the secrets, run the GitHub Pages workflow again or push a new commit.

The public application will then:

1. show the ResearchFlow landing/login screen;
2. authenticate with Google;
3. show Google profile name/photo/email;
4. save each audio in the private `research-audio` bucket;
5. save report/transcript metadata in `research_reports`;
6. load only reports belonging to the authenticated user's `auth.uid()`.

## Security model

The browser uses only the Supabase public/anon key. Data separation is enforced by RLS and Storage policies using `auth.uid()`. A logged-in researcher cannot query another researcher's reports through the normal Supabase client.
