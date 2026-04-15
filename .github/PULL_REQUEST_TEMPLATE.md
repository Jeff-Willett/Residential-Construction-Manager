## Risk Classification

**Risk Level**: <!-- Low / Medium / High -->

> Low = UI/visual only | Medium = local state or scheduling logic only | High = any DB write, migration, project/task/dependency edit, delete, or rebuild

---

## Data Safety Checklist

_Answer every question. For High-risk changes, all boxes must be checked before merge._

### Persistence Safety

- [ ] This change does NOT touch persisted data (projects, phases, tasks, dependencies, migrations)
  - _OR_ — if it does, complete the questions below

- [ ] I have identified every Supabase write in this change (`.delete()`, `.insert()`, `.update()`, `.upsert()`)
- [ ] This change does NOT use a delete-then-rebuild pattern on multi-table data
  - _OR_ — the entire sequence is wrapped in a single Supabase RPC transaction
- [ ] Partial failure cannot leave the database with empty tasks, missing dependencies, or orphaned phases
- [ ] The write operation is safe to retry (idempotent) OR has explicit rollback behavior

### Rollback Plan

**What is the rollback plan if this fails in production?**

<!-- Describe exactly how to recover if this goes wrong. "Revert the commit" is not sufficient for data-mutating changes. -->

### Test Evidence

- [ ] This was tested against realistic data: multiple projects, multiple phases, tasks with dependencies
- [ ] The failure path was checked: data is preserved if the operation fails partway through
- [ ] Preview environment was verified against the correct Supabase project (not production)

### Environment Verification

- [ ] I confirmed which Supabase environment this targets (local / preview / production)
- [ ] If this change runs a migration: I confirmed whether a data snapshot or backup exists

---

## Pre-Production Gate

For **High-risk** changes only:

- [ ] The `pre-production-gate` skill was run and passed
- [ ] The deploy-risk summary from the skill is attached below

**Deploy-Risk Summary** (paste output from skill here):

```
RISK LEVEL:
AFFECTED DATA PATHS:
RISKY PATTERNS FOUND:
ROLLBACK SAFETY:
BUILD:
TESTS:
ENVIRONMENT VERIFIED:
RECOMMENDATION:
```
