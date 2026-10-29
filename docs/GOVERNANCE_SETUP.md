# ResearchFlow governance setup

This document configures the V2 institutional authorization layer. It does not contain real secrets.

## 1. Apply database migrations

In Supabase SQL Editor, run in order:

1. `supabase/researchflow_v1.sql`
2. `supabase/researchflow_v2_governance.sql`

V2 preserves V1 and adds memberships, verticals, laboratories, access requests, helper functions, hierarchical RLS and director review RPCs.

## 2. Google provider

Keep Google as the identity provider through Supabase Auth.

Google Cloud OAuth authorized redirect URI:

`https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

Supabase Authentication URL configuration:

- Site URL: `https://leonardocamargorossato.github.io/ResearchFlow-Foton/`
- Redirect URL: `https://leonardocamargorossato.github.io/ResearchFlow-Foton/`

## 3. Frontend GitHub Actions secrets

Repository → Settings → Secrets and variables → Actions:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Only public/anon client configuration belongs in the browser.

## 4. Bootstrap the first director

The membership gate means a Google login alone is not enough. Before the first director can open the institutional workspace, insert their authorized email into `public.memberships`.

Example (replace the email/name with the real approved director):

```sql
insert into public.memberships (email, full_name, role, status, approved_at)
values ('director@example.org', 'Director Name', 'director', 'active', now())
on conflict (lower(email)) do update set
  full_name = excluded.full_name,
  role = 'director',
  status = 'active',
  approved_at = now();
```

On that person's next Google login, `researchflow_claim_membership()` links the membership to the matching `auth.uid()` using the verified JWT email.

Do not manually set `auth_user_id` unless you have a specific administrative reason.

## 5. Create laboratories

The migration seeds the initial `Círculo de Pesquisa / LAI` vertical without hardcoding authorization to it.

Find its ID:

```sql
select id, name, slug from public.research_verticals;
```

Then create laboratories, for example:

```sql
insert into public.laboratories (vertical_id, name, slug)
values
  ('VERTICAL_UUID', 'Laboratório A', 'laboratorio-a'),
  ('VERTICAL_UUID', 'Laboratório B', 'laboratorio-b');
```

Create as many laboratories as necessary; no count is hardcoded.

## 6. Seed/invite memberships

Authorized users may be preloaded from a future CSV/spreadsheet import. Runtime authorization always uses PostgreSQL.

Researcher example:

```sql
insert into public.memberships (email, full_name, role, laboratory_id, vertical_id, status, approved_at)
values ('researcher@example.org', 'Researcher Name', 'researcher', 'LAB_UUID', 'VERTICAL_UUID', 'active', now());
```

Lab coordinator example:

```sql
insert into public.memberships (email, full_name, role, laboratory_id, vertical_id, status, approved_at)
values ('coordinator@example.org', 'Coordinator Name', 'lab_coordinator', 'LAB_UUID', 'VERTICAL_UUID', 'active', now());
```

## 7. Access-request notification Edge Function

Function source:

`supabase/functions/notify-access-request/index.ts`

Deploy it with the Supabase CLI or Dashboard-supported function deployment flow.

Server-side secrets:

- `ADMIN_NOTIFICATION_EMAIL`
- `RESEND_API_KEY`
- `ACCESS_NOTIFICATION_FROM_EMAIL` (optional)

Supabase-provided function secrets such as `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` stay server-side in the Edge Function environment.

Notification is best-effort: the access request is stored first. Missing/failing email configuration does not remove the request.

## 8. Access-request lifecycle

Unauthorized authenticated user:

1. Google authentication succeeds;
2. no active membership is found;
3. internal ResearchFlow data is not shown;
4. user may submit one pending access request;
5. duplicate pending requests are prevented by a partial unique index.

Director:

1. sees pending requests;
2. approves/rejects through `researchflow_review_access_request()`;
3. approval creates/activates the membership and assigns role/scope;
4. no service-role key is exposed to GitHub Pages.

## 9. Security checks

Validate these scenarios after applying V2:

- unauthorized account sees restricted screen and cannot query reports;
- researcher can read/write only their own report content;
- laboratory coordinator can read only users/reports/audio in their laboratory;
- vertical coordinator can read only their assigned vertical;
- director can read all institutional ResearchFlow reports;
- coordinators/directors cannot update researcher report content;
- `research-audio` remains private and is served through authorized signed URLs;
- changing React/JavaScript in the browser does not bypass RLS.

## 10. Suspension/revocation

Change `memberships.status` to `suspended` or `revoked`. The next membership validation denies application access even if the Supabase session itself is still valid.
