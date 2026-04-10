So what I'm needing to manage here is not just the project and the overlapping. I need a visual that identifies the subcontractor, because currently in the stage of the business, it's more about managing a few of these subcontractors and their timing and availability, prior to us just having to go get a second subcontractor for that line of work.

As an example, if I only want to deal with one subcontractor that does my trim work because he's the best in the business, then ultimately we have to pay attention to how many weeks he is going to spend on each job, because he becomes our bottleneck for how many total jobs a year he can do if he was to work 52 weeks out of the year. At some point, we have to get a second trim contractor, but there are two or three trades that we're working with:

- plumbers
- footer slab installer
- trim carpenter

that are kind of the bottlenecks.





# Residential Construction Scheduling Engine

## Detailed Design Rationale, Processing Logic, and Developer Handoff

## 1. Objective

The purpose of this scheduling engine is to convert a builder’s baseline construction sequence into a  **real, executable, multi-project schedule** .

A normal Gantt chart is mostly visual. It shows planned sequence, but it does not reliably answer the real production question:

> “If I start multiple houses, and some subcontractors are single-threaded, when do tasks actually happen?”

This engine is designed to answer that question.

It takes:

- multiple projects
- a standard sequence of tasks
- project-specific durations
- project-specific start dates
- limited-capacity subcontractors/resources

and produces:

- actual start dates
- actual finish dates
- bottleneck delays
- downstream ripple effects
- a usable Gantt output
- a bottleneck/resource load view

---

## 2. The Core Scheduling Problem

A task is not allowed to start merely because the plan says it should.

A task can only start when **both** of these conditions are true:

### A. Dependency condition

All required predecessor work is complete.

### B. Resource condition

The subcontractor or constrained resource required for that task is available.

That means every task has at least two candidate start dates:

- the date it becomes logically ready
- the date the assigned resource becomes available

The real start date is the later of the two.

## Core scheduling rule

```text


actual_start = max(dependency_ready_date, resource_available_date)


actual_finish = add_workdays(actual_start, duration_days - 1)
```






More details:



nd resource occupancy

This requirement directly drove the change from:

- “edited Gantt workbook”

to

- “task-based scheduling engine”

---

## 11. Requested Output Format / Developer Handoff Scenario

### User request

You wanted the scheduling logic captured in a form you could take to a software developer, preferably in Markdown.

You specifically wanted:

- the logic used
- how constraints were interpreted
- how the schedule was processed
- how resource conflicts were understood
- how the engine decided when to move tasks

### Resolution outcome

A Markdown developer handoff was produced describing:

- objective
- data model
- processing order
- dependency logic
- resource availability logic
- bottleneck mapping
- actual start / actual finish formulas
- conflict handling
- downstream cascading
- recommended software structure

Later, when you asked for even more, that was expanded into a more detailed:

- design rationale
- processing specification
- data architecture
- tie-break logic
- limitations
- suggested future enhancements

---

## 12. Constraint Hierarchy That Emerged

As the discussion evolved, the model effectively adopted this hierarchy:

### Tier 1: Project dependency logic

Tasks must follow the correct construction sequence.

### Tier 2: Explicit bottleneck resources

The following are capacity-constrained:

- 3C Concrete
- Hays Plumbing
- Matt Thorne

### Tier 3: Bottleneck task mapping

Only selected tasks consume those bottleneck resources:

#### 3C Concrete

- Footer
- Slab
- not Driveway

#### Hays Plumbing

- Plumbing Pre
- Plumbing Rough
- Plumbing Finish

#### Matt Thorne

- Trim Interior
- Trim Exterior

### Tier 4: Delay cascading

If a bottleneck task moves:

- all downstream dependent tasks must also move

### Tier 5: Visual output

The Gantt should reflect the calculated schedule, not just planned dates

This became the practical operating logic of the engine.

---

## 13. Final Scheduling Logic Outcome

The final approach that emerged from your scenarios was:

### A. Treat the original schedule as a template

Use it as the baseline build sequence and default durations.

### B. Expand that template into project-specific task instances

Each project gets its own copy of the tasks.

### C. Allow each project-task to have its own duration

Durations belong to the project instance, not just the template.

### D. For each task, calculate:

1. when it is logically ready based on predecessor completion
2. when its assigned bottleneck resource is available
3. the later of those two as actual start
4. actual finish from actual start + duration
5. downstream ripple to following tasks

### E. Display the result in:

- a schedule table
- a Gantt chart
- a bottleneck load/heatmap view

That is the resolution path that came out of all your scenarios.

---

## 14. Summary of All Explicit User Constraints and Final Treatment

| Constraint / Scenario | Final Treatment |

|---|---|

| Original Gantt is ideal/perfect-world build | Used as baseline template |

| No weekend work | Preserved in scheduling logic |

| Solve subcontractor overlap before full CPM | Yes, resource overlap prioritized |

| 3C Concrete is bottleneck | Treated as capacity-1 |

| 3C only matters for Footer and Slab | Implemented |

| Driveway does not matter for bottleneck pacing | Excluded from 3C bottleneck logic |

| Hays is only plumber | Treated as capacity-1 |

| Plumbing Pre / Rough / Finish should count | Implemented |

| Matt Thorne is only trim carpenter | Treated as capacity-1 |

| Trim Interior / Exterior should count | Implemented |

| Project 2 start target = April 20, 2026 | Applied in scenario workbook |

| Project 3 start target = May 1, 2026 | Applied in scenario workbook |

| Keep same pacing unless bottleneck conflict | Applied |

| Highlight conflicts red | Applied |

| Moving bottleneck tasks must also move downstream tasks | Corrected and adopted as core rule |

| Need project-specific durations by project | Became basis for scheduling engine rebuild |

| Need dynamic logic to give software developer | Delivered in Markdown handoff |

---

## 15.

Plain-English Executive Summary

The original one-house Gantt was treated as the ideal sequence template. ** **

The real scheduling problem then became how to run multiple houses at once without double-booking single-source subcontractors. The critical bottlenecks identified were 3C Concrete for footer/slab, Hays for plumbing phases, and Matt Thorne for trim. The scheduling method evolved so that each task’s real start date is determined by both predecessor completion and bottleneck resource availability. When a bottleneck delays a task, that delay must ripple through all downstream tasks. The final resolution was to move away from a static Gantt and toward a task-based scheduling engine that can support project-specific durations, multi-project overlap, bottleneck conflict prevention, and visual reporting.**...**
