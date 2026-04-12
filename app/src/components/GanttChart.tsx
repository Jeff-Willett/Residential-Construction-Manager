import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { differenceInDays, addDays, endOfWeek, format, isWeekend, startOfWeek, parseISO } from 'date-fns';
import { clsx } from 'clsx';
import { ZoomIn, ZoomOut, AlertTriangle, UserMinus, ChevronDown, ChevronRight, Lightbulb, LightbulbOff, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '../store/projectStore';
import type { EngineTask } from '../utils/schedulingEngine';

type ZoomLevel = 'day' | 'week' | 'month';

const ZOOM_LEVELS: ZoomLevel[] = ['day', 'week', 'month'];
const ZOOM_DAY_WIDTH: Record<ZoomLevel, number> = {
  day: 40,
  week: 16,
  month: 10
};

type MonthGroup = {
  label: string;
  days: number;
  startIndex: number;
};

type WeekGroup = {
  label: string;
  shortLabel: string;
  days: number;
  startIndex: number;
  weekendStartIndex: number;
  weekendDays: number;
};

type ChartRow =
  | {
      kind: 'project';
      key: string;
      projectId: string;
      label: string;
      start: string;
      finish: string;
      taskCount: number;
      height: number;
    }
  | {
      kind: 'phase';
      key: string;
      projectId: string;
      phaseId: string;
      label: string;
      start: string;
      finish: string;
      taskCount: number;
      height: number;
      expanded: boolean;
    }
  | {
      kind: 'task';
      key: string;
      taskId: string;
      projectId: string;
      phaseId: string;
      label: string;
      subcontractor: string | null;
      start: string;
      finish: string;
      duration: number;
      delayDays: number;
      lag: number;
      bottleneckVendor: string | null;
      height: number;
    };

const PROJECT_ROW_HEIGHT = 34;
const PHASE_ROW_HEIGHT = 28;
const TASK_ROW_HEIGHT = 28;

export function GanttChart({
  onTaskClick,
  selectedTaskId
}: {
  onTaskClick: (id: string) => void;
  selectedTaskId: string | null;
}) {
  const { projects, tasks, projectPhases, deleteProject, vendorColors, activeFilters } = useProjectStore(
    useShallow((state) => ({
      projects: state.projects,
      tasks: state.tasks,
      projectPhases: state.projectPhases,
      deleteProject: state.deleteProject,
      vendorColors: state.vendorColors,
      activeFilters: state.activeFilters
    }))
  );

  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('day');
  const [leftPanelWidth, setLeftPanelWidth] = useState(272);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const [hiddenProjectBars, setHiddenProjectBars] = useState<Record<string, boolean>>({});
  const [hiddenPhaseBars, setHiddenPhaseBars] = useState<Record<string, boolean>>({});
  const [projectPendingDelete, setProjectPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const isResizing = useRef(false);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingTop = useRef(false);
  const isScrollingMain = useRef(false);
  const pendingZoomFocusDay = useRef<number | null>(null);

  const visibleTasks = useMemo(() => {
    const { projects: projectIds, vendors, scopes } = activeFilters;
    if (projectIds.length === 0 && vendors.length === 0 && scopes.length === 0) return tasks;

    return tasks.filter((task) => {
      const matchProject = projectIds.length === 0 || projectIds.includes(task.project_id);
      const matchVendor = vendors.length === 0 || (task.subcontractor && vendors.includes(task.subcontractor));
      const matchScope = scopes.length === 0 || scopes.includes(task.name);
      return matchProject && matchVendor && matchScope;
    });
  }, [tasks, activeFilters]);

  const taskById = useMemo(() => new Map<string, EngineTask>(visibleTasks.map((task) => [task.id, task])), [visibleTasks]);

  const chartMeta = useMemo(() => {
    const rows: ChartRow[] = [];
    const tasksByProject = new Map<string, EngineTask[]>();
    const phaseIdsByProject = new Map<string, string[]>();
    const projectHasCollapsedPhase = new Map<string, boolean>();
    const projectPhasesByProject = new Map<string, { id: string; name: string; order: number }[]>();

    projectPhases.forEach((phase) => {
      const phases = projectPhasesByProject.get(phase.project_id) ?? [];
      phases.push({ id: phase.id, name: phase.name, order: phase.phase_order });
      projectPhasesByProject.set(phase.project_id, phases);
    });

    visibleTasks.forEach((task) => {
      if (!task.calculated_start || !task.calculated_finish) return;
      const projectTasks = tasksByProject.get(task.project_id) ?? [];
      projectTasks.push(task);
      tasksByProject.set(task.project_id, projectTasks);
    });

    projects.forEach((project) => {
      const sortedProjectTasks = [...(tasksByProject.get(project.id) ?? [])].sort((a, b) => {
        if (a.phase_order !== b.phase_order) return a.phase_order - b.phase_order;
        if (a.task_order !== b.task_order) return a.task_order - b.task_order;
        return a.name.localeCompare(b.name);
      });

      if (sortedProjectTasks.length === 0) return;

      const phaseMeta = new Map<string, { name: string; order: number }>();
      const phaseTaskBuckets = new Map<string, EngineTask[]>();
      const projectPhaseIds: string[] = [];

      const projectStart = sortedProjectTasks[0].calculated_start!;
      let projectFinish = sortedProjectTasks[0].calculated_finish!;

      (projectPhasesByProject.get(project.id) ?? []).forEach((phase) => {
        phaseMeta.set(phase.id, { name: phase.name, order: phase.order });
      });

      sortedProjectTasks.forEach((task) => {
        if (task.calculated_finish! > projectFinish) projectFinish = task.calculated_finish!;

        const phaseKey = task.project_phase_id ?? `${project.id}:${task.phase_order}:${task.phase_name ?? 'Unphased'}`;
        if (!phaseMeta.has(phaseKey)) {
          phaseMeta.set(phaseKey, {
            name: task.phase_name ?? 'Unphased',
            order: task.phase_order ?? 999
          });
        }

        const phaseTasks = phaseTaskBuckets.get(phaseKey) ?? [];
        phaseTasks.push(task);
        phaseTaskBuckets.set(phaseKey, phaseTasks);
      });

      rows.push({
        kind: 'project',
        key: `project-${project.id}`,
        projectId: project.id,
        label: project.name,
        start: projectStart,
        finish: projectFinish,
        taskCount: sortedProjectTasks.length,
        height: PROJECT_ROW_HEIGHT
      });

      const orderedPhases = Array.from(phaseMeta.entries()).sort((a, b) => {
        if (a[1].order !== b[1].order) return a[1].order - b[1].order;
        return a[1].name.localeCompare(b[1].name);
      });

      orderedPhases.forEach(([phaseId, meta]) => {
        const phaseTasks = phaseTaskBuckets.get(phaseId);
        if (!phaseTasks || phaseTasks.length === 0) return;

        projectPhaseIds.push(phaseId);

        let phaseStart = phaseTasks[0].calculated_start!;
        let phaseFinish = phaseTasks[0].calculated_finish!;

        phaseTasks.forEach((task) => {
          if (task.calculated_start! < phaseStart) phaseStart = task.calculated_start!;
          if (task.calculated_finish! > phaseFinish) phaseFinish = task.calculated_finish!;
        });

        const expanded = expandedPhases[phaseId] ?? true;
        if (!expanded) projectHasCollapsedPhase.set(project.id, true);

        rows.push({
          kind: 'phase',
          key: `phase-${phaseId}`,
          projectId: project.id,
          phaseId,
          label: meta.name,
          start: phaseStart,
          finish: phaseFinish,
          taskCount: phaseTasks.length,
          height: PHASE_ROW_HEIGHT,
          expanded
        });

        if (!expanded) return;

        phaseTasks.forEach((task) => {
          rows.push({
            kind: 'task',
            key: `task-${task.id}`,
            taskId: task.id,
            projectId: project.id,
            phaseId,
            label: task.name,
            subcontractor: task.subcontractor,
            start: task.calculated_start!,
            finish: task.calculated_finish!,
            duration: task.duration,
            delayDays: task.delay_days || 0,
            lag: task.lag || 0,
            bottleneckVendor: task.bottleneck_vendor,
            height: TASK_ROW_HEIGHT
          });
        });
      });

      phaseIdsByProject.set(project.id, projectPhaseIds);
    });

    return { chartRows: rows, phaseIdsByProject, projectHasCollapsedPhase };
  }, [expandedPhases, projectPhases, projects, visibleTasks]);

  const { chartRows, phaseIdsByProject, projectHasCollapsedPhase } = chartMeta;
  const allPhaseIds = useMemo(() => Array.from(phaseIdsByProject.values()).flat(), [phaseIdsByProject]);
  const visibleProjectIds = useMemo(() => Array.from(phaseIdsByProject.keys()), [phaseIdsByProject]);

  const datesInfo = useMemo(() => {
    if (visibleTasks.length === 0 || projects.length === 0) {
      return { dates: [], getDayOffset: () => 0, monthGroups: [] as MonthGroup[], weekGroups: [] as WeekGroup[] };
    }

    let minDateStr = visibleTasks[0].calculated_start || projects[0].start_date;
    let maxDateStr = visibleTasks[0].calculated_finish || projects[0].start_date;

    visibleTasks.forEach((task) => {
      if (task.calculated_start && task.calculated_start < minDateStr) minDateStr = task.calculated_start;
      if (task.calculated_finish && task.calculated_finish > maxDateStr) maxDateStr = task.calculated_finish;
    });

    const start = startOfWeek(parseISO(minDateStr), { weekStartsOn: 1 });
    const end = endOfWeek(addDays(parseISO(maxDateStr), 30), { weekStartsOn: 1 });
    const dayCount = differenceInDays(end, start) + 1;
    const dates = Array.from({ length: dayCount }, (_, index) => addDays(start, index));
    const getDayOffset = (dateStr: string) => differenceInDays(parseISO(dateStr), start);

    const monthGroups: MonthGroup[] = [];
    const weekGroups: WeekGroup[] = [];

    dates.forEach((date, index) => {
      const monthLabel = format(date, 'MMMM yyyy');
      if (monthGroups.length === 0 || monthGroups[monthGroups.length - 1].label !== monthLabel) {
        monthGroups.push({ label: monthLabel, days: 1, startIndex: index });
      } else {
        monthGroups[monthGroups.length - 1].days++;
      }

      const weekStartDate = startOfWeek(date, { weekStartsOn: 1 });
      const weekLabel = `Week of ${format(weekStartDate, 'MMM d')}`;
      const shortWeekLabel = format(weekStartDate, 'MMM d');

      if (weekGroups.length === 0 || weekGroups[weekGroups.length - 1].label !== weekLabel) {
        weekGroups.push({
          label: weekLabel,
          shortLabel: shortWeekLabel,
          days: 1,
          startIndex: index,
          weekendStartIndex: isWeekend(date) ? 0 : -1,
          weekendDays: isWeekend(date) ? 1 : 0
        });
      } else {
        const currentWeek = weekGroups[weekGroups.length - 1];
        currentWeek.days++;

        if (isWeekend(date)) {
          if (currentWeek.weekendStartIndex === -1) {
            currentWeek.weekendStartIndex = index - currentWeek.startIndex;
          }
          currentWeek.weekendDays++;
        }
      }
    });

    return { dates, getDayOffset, monthGroups, weekGroups };
  }, [visibleTasks, projects]);

  const { monthGroups, weekGroups, dates, getDayOffset } = datesInfo;

  const dayWidth = ZOOM_DAY_WIDTH[zoomLevel];

  const totalGridWidth = useMemo(() => dates.length * dayWidth, [dates.length, dayWidth]);

  const headerHeight = useMemo(() => {
    if (zoomLevel === 'day') return 96;
    if (zoomLevel === 'week') return 60;
    return 32;
  }, [zoomLevel]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isResizing.current) return;
    setLeftPanelWidth(Math.max(200, Math.min(520, event.clientX)));
  }, []);

  const handleMouseUp = useCallback(() => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  const handleMouseDown = () => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp, { once: true });
  };

  const beginDeleteProject = (projectId: string, projectName: string) => {
    setProjectPendingDelete({ id: projectId, name: projectName });
    setDeleteConfirmation('');
    setDeleteError(null);
  };

  const closeDeleteProjectModal = () => {
    if (isDeletingProject) return;
    setProjectPendingDelete(null);
    setDeleteConfirmation('');
    setDeleteError(null);
  };

  const confirmDeleteProject = async () => {
    if (!projectPendingDelete) return;
    if (deleteConfirmation !== projectPendingDelete.name) {
      setDeleteError('Type the exact project name to enable deletion.');
      return;
    }

    setIsDeletingProject(true);
    setDeleteError(null);

    try {
      await deleteProject(projectPendingDelete.id);
      setProjectPendingDelete(null);
      setDeleteConfirmation('');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete project.');
    } finally {
      setIsDeletingProject(false);
    }
  };

  useEffect(() => {
    const mainScroll = mainScrollRef.current;
    const topScroll = topScrollRef.current;
    if (!mainScroll || !topScroll) return;

    const syncTop = () => {
      if (!isScrollingMain.current) {
        isScrollingTop.current = true;
        topScroll.scrollLeft = mainScroll.scrollLeft;
        setTimeout(() => {
          isScrollingTop.current = false;
        }, 50);
      }
    };

    const syncMain = () => {
      if (!isScrollingTop.current) {
        isScrollingMain.current = true;
        mainScroll.scrollLeft = topScroll.scrollLeft;
        setTimeout(() => {
          isScrollingMain.current = false;
        }, 50);
      }
    };

    mainScroll.addEventListener('scroll', syncTop);
    topScroll.addEventListener('scroll', syncMain);

    return () => {
      mainScroll.removeEventListener('scroll', syncTop);
      topScroll.removeEventListener('scroll', syncMain);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [datesInfo, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const mainScroll = mainScrollRef.current;
    if (!mainScroll || pendingZoomFocusDay.current === null) return;

    const viewportWidth = mainScroll.clientWidth;
    const targetScrollLeft = Math.max(0, pendingZoomFocusDay.current * dayWidth - viewportWidth / 2);
    mainScroll.scrollLeft = targetScrollLeft;
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = targetScrollLeft;
    }
    pendingZoomFocusDay.current = null;
  }, [dayWidth]);

  const captureZoomFocus = () => {
    const mainScroll = mainScrollRef.current;
    if (!mainScroll) return;

    const viewportCenter = mainScroll.scrollLeft + mainScroll.clientWidth / 2;
    pendingZoomFocusDay.current = viewportCenter / dayWidth;
  };

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => ({ ...prev, [phaseId]: !(prev[phaseId] ?? true) }));
  };

  const toggleProjectPhases = (projectId: string) => {
    const phaseIds = phaseIdsByProject.get(projectId) ?? [];
    if (phaseIds.length === 0) return;

    const shouldExpand = phaseIds.some((phaseId) => !(expandedPhases[phaseId] ?? true));

    setExpandedPhases((prev) => {
      const next = { ...prev };
      phaseIds.forEach((phaseId) => {
        next[phaseId] = shouldExpand;
      });
      return next;
    });
  };

  const toggleProjectBarVisibility = (projectId: string) => {
    const shouldHide = !(hiddenProjectBars[projectId] ?? false);

    setHiddenProjectBars((current) => ({
      ...current,
      [projectId]: shouldHide
    }));

    if (shouldHide) {
      const projectPhaseIds = phaseIdsByProject.get(projectId) ?? [];
      setHiddenPhaseBars((current) => {
        const next = { ...current };
        projectPhaseIds.forEach((phaseId) => {
          next[phaseId] = true;
        });
        return next;
      });
    }
  };

  const togglePhaseBarVisibility = (phaseId: string) => {
    setHiddenPhaseBars((current) => ({
      ...current,
      [phaseId]: !(current[phaseId] ?? false)
    }));
  };

  const toggleAllProjectBars = () => {
    if (visibleProjectIds.length === 0) return;

    const shouldHideAllProjects = visibleProjectIds.some((projectId) => !(hiddenProjectBars[projectId] ?? false));

    setHiddenProjectBars((current) => {
      const next = { ...current };
      visibleProjectIds.forEach((projectId) => {
        next[projectId] = shouldHideAllProjects;
      });
      return next;
    });

    if (shouldHideAllProjects) {
      setHiddenPhaseBars((current) => {
        const next = { ...current };
        allPhaseIds.forEach((phaseId) => {
          next[phaseId] = true;
        });
        return next;
      });
      return;
    }
  };

  const toggleAllPhaseBars = () => {
    if (allPhaseIds.length === 0) return;

    const shouldHideAllPhases = allPhaseIds.some((phaseId) => !(hiddenPhaseBars[phaseId] ?? false));

    setHiddenPhaseBars((current) => {
      const next = { ...current };
      allPhaseIds.forEach((phaseId) => {
        next[phaseId] = shouldHideAllPhases;
      });
      return next;
    });
  };

  const toggleAllPhases = () => {
    if (allPhaseIds.length === 0) return;

    const shouldExpand = allPhaseIds.some((phaseId) => !(expandedPhases[phaseId] ?? true));

    setExpandedPhases((prev) => {
      const next = { ...prev };
      allPhaseIds.forEach((phaseId) => {
        next[phaseId] = shouldExpand;
      });
      return next;
    });
  };

  const setZoomFromIndex = (nextIndex: number) => {
    setZoomLevel(ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, nextIndex))]);
  };

  const handleZoomIn = () => {
    captureZoomFocus();
    const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);
    setZoomFromIndex(currentIndex - 1);
  };

  const handleZoomOut = () => {
    captureZoomFocus();
    const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);
    setZoomFromIndex(currentIndex + 1);
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex justify-between items-center px-4 py-2 bg-slate-800/80 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Project / Phase / Scope Timeline</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleZoomOut}
            disabled={zoomLevel === 'month'}
            className="p-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoomLevel === 'day'}
            className="p-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition"
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {chartRows.length > 0 && (
        <div
          ref={topScrollRef}
          className="h-3 overflow-x-auto overflow-y-hidden bg-slate-900 border-b border-slate-700 sticky top-0 z-50 rounded-t-xl"
          style={{ paddingLeft: `${leftPanelWidth}px` }}
        >
          <div style={{ width: totalGridWidth, height: '1px' }} />
        </div>
      )}

      <div ref={mainScrollRef} className="flex flex-1 overflow-auto relative rounded-b-xl hide-scrollbar">
        <div
          style={{ width: leftPanelWidth }}
          className="flex-shrink-0 border-r border-slate-700 bg-slate-800/95 z-40 sticky left-0"
        >
          <div
            onMouseDown={handleMouseDown}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-cyan-500/50 transition-colors z-50"
            title="Drag to resize"
          />

          <div
            style={{ height: headerHeight }}
            className="border-b border-slate-700 flex items-end justify-between gap-2 pb-2 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-[0.16em] bg-slate-900/98 w-full z-10 sticky top-0"
          >
            <div className="min-w-0 truncate">Project / Phase / Scope</div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={toggleAllProjectBars}
                className={clsx(
                  'p-1 rounded transition',
                  visibleProjectIds.some((projectId) => !(hiddenProjectBars[projectId] ?? false))
                    ? 'text-amber-300 hover:text-amber-200 hover:bg-slate-700/70'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/70'
                )}
                title="Show or hide all project summary bars. Hiding projects also hides all phase bars."
              >
                {visibleProjectIds.some((projectId) => !(hiddenProjectBars[projectId] ?? false)) ? <Lightbulb size={14} /> : <LightbulbOff size={14} />}
              </button>
              <button
                onClick={toggleAllPhaseBars}
                className={clsx(
                  'p-1 rounded transition',
                  allPhaseIds.some((phaseId) => !(hiddenPhaseBars[phaseId] ?? false))
                    ? 'text-amber-300 hover:text-amber-200 hover:bg-slate-700/70'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/70'
                )}
                title="Show or hide all phase summary bars"
              >
                {allPhaseIds.some((phaseId) => !(hiddenPhaseBars[phaseId] ?? false)) ? <Lightbulb size={14} /> : <LightbulbOff size={14} />}
              </button>
              <button
                onClick={toggleAllPhases}
                className="p-1 rounded text-cyan-400 hover:bg-slate-700/70 hover:text-cyan-300 transition"
                title="Expand or collapse all phases in the workspace"
              >
                {allPhaseIds.length > 0 && allPhaseIds.some((phaseId) => !(expandedPhases[phaseId] ?? true)) ? (
                  <ChevronRight size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
            </div>
          </div>

          <div>
            {chartRows.map((row) => {
              if (row.kind === 'project') {
                const projectBarVisible = !hiddenProjectBars[row.projectId];

                return (
                  <div
                    key={row.key}
                    style={{ height: row.height }}
                    className="px-3 flex items-center justify-between border-b border-slate-700/50 bg-slate-800"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <button
                        onClick={() => toggleProjectPhases(row.projectId)}
                        className="p-1 rounded text-cyan-400 hover:bg-slate-700/70 hover:text-cyan-300 transition flex-shrink-0"
                        title="Expand or collapse all phases in this project"
                      >
                        {projectHasCollapsedPhase.get(row.projectId) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <div className="text-[13px] font-bold text-slate-100 truncate">{row.label}</div>
                      <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 flex-shrink-0">{row.taskCount} scopes</div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => toggleProjectBarVisibility(row.projectId)}
                        className={clsx(
                          'p-1 rounded transition',
                          projectBarVisible
                            ? 'text-amber-300 hover:text-amber-200 hover:bg-slate-700/70'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/70'
                        )}
                        title={projectBarVisible ? 'Hide project summary bar' : 'Show project summary bar'}
                      >
                        {projectBarVisible ? <Lightbulb size={14} /> : <LightbulbOff size={14} />}
                      </button>
                      <button
                        onClick={() => beginDeleteProject(row.projectId, row.label)}
                        className="text-slate-400 hover:text-red-400 transition p-1 rounded hover:bg-slate-700/70"
                        title="Delete Project"
                      >
                        <UserMinus size={14} />
                      </button>
                    </div>
                  </div>
                );
              }

              if (row.kind === 'phase') {
                const phaseBarVisible = !hiddenPhaseBars[row.phaseId];

                return (
                  <div
                    key={row.key}
                    style={{ height: row.height }}
                    className="w-full px-3 flex items-center justify-between border-b border-slate-700/40 bg-slate-800/60 hover:bg-slate-700/50 transition text-left"
                  >
                    <button onClick={() => togglePhase(row.phaseId)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                      {row.expanded ? <ChevronDown size={14} className="text-cyan-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-cyan-400 flex-shrink-0" />}
                      <div className="text-[11px] font-semibold text-slate-200 truncate">{row.label}</div>
                      <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500 flex-shrink-0">{row.taskCount} scopes</div>
                    </button>
                    <button
                      onClick={() => togglePhaseBarVisibility(row.phaseId)}
                      className={clsx(
                        'p-1 rounded transition ml-2 flex-shrink-0',
                        phaseBarVisible
                          ? 'text-amber-300 hover:text-amber-200 hover:bg-slate-700/70'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/70'
                      )}
                      title={phaseBarVisible ? 'Hide phase summary bar' : 'Show phase summary bar'}
                    >
                      {phaseBarVisible ? <Lightbulb size={14} /> : <LightbulbOff size={14} />}
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={row.key}
                  onClick={() => onTaskClick(row.taskId)}
                  style={{ height: row.height }}
                  className={clsx(
                    'px-3 flex items-center justify-between border-b border-slate-700/30 cursor-pointer hover:bg-slate-700/40 transition relative',
                    selectedTaskId === row.taskId && 'bg-slate-700/60'
                  )}
                >
                  {selectedTaskId === row.taskId && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 rounded-r shadow-[0_0_8px_rgba(34,211,238,0.8)]" />}
                  <div className="flex items-center gap-1.5 min-w-0 pl-5">
                    <span className="text-[11px] font-medium text-slate-200 truncate">{row.label}</span>
                    <span className="text-[9px] text-slate-500 flex-shrink-0">({row.duration}d)</span>
                    {row.subcontractor && (
                      <span
                        className={clsx(
                          'text-[9px] uppercase truncate font-bold',
                          row.delayDays > 0 ? 'text-red-400' : row.lag > 0 ? 'text-orange-400' : 'text-green-400/80'
                        )}
                      >
                        [{row.subcontractor}]
                      </span>
                    )}
                  </div>
                  {row.delayDays > 0 && (
                    <span title={`Delay: ${row.delayDays} days`} className="flex-shrink-0 drop-shadow ml-1">
                      <AlertTriangle size={12} className="text-red-500" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 relative pb-6">
          <div className="inline-flex min-w-full">
            <div className="flex flex-col relative" style={{ width: totalGridWidth }}>
              <div className="flex border-b border-slate-700 h-8 bg-slate-900 text-slate-300 sticky top-0 z-30">
                {monthGroups.map((group, index) => (
                  <div
                    key={`${group.label}-${index}`}
                    style={{ width: group.days * dayWidth }}
                    className="flex-shrink-0 border-r border-slate-500/55 flex items-center px-3 text-[10px] font-bold uppercase tracking-[0.16em] overflow-hidden whitespace-nowrap bg-slate-900/95"
                  >
                    {group.label}
                  </div>
                ))}
              </div>

              {(zoomLevel === 'day' || zoomLevel === 'week') && (
                <div className="flex border-b border-slate-700 h-7 bg-slate-800 text-slate-400 sticky top-8 z-30">
                  {weekGroups.map((group, index) => (
                    <div
                      key={`${group.label}-${index}`}
                      style={{ width: group.days * dayWidth }}
                      className={clsx(
                        'flex-shrink-0 border-r flex items-center justify-center px-2 text-[9px] font-bold overflow-hidden whitespace-nowrap backdrop-blur-md text-center',
                        zoomLevel === 'week' ? 'border-r-slate-400/80 bg-slate-800/98 text-slate-100' : 'border-r-slate-600/60 bg-slate-800/92'
                      )}
                    >
                      {zoomLevel === 'week' ? group.label : dayWidth * 7 > 44 ? group.label : null}
                    </div>
                  ))}
                </div>
              )}

              {zoomLevel === 'day' && (
                <div className="flex border-b border-slate-700 h-9 sticky top-[60px] z-30 shadow-sm backdrop-blur">
                  {dates.map((date, index) => {
                    const weekend = isWeekend(date);
                    return (
                      <div
                        key={index}
                        style={{ minWidth: dayWidth }}
                        className={clsx(
                          'flex-shrink-0 border-r border-slate-700/50 flex flex-col items-center justify-center text-[10px]',
                          weekend ? 'bg-slate-800/90 text-slate-500' : 'bg-slate-800 border-b border-b-cyan-500/30 text-slate-300'
                        )}
                      >
                        {dayWidth > 28 && <span className="opacity-60 truncate font-medium">{format(date, 'eee')}</span>}
                        <span className={clsx(weekend ? 'text-slate-500' : 'text-white font-bold')}>{format(date, 'd')}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                className="relative"
                style={{
                  width: totalGridWidth,
                  backgroundImage:
                    zoomLevel === 'day'
                      ? `repeating-linear-gradient(to right, rgba(30, 41, 59, 0.2) 0px, rgba(30, 41, 59, 0.2) ${dayWidth - 1}px, rgba(51, 65, 85, 0.1) ${dayWidth - 1}px, rgba(51, 65, 85, 0.1) ${dayWidth}px)`
                      : 'none'
                }}
              >
                <div className="absolute inset-0 flex pointer-events-none">
                  {monthGroups.map((group, index) => (
                    <div
                      key={`${group.label}-${index}`}
                      style={{ minWidth: group.days * dayWidth, flexShrink: 0 }}
                      className={clsx(
                        'border-r',
                        zoomLevel === 'month' ? 'border-slate-400/65' : 'border-slate-500/55'
                      )}
                    />
                  ))}
                  {(zoomLevel === 'day' || zoomLevel === 'week') &&
                    weekGroups.map((group, index) => (
                      <div
                        key={`${group.label}-grid-${index}`}
                        style={{
                          position: 'absolute',
                          left: group.startIndex * dayWidth,
                          width: group.days * dayWidth,
                          height: '100%'
                        }}
                        className="border-r border-slate-500/55"
                      />
                    ))}
                  {zoomLevel === 'day' &&
                    dates.map((date, index) =>
                      isWeekend(date) ? (
                        <div
                          key={index}
                          style={{ position: 'absolute', left: index * dayWidth, width: dayWidth, height: '100%' }}
                          className="bg-slate-800/10"
                        />
                      ) : null
                    )}
                  {zoomLevel === 'week' &&
                    weekGroups.map((group, index) => {
                      if (group.weekendStartIndex < 0 || group.weekendDays === 0) return null;

                      return (
                        <div
                          key={`${group.label}-weekend-${index}`}
                          style={{
                            position: 'absolute',
                            left: (group.startIndex + group.weekendStartIndex) * dayWidth,
                            width: group.weekendDays * dayWidth,
                            height: '100%'
                          }}
                          className="bg-slate-800/18"
                        />
                      );
                    })}
                </div>

                {chartRows.map((row) => {
                  const startDay = getDayOffset(row.start);
                  const endDay = getDayOffset(row.finish);
                  const daySpan = Math.max(endDay - startDay + 1, 1);

                  if (row.kind === 'project') {
                    const projectBarVisible = !hiddenProjectBars[row.projectId];

                    return (
                      <div key={row.key} style={{ height: row.height }} className="border-b border-slate-700/30 relative flex items-center bg-slate-800/10">
                        {projectBarVisible && (
                          <div
                            className="absolute h-5 rounded-md border border-cyan-300/30 bg-gradient-to-r from-cyan-600/90 to-blue-600/90 shadow-[0_6px_18px_rgba(8,145,178,0.25)]"
                            style={{
                              left: `${startDay * dayWidth + 4}px`,
                              width: `${Math.max(daySpan * dayWidth - 8, 10)}px`
                            }}
                          >
                            {daySpan * dayWidth > 90 && (
                              <span className="h-full px-3 flex items-center text-[10px] font-bold text-white tracking-wide">
                                {row.label}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (row.kind === 'phase') {
                    const phaseBarVisible = !hiddenPhaseBars[row.phaseId];

                    return (
                      <div key={row.key} style={{ height: row.height }} className="border-b border-slate-700/20 relative flex items-center bg-slate-800/5">
                        {phaseBarVisible && (
                          <div
                            className="absolute h-3.5 rounded border border-amber-300/30 bg-gradient-to-r from-amber-500/70 to-orange-500/70 shadow-[0_4px_12px_rgba(245,158,11,0.2)]"
                            style={{
                              left: `${startDay * dayWidth + 6}px`,
                              width: `${Math.max(daySpan * dayWidth - 12, 8)}px`
                            }}
                          >
                            {daySpan * dayWidth > 120 && (
                              <span className="h-full px-2 flex items-center text-[9px] font-semibold text-white/90 uppercase tracking-[0.15em]">
                                {row.label}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const isDelayed = row.delayDays > 0;
                  const customColor = row.subcontractor ? vendorColors[row.subcontractor] : null;
                  const logicStart = taskById.get(row.taskId)?.logic_start || row.start;
                  const logicStartDay = getDayOffset(logicStart);

                  return (
                    <div key={row.key} style={{ height: row.height }} className="border-b border-slate-700/20 relative flex items-center group">
                      {isDelayed && (
                        <div
                          className="absolute h-2.5 rounded-sm bg-slate-600/30 border border-slate-500 border-dashed z-0"
                          style={{
                            left: `${logicStartDay * dayWidth + 5}px`,
                            width: `${Math.max((startDay - logicStartDay) * dayWidth, 0)}px`
                          }}
                        />
                      )}

                      <div
                        onClick={() => onTaskClick(row.taskId)}
                        className={clsx(
                          'absolute h-[18px] rounded shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer flex items-center px-1.5 z-10 box-border hover:brightness-110',
                          !customColor && isDelayed && 'bg-red-500/90 border border-red-400 shadow-[0_4px_12px_rgba(239,68,68,0.4)]',
                          !customColor && !isDelayed && 'bg-gradient-to-r from-cyan-600 to-blue-600 border border-cyan-400/50 shadow-[0_4px_12px_rgba(8,145,178,0.3)]',
                          customColor && 'shadow-md border border-black/20',
                          customColor && isDelayed && 'border-2 border-red-500 ring-2 ring-red-500/60 ring-offset-1 ring-offset-slate-900',
                          row.lag < 0 && 'border-2 border-orange-500 ring-2 ring-orange-400/50 shadow-[0_0_10px_rgba(249,115,22,0.6)]',
                          selectedTaskId === row.taskId && 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-105'
                        )}
                        style={{
                          left: `${startDay * dayWidth + 5}px`,
                          width: `${Math.max(daySpan * dayWidth - 10, 8)}px`,
                          ...(customColor ? { backgroundColor: customColor } : {})
                        }}
                      >
                        {dayWidth * daySpan > 40 && (
                          <span className={clsx('text-[9px] font-bold text-white drop-shadow-md truncate px-1 rounded', row.lag < 0 && 'bg-orange-600/50')}>
                            {row.lag < 0
                              ? `Overlap ${row.lag}d`
                              : isDelayed
                                ? `${row.delayDays}d Delay${row.bottleneckVendor ? ` (${row.bottleneckVendor})` : ''}`
                                : `${row.duration}d`}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {projectPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/80 px-5 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-400">Delete Project</div>
                <h3 className="mt-2 text-lg font-semibold text-slate-100">{projectPendingDelete.name}</h3>
                <p className="mt-2 text-sm text-slate-400">
                  This removes the project and its schedule data. Type the project name exactly to confirm.
                </p>
              </div>
              <button
                onClick={closeDeleteProjectModal}
                disabled={isDeletingProject}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-5">
              <label className="block">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Type Project Name
                </div>
                <input
                  value={deleteConfirmation}
                  onChange={(event) => {
                    setDeleteConfirmation(event.target.value);
                    if (deleteError) setDeleteError(null);
                  }}
                  placeholder={projectPendingDelete.name}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-red-400 focus:outline-none"
                />
              </label>

              <div className="mt-3 text-sm text-slate-500">
                Required: <span className="font-medium text-slate-300">{projectPendingDelete.name}</span>
              </div>

              {deleteError && <div className="mt-3 text-sm text-red-300">{deleteError}</div>}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-800 bg-slate-950/60 px-5 py-4">
              <button
                onClick={closeDeleteProjectModal}
                disabled={isDeletingProject}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteProject}
                disabled={isDeletingProject || deleteConfirmation !== projectPendingDelete.name}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isDeletingProject ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
