Build a web-based "Residential Construction Manager" MVP using React, TypeScript, and Tailwind CSS. The goal is to move beyond static spreadsheets into a dynamic, dependency-aware scheduling engine.

### 1. Core Logic Engine (CPM)

[cite_start]Implement the Critical Path Method (CPM) algorithm to calculate task dates[cite: 79].

- **Workday Logic:** All calculations must exclude weekends (Saturday/Sunday).
- [cite_start]**Formulas:** - Earliest Finish (EF): $EF = ES + \text{Duration} - 1$ [cite: 80]
  - [cite_start]Latest Start (LS): $LS = LF - \text{Duration} + 1$ [cite: 81]
  - [cite_start]Total Float: $\text{Float} = LS - ES$ [cite: 83]
- **Dependencies:** Support Finish-to-Start (FS) relationships. [cite_start]If a predecessor's End Date moves, all successor Start Dates must shift automatically[cite: 94].

### 2. Initial Data Set (Source: Gantt.csv & KEY.csv)

[cite_start]Pre-load the system with the following project data[cite: 1, 3]:

- **Project:** Residential Construction
- **Starting Task:** "Estimate" (Sub: Willett & Assoc.) | Start: 2026-04-01 | [cite_start]Duration: 10 days[cite: 3, 4].
- [cite_start]**Key Successors:** - "Clearing" (3 days) depends on Estimate[cite: 3].
  - [cite_start]"Site Prep" (2 days) depends on Clearing[cite: 4].
  - [cite_start]"Footer" (4 days, Sub: 3C Concrete) depends on Site Prep[cite: 4].
  - [cite_start]"Block" (6 days, Sub: Julio H) depends on Footer[cite: 4].

### 3. Database Schema

[cite_start]Use a relational structure to allow for future multi-project scaling[cite: 92]:

- **Tasks:** ID, Name, Subcontractor, Duration, ES, EF, LS, LF, Is_Critical (Boolean).
- **Dependencies:** Predecessor_ID, Successor_ID, Lag_Time.
- [cite_start]**Resources:** ID, Sub_Name, Trade_Type[cite: 92, 94].

### 4. UI/UX Requirements

- **Gantt Visualization:** A horizontal timeline with a "Zoom" feature (Day, Week, Month views).
- **Interactive Updates:** Users should be able to change a task's duration in a side panel, which immediately triggers a re-calculation of the entire chain.
- [cite_start]**Visual Cues:** Highlight tasks on the "Critical Path" (Float = 0) in red[cite: 83].
- **Non-Work Days:** Gray out weekends in the timeline and ensure no tasks are scheduled on those days.
