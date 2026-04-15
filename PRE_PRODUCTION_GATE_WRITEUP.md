# Pre-Production Gate Write-Up

## Purpose

This document is a handoff for building a repeatable pre-production gate for the Residential Construction Gantt Manager. The goal is to prevent production-breaking changes from being merged or deployed without explicit checks for data safety, rollback safety, and realistic validation.

This write-up is based on the production incident where project edit behavior left production with:

- `projects` present
- `project_phases` present
- `tasks = 0`
- `dependencies = 0`

The app itself still loaded, but there was no schedule data left to render.

## What Happened

The project edit flow used a delete-then-rebuild pattern:

1. Update project metadata
2. Delete dependencies
3. Delete tasks
4. Delete project phases
5. Recreate phases
6. Recreate tasks
7. Recreate dependencies

The problem was that this sequence was not wrapped in a transaction and did not have safe rollback behavior. If anything failed after the deletes, production could be left in a half-saved or empty state.

This is not a frontend rendering issue. It is a persistence safety issue.

## Root Cause

The root cause was a risky persistence pattern in application code:

- destructive writes happened before safe reconstruction was guaranteed
- there was no database transaction around the multi-step update
- there was no enforced deployment gate to catch risky data mutation paths
- the happy path worked, but the failure path was not protected

In short: the code path was fragile under partial failure.

## Recovery Summary

Production was recovered by reconstructing schedule data from production's existing template tables:

- `phase_templates`
- `task_templates`
- `template_dependencies`
- `project_phases`

This restored baseline project schedules for the existing production projects, but it does not guarantee recovery of any prior custom manual edits that were lost before the rebuild.

## Goal

Create a repeatable process so any future change that can affect production data must pass through a gate before merge or deploy.

The gate should catch:

- destructive write patterns
- delete-then-rebuild persistence flows
- missing transaction or rollback safety
- unsafe schema/data migrations
- untested production edit flows
- environment drift between local, preview, and production

## Methodology

### 1. Classify Risk Before Merge

Every change should be tagged internally as one of:

- Low risk: visual/UI only
- Medium risk: local state or scheduling logic only
- High risk: database writes, edits, deletes, migrations, environment changes

Any high-risk change must go through the full gate.

### 2. Review for Persistence Safety

For any code that writes to Supabase or mutates persisted rows, explicitly review:

- Does it delete before replacement is confirmed?
- Does it update multiple tables in one logical operation?
- Is there a real transaction?
- If not, is there rollback protection?
- Can partial failure leave orphaned or empty data?
- Can the operation be retried safely?

### 3. Validate Against a Realistic Dataset

Do not rely only on empty-state or template-only tests.

Before production approval, validate against a dataset that includes:

- multiple projects
- multiple phases
- tasks with dependencies
- cross-project subcontractor/resource constraints
- existing edited tasks, not just pristine template data

### 4. Require Happy Path and Failure Path Checks

Every high-risk feature must be checked in two modes:

- Happy path: expected user action works
- Failure path: interruption or partial failure does not destroy data

Examples:

- editing a project should preserve data if task recreation fails
- dependency rebuild failure should not leave the project empty
- migration failure should not partially wipe live rows

### 5. Compare Environments Before Deploy

Before production deploy, verify:

- local env target
- preview env target
- production env target
- Supabase URL and project identity
- whether the preview dataset actually resembles production

This avoids false confidence from testing against the wrong database.

### 6. Gate Production Deploys

Production should only deploy from reviewed `main` after required checks pass.

No production-sensitive change should be treated as "safe because the UI works locally."

## Requirements

### A. Codex/Windsurf Skill

Create a reusable skill called something like `pre-production-gate`.

The skill should require the agent to do the following before approving production-sensitive work:

1. Identify whether the change touches:
   - Supabase writes
   - migrations
   - project/task/dependency editing
   - environment selection
   - data reconstruction flows
2. Search for risky patterns:
   - `.delete()` followed by `.insert()`
   - multi-table writes without transaction semantics
   - destructive rebuilds
   - writes that rely on in-memory ordering assumptions
3. Run required checks:
   - build
   - typecheck
   - tests
   - any targeted regression tests for affected flows
4. Produce a short release-risk summary:
   - risk level
   - affected data paths
   - rollback strategy
   - whether production data could be harmed

### B. CI / GitHub Actions

Implement a required workflow that must pass before merge.

Minimum required checks:

- install dependencies
- `npm run build`
- typecheck
- test suite
- targeted regression tests for project edit/save behavior

Recommended extra checks:

- detect destructive DB mutation patterns in changed files
- fail if high-risk files changed without a checklist acknowledgement
- run smoke tests against seeded or fixture data

### C. PR Checklist

Add a pull request template with required questions:

- Does this change touch persisted data?
- Does it edit multiple tables in one logical operation?
- Can partial failure leave the database inconsistent?
- What is the rollback plan?
- Was this tested against realistic project/task/dependency data?
- Was preview verified against the intended environment?

### D. Safer Persistence Design

For data-sensitive flows, prefer:

- database transactions
- Supabase RPC functions that perform the full mutation safely server-side
- in-place updates where possible
- rollback behavior if atomic transactions are not yet available

Avoid:

- delete-then-recreate flows without transaction support
- assuming inserts will always succeed after deletes
- relying on fragile array ordering to reconstruct relationships

### E. Production Data Safety

Before any production-sensitive deployment:

- export or snapshot data if possible
- confirm whether backups exist
- know which environment is being modified
- confirm whether the deployment changes code only or also changes live data

## Suggested Skill Behavior

When triggered, the skill should make the agent do this in order:

1. Identify changed files and classify risk
2. Inspect store/database/mutation code paths
3. Flag any destructive persistence flow
4. Check for rollback or transaction safety
5. Run build and tests
6. Summarize deploy risk in plain language
7. Refuse to recommend production deploy if rollback safety is missing

## Suggested CI Policy

Use branch protection so `main` cannot be merged without:

- passing status checks
- pull request review
- no failing tests
- no bypass for production-sensitive changes

If possible, add a "production-risk" label or required review when files like these change:

- `app/src/store/projectStore.ts`
- `app/src/lib/supabase.ts`
- `supabase/migrations/*`
- any files that mutate project/task/dependency persistence

## Suggested Regression Coverage

At minimum, add tests for:

1. Editing a project without data loss
2. Preserving tasks/dependencies if rebuild fails midway
3. Recomputing schedules without shifting unrelated tasks
4. Accepting proposed conflict adjustments without mutating the wrong task
5. Undo/redo after resource conflict resolution

## Non-Negotiable Guardrails

These should be treated as hard rules:

- no destructive multi-table production write without transaction or rollback
- no merge of high-risk persistence changes without targeted validation
- no production deploy from unreviewed branch code
- no assumption that local success means production safety

## Recommended Implementation Plan

### Phase 1

Build the skill and PR checklist.

### Phase 2

Add GitHub Actions build/test enforcement.

### Phase 3

Refactor the highest-risk persistence paths into transaction-safe RPCs or equivalent server-side guarded operations.

### Phase 4

Add seeded regression tests for realistic construction schedule data.

## Short Version

The production incident was caused by fragile application-level persistence logic, not by rendering logic and not by a database outage.

The long-term fix is:

- a repeatable review skill
- CI enforcement
- PR checklist discipline
- transaction-safe persistence for destructive updates

This is the standard that any AI-assisted coding workflow should meet before production deployment.
