# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DLRG Lehrgangs-Navigator is a **static web app** (Vite + TypeScript, no framework,
no backend) for planning individual DLRG training paths. It is deployed to GitHub
Pages. The UI and all data are in German; source code identifiers are German too.

The flagship end-to-end scenario is the path to the **DLRG-Lehrschein (181,
DOSB Trainer C Schwimmen/Rettungsschwimmen)**: given a target qualification,
already-held qualifications, and a comfort level (courses per half-year), the app
computes the fastest and the cheapest schedule.

## Commands

```bash
npm install
npm run dev          # dev server at /lehrgang_navigator/
npm test             # Vitest unit tests (tests/unit/, includes Lehrschein scenario)
npx vitest run tests/unit/planner.test.ts   # single test file
npm run build        # tsc --noEmit + vite build → dist/
npm run test:e2e     # Playwright smoke test (builds + serves via vite preview)
npm run crawl        # crawler → data/angebote.json (network required)
```

In sandboxed environments without matching Playwright browsers, run
`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test`.

## Architecture

```
data/lehrgaenge.json     course catalogue – the single source of truth
data/angebote.json       crawler output; real prices override catalogue estimates
        │
        ▼
src/lib/catalog.ts       indiziereKatalog() validates referential integrity
src/lib/graph.ts         erweitereVorhanden() (transitive completion),
                         sammleBenoetigte() (DFS), topologischSortiert() (Kahn)
src/lib/planner.ts       plane() → { schnell, guenstig }:
                           ASAP scheduling  = fastest plan
                           ALAP within same makespan = cheapest plan (keeps
                           prerequisites fresh → fewer refresher courses)
                           repariereFrische() inserts refreshers (321, 333) when
                           validity windows (frische) would be violated
src/main.ts              vanilla-TS UI, state in localStorage, German labels
crawler/crawl.mjs        separate Node script (no deps); NOT part of the app build
```

Half-year slots are the planning unit: slot 0 = the half-year after "today";
`angebot: "jaehrlich"` courses are assumed to run only in the first calendar
half-year. Ages of prerequisites are measured in half-year steps (0.5 years/slot).

## Key Conventions

- **Course IDs** are the DLRG PO numbers as strings (`"181"`, `"311_eh"`, …),
  defined in `data/lehrgaenge.json`. Display names come from `titel`.
- Catalogue fields `frische` (max age of a prerequisite in years at course time)
  and `auffrischung_fuer` (which qualifications a course renews) drive the
  cheapest-plan logic. `extern: true` marks non-course prerequisites (medical
  checks, membership) that are listed but never scheduled.
- Costs/Lehreinheiten in the catalogue are **estimates**; real offers from the
  crawler (data/angebote.json) override them at build time (`src/lib/angebote.ts`).
- Tests live in `tests/unit` (Vitest, node environment — no DOM) and `tests/e2e`
  (Playwright). The Lehrschein scenario test
  (`tests/unit/lehrschein.szenario.test.ts`) encodes the product's acceptance
  criteria — keep it green and meaningful.
- `vite.config.ts` sets `base: "/lehrgang_navigator/"` (the repo name) for dev,
  preview and build alike; override with the `PAGES_BASE` env var if the repo
  name changes.
- CI: `.github/workflows/ci.yml` (tests + build + e2e), `deploy.yml` (Pages
  deploy from `main`; requires Settings → Pages → Source: GitHub Actions).
