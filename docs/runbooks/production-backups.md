# Production Backups

Automated backups of the production Supabase database via GitHub Actions, plus a manual script for on-demand backups.

## How it works

- **Script**: `scripts/testing-data.mjs backup --env production`
- **Schedule**: Hourly at `:00` with 5-day retention, plus daily at 06:00 UTC (02:00 AM ET) with 90-day retention
- **Workflow**: `.github/workflows/backup-production.yml`
- **Storage**: GitHub Actions artifacts
- **Local path**: `snapshots/backups/` (gitignored)
- **Coverage**: App-owned production data tables exported by `scripts/testing-data.mjs`: projects, phases, tasks, dependencies, templates, subcontractors, vendor colors, and approved app users

## Manual backup (local)

```bash
npm run backup:production
```

Requires `PRODUCTION_SUPABASE_URL` and `PRODUCTION_SERVICE_ROLE_KEY` in `.env.local`.

## Manual trigger (GitHub)

Actions tab > "Daily Production Backup" > "Run workflow"

## Download a backup

Actions tab > click workflow run > Artifacts section > download zip.

## Restore from backup

```bash
node scripts/testing-data.mjs refresh \
  --env production \
  --snapshot snapshots/backups/latest-production.json \
  --allow-production-refresh
```

Takes a safety backup first, then replaces all data and verifies checksum.

The restore command refuses to run if the selected snapshot is missing any app-owned table required by the current backup script.

## Restore drill in pre-production

Use `branch-super-base` as the safe restore target:

```bash
npm run backup:production
node scripts/testing-data.mjs refresh \
  --env branch-super-base \
  --snapshot snapshots/backups/latest-production.json
npm run testing:status -- \
  --env branch-super-base \
  --snapshot snapshots/backups/latest-production.json
```

Then open the protected Vercel Preview deployment and confirm projects, schedules, templates, subcontractors, colors, and approved-user access behave as expected.

## GitHub Secrets required

Add these in Settings > Secrets and variables > Actions:

- `PRODUCTION_SUPABASE_URL`
- `PRODUCTION_SERVICE_ROLE_KEY`
