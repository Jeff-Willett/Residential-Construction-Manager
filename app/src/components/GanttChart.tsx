import { useMemo, useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { differenceInDays, addDays, format, isWeekend, startOfWeek, parseISO } from 'date-fns';
import { clsx } from 'clsx';
import { ZoomIn, ZoomOut, AlertTriangle, UserMinus, ChevronDown, ChevronRight } from 'lucide-react';

type ZoomLevel = 'day' | 'week' | 'month';

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

const PROJECT_ROW_HEIGHT = 40;
const PHASE_ROW_HEIGHT = 32;
const TASK_ROW_HEIGHT = 32;

export function GanttChart({ onTaskClick, selectedTaskId }: { onTaskClick: (id: string) => void; selectedTaskId: string | null }) {
  const { projects, tasks, projectPhases, deleteProject, vendorColors, activeFilters } = useProjectStore();
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('day');
  const [colWidth, setColWidth] = useState(40);
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});
  const isResizing = useRef(false);

  const mainScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const isScrollingTop = useRef(false);
  const isScrollingMain = useRef(false);
  const pendingZoomFocusDay = useRef<number | null>(null);

  const visibleTasks = useMemo(() => {
    const { vendors, scopes } = activeFilters;
    if (vendors.length === 0 && scopes.length === 0) return tasks;
    return tasks.filter((task) => {
      const matchVendor = vendors.length === 0 || (task.subcontractor && vendors.includes(task.subcontractor));
      const matchScope = scopes.length === 0 || scopes.includes(task.name);
      return matchVendor && matchScope;
    });
  }, [tasks, activeFilters]);

  const chartRows = useMemo<ChartRow[]>(() => {
    const rows: ChartRow[] = [];

    projects.forEach((project) => {
      const projectTasks = visibleTasks
        .filter((task) => task.project_id === project.id && task.calculated_start && task.calculated_finish)
        .sort((a, b) => {
          if (a.phase_order !== b.phase_order) return a.phase_order - b.phase_order;
          if (a.task_order !== b.task_order) return a.task_order - b.task_order;
          return a.name.localeCompare(b.name);
        });

      if (projectTasks.length === 0) return;

      const projectStart = projectTasks.reduce(
        (min, task) => (task.calculated_start! < min ? task.calculated_start! : min),
        projectTasks[0].calculated_start!
      );
      const projectFinish = projectTasks.reduce(
        (max, task) => (task.calculated_finish! > max ? task.calculated_finish! : max),
        projectTasks[0].calculated_finish!
      );

      rows.push({
        kind: 'project',
        key: `project-${project.id}`,
        projectId: project.id,
        label: project.name,
        start: projectStart,
        finish: projectFinish,
        taskCount: projectTasks.length,
        height: PROJECT_ROW_HEIGHT
      });

      const knownPhaseOrder = new Map<string, { name: string; order: number }>();
      projectPhases
        .filter((phase) => phase.project_id === project.id)
        .forEach((phase) => {
          knownPhaseOrder.set(phase.id, { name: phase.name, order: phase.phase_order });
        });

      projectTasks.forEach((task) => {
        const fallbackKey = task.project_phase_id ?? `${project.id}:${task.phase_order}:${task.phase_name ?? 'Unphased'}`;
        if (!knownPhaseOrder.has(fallbackKey)) {
          knownPhaseOrder.set(fallbackKey, {
            name: task.phase_name ?? 'Unphased',
            order: task.phase_order ?? 999
          });
        }
      });

      const orderedPhases = Array.from(knownPhaseOrder.entries()).sort((a, b) => {
        if (a[1].order !== b[1].order) return a[1].order - b[1].order;
        return a[1].name.localeCompare(b[1].name);
      });

      orderedPhases.forEach(([phaseId, meta]) => {
        const phaseTasks = projectTasks.filter((task) => {
          const taskPhaseKey = task.project_phase_id ?? `${project.id}:${task.phase_order}:${task.phase_name ?? 'Unphased'}`;
          return taskPhaseKey === phaseId;
        });

        if (phaseTasks.length === 0) return;

        const phaseStart = phaseTasks.reduce(
          (min, task) => (task.calculated_start! < min ? task.calculated_start! : min),
          phaseTasks[0].calculated_start!
        );
        const phaseFinish = phaseTasks.reduce(
          (max, task) => (task.calculated_finish! > max ? task.calculated_finish! : max),
          phaseTasks[0].calculated_finish!
        );
        const expanded = expandedPhases[phaseId] ?? true;

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
    });

    return rows;
  }, [projects, visibleTasks, projectPhases, expandedPhases]);

  const datesInfo = useMemo(() => {
    if (visibleTasks.length === 0 || projects.length === 0) return { dates: [], getDayOffset: () => 0, monthGroups: [], weekGroups: [] };

    let minDateStr = visibleTasks[0].calculated_start || projects[0].start_date;
    let maxDateStr = visibleTasks[0].calculated_finish || projects[0].start_date;

    visibleTasks.forEach((task) => {
      if (task.calculated_start && task.calculated_start < minDateStr) minDateStr = task.calculated_start;
      if (task.calculated_finish && task.calculated_finish > maxDateStr) maxDateStr = task.calculated_finish;
    });

    const start = parseISO(minDateStr);
    const end = addDays(parseISO(maxDateStr), 30);

    const dayCount = differenceInDays(end, start) + 1;
    const dateArray = Array.from({ length: dayCount }).map((_, i) => addDays(start, i));
    const getDayOffset = (dateStr: string) => differenceInDays(parseISO(dateStr), start);

    const monthGroups: { label: string; days: number }[] = [];
    const weekGroups: { label: string; days: number }[] = [];

    dateArray.forEach((date) => {
      const monthLabel = format(date, 'MMMM yyyy');
      if (monthGroups.length === 0 || monthGroups[monthGroups.length - 1].label !== monthLabel) {
        monthGroups.push({ label: monthLabel, days: 1 });
      } else {
        monthGroups[monthGroups.length - 1].days++;
      }

      const weekStartDate = startOfWeek(date, { weekStartsOn: 1 });
      const weekLabel = `Week of ${format(weekStartDate, 'MMM d')}`;
      if (weekGroups.length === 0 || weekGroups[weekGroups.length - 1].label !== weekLabel) {
        weekGroups.push({ label: weekLabel, days: 1 });
      } else {
        weekGroups[weekGroups.length - 1].days++;
      }
    });

    return { dates: dateArray, getDayOffset, monthGroups, weekGroups };
  }, [visibleTasks, projects]);

  const { monthGroups, weekGroups, dates, getDayOffset } = datesInfo;

  const dayWidth = useMemo(() => {
    if (zoomLevel === 'day') return colWidth;
    if (zoomLevel === 'week') return colWidth / 7;
    return colWidth / 30.44;
  }, [zoomLevel, colWidth]);

  const totalGridWidth = useMemo(() => dates.length * dayWidth, [dates, dayWidth]);

  const headerHeight = useMemo(() => {
    if (zoomLevel === 'day') return 104;
    if (zoomLevel === 'week') return 64;
    return 32;
  }, [zoomLevel]);

  const handleMouseDown = () => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const newWidth = Math.max(180, Math.min(640, e.clientX));
    setLeftPanelWidth(newWidth);
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
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
    };
  }, [datesInfo]);

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

  const handleZoomIn = () => {
    captureZoomFocus();
    if (zoomLevel === 'month') setZoomLevel('week');
    else if (zoomLevel === 'week') {
      setZoomLevel('day');
      setColWidth(30);
    } else {
      setColWidth((prev) => Math.min(prev + 10, 80));
    }
  };

  const handleZoomOut = () => {
    captureZoomFocus();
    if (zoomLevel === 'day') {
      if (colWidth > 30) {
        setColWidth((prev) => Math.max(prev - 10, 30));
      } else {
        setZoomLevel('week');
        setColWidth(100);
      }
    } else if (zoomLevel === 'week') {
      setZoomLevel('month');
      setColWidth(300);
    }
  };

  const toggleProjectPhases = (projectId: string) => {
    const phaseIds = chartRows
      .filter((row): row is Extract<ChartRow, { kind: 'phase' }> => row.kind === 'phase' && row.projectId === projectId)
      .map((row) => row.phaseId);

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

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex justify-between items-center px-4 py-2 bg-slate-800/80 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Project / Phase / Scope Timeline</h2>
        <div className="flex items-center space-x-2">
          <button onClick={handleZoomOut} className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition" title="Zoom Out">
            <ZoomOut size={16} />
          </button>
          <button onClick={handleZoomIn} className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition" title="Zoom In">
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
          className="flex-shrink-0 border-r border-slate-700 bg-slate-800/90 z-40 sticky left-0 shadow-[4px_0_12px_rgba(0,0,0,0.5)]"
        >
          <div
            onMouseDown={handleMouseDown}
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-cyan-500/50 transition-colors z-50"
            title="Drag to resize"
          />
          <div
            style={{ height: headerHeight }}
            className="border-b border-slate-700 flex items-end pb-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900 w-full z-10 sticky top-0 shadow-sm"
          >
            Project / Phase / Scope
          </div>

          <div className="py-0">
            {chartRows.map((row) => {
              if (row.kind === 'project') {
                return (
                  <div
                    key={row.key}
                    style={{ height: row.height }}
                    className="px-4 flex items-center justify-between border-b border-slate-700/50 bg-slate-800"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <button
                        onClick={() => toggleProjectPhases(row.projectId)}
                        className="p-1 rounded text-cyan-400 hover:bg-slate-700/70 hover:text-cyan-300 transition flex-shrink-0"
                        title="Expand or collapse all phases in this project"
                      >
                        {chartRows.some((item) => item.kind === 'phase' && item.projectId === row.projectId && !(item.expanded ?? true)) ? (
                          <ChevronRight size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                      <div className="text-sm font-bold text-slate-100 truncate">{row.label}</div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 flex-shrink-0">{row.taskCount} scopes</div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <button
                        onClick={() => {
                          if (confirm('Delete project?')) deleteProject(row.projectId);
                        }}
                        className="text-slate-400 hover:text-red-400 transition"
                        title="Delete Project"
                      >
                        <UserMinus size={14} />
                      </button>
                    </div>
                  </div>
                );
              }

              if (row.kind === 'phase') {
                return (
                  <button
                    key={row.key}
                    onClick={() => togglePhase(row.phaseId)}
                    style={{ height: row.height }}
                    className="w-full px-4 flex items-center justify-between border-b border-slate-700/40 bg-slate-800/60 hover:bg-slate-700/50 transition text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {row.expanded ? <ChevronDown size={14} className="text-cyan-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-cyan-400 flex-shrink-0" />}
                      <div className="text-xs font-semibold text-slate-200 truncate">{row.label}</div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 flex-shrink-0">{row.taskCount} scopes</div>
                    </div>
                  </button>
                );
              }

              return (
                <div
                  key={row.key}
                  onClick={() => onTaskClick(row.taskId)}
                  style={{ height: row.height }}
                  className={clsx(
                    'px-4 flex items-center justify-between border-b border-slate-700/30 cursor-pointer hover:bg-slate-700/40 transition relative',
                    selectedTaskId === row.taskId && 'bg-slate-700/60'
                  )}
                >
                  {selectedTaskId === row.taskId && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 rounded-r shadow-[0_0_8px_rgba(34,211,238,0.8)]" />}
                  <div className="flex items-center gap-2 min-w-0 pl-6">
                    <span className="text-xs font-medium text-slate-200 truncate">{row.label}</span>
                    <span className="text-[10px] text-slate-500 flex-shrink-0">({row.duration}d)</span>
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

        <div className="flex-1 relative pb-8">
          <div className="inline-flex min-w-full">
            <div className="flex flex-col relative" style={{ width: totalGridWidth }}>
              <div className="flex border-b border-slate-700 h-8 bg-slate-900 text-slate-300 sticky top-0 z-30">
                {monthGroups.map((group, i) => (
                  <div
                    key={i}
                    style={{ width: group.days * dayWidth }}
                    className="flex-shrink-0 border-r border-slate-700/50 flex items-center px-4 text-[10px] font-bold uppercase tracking-[0.2em] overflow-hidden whitespace-nowrap bg-slate-900/60 backdrop-blur-md"
                  >
                    {group.label}
                  </div>
                ))}
              </div>

              {(zoomLevel === 'day' || zoomLevel === 'week') && (
                <div className="flex border-b border-slate-700 h-8 bg-slate-800 text-slate-400 sticky top-8 z-30">
                  {weekGroups.map((group, i) => (
                    <div
                      key={i}
                      style={{ width: group.days * dayWidth }}
                      className="flex-shrink-0 border-r border-slate-700/50 flex items-center px-4 text-[9px] font-bold overflow-hidden whitespace-nowrap backdrop-blur-md"
                    >
                      {dayWidth * 7 > 40 && group.label}
                    </div>
                  ))}
                </div>
              )}

              {zoomLevel === 'day' && (
                <div className="flex border-b border-slate-700 h-10 sticky top-[64px] z-30 shadow-sm backdrop-blur">
                  {dates.map((date, i) => {
                    const isWknd = isWeekend(date);
                    return (
                      <div
                        key={i}
                        style={{ minWidth: colWidth }}
                        className={clsx(
                          'flex-shrink-0 border-r border-slate-700/50 flex flex-col items-center justify-center text-[10px]',
                          isWknd ? 'bg-slate-800/90 text-slate-500' : 'bg-slate-800 border-b border-b-cyan-500/30 text-slate-300'
                        )}
                      >
                        {colWidth > 25 && <span className="opacity-60 truncate font-medium">{format(date, 'eee')}</span>}
                        <span className={clsx(isWknd ? 'text-slate-500' : 'text-white font-bold')}>{format(date, 'd')}</span>
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
                      : zoomLevel === 'week'
                        ? `repeating-linear-gradient(to right, rgba(30, 41, 59, 0.15) 0px, rgba(30, 41, 59, 0.15) ${dayWidth * 7 - 1}px, rgba(51, 65, 85, 0.2) ${dayWidth * 7 - 1}px, rgba(51, 65, 85, 0.2) ${dayWidth * 7}px)`
                        : 'none',
                  backgroundSize: zoomLevel === 'day' ? `${dayWidth}px 100%` : `${dayWidth * 7}px 100%`
                }}
              >
                <div className="absolute inset-0 flex pointer-events-none">
                  {monthGroups.map((group, i) => (
                    <div key={i} style={{ minWidth: group.days * dayWidth, flexShrink: 0 }} className="border-r border-slate-700/30" />
                  ))}
                  {zoomLevel === 'day' &&
                    dates.map((date, i) =>
                      isWeekend(date) ? (
                        <div
                          key={i}
                          style={{ position: 'absolute', left: i * dayWidth, width: dayWidth, height: '100%' }}
                          className="bg-slate-800/10"
                        />
                      ) : null
                    )}
                </div>

                {chartRows.map((row) => {
                  const startDay = getDayOffset(row.start);
                  const endDay = getDayOffset(row.finish);
                  const daySpan = Math.max(endDay - startDay + 1, 1);

                  if (row.kind === 'project') {
                    return (
                      <div key={row.key} style={{ height: row.height }} className="border-b border-slate-700/30 relative flex items-center bg-slate-800/10">
                        <div
                          className="absolute h-6 rounded-md border border-cyan-300/30 bg-gradient-to-r from-cyan-600/90 to-blue-600/90 shadow-[0_6px_18px_rgba(8,145,178,0.25)]"
                          style={{
                            left: `${startDay * dayWidth + 4}px`,
                            width: `${Math.max(daySpan * dayWidth - 8, 10)}px`
                          }}
                        >
                          {daySpan * dayWidth > 90 && (
                            <span className="h-full px-3 flex items-center text-[11px] font-bold text-white tracking-wide">
                              {row.label}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (row.kind === 'phase') {
                    return (
                      <div key={row.key} style={{ height: row.height }} className="border-b border-slate-700/20 relative flex items-center bg-slate-800/5">
                        <div
                          className="absolute h-4 rounded border border-amber-300/30 bg-gradient-to-r from-amber-500/70 to-orange-500/70 shadow-[0_4px_12px_rgba(245,158,11,0.2)]"
                          style={{
                            left: `${startDay * dayWidth + 6}px`,
                            width: `${Math.max(daySpan * dayWidth - 12, 8)}px`
                          }}
                        >
                          {daySpan * dayWidth > 120 && (
                            <span className="h-full px-2 flex items-center text-[10px] font-semibold text-white/90 uppercase tracking-[0.15em]">
                              {row.label}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  const isDelayed = row.delayDays > 0;
                  const customColor = row.subcontractor ? vendorColors[row.subcontractor] : null;

                  return (
                    <div key={row.key} style={{ height: row.height }} className="border-b border-slate-700/20 relative flex items-center group">
                      {isDelayed && (
                        <div
                          className="absolute h-[10px] rounded-sm bg-slate-600/30 border border-slate-500 border-dashed z-0"
                          style={{
                            left: `${getDayOffset(tasks.find((task) => task.id === row.taskId)?.logic_start || row.start) * dayWidth + 4}px`,
                            width: `${Math.max((getDayOffset(row.start) - getDayOffset(tasks.find((task) => task.id === row.taskId)?.logic_start || row.start)) * dayWidth, 0)}px`
                          }}
                        />
                      )}

                      <div
                        onClick={() => onTaskClick(row.taskId)}
                        className={clsx(
                          'absolute h-5 rounded shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer flex items-center px-1.5 z-10 box-border hover:brightness-110',
                          !customColor && isDelayed && 'bg-red-500/90 border border-red-400 shadow-[0_4px_12px_rgba(239,68,68,0.4)]',
                          !customColor && !isDelayed && 'bg-gradient-to-r from-cyan-600 to-blue-600 border border-cyan-400/50 shadow-[0_4px_12px_rgba(8,145,178,0.3)]',
                          customColor && 'shadow-md border border-black/20',
                          customColor && isDelayed && 'border-2 border-red-500 ring-2 ring-red-500/60 ring-offset-1 ring-offset-slate-900',
                          row.lag < 0 && 'border-2 border-orange-500 ring-2 ring-orange-400/50 shadow-[0_0_10px_rgba(249,115,22,0.6)]',
                          selectedTaskId === row.taskId && 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-105'
                        )}
                        style={{
                          left: `${startDay * dayWidth + 4}px`,
                          width: `${Math.max(daySpan * dayWidth - 8, 8)}px`,
                          ...(customColor ? { backgroundColor: customColor } : {})
                        }}
                      >
                        {dayWidth * daySpan > 36 && (
                          <span className={clsx('text-[10px] font-bold text-white drop-shadow-md truncate px-1 rounded', row.lag < 0 && 'bg-orange-600/50')}>
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
    </div>
  );
}
