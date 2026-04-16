# Architectural Decisions

This file logs key decisions so both Windsurf and Anti-gravity AIs stay informed and don't re-litigate settled choices.

## Decisions

### ADR-001: Supabase RPC for all data access
- **Date**: 2026-04
- **Context**: Frontend needs consistent, secure data access
- **Decision**: All data access goes through Supabase RPC functions — no direct table queries from the frontend
- **Rationale**: Centralizes business logic, enforces row-level security, simplifies frontend code

### ADR-002: Scheduling engine isolation
- **Date**: 2026-04
- **Context**: Scheduling logic is complex and needs to be testable independently
- **Decision**: All scheduling engine logic lives in `app/src/lib/scheduling/`
- **Rationale**: Separation of concerns, easier testing, prevents UI coupling with engine logic

### ADR-003: Dual-IDE workflow (Windsurf + Anti-gravity)
- **Date**: 2026-04
- **Context**: Project edited in both Windsurf and Anti-gravity IDEs
- **Decision**: One shared repo, each IDE has its own gitignored dot-directory (.windsurf/, .adal/), coordination via TASKS.md with [WS]/[AG] ownership tags
- **Rationale**: Avoids repo duplication, prevents merge conflicts, keeps AI context isolated

### ADR-004: Project modal task rows use native editable date inputs with persisted manual dates
- **Date**: 2026-04
- **Context**: Project create/edit modals need task-level start and finish dates that users can edit directly without breaking row density
- **Decision**: Task row start/finish cells use native `input[type="date"]` controls bound to persisted `manual_start` / `manual_finish` values, with compact column widths sized just large enough for the full date and picker affordance
- **Rationale**: Keeps dates editable and savable, preserves browser-native date picker behavior, and avoids oversized columns that hide adjacent row actions

### ADR-005: Pre-Production Safety Gate [WS]
- **Date**: 2026-04-14
- **Context**: Production incident wiped all tasks and dependencies. Root cause: project edit flow used delete-then-rebuild across multiple tables with no database transaction. Partial failure after deletes left production empty.
- **Decision**: Three-layer pre-production gate implemented:
  1. `.skills/pre-production-gate.skill` — agent skill that classifies risk, scans for `.delete()→.insert()` patterns, verifies rollback safety, runs build/typecheck, produces a deploy-risk summary, and refuses to greenlight production deploy if rollback safety is absent.
  2. `.github/PULL_REQUEST_TEMPLATE.md` — mandatory PR checklist covering persistence safety, rollback plan, environment verification, and skill sign-off for high-risk changes.
  3. `.github/workflows/ci.yml` — CI on every push/PR to `main`: Build, Typecheck, Lint, risky-pattern detection, test placeholder.
  4. Branch protection on `main` — required status checks (Build, Typecheck, Lint, Detect Risky DB Patterns), 1 PR review required, stale reviews dismissed on push.
- **High-risk files flagged**: `app/src/store/projectStore.ts`, `app/src/lib/supabase.ts`, `supabase/migrations/*`
- **Still pending**: Phase 3 — refactor project edit flow into a transaction-safe Supabase RPC. Phase 4 — add Vitest regression tests for edit/rebuild failure paths.
- **References**: `PRE_PRODUCTION_GATE_WRITEUP.md`, `docs/runbooks/production-backups.md`

### ADR-006: Downstream dependencies can be toggled per scope edit
- **Date**: 2026-04-16
- **Context**: Issue `#52` started from a reported production scheduling mismatch, but the investigation showed the immediate example was more about missing dependency relationships than a broken engine. The requested product behavior still had value: when manually moving a scope, users need to choose whether each downstream dependency should follow that move.
- **Decision**:
  1. Add `dependencies.follow_predecessor_changes BOOLEAN NOT NULL DEFAULT TRUE` so each live dependency can persist whether it should follow predecessor movement.
  2. Surface downstream dependencies in the right-hand scope panel with a checkbox per successor, defaulted on.
  3. When a downstream dependency is unchecked, saving a predecessor move freezes that successor at its current dates instead of letting it inherit the predecessor's moved schedule.
  4. Use the actual Vercel deployment environment for the header badge so production deployments show `production` even when deployed from a feature branch.
- **Operational note**: The migration was applied to `branch-super-base` during development and later applied directly to production after the production smoke test revealed the column was missing there.
- **Rationale**: Keeps standard dependency behavior as the default, adds a clear escape hatch for selective downstream movement, and prevents silent UI reversion caused by missing schema in promoted environments.

---
*New decisions should be added here as the project evolves.*
