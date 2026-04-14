# App README

This directory contains the frontend application for Residential Construction Manager.

## Stack

- Vite
- React
- TypeScript
- Zustand for client state
- Supabase for backend data

## Local development

1. Install dependencies:

```bash
npm install
```

2. Create `app/.env.local` with:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

For normal development, these should point to `branch-super-base`.

3. Start the dev server:

```bash
npm run dev
```

## App structure

- `src/App.tsx`: top-level shell, environment badges, and modal orchestration
- `src/store/projectStore.ts`: main state and Supabase data access layer
- `src/components/GanttChart.tsx`: primary chart rendering
- `src/components/AddProjectModal.tsx`: create and edit projects
- `src/components/TemplateStudioModal.tsx`: edit phases, scopes, and dependencies
- `src/components/FilterModal.tsx`: filter by project, subcontractor, and scope
- `src/components/VendorColorModal.tsx`: manage vendor colors
- `src/utils/schedulingEngine.ts`: schedule calculation logic

## Important behavior

- the app shows the current environment label in the header
- if Supabase credentials are missing, the app loads with a connection warning instead of crashing
- preview and local work should use `branch-super-base`

## Related docs

- [README.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/README.md:1)
- [docs/architecture/system-overview.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/architecture/system-overview.md:1)
- [docs/user-guide/how-to-use-the-tool.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/user-guide/how-to-use-the-tool.md:1)
