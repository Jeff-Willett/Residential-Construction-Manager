# Commands And Environments

This page is the quick reference for operational commands and environment variables used by the repository.

## Supported environments

- `branch-super-base`: default for local work, feature branches, and Vercel Preview
- `production`: reserved for `main` and Vercel Production

## Root commands

Run these from the repository root:

```bash
npm run testing:status
npm run testing:snapshot -- --label "baseline-super-base"
npm run testing:refresh
```

Useful variants:

```bash
npm run testing:status -- --env branch-super-base
npm run testing:status -- --env production
npm run testing:snapshot -- --env branch-super-base --label "before-template-rework"
npm run testing:refresh -- --snapshot snapshots/testing-data/latest.json
```

Production is guarded:

```bash
npm run testing:refresh -- --env production --allow-production-refresh
```

## App runtime variables

These belong in `app/.env.local`:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

For normal development, these should point to `branch-super-base`.

## Root operational variables

These belong in the repository root `.env.local`:

```bash
TESTING_DATA_DEFAULT_ENV=branch-super-base

BRANCH_SUPER_BASE_SUPABASE_URL=...
BRANCH_SUPER_BASE_SERVICE_ROLE_KEY=...

PRODUCTION_SUPABASE_URL=...
PRODUCTION_SERVICE_ROLE_KEY=...
```

## Script behavior notes

- `testing:status` compares a live environment checksum to a stored snapshot
- `testing:snapshot` exports the current environment data to `snapshots/testing-data/`
- `testing:refresh` backs up the target first, then replaces its data from a snapshot
- `branch-super-base` can fall back to `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for compatibility

## Related docs

- [docs/runbooks/environment-policy.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/runbooks/environment-policy.md:1)
- [docs/runbooks/testing-data-workflow.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/runbooks/testing-data-workflow.md:1)
- [docs/runbooks/branch-super-base-setup.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/runbooks/branch-super-base-setup.md:1)
