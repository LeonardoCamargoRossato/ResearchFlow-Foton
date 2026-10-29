# ResearchFlow V3 — rollout and acceptance test

## Goal

V3 has exactly three functional levels:

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
```

V3 is incremental and does not replace V1/V2 history.

## 2. V3 seed

The V3 migration creates/updates:

### Project / Laboratory

- Quântica nos Negócios
- slug: `quantica-nos-negocios`

### Director

- `leonardo.rossato@institutofoton.com.br`
- role: `director`
- scope: entire ResearchFlow

### Laboratory Coordinator

- `leonardo.rossato.coordenador@gmail.com`
- role: `lab_coordinator`
- laboratory: Quântica nos Negócios

### Researcher

- `leo.c.rossato@gmail.com`
- role: `researcher`
- laboratory: Quântica nos Negócios

The seed preserves an existing valid `auth_user_id`. If it is null, the next Google login is linked automatically by `researchflow_claim_membership()` using the verified Supabase JWT email.

## 3. Existing pending access request

A pending access request matching one of the three seeded emails is marked approved by the migration. It does not block the seeded membership.

## 4. RLS acceptance

### Researcher

Log in as:

`leo.c.rossato@gmail.com`

Expected:

- existing Researcher Dashboard opens;
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
- report library aggregates only this laboratory's researchers;
- audio/transcript access is read-only;
- another laboratory is not returned by direct Supabase queries.

### Director

Log in as:

`leonardo.rossato@institutofoton.com.br`

Expected:

- Director Dashboard opens;
- Quântica nos Negócios is visible;
- assigned coordinator is visible;
- assigned researcher is visible;
- Director can create/edit laboratories/projects and assign coordinators;
- all authorized institutional reports are visible read-only;
- access requests can be approved/rejected.

## 5. Management RPCs

V3 creates checked `SECURITY DEFINER` functions:

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

Committing the SQL migration to GitHub does not execute it inside Supabase. The migration must be applied to the actual Supabase project before the V3 role/routing acceptance test can succeed against production data.
