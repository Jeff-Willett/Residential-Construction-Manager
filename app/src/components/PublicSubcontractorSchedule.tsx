import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  differenceInCalendarDays,
  eachMonthOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfDay,
  startOfWeek
} from 'date-fns';
import { AlertTriangle, CalendarDays, Clock, FolderKanban, Printer, RefreshCcw, UserRound, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateScheduleEngine, type EngineTask, type Project } from '../utils/schedulingEngine';
import { normalizeSubcontractorName } from '../utils/subcontractors';

type PublicTaskRow = {
  id: string;
  project_id: string;
  project_phase_id: string | null;
  template_id: string | null;
  name: string;
  phase_name: string | null;
  phase_order: number | null;
  task_order: number | null;
  subcontractor: string | null;
  bottleneck_vendor: string | null;
  duration: number | null;
  lag: number | null;
  manual_start: string | null;
  manual_finish: string | null;
};

type PublicDependencyRow = {
  id: string;
  predecessor_id: string;
  successor_id: string;
  follow_predecessor_changes: boolean | null;
};

type ScheduleItem = EngineTask & {
  projectName: string;
};

type ProjectGroup = {
  projectId: string;
  projectName: string;
  start: string;
  finish: string;
  items: ScheduleItem[];
};

type ViewMode = 'standard' | 'compact' | 'calendar';

type CalendarMonth = {
  key: string;
  label: string;
  days: CalendarDay[];
};

type CalendarDay = {
  key: string;
  date: Date;
  inMonth: boolean;
  items: ScheduleItem[];
};

const formatDisplayDate = (value: string | null | undefined) => {
  if (!value) return 'Unscheduled';

  try {
    return format(parseISO(value), 'MMM d, yyyy');
  } catch {
    return value;
  }
};

const formatCompactDate = (value: string | null | undefined) => {
  if (!value) return 'TBD';

  try {
    return format(parseISO(value), 'MMM d');
  } catch {
    return value;
  }
};

const compareDateStrings = (left: string | undefined, right: string | undefined) => {
  const leftTime = left ? parseISO(left).getTime() : Number.MAX_SAFE_INTEGER;
  const rightTime = right ? parseISO(right).getTime() : Number.MAX_SAFE_INTEGER;
  return leftTime - rightTime;
};

const readInitialSubcontractor = () => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('sub') ?? '';
};

const readInitialViewMode = (): ViewMode => {
  if (typeof window === 'undefined') return 'standard';

  const view = new URLSearchParams(window.location.search).get('view');
  return view === 'compact' || view === 'calendar' ? view : 'standard';
};

const buildCalendarDays = (month: Date, items: ScheduleItem[]) => {
  const firstDay = startOfWeek(startOfMonth(month));
  const lastDay = endOfWeek(endOfMonth(month));
  const days = [];

  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    days.push({
      key: format(day, 'yyyy-MM-dd'),
      date: day,
      inMonth: day.getMonth() === month.getMonth(),
      items: items.filter((item) => {
        if (!item.calculated_start || !item.calculated_finish) return false;

        return isWithinInterval(day, {
          start: parseISO(item.calculated_start),
          end: parseISO(item.calculated_finish)
        });
      })
    });
  }

  return days;
};

const isBeforeToday = (value: string | null | undefined, today: Date) => {
  if (!value) return false;
  return startOfDay(parseISO(value)).getTime() < today.getTime();
};

const isTodayOrLater = (value: string | null | undefined, today: Date) => {
  if (!value) return false;
  return startOfDay(parseISO(value)).getTime() >= today.getTime();
};

const findTodayBoundaryTaskId = (items: ScheduleItem[], today: Date) =>
  items.find((item) => {
    if (!item.calculated_start || !item.calculated_finish) return false;

    return (
      isTodayOrLater(item.calculated_finish, today) ||
      isWithinInterval(today, {
        start: parseISO(item.calculated_start),
        end: parseISO(item.calculated_finish)
      })
    );
  })?.id ?? null;

