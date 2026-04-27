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

## Refresh pre-production from a GitHub backup

Use this when the request is like "refresh pre-production from production" or "refresh pre-production with yesterday's backup."

1. Identify the desired backup run:

```bash
gh run list \
  --repo Jeff-Willett/Residential-Construction-Manager \
  --workflow backup-production.yml \
  --limit 30
```

Prefer a `production-backup-daily-*` artifact for date-based requests such as yesterday. Use hourly artifacts when the request asks for a more specific point in time.

2. Download the artifact:

```bash
rm -rf /tmp/rcgm-backup-restore
mkdir -p /tmp/rcgm-backup-restore
gh run download <run-id> \
  --repo Jeff-Willett/Residential-Construction-Manager \
  --name production-backup-daily-<run-id> \
  --dir /tmp/rcgm-backup-restore
```

3. Restore only into `branch-super-base`:

```bash
node scripts/testing-data.mjs refresh \
  --env branch-super-base \
  --snapshot /tmp/rcgm-backup-restore/latest-production.json
npm run testing:status -- \
  --env branch-super-base \
  --snapshot /tmp/rcgm-backup-restore/latest-production.json
```

The expected result is `Status: MATCH`.

4. Verify Vercel Preview is wired to `branch-super-base` before sharing a pre-production link:

- `VITE_SUPABASE_URL` must be the branch-super-base URL, currently project ref `qjsjsemxtmatlpmvsmoi`
- `VITE_SUPABASE_ANON_KEY` must be the anon key from that same branch-super-base Supabase project
- a mismatched URL/key pair causes Google sign-in to return `Invalid API key`

If the Vercel Preview project env is stale or missing the branch anon key, deploy the pre-production preview with explicit build-time env values from `app/.env.local`:

```bash
URL=$(grep '^VITE_SUPABASE_URL=' app/.env.local | cut -d= -f2-)
KEY=$(grep '^VITE_SUPABASE_ANON_KEY=' app/.env.local | cut -d= -f2-)
npx vercel --yes --force \
  --build-env VITE_SUPABASE_URL="$URL" \
  --build-env VITE_SUPABASE_ANON_KEY="$KEY"
```

5. Open the resulting Vercel Preview URL and complete Google sign-in. Confirm the app opens to the schedule workspace, not the sign-in page, access-restricted page, or `Invalid API key` error.

## GitHub Secrets required

Add these in Settings > Secrets and variables > Actions:

- `PRODUCTION_SUPABASE_URL`
- `PRODUCTION_SERVICE_ROLE_KEY`
