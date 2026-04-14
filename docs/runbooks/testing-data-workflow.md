# Testing Data Workflow

This repository treats testing data as a dedicated environment workflow, not just a loose snapshot file.

## Environment names

- `production`: the Supabase project used by `main`
- `branch-super-base`: the shared Supabase project used by feature branches, preview deployments, and local development

Standing default:

- if the request is about any non-`main` branch, assume `branch-super-base`
- only use `production` when the request explicitly says `production`

## What "super base" means now

In day-to-day repo language, "super base" should mean the `branch-super-base` environment unless `production` is stated explicitly.

That gives the team a stable testing reset target without letting routine branch work point at production.

## Commands

Run these from the repository root:

```bash
npm run testing:status
npm run testing:snapshot -- --label "baseline-super-base"
npm run testing:refresh
```

Useful variants:

```bash
npm run testing:status -- --env branch-super-base
npm run testing:snapshot -- --env branch-super-base --label "before-template-rework"
npm run testing:refresh -- --snapshot snapshots/testing-data/latest.json
```

Production is guarded on purpose:

```bash
npm run testing:status -- --env production
npm run testing:snapshot -- --env production --label "manual-production-backup"
npm run testing:refresh -- --env production --allow-production-refresh
```

## Required environment variables

Put these in the root `.env.local` for the operational scripts:

```bash
TESTING_DATA_DEFAULT_ENV=branch-super-base

BRANCH_SUPER_BASE_SUPABASE_URL=...
BRANCH_SUPER_BASE_SERVICE_ROLE_KEY=...

PRODUCTION_SUPABASE_URL=...
PRODUCTION_SERVICE_ROLE_KEY=...
```

Compatibility fallback:

- `branch-super-base` also falls back to the current repo values of `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- this preserves the existing workflow while the environment split is being formalized

## Snapshot behavior

- `testing:snapshot` creates a timestamped JSON export in [snapshots/testing-data](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/snapshots/testing-data:1)
- it also updates `latest.json`
- `testing:refresh` takes a safety backup before restoring
- `testing:status` compares the live database checksum against a snapshot checksum

## Guardrails

- preview and branch workflows should use `branch-super-base`, not `production`
- `testing:refresh` refuses to touch `production` unless `--allow-production-refresh` is supplied
- production backups should be treated as operational events, not normal branch resets
