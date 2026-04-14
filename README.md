# Residential Construction Manager

Residential Construction Manager is a Vite + React + TypeScript application for building and maintaining residential construction schedules backed by Supabase.

The repository is split into two practical layers:

- `app/` contains the frontend application
- the repository root contains operational tooling and project documentation

## Quick Start

1. Install root dependencies for operational scripts:

```bash
npm install
```

2. Install app dependencies:

```bash
cd app
npm install
```

3. Configure environment variables:

- copy the root environment structure from [.env.local.example](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/.env.local.example:1)
- create `app/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

4. Start the app locally:

```bash
cd app
npm run dev
```

## Environment Model

The project uses a deliberate Supabase split:

- `main` and Vercel Production use `production`
- local development, feature branches, and Vercel Preview use `branch-super-base`

If a task does not explicitly say `production`, it should use `branch-super-base`.

## Documentation

- Architecture: [docs/architecture/system-overview.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/architecture/system-overview.md:1)
- Runbooks: [docs/runbooks/operations-and-deployment.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/runbooks/operations-and-deployment.md:1)
- User guide: [docs/user-guide/how-to-use-the-tool.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/user-guide/how-to-use-the-tool.md:1)
- Reference: [docs/reference/commands-and-environments.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/reference/commands-and-environments.md:1)
- App-specific notes: [app/README.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/app/README.md:1)

## Testing Data Commands

Run these from the repository root:

```bash
npm run testing:status
npm run testing:snapshot -- --label "baseline-super-base"
npm run testing:refresh
```

Production refreshes are intentionally guarded and require an explicit override.
