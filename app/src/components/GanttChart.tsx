import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { differenceInDays, addDays, endOfWeek, format, isWeekend, startOfWeek, parseISO } from 'date-fns';
import { clsx } from 'clsx';
import { AlertTriangle, ChevronDown, ChevronRight, ChevronsDown, ChevronsRight, Lightbulb, LightbulbOff, Pencil } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '../store/projectStore';
import type { EngineTask } from '../utils/schedulingEngine';

type ZoomLevel = 'day' | 'week' | 'month';
type PersistedVisibilityMap = Record<string, boolean>;
type GanttChartViewState = {
  version: 1;
  zoomLevel: ZoomLevel;
  leftPanelWidth: number;
  visibleProjectPhases: PersistedVisibilityMap;
  expandedPhases: Record<string, boolean>;
  hiddenProjectBars: PersistedVisibilityMap;
  hiddenPhaseBars: PersistedVisibilityMap;
  scrollTop: number;
  scrollLeft: number;
};

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
      logicViolationDays: number;
      lag: number;
      bottleneckVendor: string | null;
      hasVendorCollision: boolean;
      hasDependencyViolation: boolean;
      height: number;
    };

type RowMetric = {
  row: ChartRow;
  top: number;
  bottom: number;
};

type ProjectRowMetric = {
  row: Extract<ChartRow, { kind: 'project' }>;
  top: number;
  bottom: number;
};

type PhaseRowMetric = {
  row: Extract<ChartRow, { kind: 'phase' }>;
  top: number;
  bottom: number;
};

const PROJECT_ROW_HEIGHT = 34;
const PHASE_ROW_HEIGHT = 28;
const TASK_ROW_HEIGHT = 28;
const CHART_VIEW_STATE_STORAGE_KEY = 'gantt:view-state';
const HIDDEN_PROJECT_BARS_STORAGE_KEY = 'gantt:hidden-project-bars';
const HIDDEN_PHASE_BARS_STORAGE_KEY = 'gantt:hidden-phase-bars';

const readPersistedBarVisibility = (storageKey: string): PersistedVisibilityMap => {
  if (typeof window === 'undefined') return {};

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return {};

    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[0] === 'string' && typeof entry[1] === 'boolean')
    );
  } catch {
    return {};
  }
};

const isZoomLevel = (value: unknown): value is ZoomLevel =>
  typeof value === 'string' && ZOOM_LEVELS.includes(value as ZoomLevel);

