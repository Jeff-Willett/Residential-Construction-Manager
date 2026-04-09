import { create } from 'zustand';
import { calculateCPM } from '../utils/cpm';
import type { Task, Dependency } from '../utils/cpm';
import { supabase } from '../lib/supabase';

interface ProjectState {
  projectStartDate: string;
  tasks: Task[];
  dependencies: Dependency[];
  isLoading: boolean;
  error: string | null;
  
  fetchData: () => Promise<void>;
  setProjectStartDate: (date: string) => void;
  updateTaskDetails: (taskId: string, updates: Partial<Task>) => Promise<void>;
  setDependenciesForTask: (taskId: string, predecessorIds: string[]) => Promise<void>;
  addTask: (task: Omit<Task, 'es' | 'ef' | 'ls' | 'lf' | 'float' | 'isCritical' | 'id'>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectStartDate: '2026-04-01',
  tasks: [],
  dependencies: [],
  isLoading: true,
  error: null,

  fetchData: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data: tasksData, error: tasksError } = await supabase.from('tasks').select('*');
      if (tasksError) throw tasksError;

      const { data: depsData, error: depsError } = await supabase.from('dependencies').select('*');
      if (depsError) throw depsError;

      const fetchedTasks: Task[] = (tasksData || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        subcontractor: t.subcontractor || 'Unassigned',
        duration: t.duration || 1,
        lag: t.lag || 0,
        es: 0, ef: 0, ls: 0, lf: 0, float: 0, isCritical: false
      }));

      const fetchedDeps: Dependency[] = (depsData || []).map((d: any) => ({
        id: d.id,
        predecessorId: d.predecessor_id,
        successorId: d.successor_id
      }));

      const recalculated = calculateCPM(fetchedTasks, fetchedDeps);
      set({ tasks: recalculated, dependencies: fetchedDeps, isLoading: false });
    } catch (err: any) {
      console.error('Error fetching data:', err);
      set({ error: err.message, isLoading: false });
    }
  },

  setProjectStartDate: (date: string) => 
    set(() => {
      // Re-triggering components that listen to start date will automatically reflect changes.
      return { projectStartDate: date };
    }),

  updateTaskDetails: async (taskId: string, updates: Partial<Task>) => {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.subcontractor !== undefined) dbUpdates.subcontractor = updates.subcontractor;
    if (updates.duration !== undefined) dbUpdates.duration = Math.max(1, updates.duration);
    if (updates.lag !== undefined) dbUpdates.lag = updates.lag;

    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase.from('tasks').update(dbUpdates).eq('id', taskId);
      if (error) {
        console.error('Error updating task:', error);
        return;
      }
    }

    set((state) => {
      const updatedTasks = state.tasks.map(t => 
        t.id === taskId ? { ...t, ...updates, duration: Math.max(1, updates.duration ?? t.duration) } : t
      );
      const recalculated = calculateCPM(updatedTasks, state.dependencies);
      return { tasks: recalculated };
    });
  },

  setDependenciesForTask: async (taskId: string, predecessorIds: string[]) => {
    // Note: Due to RLS or simple REST, we do two requests: delete old, insert new.
    // In production a PostgreSQL function or batch might be better.
    try {
      // 1. Delete existing incoming dependencies to this task
      const { error: delError } = await supabase.from('dependencies').delete().eq('successor_id', taskId);
      if (delError) throw delError;

      // 2. Insert new ones
      if (predecessorIds.length > 0) {
        const inserts = predecessorIds.map(predId => ({
          predecessor_id: predId,
          successor_id: taskId
        }));
        const { error: insError } = await supabase.from('dependencies').insert(inserts);
        if (insError) throw insError;
      }
      
      // Just re-fetch completely to get valid IDs
      await get().fetchData();

    } catch (err) {
      console.error('Error setting dependencies:', err);
    }
  },

  addTask: async (taskInfo) => {
    const { data, error } = await supabase.from('tasks').insert({
      name: taskInfo.name,
      subcontractor: taskInfo.subcontractor,
      duration: taskInfo.duration,
      lag: taskInfo.lag || 0
    }).select().single();
    
    if (error) {
      console.error('Error adding task:', error);
      return;
    }

    set((state) => {
      const newTask: Task = {
        id: data.id,
        name: data.name,
        subcontractor: data.subcontractor || 'Unassigned',
        duration: data.duration,
        lag: data.lag || 0,
        es: 0, ef: 0, ls: 0, lf: 0, float: 0, isCritical: false
      };
      const updatedTasks = [...state.tasks, newTask];
      const recalculated = calculateCPM(updatedTasks, state.dependencies);
      return { tasks: recalculated };
    });
  },

  deleteTask: async (taskId: string) => {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) {
      console.error('Error deleting task:', error);
      return;
    }

    set((state) => {
      const remainingTasks = state.tasks.filter(t => t.id !== taskId);
      const remainingDeps = state.dependencies.filter(d => d.predecessorId !== taskId && d.successorId !== taskId);
      const recalculated = calculateCPM(remainingTasks, remainingDeps);
      return { 
        tasks: [...recalculated], 
        dependencies: [...remainingDeps] 
      };
    });
  }
}));
