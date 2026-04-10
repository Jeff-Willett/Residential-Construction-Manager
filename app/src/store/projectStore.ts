import { create } from 'zustand';
import { calculateScheduleEngine, type Project, type EngineTask, type EngineDependency } from '../utils/schedulingEngine';
import { supabase } from '../lib/supabase';

export interface TaskTemplate {
  id: string;
  task_order: number;
  scope: string;
  subcontractor: string | null;
  default_days: number;
  bottleneck_vendor: string | null;
}

export interface TemplateDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
}

export interface ActiveFilters {
  vendors: string[];
  scopes: string[];
}

export interface TaskUndoEntry {
  type: 'TASK_UPDATE';
  taskId: string;
  prev: {
    duration?: number;
    lag?: number;
    subcontractor?: string | null;
    bottleneck_vendor?: string | null;
  };
}

interface ProjectState {
  projects: Project[];
  tasks: EngineTask[];
  dependencies: EngineDependency[];
  templates: TaskTemplate[];
  templateDependencies: TemplateDependency[];
  isLoading: boolean;
  error: string | null;
  vendorColors: Record<string, string>;
  activeFilters: ActiveFilters;
  undoStack: TaskUndoEntry[];
  redoStack: TaskUndoEntry[];
  
  fetchData: () => Promise<void>;
  addProject: (name: string, startDate: string) => Promise<void>;
  updateTaskDuration: (taskId: string, duration: number) => Promise<void>;
  updateTaskLag: (taskId: string, lag: number) => Promise<void>;
  updateTaskSubcontractor: (taskId: string, subcontractor: string | null, bottleneck_vendor: string | null) => Promise<void>;
  setVendorColor: (vendor: string, color: string) => Promise<void>;
  toggleFilter: (type: keyof ActiveFilters, value: string) => void;
  clearFilters: () => void;
  deleteProject: (projectId: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
      projects: [],
      tasks: [],
      dependencies: [],
      templates: [],
      templateDependencies: [],
      isLoading: true,
      error: null,
      vendorColors: {},
      activeFilters: { vendors: [], scopes: [] },
      undoStack: [],
      redoStack: [],

      toggleFilter: (type: keyof ActiveFilters, value: string) => {
        set((state) => {
          const arr = state.activeFilters[type];
          const newArr = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
          return { activeFilters: { ...state.activeFilters, [type]: newArr } };
        });
      },

      clearFilters: () => set({ activeFilters: { vendors: [], scopes: [] } }),

      setVendorColor: async (vendor: string, color: string) => {
        // Optimistic UI update
        const updatedColors = { ...get().vendorColors };
        if (color) {
          updatedColors[vendor] = color;
          set({ vendorColors: updatedColors });
          await supabase.from('vendor_colors').upsert({ vendor_name: vendor, color }, { onConflict: 'vendor_name' });
        } else {
          delete updatedColors[vendor];
          set({ vendorColors: updatedColors });
          await supabase.from('vendor_colors').delete().eq('vendor_name', vendor);
        }
      },

  fetchData: async () => {
    set({ isLoading: true, error: null });
    try {
      const [
        { data: projectsData, error: projErr },
        { data: tasksData, error: tasksErr },
        { data: depsData, error: depsErr },
        { data: tempData, error: tempErr },
        { data: tempDepsData, error: tempDepsErr },
        { data: vendorColorsData, error: vendorColorsErr }
      ] = await Promise.all([
        supabase.from('projects').select('*').order('start_date', { ascending: true }),
        supabase.from('tasks').select('*'),
        supabase.from('dependencies').select('*'),
        supabase.from('task_templates').select('*').order('task_order', { ascending: true }),
        supabase.from('template_dependencies').select('*'),
        supabase.from('vendor_colors').select('*')
      ]);

      if (projErr) throw projErr;
      if (tasksErr) throw tasksErr;
      if (depsErr) throw depsErr;
      if (tempErr) throw tempErr;
      if (tempDepsErr) throw tempDepsErr;
      if (vendorColorsErr) console.error('Failed to fetch vendor colors:', vendorColorsErr);

      const computedColors: Record<string, string> = {};
      if (vendorColorsData) {
         vendorColorsData.forEach(vc => {
            computedColors[vc.vendor_name] = vc.color;
         });
      }

      const projects = projectsData || [];
      const templates = tempData || [];
      const templateDependencies = tempDepsData || [];

      const fetchedTasks: EngineTask[] = (tasksData || []).map((t: any) => ({
        id: t.id,
        project_id: t.project_id,
        template_id: t.template_id,
        name: t.name,
        subcontractor: t.subcontractor,
        bottleneck_vendor: t.bottleneck_vendor,
        duration: t.duration || 1,
        lag: t.lag || 0,
      }));

      const fetchedDeps: EngineDependency[] = (depsData || []).map((d: any) => ({
        id: d.id,
        predecessor_id: d.predecessor_id,
        successor_id: d.successor_id
      }));

      // Apply Engine Logic
      const recalculated = calculateScheduleEngine(projects, fetchedTasks, fetchedDeps);

      // Force deterministic chronological order to prevent Postgres UPDATE tuple jumping
      recalculated.sort((a, b) => {
         // Project grouping implicitly handled by React rendering structure later,
         // but sort by logic_start or calculated_start inside here.
         const startA = a.calculated_start ? new Date(a.calculated_start).getTime() : 0;
         const startB = b.calculated_start ? new Date(b.calculated_start).getTime() : 0;
         if (startA !== startB) return startA - startB;
         return a.name.localeCompare(b.name);
      });

      set({ 
        projects, 
        tasks: recalculated, 
        dependencies: fetchedDeps, 
        templates, 
        templateDependencies,
        vendorColors: computedColors,
        isLoading: false 
      });
    } catch (err: any) {
      console.error('Error fetching data:', err);
      set({ error: err.message, isLoading: false });
    }
  },

  addProject: async (name: string, startDate: string) => {
    const { templates, templateDependencies } = get();
    // 1. Insert Project
    const { data: projData, error: projErr } = await supabase
      .from('projects')
      .insert({ name, start_date: startDate })
      .select()
      .single();

    if (projErr || !projData) {
      console.error('Failed to create project:', projErr);
      return;
    }

    const projectId = projData.id;

    if (templates.length === 0) {
      await get().fetchData();
      return;
    }

    // 2. Insert Tasks from Templates
    const taskInserts = templates.map(t => ({
      project_id: projectId,
      template_id: t.id,
      name: t.scope,
      subcontractor: t.subcontractor,
      bottleneck_vendor: t.bottleneck_vendor,
      duration: t.default_days,
      lag: 0
    }));

    const { data: insertedTasks, error: tasksErr } = await supabase
      .from('tasks')
      .insert(taskInserts)
      .select();

    if (tasksErr || !insertedTasks) {
      console.error('Failed to insert tasks:', tasksErr);
      return;
    }

    // 3. Insert Dependencies
    // We must map template_id -> new task id
    const templateToTaskMap = new Map<string, string>();
    insertedTasks.forEach(t => templateToTaskMap.set(t.template_id, t.id));

    const depInserts = templateDependencies.map(td => ({
      predecessor_id: templateToTaskMap.get(td.predecessor_id)!,
      successor_id: templateToTaskMap.get(td.successor_id)!
    })).filter(d => d.predecessor_id && d.successor_id); // Ensure validity

    if (depInserts.length > 0) {
      const { error: depErr } = await supabase.from('dependencies').insert(depInserts);
      if (depErr) console.error('Failed to insert dependencies:', depErr);
    }

    // Refresh everything to reflect changes
    await get().fetchData();
  },

  deleteProject: async (projectId: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (!error) {
      await get().fetchData();
    } else {
      console.error('Failed to delete project', error);
    }
  },

  updateTaskDuration: async (taskId: string, duration: number) => {
    const task = get().tasks.find(t => t.id === taskId);
    if (task) {
      const entry: TaskUndoEntry = {
        type: 'TASK_UPDATE',
        taskId,
        prev: { duration: task.duration }
      };
      set(state => ({ 
        undoStack: [entry, ...state.undoStack].slice(0, 50),
        redoStack: []
      }));
    }

    // Optimistic update logic could go here, but for simplicity we await db save so logic engine syncs
    const { error } = await supabase.from('tasks').update({ duration: Math.max(1, duration) }).eq('id', taskId);
    if (!error) {
       await get().fetchData();
    }
  },

  updateTaskLag: async (taskId: string, lag: number) => {
    const task = get().tasks.find(t => t.id === taskId);
    if (task) {
      const entry: TaskUndoEntry = {
        type: 'TASK_UPDATE',
        taskId,
        prev: { lag: task.lag }
      };
      set(state => ({ 
        undoStack: [entry, ...state.undoStack].slice(0, 50),
        redoStack: []
      }));
    }

    const { error } = await supabase.from('tasks').update({ lag }).eq('id', taskId);
    if (!error) {
       await get().fetchData();
    }
  },

  updateTaskSubcontractor: async (taskId: string, subcontractor: string | null, bottleneck_vendor: string | null) => {
    const task = get().tasks.find(t => t.id === taskId);
    if (task) {
      const entry: TaskUndoEntry = {
        type: 'TASK_UPDATE',
        taskId,
        prev: { subcontractor: task.subcontractor, bottleneck_vendor: task.bottleneck_vendor }
      };
      set(state => ({ 
        undoStack: [entry, ...state.undoStack].slice(0, 50),
        redoStack: []
      }));
    }

    const { error } = await supabase.from('tasks').update({ subcontractor, bottleneck_vendor }).eq('id', taskId);
    if (!error) {
       await get().fetchData();
    }
  },

  undo: async () => {
    const stack = get().undoStack;
    if (stack.length === 0) return;

    const [lastAction, ...remainingStack] = stack;
    
    // Capture current state for redo BEFORE applying undo
    const task = get().tasks.find(t => t.id === lastAction.taskId);
    if (task) {
        const redoEntry: TaskUndoEntry = {
            type: 'TASK_UPDATE',
            taskId: lastAction.taskId,
            prev: {}
        };
        // Fill prev with current values that are about to be overwritten
        if ('duration' in lastAction.prev) redoEntry.prev.duration = task.duration;
        if ('lag' in lastAction.prev) redoEntry.prev.lag = task.lag;
        if ('subcontractor' in lastAction.prev) {
            redoEntry.prev.subcontractor = task.subcontractor;
            redoEntry.prev.bottleneck_vendor = task.bottleneck_vendor;
        }

        set(state => ({ 
            undoStack: remainingStack,
            redoStack: [redoEntry, ...state.redoStack].slice(0, 50)
        }));

        const { error } = await supabase
            .from('tasks')
            .update(lastAction.prev)
            .eq('id', lastAction.taskId);
        
        if (!error) {
            await get().fetchData();
        }
    }
  },

  redo: async () => {
    const stack = get().redoStack;
    if (stack.length === 0) return;

    const [nextAction, ...remainingStack] = stack;

    // Capture current state for undo BEFORE applying redo
    const task = get().tasks.find(t => t.id === nextAction.taskId);
    if (task) {
        const undoEntry: TaskUndoEntry = {
            type: 'TASK_UPDATE',
            taskId: nextAction.taskId,
            prev: {}
        };
        if ('duration' in nextAction.prev) undoEntry.prev.duration = task.duration;
        if ('lag' in nextAction.prev) undoEntry.prev.lag = task.lag;
        if ('subcontractor' in nextAction.prev) {
            undoEntry.prev.subcontractor = task.subcontractor;
            undoEntry.prev.bottleneck_vendor = task.bottleneck_vendor;
        }

        set(state => ({ 
            redoStack: remainingStack,
            undoStack: [undoEntry, ...state.undoStack].slice(0, 50)
        }));

        const { error } = await supabase
            .from('tasks')
            .update(nextAction.prev)
            .eq('id', nextAction.taskId);
        
        if (!error) {
            await get().fetchData();
        }
    }
  }
}));
