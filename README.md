# ResearchFlow Foton

ResearchFlow is the Instituto Foton research activity reporting environment.

Current flow:

**Google Identity → Supabase Auth → ResearchFlow Membership → Role/Laboratory Scope → PostgreSQL RLS → Authorized research data**

## Functional hierarchy

ResearchFlow has exactly three functional access levels:

```text
Director / General Management
        ↓
Laboratory Coordinator
        ↓
Researcher
```

Projects and laboratories are the same managed research unit. The existing `laboratories` table remains the single source of truth; there is no duplicate project hierarchy.

## Current functionality

- Google login through Supabase Auth;
- institutional membership gate after authentication;
- unauthorized-access screen and access-request flow;
- three roles: `researcher`, `lab_coordinator`, `director`;
- Director Dashboard with projects/laboratories, coordinators, researchers, reports and access requests;
- Laboratory Coordinator Dashboard with researcher management, aggregated report library and coordinator weekly reports;
- researcher audio recorder and personal report library;
- editable own transcripts;
- coordinator/director read-only access to researcher-generated reports;
- private `research-audio` Supabase Storage bucket and signed audio access;
- soft deletion preserving governance history;
- PostgreSQL Row Level Security (RLS) for reports, memberships and laboratories;
- secure PostgreSQL RPCs for privileged management actions;
- optional access-request notification Edge Function;
- responsive UI and GitHub Pages deployment.

## Architecture

```text
GitHub Pages
    ↓
React + TypeScript + Vite
    ↓
Supabase Auth
    ↓
Google OAuth
    ↓
ResearchFlow membership registry
    ↓
Three-level role + laboratory scope
    ↓
PostgreSQL + Row Level Security
    ↓
Supabase Storage / authorized research reports
```

Authentication and authorization remain deliberately separate. Google/Supabase proves identity; `public.memberships` determines whether that identity is authorized and which institutional scope it may access.

## Authorization levels

1. **Researcher** — own recorder, own reports, own audio and own transcript editing.
2. **Laboratory Coordinator** — own laboratory only; manages its researcher memberships, reads their reports/audio/transcripts and creates own coordinator reports.
3. **Director** — institution-wide structural management and read-only visibility of researcher-generated content.

Actual authorization is enforced by PostgreSQL RLS and checked RPC functions, not only by React conditions.

## Supabase migrations

Apply in order:

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

The current patches add or change:

- exactly three functional roles;
- scoped laboratory/member/report RLS;
- private audio authorization;
- secure project/laboratory management RPCs;
- secure coordinator researcher-management RPCs;
- initial `Quântica nos Negócios` seed;
- coordinator own weekly reports;
- current Director membership correction.

See `docs/V3_SETUP.md` for rollout and acceptance testing.

## Current test memberships

| Role | Email | Project / Laboratory |
| --- | --- | --- |
| Director | `institutofotonmais@gmail.com` | Entire ResearchFlow |
| Laboratory Coordinator | `leonardo.rossato.coordenador@gmail.com` | Quântica nos Negócios |
| Researcher | `leo.c.rossato@gmail.com` | Quântica nos Negócios |

The former Director membership `leonardo.rossato@institutofoton.com.br` is revoked by V4.1. Authorization is not hardcoded in React.

## Environment variables

Frontend/public configuration only:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Never expose a Supabase service-role key, database password, Google client secret or transactional-email API key in the GitHub Pages bundle.

For the optional access-request notification Edge Function:

```text
ADMIN_NOTIFICATION_EMAIL
RESEND_API_KEY
ACCESS_NOTIFICATION_FROM_EMAIL
```

## Local development

```bash
npm install
npm run dev
```

## Validation and build

```bash
npm run typecheck
npm run build
```

GitHub Actions runs TypeScript validation before every Pages build.

The Vite base path remains `/ResearchFlow-Foton/`.

## GitHub Pages

`.github/workflows/deploy-pages.yml` deploys `main` to:

`https://leonardocamargorossato.github.io/ResearchFlow-Foton/`

OAuth redirects must return to that URL.

## Deliberately deferred

- charts and complex analytics;
- AI summaries;
- automatic transcription backend;
- email reminders;
- performance ranking or research scoring;
- complex KPIs;
- project milestones and task management;
- publication management.

The current hierarchy is:

**Director → Project/Laboratory → Coordinator → Researchers → Reports**.
