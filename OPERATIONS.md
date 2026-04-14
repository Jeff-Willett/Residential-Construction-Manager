# Operations & Deployment Guide

This document outlines the operational setup, deployment workflow, and troubleshooting steps for the **Residential Construction Manager**.

## Environment Split

The repository now targets two Supabase environments:

- `production`: used by `main` and Vercel Production
- `branch-super-base`: used by local development, feature branches, and Vercel Preview

This split keeps testing resets away from production and makes branch work safer.

Reference docs:

- [TESTING_DATA.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/TESTING_DATA.md:1)
- [BRANCH_SUPER_BASE_SETUP.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/BRANCH_SUPER_BASE_SETUP.md:1)
- [ENVIRONMENT_POLICY.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/ENVIRONMENT_POLICY.md:1)

## 🏗️ Architecture & Tech Stack

- **Codebase/Framework**: React + TypeScript built with Vite.
- **Directory Structure**: All of the core frontend application code, package management (`package.json`), and configurations live inside the `app/` directory. The root directory contains project-level documentation and initial conceptual files.
- **Source Control**: Hosted on GitHub (`Jeff-Willett/Residential-Construction-Gantt-Manager`).
- **Hosting & CI/CD**: Deployed and hosted on **Vercel**.

## 🚀 Deployment Workflow (GitHub $\rightarrow$ Vercel)

The application is configured for continuous deployment (CD) through Vercel.

1. **Automatic Deployments**: Any commit pushed to the `main` branch of the GitHub repository will automatically trigger a new deployment build on Vercel. 
2. **Vercel Configuration (CRITICAL)**: 
   - Because the React Native/Vite code is nested inside the repository, Vercel is specifically configured with its **Root Directory set to `app`**.
   - If you ever need to recreate or move the Vercel project, remember to go into the Vercel Project Settings and change the Root Directory from the default (`./`) to `app`.
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build` (Automatically detected by Vercel)
   - **Output Directory**: `dist` (Automatically detected by Vercel)
3. **Supabase Environment Mapping**:
   - **Production deployment** uses the production Supabase URL/key pair.
   - **Preview deployments** use the branch-super-base Supabase URL/key pair.
   - Do not point preview deployments at production.
   - Standing repo rule: `main` means production; every non-`main` branch means branch-super-base.

## 🛠️ Local Development Setup

If you need to reproduce or test something locally before it goes to Vercel:

1. Open your terminal and navigate to the `app` directory:
   ```bash
   cd app
   ```
2. Install the necessary dependencies (if you haven't recently):
   ```bash
   npm install
   ```
3. Start the local development server:
   ```bash
   npm run dev
   ```
   This will spin up a local server (usually at `http://localhost:5173`) where you can test your changes.
4. Use the branch-super-base credentials in `app/.env.local` for normal development. Production credentials should stay out of the app runtime unless we are intentionally validating production.

## Testing Data Operations

Testing-data commands now live at the repository root:

```bash
npm run testing:status
npm run testing:snapshot -- --label "baseline-super-base"
npm run testing:refresh
```

Important safety rule:

- `testing:refresh` is for `branch-super-base` by default
- production refreshes require an explicit override flag and should be treated as recovery events

## Backup Readiness

Production backups are a separate operational track from the environment split, but this environment split supports that future work.

Current expectation:

- branch/testing resets happen in `branch-super-base`
- production snapshot and restore actions stay explicit and guarded
- when we implement scheduled backups, they should target the production project only

## 🚑 Troubleshooting

If the deployed website breaks or fails to update, here is how you can troubleshoot:

### 1. Build Fails on Vercel
- **Symptom**: You pushed code to GitHub, but the live site didn't update and you received an email from Vercel saying the build failed.
- **Action**: Log into your [Vercel Dashboard](https://vercel.com/), find the "Residential Construction Manager" project, and click on the "Deployments" tab. Click on the failed deployment to view the build logs.
- **Common Causes**: 
  - A TypeScript typing error. (Run `npm run build` locally inside the `app/` folder to see the exact error).
  - A missing dependency. (Ensure you ran `npm install <package-name>` inside the `app/` directory so it gets added to `app/package.json`).

### 2. Automatic Deployments Stopped Working
- **Symptom**: Code is pushed to GitHub, but Vercel doesn't register a new deployment at all.
- **Action**: Check the Vercel Project Settings under **Git**. Sometimes permissions can get revoked. Ensure the GitHub repository is still successfully connected to the Vercel project. 

### 3. "Page Not Found" or Routing Issues on Reload
- **Symptom**: Refreshing a page other than the home page returns an error (like a 404).
- **Action**: While Vite handles typical single-page application (SPA) routing, ensure there is a `vercel.json` file inside the `app/` directory (if you use React Router) that rewrites all traffic back to `index.html`. *(Note: This is automatically configured by the Vite Vercel preset in most normal circumstances).*
