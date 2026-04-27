# Agent Notes

Use this file as the first stop for Codex/agent work in this repository.

## Project Shape

- Frontend app: `app/`
- Operational scripts and runbooks: repository root and `docs/runbooks/`
- Supabase data tooling: `scripts/testing-data.mjs`
- Production backup workflow: `.github/workflows/backup-production.yml`

## Environment Rules

- `production` is the live Supabase database and Vercel Production.
- `branch-super-base` is the shared testing/pre-production Supabase database.
- Local development, feature branches, and Vercel Preview should use `branch-super-base`.
- Do not refresh or restore production unless the user explicitly asks for a production recovery action.

## Pre-Production

When the user says "pre-production", treat it as:

- Vercel Preview deployment
- backed by `branch-super-base`
- protected by Supabase Google auth and the app's approved-user gate

Before sharing a pre-production URL, verify the preview build uses matching branch-super-base credentials:

- `VITE_SUPABASE_URL` must point to branch-super-base, currently project ref `qjsjsemxtmatlpmvsmoi`
- `VITE_SUPABASE_ANON_KEY` must be the anon key from that same branch-super-base project
- mismatched URL/key pairs cause the app to show `Invalid API key` after Google sign-in

If Vercel Preview env is stale, deploy with explicit build-time env values from `app/.env.local`:

```bash
URL=$(grep '^VITE_SUPABASE_URL=' app/.env.local | cut -d= -f2-)
KEY=$(grep '^VITE_SUPABASE_ANON_KEY=' app/.env.local | cut -d= -f2-)
npx vercel --yes --force \
  --build-env VITE_SUPABASE_URL="$URL" \
  --build-env VITE_SUPABASE_ANON_KEY="$KEY"
```

## Production Backups And Restore Drills

Production backups run through GitHub Actions and are stored as artifacts.

- Hourly backups: 5-day retention
- Daily backups: 90-day retention
- Runbook: `docs/runbooks/production-backups.md`

When asked to refresh pre-production from production or from a backup:

1. Find the desired GitHub backup run.
2. Download the backup artifact.
3. Restore only into `branch-super-base`.
4. Run `testing:status` against the same snapshot and require `Status: MATCH`.
5. Deploy/verify a Vercel Preview with matching branch-super-base URL and anon key.

Useful commands:

```bash
gh run list \
  --repo Jeff-Willett/Residential-Construction-Manager \
  --workflow backup-production.yml \
  --limit 30

node scripts/testing-data.mjs refresh \
  --env branch-super-base \
  --snapshot /path/to/latest-production.json

npm run testing:status -- \
  --env branch-super-base \
  --snapshot /path/to/latest-production.json
```

## Restore Coverage

The app-owned backup currently covers:

- `projects`
- `phase_templates`
- `task_templates`
- `template_dependencies`
- `project_phases`
- `tasks`
- `dependencies`
- `subcontractors`
- `vendor_colors`
- `app_users`

This is an app-table JSON recovery path, not a full Supabase/Postgres platform backup.

## References

- Environment policy: `docs/runbooks/environment-policy.md`
- Production backups: `docs/runbooks/production-backups.md`
- Branch super base setup: `docs/runbooks/branch-super-base-setup.md`
- Commands reference: `docs/reference/commands-and-environments.md`
