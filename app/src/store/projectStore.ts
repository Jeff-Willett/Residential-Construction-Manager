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

export interface PhaseTemplateInput {
  name: string;
  phase_order: number;
}

export interface TaskTemplateInput {
  phase_template_id: string | null;
  task_order: number;
  scope: string;
  subcontractor: string | null;
  default_days: number;
  bottleneck_vendor: string | null;
}

export interface ProjectTaskDraftInput {
  source_task_id?: string | null;
  template_id: string | null;
  phase_template_id: string | null;
  task_order: number;
  scope: string;
  subcontractor: string | null;
  duration: number;
  bottleneck_vendor: string | null;
  lag?: number;
}

export interface ProjectCreationInput {
  name: string;
  startDate: string;
  tasks: ProjectTaskDraftInput[];
}

export interface ProjectUpdateInput extends ProjectCreationInput {
  projectId: string;
}

export interface ActiveFilters {
  projects: string[];
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

interface TaskRow {
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
}

interface DependencyRow {
  id: string;
  predecessor_id: string;
  successor_id: string;
}

interface ProjectPhaseRow {
  id: string;
  phase_template_id: string | null;
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
  addProjectFromDraft: (input: ProjectCreationInput) => Promise<void>;
  updateProjectFromDraft: (input: ProjectUpdateInput) => Promise<void>;
  createPhaseTemplate: (input: PhaseTemplateInput) => Promise<void>;
  updatePhaseTemplate: (phaseId: string, updates: Partial<PhaseTemplateInput>) => Promise<void>;
  deletePhaseTemplate: (phaseId: string) => Promise<void>;
  createTaskTemplate: (input: TaskTemplateInput) => Promise<void>;
  updateTaskTemplate: (templateId: string, updates: Partial<TaskTemplateInput>) => Promise<void>;
  deleteTaskTemplate: (templateId: string) => Promise<void>;
  addTemplateDependency: (predecessorId: string, successorId: string) => Promise<void>;
  removeTemplateDependency: (dependencyId: string) => Promise<void>;
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
      activeFilters: { projects: [], vendors: [], scopes: [] },
      undoStack: [],
      redoStack: [],

      toggleFilter: (type: keyof ActiveFilters, value: string) => {
        set((state) => {
          const arr = state.activeFilters[type];
          const newArr = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
          return { activeFilters: { ...state.activeFilters, [type]: newArr } };
        });
      },

      clearFilters: () => set({ activeFilters: { projects: [], vendors: [], scopes: [] } }),

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

