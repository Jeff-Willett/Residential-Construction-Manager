# Residential Construction Manager Master Task List & Roadmap

This document tracks active bugs, requested features, and the long-term vision for the Residential Construction Manager.

## 🛠 Active Bugs
- [ ] *None reported yet for v0.06*

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

## 📅 Version History
- **v0.07**: Sync with GitHub/Vercel and Maintenance Increment. (Current)
- **v0.06**: Interactive Side Panel, Global Filtering, and Engine Collision Analytics.
- **v0.05**: Supabase Backend Integration & Multi-Project Engine.
- **v0.04**: Gantt UI Refresh & Custom Row Colors.

---
*Capture new items from testers below:*
