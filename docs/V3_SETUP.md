# ResearchFlow — rollout and acceptance test

## Goal

ResearchFlow has exactly three functional levels:

1. Director
2. Laboratory Coordinator
3. Researcher

The runtime authorization source of truth is PostgreSQL/Supabase, not React and not the seeded email strings.

## 1. Apply migrations

In Supabase **SQL Editor**, run in this order if not already applied:

```text
supabase/researchflow_v1.sql
supabase/researchflow_v2_governance.sql
supabase/researchflow_v3_three_levels.sql
supabase/researchflow_v3_1_claim_membership_fix.sql
supabase/researchflow_v3_2_personal_library_fix.sql
supabase/researchflow_v3_3_researcher_write_fix.sql
supabase/researchflow_v4_coordinator_workspace.sql
supabase/researchflow_v4_1_director_email.sql
```

The migrations are incremental and preserve previous history.

## 2. Current memberships

### Project / Laboratory

- Quântica nos Negócios
- slug: `quantica-nos-negocios`

### Director

- `institutofotonmais@gmail.com`
- role: `director`
- scope: entire ResearchFlow

The former Director membership `leonardo.rossato@institutofoton.com.br` is revoked by V4.1.

### Laboratory Coordinator

- `leonardo.rossato.coordenador@gmail.com`
- role: `lab_coordinator`
- laboratory: Quântica nos Negócios

### Researcher

- `leo.c.rossato@gmail.com`
- role: `researcher`
- laboratory: Quântica nos Negócios

If the current Director membership has no `auth_user_id`, the next Google login is linked automatically by `researchflow_claim_membership()` using the verified Supabase JWT email. V4.1 also links it immediately if the Google account already exists in `auth.users`.

## 3. Existing pending access request

A pending access request matching an activated membership may be marked approved by the relevant migration. It does not block an active membership.

## 4. RLS acceptance

### Researcher

Log in as:

`leo.c.rossato@gmail.com`

Expected:

- Researcher Dashboard opens;
- only Novo Relato and Meus Relatos workflow is available;
- own reports are visible;
- direct queries cannot return another researcher's reports.

### Laboratory Coordinator

Log in as:

`leonardo.rossato.coordenador@gmail.com`

Expected:

- Coordinator Dashboard opens;
- only Quântica nos Negócios is visible;
- researcher `leo.c.rossato@gmail.com` is visible;
- coordinator can add/update/deactivate researchers in this laboratory;
- report library aggregates only this laboratory's researchers plus own coordinator reports;
- researcher audio/transcript access is read-only;
- another laboratory is not returned by direct Supabase queries.

### Director

Log in as:

`institutofotonmais@gmail.com`

Expected:

- Director Dashboard opens;
- Quântica nos Negócios is visible;
- assigned coordinator is visible;
- assigned researcher is visible;
- Director can create/edit laboratories/projects and assign coordinators;
- all authorized institutional reports are visible read-only;
- access requests can be approved/rejected.

The former Director account must no longer receive active Director authorization.

## 5. Management RPCs

The application uses checked `SECURITY DEFINER` functions for privileged operations, including:

```text
researchflow_create_laboratory(...)
researchflow_update_laboratory(...)
researchflow_assign_coordinator(...)
researchflow_add_researcher(...)
researchflow_update_researcher(...)
researchflow_remove_researcher(...)
researchflow_update_membership_status(...)
researchflow_review_access_request(...)
```

Each function verifies the authenticated caller's role and, where relevant, laboratory scope.

No service-role key is used in the GitHub Pages frontend.

## 6. Google/Supabase configuration

Keep the existing Google provider in Supabase Auth.

Supabase URL configuration must include:

```text
https://leonardocamargorossato.github.io/ResearchFlow-Foton/
```

The Google OAuth callback remains the callback URL shown by Supabase for the project.

## 7. GitHub Actions configuration

Repository Actions secrets required:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

The frontend must never receive `service_role`.

## 8. Optional access-request notification

The existing Edge Function remains optional. Server-side secrets, when used:

```text
ADMIN_NOTIFICATION_EMAIL
RESEND_API_KEY
ACCESS_NOTIFICATION_FROM_EMAIL
```

Notification failure must not roll back the stored access request.

## 9. Deployment validation

GitHub Actions runs:

```text
npm run typecheck
npm run build
```

and deploys to:

```text
https://leonardocamargorossato.github.io/ResearchFlow-Foton/
```

## Important

Committing a SQL migration to GitHub does not execute it inside Supabase. Apply `supabase/researchflow_v4_1_director_email.sql` to the actual Supabase project before testing `institutofotonmais@gmail.com` as Director.
