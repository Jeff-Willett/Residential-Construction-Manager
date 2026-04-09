import { addDays, isWeekend, format, parseISO } from 'date-fns';

/**
 * Maps a project day integer (e.g., Day 1, Day 10) to an actual calendar date, 
 * skipping weekends (Saturdays and Sundays).
 */
export function getCalendarDateFromProjectDay(projectStartDate: string, projectDay: number): string {
  let currentDate = parseISO(projectStartDate);
  let daysAdded = 1; // Project day 1 is the start date (if it's a weekday)
  
  // Quick check if start date itself is weekend, push it to monday
  while (isWeekend(currentDate)) {
    currentDate = addDays(currentDate, 1);
  }

  while (daysAdded < projectDay) {
    currentDate = addDays(currentDate, 1);
    if (!isWeekend(currentDate)) {
      daysAdded++;
    }
  }
  return format(currentDate, 'yyyy-MM-dd');
}

export interface Task {
  id: string;
  name: string;
  subcontractor: string;
  duration: number; // in working days
  es: number; // Earliest Start (project day)
  ef: number;
  ls: number;
  lf: number; // Latest Finish (project day)
  float: number;
  isCritical: boolean;
}

export interface Dependency {
  id: string;
  predecessorId: string;
  successorId: string;
}

/**
 * Calculates CPM metrics for all tasks based on dependencies.
 * Returns an updated array of tasks with es, ef, ls, lf, float, and isCritical calculated.
 */
export function calculateCPM(tasks: Task[], dependencies: Dependency[]): Task[] {
  // Reset all tasks
  const updatedTasks = tasks.map(t => ({
    ...t,
    es: 0,
    ef: 0,
    ls: 0,
    lf: 0,
    float: 0,
    isCritical: false
  }));

  const taskMap = new Map<string, Task>();
  updatedTasks.forEach(t => taskMap.set(t.id, t));

  // Build adjacency list
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  
  dependencies.forEach(dep => {
    if (!successors.has(dep.predecessorId)) successors.set(dep.predecessorId, []);
    if (!predecessors.has(dep.successorId)) predecessors.set(dep.successorId, []);
    
    successors.get(dep.predecessorId)!.push(dep.successorId);
    predecessors.get(dep.successorId)!.push(dep.predecessorId);
  });

  // Topological Sort (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  updatedTasks.forEach(t => inDegree.set(t.id, 0));
  
  dependencies.forEach(dep => {
    inDegree.set(dep.successorId, (inDegree.get(dep.successorId) || 0) + 1);
  });

  const queue: string[] = [];
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id);
  });

  const sortedIds: string[] = [];
  while (queue.length > 0) {
    const currId = queue.shift()!;
    sortedIds.push(currId);
    
    const succs = successors.get(currId) || [];
    for (const succ of succs) {
      inDegree.set(succ, (inDegree.get(succ)! - 1));
      if (inDegree.get(succ) === 0) {
        queue.push(succ);
      }
    }
  }

  // Forward Pass (Calculate ES, EF)
  sortedIds.forEach(id => {
    const task = taskMap.get(id)!;
    const preds = predecessors.get(id) || [];
    
    if (preds.length === 0) {
      task.es = 1;
    } else {
      let maxEF = 0;
      for (const pId of preds) {
        const pTask = taskMap.get(pId)!;
        if (pTask.ef > maxEF) maxEF = pTask.ef;
      }
      task.es = maxEF + 1;
    }
    
    // Formula: EF = ES + Duration - 1
    task.ef = task.es + task.duration - 1;
  });

  // Backward Pass (Calculate LF, LS)
  let projectDuration = 0;
  updatedTasks.forEach(t => {
    if (t.ef > projectDuration) projectDuration = t.ef;
  });

  const reversedIds = [...sortedIds].reverse();
  reversedIds.forEach(id => {
    const task = taskMap.get(id)!;
    const succs = successors.get(id) || [];
    
    if (succs.length === 0) {
      task.lf = projectDuration;
    } else {
      let minLS = Infinity;
      for (const sId of succs) {
        const sTask = taskMap.get(sId)!;
        if (sTask.ls < minLS) minLS = sTask.ls;
      }
      task.lf = minLS - 1;
    }
    
    // Formula: LS = LF - Duration + 1
    task.ls = task.lf - task.duration + 1;
    
    // Formula: Float = LS - ES
    task.float = task.ls - task.es;
    task.isCritical = task.float === 0;
  });

  return Array.from(taskMap.values());
}
