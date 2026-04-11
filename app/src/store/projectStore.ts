import { create } from 'zustand';
import { calculateScheduleEngine, type Project, type EngineTask, type EngineDependency } from '../utils/schedulingEngine';
import { supabase } from '../lib/supabase';

export interface TaskTemplate {
  id: string;
  phase_template_id: string | null;
  phase_name: string | null;
  phase_order: number;
  task_order: number;
  scope: string;
  subcontractor: string | null;
  default_days: number;
  bottleneck_vendor: string | null;
}

export interface PhaseTemplate {
  id: string;
  name: string;
  phase_order: number;
}

export interface ProjectPhase {
  id: string;
  project_id: string;
  phase_template_id: string | null;
  name: string;
  phase_order: number;
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
  phaseTemplates: PhaseTemplate[];
  projectPhases: ProjectPhase[];
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
      phaseTemplates: [],
      projectPhases: [],
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
        { data: phaseTemplatesData, error: phaseTemplatesErr },
        { data: projectPhasesData, error: projectPhasesErr },
        { data: tempData, error: tempErr },
        { data: tempDepsData, error: tempDepsErr },
        { data: vendorColorsData, error: vendorColorsErr }
      ] = await Promise.all([
        supabase.from('projects').select('*').order('start_date', { ascending: true }),
        supabase.from('tasks').select('*'),
        supabase.from('dependencies').select('*'),
        supabase.from('phase_templates').select('*').order('phase_order', { ascending: true }),
        supabase.from('project_phases').select('*').order('phase_order', { ascending: true }),
        supabase.from('task_templates').select('*').order('task_order', { ascending: true }),
        supabase.from('template_dependencies').select('*'),
        supabase.from('vendor_colors').select('*')
      ]);

      if (projErr) throw projErr;
      if (tasksErr) throw tasksErr;
      if (depsErr) throw depsErr;
      if (phaseTemplatesErr) throw phaseTemplatesErr;
      if (projectPhasesErr) throw projectPhasesErr;
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
      const phaseTemplates = phaseTemplatesData || [];
      const projectPhases = projectPhasesData || [];
      const templates = tempData || [];
      const templateDependencies = tempDepsData || [];

      const fetchedTasks: EngineTask[] = (tasksData || []).map((t: any) => ({
        id: t.id,
        project_id: t.project_id,
        project_phase_id: t.project_phase_id,
        template_id: t.template_id,
        name: t.name,
        phase_name: t.phase_name,
        phase_order: t.phase_order || 0,
        task_order: t.task_order || 0,
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
         if (a.phase_order !== b.phase_order) return a.phase_order - b.phase_order;
         if (a.task_order !== b.task_order) return a.task_order - b.task_order;
         return a.name.localeCompare(b.name);
      });

      set({ 
        projects, 
        tasks: recalculated, 
        dependencies: fetchedDeps, 
        phaseTemplates,
        projectPhases,
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
    const { phaseTemplates, templates, templateDependencies } = get();
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

    if (phaseTemplates.length === 0 || templates.length === 0) {
      await get().fetchData();
      return;
    }

    // 2. Insert Project Phases from Templates
    const phaseInserts = phaseTemplates.map((phase) => ({
      project_id: projectId,
      phase_template_id: phase.id,
      name: phase.name,
      phase_order: phase.phase_order
    }));

    const { data: insertedPhases, error: phasesErr } = await supabase
      .from('project_phases')
      .insert(phaseInserts)
      .select();

    if (phasesErr || !insertedPhases) {
      console.error('Failed to insert project phases:', phasesErr);
      return;
    }

    const phaseTemplateToProjectPhaseMap = new Map<string, string>();
    insertedPhases.forEach((phase: any) => {
      if (phase.phase_template_id) {
        phaseTemplateToProjectPhaseMap.set(phase.phase_template_id, phase.id);
      }
    });

    // 3. Insert Tasks from Templates
    const taskInserts = templates.map(t => ({
      project_id: projectId,
      project_phase_id: t.phase_template_id ? phaseTemplateToProjectPhaseMap.get(t.phase_template_id) ?? null : null,
      template_id: t.id,
      name: t.scope,
      phase_name: t.phase_name,
      phase_order: t.phase_order,
      task_order: t.task_order,
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

    // 4. Insert Dependencies
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
    const { tasks, projects, dependencies } = get();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // 1. History for Undo
    const entry: TaskUndoEntry = {
      type: 'TASK_UPDATE',
      taskId,
      prev: { duration: task.duration }
    };

    // 2. Optimistic Update & Local Recalculation
    const updatedTasks = tasks.map(t => 
      t.id === taskId ? { ...t, duration: Math.max(1, duration) } : t
    );
    const recalculated = calculateScheduleEngine(projects, updatedTasks, dependencies);
    
    set(state => ({ 
      tasks: recalculated,
      undoStack: [entry, ...state.undoStack].slice(0, 50),
      redoStack: []
    }));

    // 3. Background Sync
    const { error } = await supabase.from('tasks').update({ duration: Math.max(1, duration) }).eq('id', taskId);
    if (error) {
       console.error('Failed to sync duration to DB:', error);
       // Revert or show error if critical
    }
  },

  updateTaskLag: async (taskId: string, lag: number) => {
    const { tasks, projects, dependencies } = get();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const entry: TaskUndoEntry = {
      type: 'TASK_UPDATE',
      taskId,
      prev: { lag: task.lag }
    };

    const updatedTasks = tasks.map(t => 
      t.id === taskId ? { ...t, lag } : t
    );
    const recalculated = calculateScheduleEngine(projects, updatedTasks, dependencies);

    set(state => ({ 
      tasks: recalculated,
      undoStack: [entry, ...state.undoStack].slice(0, 50),
      redoStack: []
    }));

    const { error } = await supabase.from('tasks').update({ lag }).eq('id', taskId);
    if (error) console.error('Failed to sync lag to DB:', error);
  },

  updateTaskSubcontractor: async (taskId: string, subcontractor: string | null, bottleneck_vendor: string | null) => {
    const { tasks, projects, dependencies } = get();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const entry: TaskUndoEntry = {
      type: 'TASK_UPDATE',
      taskId,
      prev: { subcontractor: task.subcontractor, bottleneck_vendor: task.bottleneck_vendor }
    };

    const updatedTasks = tasks.map(t => 
      t.id === taskId ? { ...t, subcontractor, bottleneck_vendor } : t
    );
    const recalculated = calculateScheduleEngine(projects, updatedTasks, dependencies);

    set(state => ({ 
      tasks: recalculated,
      undoStack: [entry, ...state.undoStack].slice(0, 50),
      redoStack: []
    }));

    const { error } = await supabase.from('tasks').update({ subcontractor, bottleneck_vendor }).eq('id', taskId);
    if (error) console.error('Failed to sync subcontractor to DB:', error);
  },

  undo: async () => {
    const { undoStack, redoStack, tasks, projects, dependencies } = get();
    if (undoStack.length === 0) return;

    const [lastAction, ...remainingStack] = undoStack;
    const task = tasks.find(t => t.id === lastAction.taskId);
    if (!task) return;

    // 1. Prepare Redo Entry
    const redoEntry: TaskUndoEntry = {
      type: 'TASK_UPDATE',
      taskId: lastAction.taskId,
      prev: {}
    };
    if ('duration' in lastAction.prev) redoEntry.prev.duration = task.duration;
    if ('lag' in lastAction.prev) redoEntry.prev.lag = task.lag;
    if ('subcontractor' in lastAction.prev) {
      redoEntry.prev.subcontractor = task.subcontractor;
      redoEntry.prev.bottleneck_vendor = task.bottleneck_vendor;
    }

    // 2. Apply Locally & Recalculate
    const updatedTasks = tasks.map(t => 
      t.id === lastAction.taskId ? { ...t, ...lastAction.prev } : t
    );
    const recalculated = calculateScheduleEngine(projects, updatedTasks, dependencies);

    set({ 
      tasks: recalculated,
      undoStack: remainingStack,
      redoStack: [redoEntry, ...redoStack].slice(0, 50)
    });

    // 3. Background Sync
    const { error } = await supabase.from('tasks').update(lastAction.prev).eq('id', lastAction.taskId);
    if (error) console.error('Failed to sync undo to DB:', error);
  },

  redo: async () => {
    const { undoStack, redoStack, tasks, projects, dependencies } = get();
    if (redoStack.length === 0) return;

    const [nextAction, ...remainingStack] = redoStack;
    const task = tasks.find(t => t.id === nextAction.taskId);
    if (!task) return;

    // 1. Prepare Undo Entry
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

    // 2. Apply Locally & Recalculate
    const updatedTasks = tasks.map(t => 
      t.id === nextAction.taskId ? { ...t, ...nextAction.prev } : t
    );
    const recalculated = calculateScheduleEngine(projects, updatedTasks, dependencies);

    set({ 
      tasks: recalculated,
      redoStack: remainingStack,
      undoStack: [undoEntry, ...undoStack].slice(0, 50)
    });

    // 3. Background Sync
    const { error } = await supabase.from('tasks').update(nextAction.prev).eq('id', nextAction.taskId);
    if (error) console.error('Failed to sync redo to DB:', error);
  }
}));
