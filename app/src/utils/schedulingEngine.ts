import { addDays, isWeekend, format, parseISO } from 'date-fns';

export function addWorkingDays(startDateStr: string, daysToAdd: number): string {
  try {
    if (!startDateStr || startDateStr.length < 8) return format(new Date(), 'yyyy-MM-dd');
    let currentDate = parseISO(startDateStr);
    
    if (currentDate.getFullYear() < 2000) currentDate.setFullYear(2026);
    
    // Support zero lag (start on the same day as base)
    if (daysToAdd === 0) return format(currentDate, 'yyyy-MM-dd');

    const isForward = daysToAdd > 0;
    let daysAdded = 0;
    const absDays = Math.abs(daysToAdd);

    // If forward, we stay on this day if it's a workday, otherwise jump to next workday
    while (isWeekend(currentDate)) {
      currentDate = addDays(currentDate, isForward ? 1 : -1);
    }

    // A 1-day task finishes on its start day (so we jump 0 times for duration=1)
    // For lag/offsets, we jump the actual number of working days
    while (daysAdded < absDays) {
      currentDate = addDays(currentDate, isForward ? 1 : -1);
      if (!isWeekend(currentDate)) {
        daysAdded++;
      }
    }
    return format(currentDate, 'yyyy-MM-dd');
  } catch (e) {
    console.error('addWorkingDays error:', e);
    return format(new Date(), 'yyyy-MM-dd');
  }
}

export function differenceInWorkingDays(startDateStr: string, endDateStr: string): number {
    let current = parseISO(startDateStr);
    const end = parseISO(endDateStr);
    if (end < current) return 0;

    let count = 0;
    while (current <= end) {
      if (!isWeekend(current)) {
        count++;
      }
      current = addDays(current, 1);
    }
    return count;
}

export function getFinishDateFromDuration(startDateStr: string, duration: number): string {
  return addWorkingDays(startDateStr, Math.max(duration - 1, 0));
}

export interface Project {
  id: string;
  name: string;
  start_date: string;
}

export interface EngineTask {
  id: string;
  project_id: string;
  project_phase_id: string | null;
  template_id: string | null;
  name: string;
  phase_name: string | null;
  phase_order: number;
  task_order: number;
  subcontractor: string | null;
  bottleneck_vendor: string | null;
  duration: number; // working days
  lag: number;

  // Manual date overrides
  manual_start?: string | null;
  manual_finish?: string | null;

  // Calculated fields
  logic_start?: string; // When dependencies are met
  calculated_start?: string; // logic_start + resource wait if any
  calculated_finish?: string; // inclusive finish date for the occupied work span
  delay_days?: number; // difference in days between logic and calculated
  delay_cause_task_id?: string; // Which conflicting task is holding up this vendor
}

export interface EngineDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
}

export function calculateScheduleEngine(
  projects: Project[], 
  tasks: EngineTask[], 
  dependencies: EngineDependency[]
): EngineTask[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  
  // Track vendor busy dates globally across all projects
  // Map of vendorName -> state
  const vendorOccupancy = new Map<string, { lastBusy: string, taskId: string }>();

  const taskMap = new Map<string, EngineTask>();
  tasks.forEach((task) =>
    taskMap.set(task.id, {
      id: task.id,
      project_id: task.project_id,
      project_phase_id: task.project_phase_id,
      template_id: task.template_id,
      name: task.name,
      phase_name: task.phase_name,
      phase_order: task.phase_order,
      task_order: task.task_order,
      subcontractor: task.subcontractor,
      bottleneck_vendor: task.bottleneck_vendor,
      duration: task.duration,
      lag: task.lag,
      manual_start: task.manual_start ?? null,
      manual_finish: task.manual_finish ?? null,
    })
  );
  
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  
  dependencies.forEach(dep => {
    if (!successors.has(dep.predecessor_id)) successors.set(dep.predecessor_id, []);
    if (!predecessors.has(dep.successor_id)) predecessors.set(dep.successor_id, []);
    
    successors.get(dep.predecessor_id)!.push(dep.successor_id);
    predecessors.get(dep.successor_id)!.push(dep.predecessor_id);
  });

  const inDegree = new Map<string, number>();
  tasks.forEach(t => inDegree.set(t.id, 0));
  
  dependencies.forEach(dep => {
    inDegree.set(dep.successor_id, (inDegree.get(dep.successor_id) || 0) + 1);
  });

  const readyTasks: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) {
      const t = taskMap.get(id)!;
      const proj = projectById.get(t.project_id);
      
      const baseStart = proj ? proj.start_date : format(new Date(), 'yyyy-MM-dd');
      t.logic_start = addWorkingDays(baseStart, t.lag || 0);
      readyTasks.push(id);
    }
  });

  const sortedIds: string[] = [];

  while (readyTasks.length > 0) {
    // Priority: Earliest logic_start. Tiebreaker: Earliest project start_date
    readyTasks.sort((a,b) => {
        const ta = taskMap.get(a)!;
        const tb = taskMap.get(b)!;
        const timeA = parseISO(ta.logic_start!).getTime();
        const timeB = parseISO(tb.logic_start!).getTime();
        if (timeA !== timeB) return timeA - timeB;
        
        const pa = projectById.get(ta.project_id);
        const pb = projectById.get(tb.project_id);
        const pTimeA = pa ? parseISO(pa.start_date).getTime() : 0;
        const pTimeB = pb ? parseISO(pb.start_date).getTime() : 0;
        return pTimeA - pTimeB;
    });

    const currId = readyTasks.shift()!;
    sortedIds.push(currId);
    const task = taskMap.get(currId)!;
    
    let actualStart = task.logic_start!;

    // If manual_start is set, use it as the actual start date
    if (task.manual_start) {
        actualStart = task.manual_start;
    } else if (task.bottleneck_vendor) {
        const vendorState = vendorOccupancy.get(task.bottleneck_vendor);
        if (vendorState) {
             const vendorAvailableDate = addWorkingDays(vendorState.lastBusy, 1); // next working day after last busy
             if (parseISO(vendorAvailableDate) > parseISO(actualStart)) {
                 actualStart = vendorAvailableDate;
                 task.delay_cause_task_id = vendorState.taskId;
             }
        }
    }

    task.calculated_start = actualStart;

    // If manual_finish is set, use it; otherwise calculate from duration
    if (task.manual_finish) {
        task.calculated_finish = task.manual_finish;
    } else {
        task.calculated_finish = getFinishDateFromDuration(actualStart, task.duration);
    }
    
    if (task.bottleneck_vendor) {
        vendorOccupancy.set(task.bottleneck_vendor, { lastBusy: task.calculated_finish, taskId: task.id });
    }
    
    if (task.calculated_start === task.logic_start) {
      task.delay_days = 0;
    } else {
      task.delay_days = differenceInWorkingDays(task.logic_start!, task.calculated_start) - 1; 
    }

    const succs = successors.get(currId) || [];
    for (const succ of succs) {
      inDegree.set(succ, (inDegree.get(succ)! - 1));
      if (inDegree.get(succ) === 0) {
          const sTask = taskMap.get(succ)!;
          const sPreds = predecessors.get(succ) || [];
          
          let maxFinish = '1970-01-01';
          for (const p of sPreds) {
             const preTask = taskMap.get(p)!;
             if (parseISO(preTask.calculated_finish!) > parseISO(maxFinish)) {
                 maxFinish = preTask.calculated_finish!;
             }
          }
          sTask.logic_start = addWorkingDays(maxFinish, 1 + (sTask.lag || 0)); 
          readyTasks.push(succ);
      }
    }
  }

  return Array.from(taskMap.values());
}