const readPersistedChartViewState = (): GanttChartViewState => {
  if (typeof window === 'undefined') {
    return {
      version: 1,
      zoomLevel: 'day',
      leftPanelWidth: 272,
      visibleProjectPhases: {},
      expandedPhases: {},
      hiddenProjectBars: {},
      hiddenPhaseBars: {},
      scrollTop: 0,
      scrollLeft: 0
    };
  }

  const fallbackHiddenProjectBars = readPersistedBarVisibility(HIDDEN_PROJECT_BARS_STORAGE_KEY);
  const fallbackHiddenPhaseBars = readPersistedBarVisibility(HIDDEN_PHASE_BARS_STORAGE_KEY);

  try {
    const rawValue = window.localStorage.getItem(CHART_VIEW_STATE_STORAGE_KEY);
    if (!rawValue) {
      return {
        version: 1,
        zoomLevel: 'day',
        leftPanelWidth: 272,
        visibleProjectPhases: {},
        expandedPhases: {},
        hiddenProjectBars: fallbackHiddenProjectBars,
        hiddenPhaseBars: fallbackHiddenPhaseBars,
        scrollTop: 0,
        scrollLeft: 0
      };
    }

    const parsed = JSON.parse(rawValue) as Partial<GanttChartViewState> | null;
    const visibleProjectPhases =
      parsed?.visibleProjectPhases && typeof parsed.visibleProjectPhases === 'object' && !Array.isArray(parsed.visibleProjectPhases)
        ? Object.fromEntries(
            Object.entries(parsed.visibleProjectPhases).filter(
              (entry): entry is [string, boolean] => typeof entry[0] === 'string' && typeof entry[1] === 'boolean'
            )
          )
        : {};
    const expandedPhases =
      parsed?.expandedPhases && typeof parsed.expandedPhases === 'object' && !Array.isArray(parsed.expandedPhases)
        ? Object.fromEntries(
            Object.entries(parsed.expandedPhases).filter(
              (entry): entry is [string, boolean] => typeof entry[0] === 'string' && typeof entry[1] === 'boolean'
            )
          )
        : {};

    return {
      version: 1,
      zoomLevel: isZoomLevel(parsed?.zoomLevel) ? parsed.zoomLevel : 'day',
      leftPanelWidth:
        typeof parsed?.leftPanelWidth === 'number' && Number.isFinite(parsed.leftPanelWidth)
          ? Math.max(200, Math.min(520, parsed.leftPanelWidth))
          : 272,
      visibleProjectPhases,
      expandedPhases,
      hiddenProjectBars:
        parsed?.hiddenProjectBars && typeof parsed.hiddenProjectBars === 'object' && !Array.isArray(parsed.hiddenProjectBars)
          ? Object.fromEntries(
              Object.entries(parsed.hiddenProjectBars).filter(
                (entry): entry is [string, boolean] => typeof entry[0] === 'string' && typeof entry[1] === 'boolean'
              )
            )
          : fallbackHiddenProjectBars,
      hiddenPhaseBars:
        parsed?.hiddenPhaseBars && typeof parsed.hiddenPhaseBars === 'object' && !Array.isArray(parsed.hiddenPhaseBars)
          ? Object.fromEntries(
              Object.entries(parsed.hiddenPhaseBars).filter(
                (entry): entry is [string, boolean] => typeof entry[0] === 'string' && typeof entry[1] === 'boolean'
              )
            )
          : fallbackHiddenPhaseBars,
      scrollTop:
        typeof parsed?.scrollTop === 'number' && Number.isFinite(parsed.scrollTop) && parsed.scrollTop >= 0 ? parsed.scrollTop : 0,
      scrollLeft:
        typeof parsed?.scrollLeft === 'number' && Number.isFinite(parsed.scrollLeft) && parsed.scrollLeft >= 0 ? parsed.scrollLeft : 0
    };
  } catch {
    return {
      version: 1,
      zoomLevel: 'day',
      leftPanelWidth: 272,
      visibleProjectPhases: {},
      expandedPhases: {},
      hiddenProjectBars: fallbackHiddenProjectBars,
      hiddenPhaseBars: fallbackHiddenPhaseBars,
      scrollTop: 0,
      scrollLeft: 0
    };
  }
};

export type GanttChartHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
};

