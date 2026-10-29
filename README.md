# ResearchFlow Foton

ResearchFlow is the Instituto Foton research activity reporting environment.

Current flow:

**Google Identity → Supabase Auth → ResearchFlow Membership → Role/Scope → PostgreSQL RLS → Authorized research data**

## Current functionality

- Google login through Supabase Auth;
- institutional membership gate after authentication;
- unauthorized-access screen and access-request flow;
- four roles: `researcher`, `lab_coordinator`, `vertical_coordinator`, `director`;
- laboratories and research verticals represented in PostgreSQL;
- researcher audio recorder and personal report library;
- editable transcripts;
- private `research-audio` Supabase Storage bucket;
- signed audio access;
- soft deletion for the researcher view;
- role-aware coordinator/director workspace shells;
- hierarchical PostgreSQL Row Level Security (RLS);
- director-only access-request approval/rejection RPC;
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
Role + organizational scope
    ↓
PostgreSQL + Row Level Security
    ↓
Supabase Storage / authorized research reports
```

Authentication and authorization are deliberately separate. Google/Supabase proves who the user is; `public.memberships` determines whether that identity is allowed into ResearchFlow and which data it may read.

## Authorization levels

1. **Researcher** — own reports and own audio.
2. **Laboratory Coordinator** — researchers/reports in the assigned laboratory, read-only.
3. **Vertical Coordinator** — laboratories/researchers/reports in the assigned vertical, read-only.
4. **Director** — institution-wide visibility, read-only for researcher report content in this iteration.

Actual data authorization is enforced by PostgreSQL RLS and Storage policies, not only by React conditions.

## Supabase migrations

Apply in order:

```text
supabase/researchflow_v1.sql
supabase/researchflow_v2_governance.sql
```

V2 adds:

- `research_verticals`;
- `laboratories`;
- `memberships`;
- `access_requests`;
- membership-linking/helper functions;
- hierarchical report RLS;
- hierarchical private Storage policies;
- director approval/rejection RPC.

See `docs/GOVERNANCE_SETUP.md` for configuration and first-user bootstrap.

## Environment variables

Frontend/public configuration only:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Never expose a Supabase service-role key, database password, Google client secret or transactional-email API key in the GitHub Pages bundle.

For the optional Edge Function, server-side secrets are documented separately:

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

## Build

```bash
npm run build
npm run typecheck
```

The Vite base path remains `/ResearchFlow-Foton/`.

## GitHub Pages

`.github/workflows/deploy-pages.yml` deploys `main` to:

`https://leonardocamargorossato.github.io/ResearchFlow-Foton/`

OAuth redirects must return to that URL.

## Deliberately deferred

- AI summaries and production transcription services;
- KPIs and analytics;
- Power BI / SharePoint / Microsoft Entra ID;
- project/publication management;
- research scoring and gamification;
- complex final coordinator dashboards.

The current governance milestone is:

**Identity → Membership → Role → Organizational Scope → RLS → Authorized Research Data.**