const shouldShowTodayAfterItems = (items: ScheduleItem[], today: Date) =>
  items.length > 0 && items.every((item) => isBeforeToday(item.calculated_finish, today));

const isProjectInFuture = (group: ProjectGroup, today: Date) => {
  if (!group.start) return false;
  return startOfDay(parseISO(group.start)).getTime() > today.getTime();
};

export function PublicSubcontractorSchedule() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<EngineTask[]>([]);
  const [selectedSubcontractor, setSelectedSubcontractor] = useState(readInitialSubcontractor);
  const [viewMode, setViewMode] = useState<ViewMode>(readInitialViewMode);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<CalendarDay | null>(null);
  const [calendarPopupOrigin, setCalendarPopupOrigin] = useState({ x: 50, y: 50 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => startOfDay(new Date()), []);

  const loadSchedule = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [
        { data: projectsData, error: projectsError },
        { data: tasksData, error: tasksError },
        { data: dependenciesData, error: dependenciesError }
      ] = await Promise.all([
        supabase.from('projects').select('id,name,start_date').order('start_date', { ascending: true }),
        supabase
          .from('tasks')
          .select(
            'id,project_id,project_phase_id,template_id,name,phase_name,phase_order,task_order,subcontractor,bottleneck_vendor,duration,lag,manual_start,manual_finish'
          ),
        supabase.from('dependencies').select('id,predecessor_id,successor_id,follow_predecessor_changes')
      ]);

      if (projectsError) throw projectsError;
      if (tasksError) throw tasksError;
      if (dependenciesError) throw dependenciesError;

      const nextProjects = (projectsData ?? []) as Project[];
      const nextTasks = ((tasksData ?? []) as PublicTaskRow[]).map((task) => ({
        id: task.id,
        project_id: task.project_id,
        project_phase_id: task.project_phase_id,
        template_id: task.template_id,
        name: task.name,
        phase_name: task.phase_name,
        phase_order: task.phase_order ?? 0,
        task_order: task.task_order ?? 0,
        subcontractor: task.subcontractor,
        bottleneck_vendor: task.bottleneck_vendor,
        duration: task.duration ?? 1,
        lag: task.lag ?? 0,
        manual_start: task.manual_start,
        manual_finish: task.manual_finish
      }));
      const nextDependencies = ((dependenciesData ?? []) as PublicDependencyRow[]).map((dependency) => ({
        id: dependency.id,
        predecessor_id: dependency.predecessor_id,
        successor_id: dependency.successor_id,
        follow_predecessor_changes: dependency.follow_predecessor_changes ?? true
      }));

      setProjects(nextProjects);
      setTasks(calculateScheduleEngine(nextProjects, nextTasks, nextDependencies));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load schedule.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSchedule();
  }, []);

  const subcontractors = useMemo(() => {
    const names = new Set<string>();
    tasks.forEach((task) => {
      const normalized = normalizeSubcontractorName(task.subcontractor);
      if (normalized) names.add(normalized);
    });
    return Array.from(names).sort((left, right) => left.localeCompare(right));
  }, [tasks]);

  useEffect(() => {
    if (isLoading || subcontractors.length === 0) return;
    if (selectedSubcontractor && subcontractors.includes(selectedSubcontractor)) return;
    setSelectedSubcontractor(subcontractors[0]);
  }, [isLoading, selectedSubcontractor, subcontractors]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (selectedSubcontractor) {
      params.set('sub', selectedSubcontractor);
    } else {
      params.delete('sub');
    }

    if (viewMode === 'standard') {
      params.delete('view');
    } else {
      params.set('view', viewMode);
    }

    const nextSearch = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`);
  }, [selectedSubcontractor, viewMode]);

  useEffect(() => {
    setSelectedCalendarDay(null);
  }, [selectedSubcontractor, viewMode]);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  const scheduleItems = useMemo<ScheduleItem[]>(() => {
    return tasks
      .filter((task) => task.subcontractor === selectedSubcontractor)
      .map((task) => ({
        ...task,
        projectName: projectById.get(task.project_id)?.name ?? 'Unknown project'
      }))
      .sort((left, right) => {
        const startDelta = compareDateStrings(left.calculated_start, right.calculated_start);
        if (startDelta !== 0) return startDelta;
        return left.projectName.localeCompare(right.projectName) || left.name.localeCompare(right.name);
      });
  }, [projectById, selectedSubcontractor, tasks]);

  const projectGroups = useMemo<ProjectGroup[]>(() => {
    const groups = new Map<string, ProjectGroup>();

    scheduleItems.forEach((item) => {
      const current = groups.get(item.project_id) ?? {
        projectId: item.project_id,
        projectName: item.projectName,
        start: item.calculated_start ?? '',
        finish: item.calculated_finish ?? '',
        items: []
      };

      current.items.push(item);
      if (!current.start || compareDateStrings(item.calculated_start, current.start) < 0) {
        current.start = item.calculated_start ?? current.start;
      }
      if (!current.finish || compareDateStrings(item.calculated_finish, current.finish) > 0) {
        current.finish = item.calculated_finish ?? current.finish;
      }
      groups.set(item.project_id, current);
    });

    return Array.from(groups.values()).sort((left, right) => compareDateStrings(left.start, right.start));
  }, [scheduleItems]);

  const calendarMonths = useMemo<CalendarMonth[]>(() => {
    const scheduledItems = scheduleItems.filter((item) => item.calculated_start && item.calculated_finish);
    if (scheduledItems.length === 0) return [];

    const firstStart = scheduledItems[0].calculated_start!;
    const lastFinish = scheduledItems.reduce((latest, item) => {
      if (!item.calculated_finish) return latest;
      return compareDateStrings(item.calculated_finish, latest) > 0 ? item.calculated_finish : latest;
    }, scheduledItems[0].calculated_finish!);

    return eachMonthOfInterval({
      start: startOfMonth(parseISO(firstStart)),
      end: startOfMonth(parseISO(lastFinish))
    }).map((month) => ({
      key: format(month, 'yyyy-MM'),
      label: format(month, 'MMMM yyyy'),
      days: buildCalendarDays(month, scheduledItems)
    }));
  }, [scheduleItems]);

  const todayBoundaryTaskId = useMemo(() => findTodayBoundaryTaskId(scheduleItems, today), [scheduleItems, today]);
  const todayBoundaryProjectId = useMemo(
    () => projectGroups.find((group) => !isBeforeToday(group.finish, today))?.projectId ?? null,
    [projectGroups, today]
  );
  const showTodayAfterSchedule = useMemo(() => shouldShowTodayAfterItems(scheduleItems, today), [scheduleItems, today]);

  const renderTodayDivider = (key: string) => (
    <div key={key} className="relative flex items-center gap-2 bg-red-500/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-red-300">
      <div className="h-px flex-1 bg-red-500/70" />
      <span className="rounded-full border border-red-500/60 bg-red-500/15 px-2 py-0.5">
        Today: {format(today, 'EEEE MM/dd/yyyy')}
      </span>
      <div className="h-px flex-1 bg-red-500/70" />
    </div>
  );

  const openCalendarDay = (day: CalendarDay, event: React.MouseEvent<HTMLButtonElement>) => {
    const { innerWidth, innerHeight } = window;
    setCalendarPopupOrigin({
      x: Math.round((event.clientX / Math.max(innerWidth, 1)) * 100),
      y: Math.round((event.clientY / Math.max(innerHeight, 1)) * 100)
    });
    setSelectedCalendarDay(day);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 print:bg-white print:text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 px-3 py-2.5 backdrop-blur print:static print:border-slate-300 print:bg-white sm:px-4 sm:py-3">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300 print:text-slate-600 sm:gap-2 sm:text-xs sm:tracking-[0.16em]">
              <CalendarDays size={14} className="sm:h-4 sm:w-4" />
              Subcontractor Schedule
            </div>
            <h1 className="mt-0.5 truncate text-[22px] font-semibold leading-tight text-white print:text-slate-950 sm:mt-1 sm:text-2xl">
              Residential Construction
            </h1>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5 print:hidden sm:gap-2">
            <button
              type="button"
              onClick={loadSchedule}
              disabled={isLoading}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10"
              title="Refresh schedule"
            >
              <RefreshCcw size={17} />
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-200 transition hover:bg-slate-800 sm:h-10 sm:w-10"
              title="Print schedule"
            >
              <Printer size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-6">
        <section className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 shadow-xl print:border-slate-300 print:bg-white print:shadow-none sm:grid-cols-[1fr_220px] sm:p-4">
          <label className="flex flex-col gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-400 print:text-slate-700 sm:text-sm sm:normal-case sm:tracking-normal">
              <UserRound size={15} />
              Subcontractor
            </span>
            <select
              value={selectedSubcontractor}
              onChange={(event) => setSelectedSubcontractor(event.target.value)}
              disabled={isLoading || subcontractors.length === 0}
              className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-base font-medium text-white outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 print:border-slate-300 print:bg-white print:text-slate-950 sm:h-12"
            >
              {subcontractors.length === 0 ? (
                <option value="">No subcontractors found</option>
              ) : (
                subcontractors.map((subcontractor) => (
                  <option key={subcontractor} value={subcontractor}>
                    {subcontractor}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="flex flex-col gap-2 print:hidden">
            <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-400 sm:text-sm sm:normal-case sm:tracking-normal">
              <CalendarDays size={15} />
              View
            </span>
            <select
              value={viewMode}
              onChange={(event) => setViewMode(event.target.value as ViewMode)}
              className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-base font-medium text-white outline-none transition focus:border-cyan-400 sm:h-12"
            >
              <option value="standard">Standard</option>
              <option value="compact">Compact</option>
              <option value="calendar">Calendar</option>
            </select>
          </label>
        </section>

        {isLoading ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-300 sm:p-8">
            Loading schedule...
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-100 print:border-red-300 print:bg-white print:text-red-800">
            <AlertTriangle className="mt-0.5 flex-shrink-0" size={18} />
            <div>
              <div className="font-semibold">Unable to load the subcontractor schedule.</div>
              <div className="mt-1 text-sm opacity-90">{error}</div>
            </div>
          </div>
        ) : scheduleItems.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-6 text-center text-slate-300 print:border-slate-300 print:bg-white print:text-slate-700 sm:p-8">
            No scheduled work found for this subcontractor.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 print:hidden sm:grid-cols-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Tasks</div>
                <div className="mt-1 text-2xl font-semibold text-white">{scheduleItems.length}</div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Projects</div>
                <div className="mt-1 text-2xl font-semibold text-white">{projectGroups.length}</div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 sm:col-span-2">
                <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Date Range</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {formatDisplayDate(scheduleItems[0]?.calculated_start)} - {formatDisplayDate(scheduleItems.at(-1)?.calculated_finish)}
                </div>
              </div>
            </div>

            {viewMode === 'standard' &&
              projectGroups.map((group) => {
                const showTodayBeforeProject = group.projectId === todayBoundaryProjectId && isProjectInFuture(group, today);
                const showTodayInsideProject = group.projectId === todayBoundaryProjectId && !showTodayBeforeProject;
                const todayBoundaryGroupTaskId = showTodayInsideProject ? findTodayBoundaryTaskId(group.items, today) : null;

                return (
                  <Fragment key={group.projectId}>
                    {showTodayBeforeProject && renderTodayDivider('standard-today-before-project')}
                    <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70 print:border-slate-300 print:bg-white">
                  <div className="border-b border-slate-800 bg-slate-900 px-3 py-2.5 print:border-slate-300 print:bg-slate-100 sm:px-4 sm:py-3">
                    <h2 className="text-lg font-semibold leading-tight text-white print:text-slate-950">{group.projectName}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-400 print:text-slate-700 sm:text-sm">
                      <span>{group.items.length} scheduled tasks</span>
                      <span>{formatDisplayDate(group.start)} - {formatDisplayDate(group.finish)}</span>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-800 print:divide-slate-200">
                    {group.items.map((item) => (
                      <Fragment key={item.id}>
                        {item.id === todayBoundaryGroupTaskId && renderTodayDivider('standard-today-inside-project')}
                        <article className="p-3 sm:p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-[17px] font-semibold leading-snug text-white print:text-slate-950 sm:text-base">{item.name}</h3>
                              {item.phase_name && <p className="mt-0.5 text-sm leading-snug text-slate-400 print:text-slate-700">{item.phase_name}</p>}
                            </div>
                            <div className="inline-flex flex-shrink-0 items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-300 print:border-slate-300 print:bg-white print:text-slate-700">
                              <Clock size={13} />
                              {item.duration} day{item.duration === 1 ? '' : 's'}
                            </div>
                          </div>

                          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Start</div>
                              <div className="mt-0.5 font-medium leading-tight text-slate-100 print:text-slate-950">{formatDisplayDate(item.calculated_start)}</div>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">Finish</div>
                              <div className="mt-0.5 font-medium leading-tight text-slate-100 print:text-slate-950">{formatDisplayDate(item.calculated_finish)}</div>
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                              <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Project</div>
                              <div className="mt-0.5 font-medium leading-tight text-slate-100 print:text-slate-950">{item.projectName}</div>
                            </div>
                          </div>
                        </article>
                      </Fragment>
                    ))}
                  </div>
                    </section>
                  </Fragment>
                );
              })}
            {viewMode === 'standard' && showTodayAfterSchedule && renderTodayDivider('standard-today-after')}

            {viewMode === 'compact' && (
              <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70">
                <div className="grid grid-cols-[1.35fr_0.9fr_0.9fr_0.55fr] gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span>Project / Task</span>
                  <span>Start</span>
                  <span>Finish</span>
                  <span className="text-right">Days</span>
                </div>
                <div className="divide-y divide-slate-800">
                  {scheduleItems.map((item) => {
                    const spanDays =
                      item.calculated_start && item.calculated_finish
                        ? differenceInCalendarDays(parseISO(item.calculated_finish), parseISO(item.calculated_start)) + 1
                        : item.duration;

                    return (
                      <Fragment key={item.id}>
                        {item.id === todayBoundaryTaskId && renderTodayDivider('compact-today')}
                        <article className="grid grid-cols-[1.35fr_0.9fr_0.9fr_0.55fr] gap-2 px-3 py-2.5 text-sm">
                          <div className="min-w-0">
                            <div className="truncate font-semibold leading-tight text-white">{item.projectName}</div>
                            <div className="mt-0.5 truncate text-slate-300">{item.name}</div>
                            {item.phase_name && <div className="mt-0.5 truncate text-xs text-slate-500">{item.phase_name}</div>}
                          </div>
                          <div className="font-medium leading-tight text-slate-100">{formatCompactDate(item.calculated_start)}</div>
                          <div className="font-medium leading-tight text-slate-100">{formatCompactDate(item.calculated_finish)}</div>
                          <div className="text-right font-medium leading-tight text-slate-300">{spanDays}</div>
                        </article>
                      </Fragment>
                    );
                  })}
                  {showTodayAfterSchedule && renderTodayDivider('compact-today-after')}
                </div>
              </section>
            )}

            {viewMode === 'calendar' && (
              <div className="grid gap-4 lg:grid-cols-2">
                {calendarMonths.map((month) => (
                  <section key={month.key} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70">
                    <div className="border-b border-slate-800 bg-slate-900 px-3 py-2.5">
                      <h2 className="text-base font-semibold text-white">{month.label}</h2>
                    </div>
                    <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/50 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                        <div key={day} className="py-1.5">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      {month.days.map((day) => (
                        <button
                          type="button"
                          key={day.key}
                          onClick={(event) => openCalendarDay(day, event)}
                          className={[
                            'min-h-[70px] border-b border-r border-slate-800 p-1.5 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-inset',
                            day.items.length > 0 ? 'cursor-pointer hover:bg-slate-800/80' : 'cursor-pointer hover:bg-slate-900/70',
                            day.inMonth ? 'bg-slate-950/20' : 'bg-slate-950/60 text-slate-700'
                          ].join(' ')}
                        >
                          <div
                            className={[
                              'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium',
                              isSameDay(day.date, today)
                                ? 'border border-red-400 bg-red-500/20 text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.35)]'
                                : 'text-slate-400'
                            ].join(' ')}
                          >
                            {format(day.date, 'd')}
                          </div>
                          <div className="mt-1 flex flex-col gap-1">
                            {day.items.slice(0, 2).map((item) => (
                              <div key={item.id} className="truncate rounded bg-cyan-500/20 px-1 py-0.5 text-[10px] font-medium leading-tight text-cyan-100">
                                {item.projectName}
                              </div>
                            ))}
                            {day.items.length > 2 && <div className="text-[10px] font-medium text-cyan-300">+{day.items.length - 2} more</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="px-4 pb-6 text-center text-xs text-slate-500 print:hidden">
        Read-only schedule view. Contact the project manager for schedule changes.
      </footer>

      {selectedCalendarDay && (
        <div className="calendar-day-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-[3px] print:hidden">
          <button
            type="button"
            aria-label="Close day details"
            className="absolute inset-0 cursor-default"
            onClick={() => setSelectedCalendarDay(null)}
          />
          <button
            type="button"
            onClick={() => setSelectedCalendarDay(null)}
            className="calendar-day-dialog relative max-h-[82vh] w-full max-w-md overflow-hidden rounded-xl border border-cyan-400/30 bg-slate-900 text-left shadow-[0_28px_90px_rgba(0,0,0,0.65),0_0_38px_rgba(34,211,238,0.12)] ring-1 ring-white/5"
            style={{ transformOrigin: `${calendarPopupOrigin.x}% ${calendarPopupOrigin.y}%` }}
          >
            <div className="border-b border-slate-700/80 bg-slate-950/70 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">
                    <CalendarDays size={14} />
                    {format(selectedCalendarDay.date, 'EEEE')}
                  </div>
                  <h2 className="mt-1 text-xl font-semibold leading-tight text-white">{format(selectedCalendarDay.date, 'MMMM d, yyyy')}</h2>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-300">
                  <X size={16} />
                </div>
              </div>
            </div>

            <div className="max-h-[62vh] overflow-y-auto p-4">
              {selectedCalendarDay.items.length === 0 ? (
                <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
                  No scheduled work for this subcontractor.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-100">
                    {selectedCalendarDay.items.length} scheduled item{selectedCalendarDay.items.length === 1 ? '' : 's'} on this day
                  </div>
                  {selectedCalendarDay.items.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 shadow-inner">
                      <div className="flex items-center gap-2 text-base font-semibold text-white">
                        <FolderKanban size={16} className="text-cyan-300" />
                        {item.projectName}
                      </div>
                      <div className="mt-3 grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 text-sm">
                        <div className="text-slate-500">Phase</div>
                        <div className="font-medium text-slate-200">{item.phase_name ?? 'Unphased'}</div>
                        <div className="text-slate-500">Scope</div>
                        <div className="font-medium text-slate-200">{item.name}</div>
                        <div className="text-slate-500">Dates</div>
                        <div className="font-medium text-slate-200">
                          {formatCompactDate(item.calculated_start)} - {formatCompactDate(item.calculated_finish)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
