# Production Backups

Daily automated backups of the production Supabase database via GitHub Actions, plus a manual script for on-demand backups.

## How it works

- **Script**: `scripts/testing-data.mjs backup --env production`
- **Schedule**: Daily at 06:00 UTC (02:00 AM ET)
- **Workflow**: `.github/workflows/backup-production.yml`
- **Storage**: GitHub Actions artifacts (90-day retention)
- **Local path**: `snapshots/backups/` (gitignored)

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

## GitHub Secrets required

Add these in Settings > Secrets and variables > Actions:

- `PRODUCTION_SUPABASE_URL`
- `PRODUCTION_SERVICE_ROLE_KEY`
