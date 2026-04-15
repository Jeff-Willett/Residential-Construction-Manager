# Residential Construction Manager Master Task List & Roadmap

This document tracks active bugs, requested features, and the long-term vision for the Residential Construction Manager.

## Coordination Protocol
This project is edited in both **Windsurf** and **Anti-gravity** IDEs.
- Mark tasks you start with **[WS]** (Windsurf) or **[AG]** (Anti-gravity)
- Check this file before starting work — do not edit files owned by the other IDE
- After completing, move the task to Completed and note what was done
- Log architectural decisions in `docs/decisions.md`

## 🛠 Active Bugs
- [ ] *None reported yet for v0.07*

## 🔨 In Progress
- *None*

## ✅ Completed
- [x] [WS] Issue 19 - Editable project dates now persist on save.
  - Wired `manual_start`/`manual_finish` through side panel save payload, store updates, fetch mapping, and scheduling engine recalculation.
  - Fixed side panel initialization to prefer saved manual dates over recalculated defaults.
  - Restored editable task Start/Finish date inputs (with calendar icons) in Edit Project modal and persisted those values through project save.
  - Verified build passes (`npm run build`).

## 🚀 Feature Requests
- [ ] **Multi-User Collaboration**: Allow multiple project managers to edit simultaneously.
- [ ] **Email Reports**: Send a weekly "Bottleneck Summary" to specific subcontractors.
- [ ] **PDF Export**: Generate a printable high-res Gantt chart for site meetings.

## 🔜 Pending (Phase 3 & 4 — Pre-Production Gate continuation)
- [ ] **[WS] Phase 3**: Refactor project edit flow in `projectStore.ts` into a transaction-safe Supabase RPC — eliminates delete-then-rebuild risk at the database level.
- [ ] **[WS] Phase 4**: Add Vitest regression tests for project edit / dependency rebuild failure paths — enables CI `test` job to enforce coverage.

## ✅ Completed
- **[WS]** Issue #30: Color code project rows in task list with cyan-to-blue gradient to match Gantt bars — Apr 14, 2026
- **[WS]** Directory cleanup and dual-IDE coordination setup — Apr 14, 2026
- **[WS]** Pre-Production Gate (Phase 1+2) — Apr 14, 2026: Created `.skills/pre-production-gate.skill`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/ci.yml`; enabled branch protection on `main` (required CI checks + 1 PR review). See `docs/decisions.md` ADR-005.

## 📅 Version History
- **v0.07**: Sync with GitHub/Vercel and Maintenance Increment. (Current)
- **v0.06**: Interactive Side Panel, Global Filtering, and Engine Collision Analytics.
- **v0.05**: Supabase Backend Integration & Multi-Project Engine.
- **v0.04**: Gantt UI Refresh & Custom Row Colors.

## ✅ Completed
- [x] [WS] **Production Database Backups**: Daily automated backups via GitHub Actions cron + manual `npm run backup:production`. See `docs/runbooks/production-backups.md`.

---
*Capture new items from testers below:*

- [WS][Completed] Restored editable task start/finish date fields in `AddProjectModal.tsx`, re-enabled saved `manual_start` / `manual_finish` support in `projectStore.ts`, and tuned row date column widths so full dates fit without crowding row action icons.
