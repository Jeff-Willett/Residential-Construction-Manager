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

---
*New decisions should be added here as the project evolves.*
