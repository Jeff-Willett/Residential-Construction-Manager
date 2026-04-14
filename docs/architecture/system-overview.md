# System Overview

This project is a residential construction scheduling tool with a React frontend and a Supabase-backed data model.

## Primary building blocks

- `app/`: the frontend application
- `scripts/testing-data.mjs`: operational snapshot and refresh tooling for Supabase environments
- `supabase/` and `supabase_schema.sql`: schema and migration assets
- `snapshots/testing-data/`: generated snapshot files used for testing-data workflows

## Frontend structure

The app lives under `app/src/` and is organized around a few central concepts:

- `App.tsx` is the shell and top-level UI orchestration
- `store/projectStore.ts` is the main Zustand state layer and Supabase integration point
- `components/GanttChart.tsx` renders the scheduling view
- `components/AddProjectModal.tsx` handles project creation and editing
- `components/TemplateStudioModal.tsx` manages schedule phases, scopes, and dependencies
- `components/FilterModal.tsx` manages project, subcontractor, and scope filtering
- `components/VendorColorModal.tsx` manages vendor color settings
- `utils/schedulingEngine.ts` calculates the scheduling logic used to render tasks and dependencies

## Data model at a glance

The app reads and writes several core Supabase tables:

- `projects`
- `project_phases`
- `tasks`
- `dependencies`
- `phase_templates`
- `task_templates`
- `template_dependencies`
- `vendor_colors`

In practice, templates define the baseline structure for a schedule, and projects materialize that baseline into editable project tasks.

## Environment architecture

The repository intentionally separates live and testing workflows:

- `production`: used by `main` and Vercel Production
- `branch-super-base`: used by local development, feature branches, and Vercel Preview

This keeps branch work and testing resets away from live production data.

## Deployment model

- source control: GitHub
- frontend hosting: Vercel
- runtime database: Supabase

Vercel should use `app/` as the project root for builds and deployments.

## Documentation map

- operational runbook: [docs/runbooks/operations-and-deployment.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/runbooks/operations-and-deployment.md:1)
- environment policy: [docs/runbooks/environment-policy.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/runbooks/environment-policy.md:1)
- testing data workflow: [docs/runbooks/testing-data-workflow.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/runbooks/testing-data-workflow.md:1)
- user guide: [docs/user-guide/how-to-use-the-tool.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/user-guide/how-to-use-the-tool.md:1)
