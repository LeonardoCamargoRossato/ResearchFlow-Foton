# ResearchFlow Foton

ResearchFlow is a lightweight open-source research activity reporting system for Instituto Foton.

## V0

The first version validates the researcher workflow:

**Record → Review → Read/Edit transcript → Save → Library → Open report**

Included in V0:

- weekly guidance questions;
- browser microphone recording with `MediaRecorder`;
- recording timer and visual recording state;
- audio preview before saving;
- optional browser-native speech transcription when supported;
- manual transcript review and editing;
- IndexedDB persistence for reports, transcripts, metadata and audio blobs;
- personal report library with search, filters and sorting;
- inline audio playback;
- report detail drawer;
- soft deletion from the researcher interface;
- responsive desktop/mobile UI;
- GitHub Pages deployment.

Not included yet: authentication, Microsoft Entra ID, Supabase, coordinator dashboards, organization roles or AI agents.

## Stack

- React
- TypeScript
- Vite
- MediaRecorder API
- IndexedDB
- optional Web Speech API
- GitHub Actions / GitHub Pages

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The Vite base path is configured for `/ResearchFlow-Foton/`.

## GitHub Pages

The workflow `.github/workflows/deploy-pages.yml` builds and deploys the app from `main`.

Expected URL:

`https://leonardocamargorossato.github.io/ResearchFlow-Foton/`

## Roadmap

- V0 — Researcher audio reports
- V1 — Authentication and researcher profiles
- V2 — Coordinators and research hierarchy
- V3 — Automatic transcription and AI summaries
- V4 — Research governance dashboards