export const GanttChart = forwardRef<GanttChartHandle, {
  onTaskClick: (id: string) => void;
  onEditProject: (projectId: string) => void;
  selectedTaskId: string | null;
  onZoomStateChange?: (state: { canZoomIn: boolean; canZoomOut: boolean }) => void;
}> (function GanttChart({
  onTaskClick,
  onEditProject,
  selectedTaskId,
  onZoomStateChange
}, ref) {
  const { projects, tasks, projectPhases, vendorColors, activeFilters } = useProjectStore(
    useShallow((state) => ({
      projects: state.projects,
      tasks: state.tasks,
      projectPhases: state.projectPhases,
      vendorColors: state.vendorColors,
      activeFilters: state.activeFilters
    }))
  );

  const [persistedViewState] = useState(readPersistedChartViewState);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(persistedViewState.zoomLevel);
  const [leftPanelWidth, setLeftPanelWidth] = useState(persistedViewState.leftPanelWidth);
  const [visibleProjectPhases, setVisibleProjectPhases] = useState<Record<string, boolean>>(persistedViewState.visibleProjectPhases);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>(persistedViewState.expandedPhases);
  const [hiddenProjectBars, setHiddenProjectBars] = useState<Record<string, boolean>>(persistedViewState.hiddenProjectBars);
  const [hiddenPhaseBars, setHiddenPhaseBars] = useState<Record<string, boolean>>(persistedViewState.hiddenPhaseBars);
  const [scrollTop, setScrollTop] = useState(persistedViewState.scrollTop);
  const [scrollLeft, setScrollLeft] = useState(persistedViewState.scrollLeft);

  const isResizing = useRef(false);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingTop = useRef(false);
  const isScrollingMain = useRef(false);
  const pendingZoomFocusDay = useRef<number | null>(null);
  const hasRestoredScroll = useRef(false);

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
    const projectShowsPhases = new Map<string, boolean>();
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
      const phasesVisible = visibleProjectPhases[project.id] ?? false;

      projectShowsPhases.set(project.id, phasesVisible);

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

        const expanded = expandedPhases[phaseId] ?? false;
        if (!expanded) projectHasCollapsedPhase.set(project.id, true);
        if (!phasesVisible) return;

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
            logicViolationDays: task.logic_violation_days || 0,
            lag: task.lag || 0,
            bottleneckVendor: task.bottleneck_vendor,
            hasVendorCollision: (task.delay_days || 0) > 0 && Boolean(task.bottleneck_vendor) && Boolean(task.delay_cause_task_id || task.delay_cause_task_name),
            hasDependencyViolation: (task.logic_violation_days || 0) > 0,
            height: TASK_ROW_HEIGHT
          });
        });
      });

      phaseIdsByProject.set(project.id, projectPhaseIds);
    });

    return { chartRows: rows, phaseIdsByProject, projectHasCollapsedPhase, projectShowsPhases };
  }, [expandedPhases, projectPhases, projects, visibleProjectPhases, visibleTasks]);

  const { chartRows, phaseIdsByProject, projectHasCollapsedPhase, projectShowsPhases } = chartMeta;
  const allPhaseIds = useMemo(() => Array.from(phaseIdsByProject.values()).flat(), [phaseIdsByProject]);
  const visibleProjectIds = useMemo(() => Array.from(phaseIdsByProject.keys()), [phaseIdsByProject]);
  const allProjectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const allPersistablePhaseIds = useMemo(() => {
    const persistedIds = new Set(projectPhases.map((phase) => phase.id));

    tasks.forEach((task) => {
      const fallbackPhaseId = task.project_phase_id ?? `${task.project_id}:${task.phase_order}:${task.phase_name ?? 'Unphased'}`;
      persistedIds.add(fallbackPhaseId);
    });

    return Array.from(persistedIds);
  }, [projectPhases, tasks]);
  const rowMetrics = useMemo<RowMetric[]>(() => {
    let offsetTop = 0;

    return chartRows.map((row) => {
      const metric: RowMetric = {
        row,
        top: offsetTop,
        bottom: offsetTop + row.height
      };
      offsetTop += row.height;
      return metric;
    });
  }, [chartRows]);
  const taskRowById = useMemo(
    () =>
      new Map(
        chartRows
          .filter((row): row is Extract<ChartRow, { kind: 'task' }> => row.kind === 'task')
          .map((row) => [row.taskId, row])
      ),
    [chartRows]
  );

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

  const activeStickyRows = useMemo(() => {
    let activeProject: ProjectRowMetric | null = null;
    let nextProject: ProjectRowMetric | null = null;
    let activePhase: PhaseRowMetric | null = null;
    let nextPhase: PhaseRowMetric | null = null;

    // Use absolute scrollTop for detection thresholds
    // A project sticks when it hits the top (0)
    // A phase sticks when it hits the bottom of the project header (PROJECT_ROW_HEIGHT)
    for (let i = 0; i < rowMetrics.length; i++) {
      const metric = rowMetrics[i];
      
      if (metric.row.kind === 'project') {
        if (metric.top <= scrollTop) {
          activeProject = metric as ProjectRowMetric;
          activePhase = null; 
        } else if (!nextProject) {
          nextProject = metric as ProjectRowMetric;
        }
      }

      if (metric.row.kind === 'phase' && activeProject && metric.row.projectId === activeProject.row.projectId) {
        if (metric.top <= scrollTop + PROJECT_ROW_HEIGHT) {
          activePhase = metric as PhaseRowMetric;
        } else if (!nextPhase) {
          nextPhase = metric as PhaseRowMetric;
        }
      }
    }

    // Calculate Push Offsets
    let projectOffset = 0;
    if (activeProject && nextProject) {
      const distance = nextProject.top - scrollTop;
      if (distance < PROJECT_ROW_HEIGHT) {
        projectOffset = distance - PROJECT_ROW_HEIGHT;
      }
    }

    let phaseOffset = projectOffset; 
    if (activePhase) {
      const phaseStickyThreshold = scrollTop + PROJECT_ROW_HEIGHT;
      
      if (nextPhase) {
        const distance = nextPhase.top - phaseStickyThreshold;
        if (distance < PHASE_ROW_HEIGHT) {
          phaseOffset += (distance - PHASE_ROW_HEIGHT);
        }
      } 
      else if (nextProject) {
        const distance = nextProject.top - phaseStickyThreshold;
        if (distance < PHASE_ROW_HEIGHT) {
          phaseOffset += (distance - PHASE_ROW_HEIGHT);
        }
      }
    }

    return { activeProject, activePhase, projectOffset, phaseOffset };
  }, [scrollTop, rowMetrics]);

  const { activeProject, activePhase, projectOffset, phaseOffset } = activeStickyRows;
  const activeProjectMetric = activeProject;
  const activePhaseMetric = activePhase;

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

  useEffect(() => {
    const mainScroll = mainScrollRef.current;
    const topScroll = topScrollRef.current;
    if (!mainScroll || !topScroll) return;

    const syncTop = () => {
      if (!isScrollingMain.current) {
        isScrollingTop.current = true;
        topScroll.scrollLeft = mainScroll.scrollLeft;
        setScrollTop(mainScroll.scrollTop);
        setScrollLeft(mainScroll.scrollLeft);
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
    setScrollTop(mainScroll.scrollTop);
    setScrollLeft(mainScroll.scrollLeft);

    return () => {
      mainScroll.removeEventListener('scroll', syncTop);
      topScroll.removeEventListener('scroll', syncMain);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [datesInfo, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const mainScroll = mainScrollRef.current;
    const topScroll = topScrollRef.current;
    if (!mainScroll || !topScroll || dates.length === 0 || chartRows.length === 0 || hasRestoredScroll.current) return;

    const maxScrollTop = Math.max(mainScroll.scrollHeight - mainScroll.clientHeight, 0);
    const maxScrollLeft = Math.max(mainScroll.scrollWidth - mainScroll.clientWidth, 0);
    const nextScrollTop = Math.max(0, Math.min(persistedViewState.scrollTop, maxScrollTop));
    const nextScrollLeft = Math.max(0, Math.min(persistedViewState.scrollLeft, maxScrollLeft));

    mainScroll.scrollTop = nextScrollTop;
    mainScroll.scrollLeft = nextScrollLeft;
    topScroll.scrollLeft = nextScrollLeft;
    setScrollTop(nextScrollTop);
    setScrollLeft(nextScrollLeft);
    hasRestoredScroll.current = true;
  }, [chartRows.length, dates.length, persistedViewState.scrollLeft, persistedViewState.scrollTop]);

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

  useEffect(() => {
    const validProjectIds = new Set(allProjectIds);

    setVisibleProjectPhases((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([projectId]) => validProjectIds.has(projectId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });

    setHiddenProjectBars((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([projectId]) => validProjectIds.has(projectId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [allProjectIds]);

  useEffect(() => {
    const validPhaseIds = new Set(allPersistablePhaseIds);

    setHiddenPhaseBars((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([phaseId]) => validPhaseIds.has(phaseId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [allPersistablePhaseIds]);

  useEffect(() => {
    window.localStorage.setItem(
      CHART_VIEW_STATE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        zoomLevel,
        leftPanelWidth,
        visibleProjectPhases,
        expandedPhases,
        hiddenProjectBars,
        hiddenPhaseBars,
        scrollTop,
        scrollLeft
      } satisfies GanttChartViewState)
    );
  }, [expandedPhases, hiddenPhaseBars, hiddenProjectBars, leftPanelWidth, scrollLeft, scrollTop, visibleProjectPhases, zoomLevel]);

  const captureZoomFocus = () => {
    const mainScroll = mainScrollRef.current;
    if (!mainScroll) return;

    const viewportCenter = mainScroll.scrollLeft + mainScroll.clientWidth / 2;
    pendingZoomFocusDay.current = viewportCenter / dayWidth;
  };

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => ({ ...prev, [phaseId]: !(prev[phaseId] ?? false) }));
  };

  const toggleProjectPhaseVisibility = (projectId: string) => {
    setVisibleProjectPhases((prev) => ({
      ...prev,
      [projectId]: !(prev[projectId] ?? false)
    }));
  };

  const toggleProjectPhases = (projectId: string) => {
    const phaseIds = phaseIdsByProject.get(projectId) ?? [];
    if (phaseIds.length === 0) return;

    const shouldExpand = phaseIds.some((phaseId) => !(expandedPhases[phaseId] ?? false));

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

  const toggleProjectPhaseBars = (projectId: string) => {
    const projectPhaseIds = phaseIdsByProject.get(projectId) ?? [];
    if (projectPhaseIds.length === 0) return;

    const shouldHide = projectPhaseIds.some((phaseId) => !(hiddenPhaseBars[phaseId] ?? false));

    setHiddenPhaseBars((current) => {
      const next = { ...current };
      projectPhaseIds.forEach((phaseId) => {
        next[phaseId] = shouldHide;
      });
      return next;
    });
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

  const collapseToProjectRows = () => {
    if (visibleProjectIds.length === 0) return;

    setVisibleProjectPhases((prev) => {
      const next = { ...prev };
      visibleProjectIds.forEach((projectId) => {
        next[projectId] = false;
      });
      return next;
    });
  };

  const areAllVisibleProjectPhasesShown =
    visibleProjectIds.length > 0 && visibleProjectIds.every((projectId) => visibleProjectPhases[projectId] ?? false);
  const areAllVisiblePhasesExpanded = allPhaseIds.length > 0 && allPhaseIds.every((phaseId) => expandedPhases[phaseId] ?? false);
  const isAllDetailExpanded = areAllVisibleProjectPhasesShown && areAllVisiblePhasesExpanded;

  const toggleAllProjectDetails = () => {
    if (visibleProjectIds.length === 0) return;

    if (isAllDetailExpanded) {
      setExpandedPhases((prev) => {
        const next = { ...prev };
        allPhaseIds.forEach((phaseId) => {
          next[phaseId] = false;
        });
        return next;
      });
      return;
    }

    setVisibleProjectPhases((prev) => {
      const next = { ...prev };
      visibleProjectIds.forEach((projectId) => {
        next[projectId] = true;
      });
      return next;
    });

    setExpandedPhases((prev) => {
      const next = { ...prev };
      allPhaseIds.forEach((phaseId) => {
        next[phaseId] = true;
      });
      return next;
    });
  };

  const setZoomFromIndex = (nextIndex: number) => {
    setZoomLevel(ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, nextIndex))]);
  };

  const centerTaskBarInView = useCallback(
    (taskId: string) => {
      const mainScroll = mainScrollRef.current;
      const taskRow = taskRowById.get(taskId);
      if (!mainScroll || !taskRow) return;

      const startDay = getDayOffset(taskRow.start);
      const finishDay = getDayOffset(taskRow.finish);
      const daySpan = Math.max(finishDay - startDay + 1, 1);
      const barCenter = startDay * dayWidth + Math.max(daySpan * dayWidth - 10, 8) / 2;
      const gridViewportWidth = Math.max(mainScroll.clientWidth - leftPanelWidth, 0);
      const maxScrollLeft = Math.max(totalGridWidth - gridViewportWidth, 0);
      const targetScrollLeft = Math.max(0, Math.min(barCenter - gridViewportWidth / 2, maxScrollLeft));

      mainScroll.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
      topScrollRef.current?.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
    },
    [dayWidth, getDayOffset, leftPanelWidth, taskRowById, totalGridWidth]
  );

  const handlePaneTaskClick = useCallback(
    (taskId: string) => {
      onTaskClick(taskId);
      centerTaskBarInView(taskId);
    },
    [centerTaskBarInView, onTaskClick]
  );

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

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: handleZoomIn,
      zoomOut: handleZoomOut,
      canZoomIn: zoomLevel !== 'day',
      canZoomOut: zoomLevel !== 'month'
    }),
    [zoomLevel]
  );

  useEffect(() => {
    onZoomStateChange?.({
      canZoomIn: zoomLevel !== 'day',
      canZoomOut: zoomLevel !== 'month'
    });
  }, [onZoomStateChange, zoomLevel]);

  return (
    <div className="flex flex-col h-full relative">
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
          className="flex-shrink-0 border-r border-slate-700 bg-slate-800/95 z-40 sticky left-0 min-h-max"
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
            <div className="min-w-0 flex items-center gap-1.5">
              <button
                onClick={collapseToProjectRows}
                className="p-1 rounded text-cyan-400 hover:bg-slate-700/70 hover:text-cyan-300 transition flex-shrink-0"
                title="Roll everything up to project rows only"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={toggleAllProjectDetails}
                className="p-1 rounded text-cyan-400 hover:bg-slate-700/70 hover:text-cyan-300 transition flex-shrink-0"
                title={isAllDetailExpanded ? 'Collapse all visible scopes back to phase rows' : 'Show all phase rows and expand all scopes'}
              >
                {isAllDetailExpanded ? <ChevronsRight size={14} /> : <ChevronsDown size={14} />}
              </button>
              <div className="min-w-0 truncate">Project / Phase / Scope</div>
            </div>
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
            </div>
          </div>

          {rowMetrics.map((metric) => {
            const row = metric.row;
            const isProjectSticky = activeProjectMetric?.row.key === row.key;
            const isPhaseSticky = activePhaseMetric?.row.key === row.key;

            if (row.kind === 'project') {
              const projectPhasesVisible = projectShowsPhases.get(row.projectId) ?? false;
              const projectScopesExpanded = !projectHasCollapsedPhase.get(row.projectId);
              const projectBarVisible = !hiddenProjectBars[row.projectId];
              const projectPhaseIds = phaseIdsByProject.get(row.projectId) ?? [];
              const projectPhaseBarsVisible =
                projectPhaseIds.length > 0 && projectPhaseIds.some((phaseId) => !(hiddenPhaseBars[phaseId] ?? false));

              return (
                <div
                  key={row.key}
                  style={{ 
                    height: row.height,
                    top: isProjectSticky ? headerHeight + projectOffset : undefined
                  }}
                  className={clsx(
                    'px-3 flex items-center justify-between border-b border-slate-700/50 bg-cyan-600/90 transition-colors',
                    isProjectSticky ? 'sticky z-30 shadow-[0_6px_18px_rgba(2,6,23,0.35)]' : 'z-10'
                  )}
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <button
                      onClick={() => toggleProjectPhaseVisibility(row.projectId)}
                      className="p-1 rounded text-white/90 hover:bg-slate-700/70 hover:text-white transition flex-shrink-0"
                      title={projectPhasesVisible ? 'Roll this project up to the project row only' : 'Show this project phase rows'}
                    >
                      {projectPhasesVisible ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <button
                      onClick={() => toggleProjectPhases(row.projectId)}
                      disabled={!projectPhasesVisible}
                      className={clsx(
                        'p-1 rounded transition flex-shrink-0',
                        projectPhasesVisible
                          ? 'text-white/90 hover:bg-slate-700/70 hover:text-white'
                          : 'text-slate-500 cursor-not-allowed'
                      )}
                      title={
                        projectPhasesVisible
                          ? 'Expand or collapse all scopes inside this project phases'
                          : 'Show this project phase rows before expanding scopes'
                      }
                    >
                      {projectScopesExpanded ? <ChevronsDown size={14} /> : <ChevronsRight size={14} />}
                    </button>
                    <div className="text-[13px] font-bold text-slate-100 truncate">{row.label}</div>
                    <div className="text-[9px] uppercase tracking-[0.18em] text-white/85 flex-shrink-0">{row.taskCount} scopes</div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => onEditProject(row.projectId)}
                      className="text-white/80 hover:text-white transition p-1 rounded hover:bg-slate-700/70"
                      title={`Edit ${row.label}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => toggleProjectBarVisibility(row.projectId)}
                      className={clsx(
                        'p-1 rounded transition',
                        projectBarVisible
                          ? 'text-white/90 hover:text-white hover:bg-slate-700/70'
                          : 'text-white/50 hover:text-white/80 hover:bg-slate-700/70'
                      )}
                      title={projectBarVisible ? 'Hide project summary bar' : 'Show project summary bar'}
                    >
                      {projectBarVisible ? <Lightbulb size={14} /> : <LightbulbOff size={14} />}
                    </button>
                    <button
                      onClick={() => toggleProjectPhaseBars(row.projectId)}
                      disabled={projectPhaseIds.length === 0}
                      className={clsx(
                        'p-1 rounded transition',
                        projectPhaseIds.length === 0
                          ? 'text-white/40 cursor-not-allowed'
                          : projectPhaseBarsVisible
                            ? 'text-white/90 hover:text-white hover:bg-slate-700/70'
                            : 'text-white/50 hover:text-white/80 hover:bg-slate-700/70'
                      )}
                      title={
                        projectPhaseIds.length === 0
                          ? 'No phase summary bars available for this project'
                          : projectPhaseBarsVisible
                            ? 'Hide all phase summary bars for this project'
                            : 'Show all phase summary bars for this project'
                      }
                    >
                      {projectPhaseBarsVisible ? <Lightbulb size={14} /> : <LightbulbOff size={14} />}
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
                  style={{ 
                    height: row.height,
                    top: isPhaseSticky ? headerHeight + PROJECT_ROW_HEIGHT + phaseOffset : undefined
                  }}
                  className={clsx(
                    'w-full px-3 flex items-center justify-between border-b border-slate-700/40 bg-slate-800/90 hover:bg-slate-700/50 transition text-left',
                    isPhaseSticky ? 'sticky z-20 shadow-[0_4px_14px_rgba(2,6,23,0.28)]' : 'z-10'
                  )}
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

            const hasVendorCollision = row.hasVendorCollision;
            const hasDependencyViolation = row.hasDependencyViolation;

            return (
              <div
                key={row.key}
                onClick={() => handlePaneTaskClick(row.taskId)}
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
                        hasVendorCollision ? 'text-red-400' : hasDependencyViolation ? 'text-orange-400' : 'text-green-400/80'
                      )}
                    >
                      [{row.subcontractor}]
                    </span>
                  )}
                </div>
                {(hasVendorCollision || hasDependencyViolation) && (
                  <span title={hasVendorCollision ? `Collision: ${row.delayDays} days` : `Dependency issue: ${row.logicViolationDays} days`} className="flex-shrink-0 drop-shadow ml-1">
                    <AlertTriangle size={12} className={hasVendorCollision ? 'text-red-500' : 'text-orange-500'} />
                  </span>
                )}
              </div>
            );
          })}
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
                  const isProjectSticky = activeProjectMetric?.row.key === row.key;
                  const isPhaseSticky = activePhaseMetric?.row.key === row.key;

                  if (row.kind === 'project') {
                    const projectBarVisible = !hiddenProjectBars[row.projectId];

                    return (
                      <div 
                        key={row.key} 
                        style={{ 
                          height: row.height,
                          top: isProjectSticky ? headerHeight + projectOffset : undefined
                        }} 
                        className={clsx(
                          'border-b border-slate-700/30 relative flex items-center overflow-hidden',
                          isProjectSticky ? 'sticky z-30 bg-slate-900 shadow-[0_6px_18px_rgba(2,6,23,0.35)]' : 'z-10 bg-slate-800/10'
                        )}
                      >
                        {isProjectSticky && <div className="absolute inset-0 bg-slate-900 z-0" />}
                        {projectBarVisible && (
                          <div
                            className="absolute h-5 rounded-md border border-cyan-300/30 bg-gradient-to-r from-cyan-600/90 to-blue-600/90 shadow-[0_6px_18px_rgba(8,145,178,0.25)] z-10"
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
                      <div 
                        key={row.key} 
                        style={{ 
                          height: row.height,
                          top: isPhaseSticky ? headerHeight + PROJECT_ROW_HEIGHT + phaseOffset : undefined
                        }} 
                        className={clsx(
                          'border-b border-slate-700/20 relative flex items-center overflow-hidden',
                          isPhaseSticky ? 'sticky z-20 bg-slate-900 shadow-[0_4px_12px_rgba(2,6,23,0.25)]' : 'z-10 bg-slate-800/5'
                        )}
                      >
                        {isPhaseSticky && <div className="absolute inset-0 bg-slate-900 z-0" />}
                        {phaseBarVisible && (
                          <div
                            className="absolute h-3.5 rounded border border-amber-300/30 bg-gradient-to-r from-amber-500/70 to-orange-500/70 shadow-[0_4px_12px_rgba(245,158,11,0.2)] z-10"
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

                  const isDelayed = row.hasVendorCollision;
                  const hasDependencyViolation = row.hasDependencyViolation;
                  const customColor = row.subcontractor ? vendorColors[row.subcontractor] : null;
                  const logicStart = taskById.get(row.taskId)?.logic_start || row.start;
                  const logicStartDay = getDayOffset(logicStart);

                  return (
                    <div key={row.key} style={{ height: row.height }} className="border-b border-slate-700/20 relative flex items-center group">
                      {(isDelayed || hasDependencyViolation) && (
                        <div
                          className={clsx(
                            'absolute h-2.5 rounded-sm border border-dashed z-0',
                            isDelayed ? 'bg-slate-600/30 border-slate-500' : 'bg-orange-500/10 border-orange-500/60'
                          )}
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
                          !customColor && !isDelayed && hasDependencyViolation && 'bg-orange-500/90 border border-orange-400 shadow-[0_4px_12px_rgba(249,115,22,0.35)]',
                          !customColor && !isDelayed && 'bg-gradient-to-r from-cyan-600 to-blue-600 border border-cyan-400/50 shadow-[0_4px_12px_rgba(8,145,178,0.3)]',
                          customColor && 'shadow-md border border-black/20',
                          customColor && isDelayed && 'border-2 border-red-500 ring-2 ring-red-500/60 ring-offset-1 ring-offset-slate-900',
                          hasDependencyViolation && 'border-2 border-orange-500 ring-2 ring-orange-400/50 shadow-[0_0_10px_rgba(249,115,22,0.6)]',
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
                              : hasDependencyViolation
                                ? `Dependency ${row.logicViolationDays}d`
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

    </div>
  );
});
