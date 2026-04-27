# Branch Super Base Setup Checklist

Use this when creating or validating the second Supabase project for issue `#20`.

## Goal

- `main` talks to `production`
- preview deployments, local development, and feature branches talk to `branch-super-base`

## 1. Create the second Supabase project

- create a new Supabase project named `rcgm-branch-super-base` or similar
- keep it in the same organization or account as production if possible
- record its project ref, URL, anon key, and service role key

## 2. Apply the schema

- run the repo migration in [supabase/migrations/20260410233000_phase_hierarchy_migration.sql](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/supabase/migrations/20260410233000_phase_hierarchy_migration.sql:1)
- if the new project is blank, also apply [supabase_schema.sql](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/supabase_schema.sql:1) first
- confirm all app tables exist before data copy

## 3. Seed the new branch-super-base database

- point the root `.env.local` at the new branch-super-base service-role credentials
- take a snapshot from the current source environment:
  - `npm run testing:snapshot -- --env branch-super-base --label "baseline-super-base"`
- if production is still the current source of truth, take an explicit production snapshot first:
  - `npm run testing:snapshot -- --env production --label "production-export-for-branch-super-base"`
- refresh the new branch-super-base database from the chosen snapshot
- run `npm run testing:status -- --env branch-super-base` and confirm `Status: MATCH`

## 4. Wire local development

- in `app/.env.local`, use the branch-super-base `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- in the root `.env.local`, set:
  - `TESTING_DATA_DEFAULT_ENV=branch-super-base`
  - `BRANCH_SUPER_BASE_SUPABASE_URL=...`
  - `BRANCH_SUPER_BASE_SERVICE_ROLE_KEY=...`
- keep production credentials in the root `.env.local` for backup and status tooling only

## 5. Wire Vercel environments

- Vercel Production environment:
  - `VITE_SUPABASE_URL` = production URL
  - `VITE_SUPABASE_ANON_KEY` = production anon key
- Vercel Preview environment:
  - `VITE_SUPABASE_URL` = branch-super-base URL
  - `VITE_SUPABASE_ANON_KEY` = branch-super-base anon key

## 6. Protect production

- do not run `testing:refresh` against production except as an intentional recovery action
- keep production refresh/restore actions explicit and guarded
- document who is allowed to use production service-role credentials

## 7. Verify the split

- open a preview deployment and confirm test edits land in branch-super-base only
- open `main` and confirm production data is unchanged
- take one manual snapshot of each environment and save the filenames in the issue notes

## Future follow-up

- optionally add a dedicated script alias such as `testing:refresh:branch`
