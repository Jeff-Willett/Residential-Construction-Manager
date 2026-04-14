# How To Use The Tool

This guide is written for day-to-day use of the Residential Construction Manager app.

## What the app does

The app helps you build, review, and adjust residential construction schedules using a reusable template system and a Gantt-style planning view.

## Main areas of the app

- the Gantt chart is the main schedule view
- the right-side task panel shows details for the selected task
- the filter button opens project, subcontractor, and scope filtering
- the template studio button opens the schedule-template editor
- the settings button opens vendor color controls
- the add project button creates a new project from the current template baseline

## Basic workflow

1. Open the app and confirm it loads data successfully.
2. Review the environment badge in the header so you know whether you are in local testing, preview testing, or production.
3. Use `+ Add Project` to create a new project from the current template structure.
4. Set the project start date and review the generated phases and scopes.
5. Adjust durations, lags, subcontractors, or bottleneck vendors as needed.
6. Click tasks in the Gantt chart to inspect details in the side panel.

## Creating a project

Use `+ Add Project` in the top-right corner.

Inside the project modal you can:

- name the project
- set the project start date
- review the generated scopes grouped by phase
- reorder or adjust task drafts before saving

The project is created from the current template library, not from a blank sheet.

## Editing schedule templates

Open the `Schedule Template Studio` from the file-text icon in the header.

The studio is organized into four tabs:

- `Rules`: overview and context
- `Phases`: manage the ordered phase list
- `Scopes`: manage template tasks, default durations, subcontractors, and bottleneck vendors
- `Dependencies`: define predecessor and successor relationships between template scopes

Use this area when the baseline schedule itself needs to change for all future projects.

## Filtering what you see

Open `Global Filters` to narrow the schedule by:

- project
- subcontractor
- task scope

This is helpful when the chart is crowded and you want to isolate a subset of work.

## Vendor color settings

Open the settings button to manage vendor color assignments.

These colors make it easier to scan the schedule visually by subcontractor.

## Undo and redo

Use the undo and redo buttons in the header to reverse recent task changes when available.

## Zoom controls

Use the zoom buttons in the header to zoom the Gantt chart in or out.

## Working safely

- normal local and branch work should use `branch-super-base`
- avoid production unless you are intentionally validating live behavior
- if the app shows a connection error, check your Supabase environment variables first

## Related docs

- [app/README.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/app/README.md:1)
- [docs/architecture/system-overview.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/architecture/system-overview.md:1)
- [docs/runbooks/testing-data-workflow.md](/Volumes/Ext-APFSv350/GoogleDrive/PARA/01_Projects/Residential%20Construction%20Gantt%20Manager/docs/runbooks/testing-data-workflow.md:1)