      const fetchedTasks: EngineTask[] = ((tasksData as TaskRow[] | null) || []).map((t) => ({
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

      const fetchedDeps: EngineDependency[] = ((depsData as DependencyRow[] | null) || []).map((d) => ({
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
    } catch (err: unknown) {
      console.error('Error fetching data:', err);
      set({ error: err instanceof Error ? err.message : 'Unknown fetch error', isLoading: false });
    }
  },

  addProject: async (name: string, startDate: string) => {
    const { templates, addProjectFromDraft } = get();

    await addProjectFromDraft({
      name,
      startDate,
      tasks: templates.map((template) => ({
        template_id: template.id,
        phase_template_id: template.phase_template_id,
        task_order: template.task_order,
        scope: template.scope,
        subcontractor: template.subcontractor,
        duration: template.default_days,
        bottleneck_vendor: template.bottleneck_vendor
      }))
    });
  },

  addProjectFromDraft: async ({ name, startDate, tasks }) => {
    const { phaseTemplates, templateDependencies } = get();
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Project name is required.');
    if (!startDate) throw new Error('Project start date is required.');

    const sanitizedTasks = tasks
      .map((task) => ({
        template_id: task.template_id,
        phase_template_id: task.phase_template_id,
        task_order: Math.max(1, Math.trunc(task.task_order || 1)),
        scope: task.scope.trim(),
        subcontractor: task.subcontractor?.trim() || null,
        duration: Math.max(1, Math.trunc(task.duration || 1)),
        bottleneck_vendor: task.bottleneck_vendor?.trim() || null,
        lag: Math.trunc(task.lag || 0)
      }))
      .filter((task) => task.scope.length > 0);

    if (sanitizedTasks.length === 0) throw new Error('Add at least one scope before creating a project.');

    // 1. Insert Project
    const { data: projData, error: projErr } = await supabase
      .from('projects')
      .insert({ name: trimmedName, start_date: startDate })
      .select()
      .single();

    if (projErr || !projData) {
      throw projErr ?? new Error('Failed to create project.');
    }

    const projectId = projData.id;

    if (sanitizedTasks.length === 0) {
      await get().fetchData();
      return;
    }

    // 2. Insert Project Phases from Templates
    const usedPhaseIds = new Set(sanitizedTasks.map((task) => task.phase_template_id).filter(Boolean));
    const phaseInserts = phaseTemplates
      .filter((phase) => usedPhaseIds.has(phase.id))
      .map((phase) => ({
        project_id: projectId,
        phase_template_id: phase.id,
        name: phase.name,
        phase_order: phase.phase_order
      }));

    let insertedPhases: ProjectPhaseRow[] = [];
    if (phaseInserts.length > 0) {
      const { data, error: phasesErr } = await supabase.from('project_phases').insert(phaseInserts).select();

      if (phasesErr || !data) {
        throw phasesErr ?? new Error('Failed to insert project phases.');
      }

      insertedPhases = data as ProjectPhaseRow[];
    }

    const phaseTemplateToProjectPhaseMap = new Map<string, string>();
    insertedPhases.forEach((phase) => {
      if (phase.phase_template_id) {
        phaseTemplateToProjectPhaseMap.set(phase.phase_template_id, phase.id);
      }
    });

    // 3. Insert Tasks from Templates
    const phaseById = new Map(phaseTemplates.map((phase) => [phase.id, phase]));
    const taskInserts = sanitizedTasks.map((task) => {
      const phase = task.phase_template_id ? phaseById.get(task.phase_template_id) ?? null : null;
      return {
        project_id: projectId,
        project_phase_id: task.phase_template_id ? phaseTemplateToProjectPhaseMap.get(task.phase_template_id) ?? null : null,
        template_id: task.template_id,
        name: task.scope,
        phase_name: phase?.name ?? null,
        phase_order: phase?.phase_order ?? 0,
        task_order: task.task_order,
        subcontractor: task.subcontractor,
        bottleneck_vendor: task.bottleneck_vendor,
        duration: task.duration,
        lag: task.lag ?? 0
      };
    });

    const { data: insertedTasks, error: tasksErr } = await supabase
      .from('tasks')
      .insert(taskInserts)
      .select();

    if (tasksErr || !insertedTasks) {
      throw tasksErr ?? new Error('Failed to insert tasks.');
    }

    // 4. Insert Dependencies
    // Preserve only dependency chains for template-backed scopes that were kept in the draft.
    const templateToTaskMap = new Map<string, string>();
    insertedTasks.forEach((task) => {
      if (task.template_id) templateToTaskMap.set(task.template_id, task.id);
    });

    const depInserts = templateDependencies
      .map((dependency) => ({
        predecessor_id: templateToTaskMap.get(dependency.predecessor_id) ?? null,
        successor_id: templateToTaskMap.get(dependency.successor_id) ?? null
      }))
      .filter(
        (dependency): dependency is { predecessor_id: string; successor_id: string } =>
          Boolean(dependency.predecessor_id && dependency.successor_id)
      );

    if (depInserts.length > 0) {
      const { error: depErr } = await supabase.from('dependencies').insert(depInserts);
      if (depErr) throw depErr;
    }

    // Refresh everything to reflect changes
    await get().fetchData();
  },

  updateProjectFromDraft: async ({ projectId, name, startDate, tasks }) => {
    const state = get();
    const { phaseTemplates, dependencies, tasks: existingTasks } = state;
    const existingProject = state.projects.find((project) => project.id === projectId);
    if (!existingProject) throw new Error('Project not found.');

    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Project name is required.');
    if (!startDate) throw new Error('Project start date is required.');

    const sanitizedTasks = tasks
      .map((task) => ({
        source_task_id: task.source_task_id ?? null,
        template_id: task.template_id,
        phase_template_id: task.phase_template_id,
        task_order: Math.max(1, Math.trunc(task.task_order || 1)),
        scope: task.scope.trim(),
        subcontractor: task.subcontractor?.trim() || null,
        duration: Math.max(1, Math.trunc(task.duration || 1)),
        bottleneck_vendor: task.bottleneck_vendor?.trim() || null,
        lag: Math.trunc(task.lag || 0)
      }))
      .filter((task) => task.scope.length > 0);

    if (sanitizedTasks.length === 0) throw new Error('Add at least one scope before saving this project.');

    const projectTaskIds = existingTasks.filter((task) => task.project_id === projectId).map((task) => task.id);
    const dependencyIdsToDelete = dependencies
      .filter(
        (dependency) =>
          projectTaskIds.includes(dependency.predecessor_id) || projectTaskIds.includes(dependency.successor_id)
      )
      .map((dependency) => dependency.id);

    const projectDependencyPairs = dependencies
      .filter(
        (dependency) =>
          projectTaskIds.includes(dependency.predecessor_id) && projectTaskIds.includes(dependency.successor_id)
      )
      .map((dependency) => ({
        predecessor_source_task_id: dependency.predecessor_id,
        successor_source_task_id: dependency.successor_id
      }));

    const { error: projectErr } = await supabase
      .from('projects')
      .update({ name: trimmedName, start_date: startDate })
      .eq('id', projectId);

    if (projectErr) throw projectErr;

    if (dependencyIdsToDelete.length > 0) {
      const { error: dependencyDeleteError } = await supabase
        .from('dependencies')
        .delete()
        .in('id', dependencyIdsToDelete);

      if (dependencyDeleteError) throw dependencyDeleteError;
    }

    if (projectTaskIds.length > 0) {
      const { error: taskDeleteError } = await supabase.from('tasks').delete().in('id', projectTaskIds);
      if (taskDeleteError) throw taskDeleteError;
    }

    const { error: phaseDeleteError } = await supabase.from('project_phases').delete().eq('project_id', projectId);
    if (phaseDeleteError) throw phaseDeleteError;

    const usedPhaseIds = new Set(sanitizedTasks.map((task) => task.phase_template_id).filter(Boolean));
    const phaseInserts = phaseTemplates
      .filter((phase) => usedPhaseIds.has(phase.id))
      .map((phase) => ({
        project_id: projectId,
        phase_template_id: phase.id,
        name: phase.name,
        phase_order: phase.phase_order
      }));

    let insertedPhases: ProjectPhaseRow[] = [];
    if (phaseInserts.length > 0) {
      const { data, error: phasesErr } = await supabase.from('project_phases').insert(phaseInserts).select();
      if (phasesErr || !data) throw phasesErr ?? new Error('Failed to rebuild project phases.');
      insertedPhases = data as ProjectPhaseRow[];
    }

    const phaseTemplateToProjectPhaseMap = new Map<string, string>();
    insertedPhases.forEach((phase) => {
      if (phase.phase_template_id) {
        phaseTemplateToProjectPhaseMap.set(phase.phase_template_id, phase.id);
      }
    });

    const phaseById = new Map(phaseTemplates.map((phase) => [phase.id, phase]));
    const taskInserts = sanitizedTasks.map((task) => {
      const phase = task.phase_template_id ? phaseById.get(task.phase_template_id) ?? null : null;
      return {
        project_id: projectId,
        project_phase_id: task.phase_template_id ? phaseTemplateToProjectPhaseMap.get(task.phase_template_id) ?? null : null,
        template_id: task.template_id,
        name: task.scope,
        phase_name: phase?.name ?? null,
        phase_order: phase?.phase_order ?? 0,
        task_order: task.task_order,
        subcontractor: task.subcontractor,
        bottleneck_vendor: task.bottleneck_vendor,
        duration: task.duration,
        lag: task.lag ?? 0
      };
    });

    const { data: insertedTasks, error: insertTasksError } = await supabase.from('tasks').insert(taskInserts).select();
    if (insertTasksError || !insertedTasks) {
      throw insertTasksError ?? new Error('Failed to save project tasks.');
    }

    const newTaskIdBySourceTaskId = new Map<string, string>();
    sanitizedTasks.forEach((task, index) => {
      if (task.source_task_id) {
        newTaskIdBySourceTaskId.set(task.source_task_id, insertedTasks[index].id);
      }
    });

    const dependencyInserts = projectDependencyPairs
      .map((dependency) => ({
        predecessor_id: newTaskIdBySourceTaskId.get(dependency.predecessor_source_task_id) ?? null,
        successor_id: newTaskIdBySourceTaskId.get(dependency.successor_source_task_id) ?? null
      }))
      .filter(
        (dependency): dependency is { predecessor_id: string; successor_id: string } =>
          Boolean(dependency.predecessor_id && dependency.successor_id)
      );

    if (dependencyInserts.length > 0) {
      const { error: dependencyInsertError } = await supabase.from('dependencies').insert(dependencyInserts);
      if (dependencyInsertError) throw dependencyInsertError;
    }

    await get().fetchData();
  },

  createPhaseTemplate: async (input: PhaseTemplateInput) => {
    const name = input.name.trim();
    if (!name) throw new Error('Phase name is required.');

    const phaseId = crypto.randomUUID();
    const phaseOrder = Math.max(1, Math.trunc(input.phase_order || 1));

    const { error } = await supabase.from('phase_templates').insert({
      id: phaseId,
      name,
      phase_order: phaseOrder
    });

    if (error) throw error;

    const projectPhaseInserts = get().projects.map((project) => ({
      project_id: project.id,
      phase_template_id: phaseId,
      name,
      phase_order: phaseOrder
    }));

    if (projectPhaseInserts.length > 0) {
      const { error: projectPhaseError } = await supabase.from('project_phases').insert(projectPhaseInserts);
      if (projectPhaseError) throw projectPhaseError;
    }

    await get().fetchData();
  },

  updatePhaseTemplate: async (phaseId: string, updates: Partial<PhaseTemplateInput>) => {
    const existingPhase = get().phaseTemplates.find((phase) => phase.id === phaseId);
    if (!existingPhase) throw new Error('Phase template not found.');

    const nextName = updates.name !== undefined ? updates.name.trim() : existingPhase.name;
    if (!nextName) throw new Error('Phase name is required.');

    const nextOrder =
      updates.phase_order !== undefined ? Math.max(1, Math.trunc(updates.phase_order || 1)) : existingPhase.phase_order;

    const { error } = await supabase
      .from('phase_templates')
      .update({ name: nextName, phase_order: nextOrder })
      .eq('id', phaseId);

    if (error) throw error;

    const { error: projectPhaseError } = await supabase
      .from('project_phases')
      .update({ name: nextName, phase_order: nextOrder })
      .eq('phase_template_id', phaseId);

    if (projectPhaseError) throw projectPhaseError;

    const linkedTemplateIds = get()
      .templates.filter((template) => template.phase_template_id === phaseId)
      .map((template) => template.id);

    if (linkedTemplateIds.length > 0) {
      const { error: taskTemplateError } = await supabase
        .from('task_templates')
        .update({ phase_name: nextName, phase_order: nextOrder })
        .in('id', linkedTemplateIds);

      if (taskTemplateError) throw taskTemplateError;

      const { error: taskError } = await supabase
        .from('tasks')
        .update({ phase_name: nextName, phase_order: nextOrder })
        .in('template_id', linkedTemplateIds);

      if (taskError) throw taskError;
    }

    await get().fetchData();
  },

  deletePhaseTemplate: async (phaseId: string) => {
    const phaseRows = get().projectPhases.filter((phase) => phase.phase_template_id === phaseId);
    const phaseRowIds = phaseRows.map((phase) => phase.id);

    if (phaseRowIds.length > 0) {
      const { error: clearTaskPhaseError } = await supabase
        .from('tasks')
        .update({ project_phase_id: null, phase_name: null, phase_order: 0 })
        .in('project_phase_id', phaseRowIds);

      if (clearTaskPhaseError) throw clearTaskPhaseError;

      const { error: deleteProjectPhasesError } = await supabase
        .from('project_phases')
        .delete()
        .eq('phase_template_id', phaseId);

      if (deleteProjectPhasesError) throw deleteProjectPhasesError;
    }

    const { error } = await supabase.from('phase_templates').delete().eq('id', phaseId);
    if (error) throw error;

    await get().fetchData();
  },

  createTaskTemplate: async (input: TaskTemplateInput) => {
    const scope = input.scope.trim();
    if (!scope) throw new Error('Scope name is required.');

    const phase = input.phase_template_id
      ? get().phaseTemplates.find((phaseTemplate) => phaseTemplate.id === input.phase_template_id) ?? null
      : null;

    const { error } = await supabase.from('task_templates').insert({
      id: crypto.randomUUID(),
      phase_template_id: input.phase_template_id,
      phase_name: phase?.name ?? null,
      phase_order: phase?.phase_order ?? 0,
      task_order: Math.max(1, Math.trunc(input.task_order || 1)),
      scope,
      subcontractor: input.subcontractor?.trim() || null,
      default_days: Math.max(1, Math.trunc(input.default_days || 1)),
      bottleneck_vendor: input.bottleneck_vendor?.trim() || null
    });

    if (error) throw error;

    await get().fetchData();
  },

  updateTaskTemplate: async (templateId: string, updates: Partial<TaskTemplateInput>) => {
    const state = get();
    const existingTemplate = state.templates.find((template) => template.id === templateId);
    if (!existingTemplate) throw new Error('Scope template not found.');

    const nextPhaseId =
      updates.phase_template_id !== undefined ? updates.phase_template_id : existingTemplate.phase_template_id;
    const nextPhase = nextPhaseId
      ? state.phaseTemplates.find((phaseTemplate) => phaseTemplate.id === nextPhaseId) ?? null
      : null;

    const nextScope = updates.scope !== undefined ? updates.scope.trim() : existingTemplate.scope;
    if (!nextScope) throw new Error('Scope name is required.');

    const nextTaskOrder =
      updates.task_order !== undefined ? Math.max(1, Math.trunc(updates.task_order || 1)) : existingTemplate.task_order;
    const nextDefaultDays =
      updates.default_days !== undefined
        ? Math.max(1, Math.trunc(updates.default_days || 1))
        : existingTemplate.default_days;
    const nextSubcontractor =
      updates.subcontractor !== undefined ? updates.subcontractor?.trim() || null : existingTemplate.subcontractor;
    const nextBottleneckVendor =
      updates.bottleneck_vendor !== undefined
        ? updates.bottleneck_vendor?.trim() || null
        : existingTemplate.bottleneck_vendor;

    const templateUpdate = {
      phase_template_id: nextPhaseId,
      phase_name: nextPhase?.name ?? null,
      phase_order: nextPhase?.phase_order ?? 0,
      task_order: nextTaskOrder,
      scope: nextScope,
      subcontractor: nextSubcontractor,
      default_days: nextDefaultDays,
      bottleneck_vendor: nextBottleneckVendor
    };

    const { error } = await supabase.from('task_templates').update(templateUpdate).eq('id', templateId);
    if (error) throw error;

    const liveTasks = state.tasks.filter((task) => task.template_id === templateId);
    if (liveTasks.length > 0) {
      const projectPhaseMap = new Map<string, string | null>();
      if (nextPhaseId) {
        state.projectPhases.forEach((phase) => {
          if (phase.phase_template_id === nextPhaseId) {
            projectPhaseMap.set(phase.project_id, phase.id);
          }
        });
      }

      await Promise.all(
        liveTasks.map(async (task) => {
          const liveTaskUpdate: {
            name: string;
            phase_name: string | null;
            phase_order: number;
            task_order: number;
            project_phase_id: string | null;
            duration?: number;
            subcontractor?: string | null;
            bottleneck_vendor?: string | null;
          } = {
            name: nextScope,
            phase_name: nextPhase?.name ?? null,
            phase_order: nextPhase?.phase_order ?? 0,
            task_order: nextTaskOrder,
            project_phase_id: nextPhaseId ? projectPhaseMap.get(task.project_id) ?? null : null
          };

          if (task.duration === existingTemplate.default_days) {
            liveTaskUpdate.duration = nextDefaultDays;
          }

          if (task.subcontractor === existingTemplate.subcontractor) {
            liveTaskUpdate.subcontractor = nextSubcontractor;
          }

          if (task.bottleneck_vendor === existingTemplate.bottleneck_vendor) {
            liveTaskUpdate.bottleneck_vendor = nextBottleneckVendor;
          }

          const { error: liveTaskError } = await supabase.from('tasks').update(liveTaskUpdate).eq('id', task.id);
          if (liveTaskError) throw liveTaskError;
        })
      );
    }

    await get().fetchData();
  },

  deleteTaskTemplate: async (templateId: string) => {
    const { error } = await supabase.from('task_templates').delete().eq('id', templateId);
    if (error) throw error;

    await get().fetchData();
  },

  addTemplateDependency: async (predecessorId: string, successorId: string) => {
    const { error } = await supabase.from('template_dependencies').insert({
      id: crypto.randomUUID(),
      predecessor_id: predecessorId,
      successor_id: successorId
    });

    if (error) throw error;

    const state = get();
    const dependencyKeys = new Set(
      state.dependencies.map((dependency) => `${dependency.predecessor_id}:${dependency.successor_id}`)
    );
    const liveDependencyInserts: { predecessor_id: string; successor_id: string }[] = [];

    state.projects.forEach((project) => {
      const predecessorTask = state.tasks.find(
        (task) => task.project_id === project.id && task.template_id === predecessorId
      );
      const successorTask = state.tasks.find((task) => task.project_id === project.id && task.template_id === successorId);

      if (!predecessorTask || !successorTask) return;

      const liveKey = `${predecessorTask.id}:${successorTask.id}`;
      if (dependencyKeys.has(liveKey)) return;

      dependencyKeys.add(liveKey);
      liveDependencyInserts.push({
        predecessor_id: predecessorTask.id,
        successor_id: successorTask.id
      });
    });

    if (liveDependencyInserts.length > 0) {
      const { error: liveDependencyError } = await supabase.from('dependencies').insert(liveDependencyInserts);
      if (liveDependencyError) throw liveDependencyError;
    }

    await get().fetchData();
  },

  removeTemplateDependency: async (dependencyId: string) => {
    const state = get();
    const templateDependency = state.templateDependencies.find((dependency) => dependency.id === dependencyId);
    if (!templateDependency) throw new Error('Template dependency not found.');

    const { error } = await supabase.from('template_dependencies').delete().eq('id', dependencyId);
    if (error) throw error;

    await Promise.all(
      state.projects.map(async (project) => {
        const predecessorTask = state.tasks.find(
          (task) => task.project_id === project.id && task.template_id === templateDependency.predecessor_id
        );
        const successorTask = state.tasks.find(
          (task) => task.project_id === project.id && task.template_id === templateDependency.successor_id
        );

        if (!predecessorTask || !successorTask) return;

        const { error: liveDependencyError } = await supabase
          .from('dependencies')
          .delete()
          .eq('predecessor_id', predecessorTask.id)
          .eq('successor_id', successorTask.id);

        if (liveDependencyError) throw liveDependencyError;
      })
    );

    await get().fetchData();
  },

  deleteProject: async (projectId: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) {
      console.error('Failed to delete project', error);
      throw error;
    }

    await get().fetchData();
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
