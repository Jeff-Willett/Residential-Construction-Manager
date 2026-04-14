# Branch Super Base Setup Checklist

Use this when we create the second Supabase project for issue 20.

## Goal

- `main` talks to `production`
- preview deployments, local development, and feature branches talk to `branch-super-base`

## 1. Create the second Supabase project

- Create a new Supabase project named `rcgm-branch-super-base` or similar
- Keep it in the same organization/account as production if possible
- Record its project ref, URL, anon key, and service role key

## 2. Apply the schema

- Run the repo migration in [supabase/migrations/20260410233000_phase_hierarchy_migration.sql](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/supabase/migrations/20260410233000_phase_hierarchy_migration.sql:1)
- If the new project is blank, also apply [supabase_schema.sql](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/supabase_schema.sql:1) first
- Confirm all app tables exist before data copy

## 3. Seed the new branch-super-base database

- Point the root `.env.local` at the new branch-super-base service-role credentials
- Take a snapshot from the current source environment:
  - `npm run testing:snapshot -- --env branch-super-base --label "baseline-super-base"`
- If production is still the current source of truth, take an explicit production snapshot first:
  - `npm run testing:snapshot -- --env production --label "production-export-for-branch-super-base"`
- Refresh the new branch-super-base database from the chosen snapshot
- Run `npm run testing:status -- --env branch-super-base` and confirm `Status: MATCH`

## 4. Wire local development

- In `app/.env.local`, use the branch-super-base `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- In the root `.env.local`, set:
  - `TESTING_DATA_DEFAULT_ENV=branch-super-base`
  - `BRANCH_SUPER_BASE_SUPABASE_URL=...`
  - `BRANCH_SUPER_BASE_SERVICE_ROLE_KEY=...`
- Keep production credentials in the root `.env.local` for backup/status tooling only

## 5. Wire Vercel environments

- Vercel Production environment:
  - `VITE_SUPABASE_URL` = production URL
  - `VITE_SUPABASE_ANON_KEY` = production anon key
- Vercel Preview environment:
  - `VITE_SUPABASE_URL` = branch-super-base URL
  - `VITE_SUPABASE_ANON_KEY` = branch-super-base anon key

## 6. Protect production

- Do not run `testing:refresh` against production except as an intentional recovery action
- Keep production snapshot/backup actions manual until the backup plan is implemented
- Document who is allowed to use production service-role credentials

## 7. Verify the split

- Open a preview deployment and confirm test edits land in branch-super-base only
- Open `main` and confirm production data is unchanged
- Take one manual snapshot of each environment and save the filenames in the issue notes

## Future follow-up

- Add scheduled production snapshot/backups
- Add a deliberate `production -> branch-super-base` refresh runbook
- Optionally add a dedicated script alias such as `testing:refresh:branch`
