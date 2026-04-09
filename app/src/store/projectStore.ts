import { create } from 'zustand';
import { calculateCPM } from '../utils/cpm';
import type { Task, Dependency } from '../utils/cpm';

interface ProjectState {
  projectStartDate: string;
  tasks: Task[];
  dependencies: Dependency[];
  
  setProjectStartDate: (date: string) => void;
  updateTaskDetails: (taskId: string, updates: Partial<Task>) => void;
  setDependenciesForTask: (taskId: string, predecessorIds: string[]) => void;
  addTask: (task: Omit<Task, 'es' | 'ef' | 'ls' | 'lf' | 'float' | 'isCritical' | 'id'>) => void;
  deleteTask: (taskId: string) => void;
}

const initialTasks: Task[] = [
  { id: '1', name: 'Estimate', subcontractor: 'Willett & Assoc.', duration: 10, es: 0, ef: 0, ls: 0, lf: 0, float: 0, isCritical: false },
  { id: '2', name: 'Clearing', subcontractor: 'Willett & Assoc.', duration: 3, es: 0, ef: 0, ls: 0, lf: 0, float: 0, isCritical: false },
  { id: '3', name: 'Site Prep', subcontractor: 'Willett & Assoc.', duration: 2, es: 0, ef: 0, ls: 0, lf: 0, float: 0, isCritical: false },
  { id: '4', name: 'Footer', subcontractor: '3C Concrete', duration: 4, es: 0, ef: 0, ls: 0, lf: 0, float: 0, isCritical: false },
  { id: '5', name: 'Block', subcontractor: 'Julio H', duration: 6, es: 0, ef: 0, ls: 0, lf: 0, float: 0, isCritical: false },
];

const initialDependencies: Dependency[] = [
  { id: 'd1', predecessorId: '1', successorId: '2' },
  { id: 'd2', predecessorId: '2', successorId: '3' },
  { id: 'd3', predecessorId: '3', successorId: '4' },
  { id: 'd4', predecessorId: '4', successorId: '5' },
];

// Pre-calculate initially
const seedTasks = calculateCPM(initialTasks, initialDependencies);

export const useProjectStore = create<ProjectState>((set) => ({
  projectStartDate: '2026-04-01',
  tasks: seedTasks,
  dependencies: initialDependencies,

  setProjectStartDate: (date: string) => 
    set(() => {
      // Re-triggering components that listen to start date will automatically reflect changes.
      return { projectStartDate: date };
    }),

  updateTaskDetails: (taskId: string, updates: Partial<Task>) => 
    set((state) => {
      const updatedTasks = state.tasks.map(t => 
        t.id === taskId ? { ...t, ...updates, duration: Math.max(1, updates.duration ?? t.duration) } : t
      );
      const recalculated = calculateCPM(updatedTasks, state.dependencies);
      return { tasks: recalculated };
    }),

  setDependenciesForTask: (taskId: string, predecessorIds: string[]) =>
    set((state) => {
      // Remove all existing predecessors for this task
      const otherDeps = state.dependencies.filter(d => d.successorId !== taskId);
      
      // Create new dependencies
      const newDeps = predecessorIds.map(predId => ({
        id: `dep-${taskId}-${predId}-${Math.random().toString(36).substr(2, 9)}`,
        predecessorId: predId,
        successorId: taskId
      }));

      const finalDeps = [...otherDeps, ...newDeps];
      const recalculated = calculateCPM(state.tasks, finalDeps);
      return { dependencies: finalDeps, tasks: recalculated };
    }),

  addTask: (taskInfo) =>
    set((state) => {
      const newTask: Task = {
        ...taskInfo,
        id: Math.random().toString(36).substr(2, 9),
        es: 0, ef: 0, ls: 0, lf: 0, float: 0, isCritical: false
      };
      const updatedTasks = [...state.tasks, newTask];
      const recalculated = calculateCPM(updatedTasks, state.dependencies);
      return { tasks: recalculated };
    }),

  deleteTask: (taskId: string) =>
    set((state) => {
      const updatedTasks = state.tasks.filter(t => t.id !== taskId);
      const updatedDeps = state.dependencies.filter(d => d.predecessorId !== taskId && d.successorId !== taskId);
      const recalculated = calculateCPM(updatedTasks, updatedDeps);
      return { tasks: recalculated, dependencies: updatedDeps };
    })
}));
