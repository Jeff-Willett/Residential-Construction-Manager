# Operations And Deployment Guide

This document outlines the operational setup, deployment workflow, and troubleshooting steps for the Residential Construction Manager.

## Environment split

The repository targets two Supabase environments:

- `production`: used by `main` and Vercel Production
- `branch-super-base`: used by local development, feature branches, and Vercel Preview

Reference docs:

- [docs/runbooks/testing-data-workflow.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/runbooks/testing-data-workflow.md:1)
- [docs/runbooks/branch-super-base-setup.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/runbooks/branch-super-base-setup.md:1)
- [docs/runbooks/environment-policy.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/runbooks/environment-policy.md:1)

## Architecture and tech stack

- framework: React + TypeScript with Vite
- state and data layer: Zustand + Supabase
- hosting: Vercel
- source control: GitHub

The frontend code lives in `app/`, while project-level scripts and documentation live at the repository root.

## Deployment workflow

1. Push code to GitHub.
2. Vercel builds the project using `app/` as the root directory.
3. Production deploys should use production Supabase credentials.
4. Preview deploys should use branch-super-base Supabase credentials.

Standing rule:

- `main` means production
- every non-`main` branch means branch-super-base

## Local development

1. From the repository root, install root dependencies if needed:

```bash
npm install
```

2. Move into `app/` and install frontend dependencies:

```bash
cd app
npm install
```

3. Start the app:

```bash
npm run dev
```

4. Use branch-super-base credentials in `app/.env.local` for normal development.

## Testing data operations

Testing-data commands live at the repository root:

```bash
npm run testing:status
npm run testing:snapshot -- --label "baseline-super-base"
npm run testing:refresh
```

Important safety rule:

- `testing:refresh` defaults to `branch-super-base`
- production refreshes require an explicit override and should be treated as recovery events

## Backup readiness

Production backups are a separate operational track from the environment split, but this split is what makes safe testing resets possible.

Current expectation:

- branch and testing resets happen in `branch-super-base`
- production snapshot and restore actions stay explicit and guarded
- future scheduled backups should target production only

## Troubleshooting

### Build fails on Vercel

- check the deployment logs in Vercel
- run `npm run build` inside `app/` locally
- confirm missing dependencies were added to `app/package.json`

### Automatic deployments stop working

- confirm the GitHub repository is still connected in Vercel project settings
- confirm the project root is still set to `app`

### The app shows a backend connection error

- verify `app/.env.local`
- verify the expected Supabase project is being used for the current branch/environment
- confirm the app can reach Supabase with valid anon credentials
