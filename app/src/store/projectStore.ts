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
  manual_start?: string | null;
  manual_finish?: string | null;
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
    manual_start?: string | null;
    manual_finish?: string | null;
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
  manual_start: string | null;
  manual_finish: string | null;
}

interface DependencyRow {
  id: string;
  predecessor_id: string;
  successor_id: string;
}

interface ProjectPhaseRow {
  id: string;
  project_id: string;
  phase_template_id: string | null;
  name: string;
  phase_order: number;
}

type SanitizedProjectTaskDraft = {
  source_task_id: string | null;
  template_id: string | null;
  phase_template_id: string | null;
  task_order: number;
  scope: string;
  subcontractor: string | null;
  duration: number;
  bottleneck_vendor: string | null;
  lag: number;
  manual_start: string | null;
  manual_finish: string | null;
};

function sanitizeProjectTaskDrafts(tasks: ProjectTaskDraftInput[]): SanitizedProjectTaskDraft[] {
  return tasks
    .map((task) => ({
      source_task_id: task.source_task_id ?? null,
      template_id: task.template_id,
      phase_template_id: task.phase_template_id,
      task_order: Math.max(1, Math.trunc(task.task_order || 1)),
      scope: task.scope.trim(),
      subcontractor: task.subcontractor?.trim() || null,
      duration: Math.max(1, Math.trunc(task.duration || 1)),
      bottleneck_vendor: task.bottleneck_vendor?.trim() || null,
      lag: Math.trunc(task.lag || 0),
      manual_start: task.manual_start || null,
      manual_finish: task.manual_finish || null
    }))
    .filter((task) => task.scope.length > 0);
}

function isManualDateColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const errorRecord = error as Record<string, unknown>;
  const message = [errorRecord.message, errorRecord.details, errorRecord.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return (
    (message.includes('manual_start') || message.includes('manual_finish')) &&
    (message.includes('column') || message.includes('schema cache'))
  );
}

function stripManualDateFields<T extends Record<string, unknown>>(record: T) {
  const { manual_start: _manualStart, manual_finish: _manualFinish, ...rest } = record;
  return rest;
}

function formatDbError(error: unknown, fallback: string): Error {
  if (!error || typeof error !== 'object') {
    return new Error(fallback);
  }

  const errorRecord = error as Record<string, unknown>;
  const code = typeof errorRecord.code === 'string' ? errorRecord.code : null;
  const message = typeof errorRecord.message === 'string' ? errorRecord.message : null;
  const details = typeof errorRecord.details === 'string' ? errorRecord.details : null;
  const hint = typeof errorRecord.hint === 'string' ? errorRecord.hint : null;

  const parts = [fallback, code ? `code=${code}` : null, message, details, hint].filter(
    (part): part is string => Boolean(part)
  );

  return new Error(parts.join(' | '));
}

function logProjectUpdateEvent(
  projectId: string,
  step: string,
  details: Record<string, unknown> = {}
) {
  console.info('[project-update]', {
    projectId,
    step,
    ...details
  });
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
  updateTaskFields: (
    taskId: string,
    updates: {
      duration?: number;
      lag?: number;
      subcontractor?: string | null;
      bottleneck_vendor?: string | null;
      manual_start?: string | null;
      manual_finish?: string | null;
    }
  ) => Promise<void>;
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

export const useProjectStore = create<ProjectState>((set, get) => {
  const updateTaskFields = async (
    taskId: string,
    updates: {
      duration?: number;
      lag?: number;
      subcontractor?: string | null;
      bottleneck_vendor?: string | null;
      manual_start?: string | null;
      manual_finish?: string | null;
    }
  ) => {
    const { tasks, projects, dependencies } = get();
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;

    const normalizedUpdates: Partial<EngineTask> = {};
    const entry: TaskUndoEntry = {
      type: 'TASK_UPDATE',
      taskId,
      prev: {}
    };

    if (updates.duration !== undefined) {
      const nextDuration = Math.max(1, updates.duration);
      if (nextDuration !== task.duration) {
        normalizedUpdates.duration = nextDuration;
        entry.prev.duration = task.duration;
      }
    }

    if (updates.lag !== undefined && updates.lag !== task.lag) {
      normalizedUpdates.lag = updates.lag;
      entry.prev.lag = task.lag;
    }

    if (updates.subcontractor !== undefined) {
      const nextSubcontractor = updates.subcontractor?.trim() || null;
      if (nextSubcontractor !== task.subcontractor) {
        normalizedUpdates.subcontractor = nextSubcontractor;
        entry.prev.subcontractor = task.subcontractor;
      }
    }

    if (updates.bottleneck_vendor !== undefined) {
      const nextBottleneckVendor = updates.bottleneck_vendor?.trim() || null;
      if (nextBottleneckVendor !== task.bottleneck_vendor) {
        normalizedUpdates.bottleneck_vendor = nextBottleneckVendor;
        entry.prev.bottleneck_vendor = task.bottleneck_vendor;
      }
    }

    if (updates.manual_start !== undefined) {
      const nextManualStart = updates.manual_start || null;
      if (nextManualStart !== task.manual_start) {
        normalizedUpdates.manual_start = nextManualStart;
        entry.prev.manual_start = task.manual_start;
      }
    }

    if (updates.manual_finish !== undefined) {
      const nextManualFinish = updates.manual_finish || null;
      if (nextManualFinish !== task.manual_finish) {
        normalizedUpdates.manual_finish = nextManualFinish;
        entry.prev.manual_finish = task.manual_finish;
      }
    }

    if (Object.keys(normalizedUpdates).length === 0) {
      return;
    }

    const recalculated = calculateScheduleEngine(
      projects,
      tasks.map((candidate) => (candidate.id === taskId ? { ...candidate, ...normalizedUpdates } : candidate)),
      dependencies
    );

    set((state) => ({
      tasks: recalculated,
      undoStack: [entry, ...state.undoStack].slice(0, 50),
      redoStack: []
    }));

    let { error } = await supabase.from('tasks').update(normalizedUpdates).eq('id', taskId);
    if (error && isManualDateColumnError(error)) {
      ({ error } = await supabase.from('tasks').update(stripManualDateFields(normalizedUpdates)).eq('id', taskId));
    }
    if (error) {
      console.error('Failed to sync task update to DB:', error);
    }
  };

  return ({
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
        manual_start: t.manual_start,
        manual_finish: t.manual_finish,
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

    const sanitizedTasks = sanitizeProjectTaskDrafts(tasks);

    if (sanitizedTasks.length === 0) throw new Error('Add at least one scope before creating a project.');

    // 1. Insert Project
    const { data: projData, error: projErr } = await supabase
      .from('projects')
      .insert({ name: trimmedName, start_date: startDate })
      .select()
      .single();

    if (projErr || !projData) {
      throw formatDbError(projErr, 'Failed to create project record.');
    }

    const projectId = projData.id;

    if (sanitizedTasks.length === 0) {
      await get().fetchData();
      return;
    }

    // 2. Insert Project Phases from Templates
    const usedPhaseIds = new Set(
      sanitizedTasks.map((task) => task.phase_template_id).filter((phaseTemplateId): phaseTemplateId is string => Boolean(phaseTemplateId))
    );
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
        throw formatDbError(phasesErr, 'Failed to insert project phases.');
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
        lag: task.lag ?? 0,
        manual_start: task.manual_start,
        manual_finish: task.manual_finish
      };
    });

    let { data: insertedTasks, error: tasksErr } = await supabase
      .from('tasks')
      .insert(taskInserts)
      .select();

    if (tasksErr && isManualDateColumnError(tasksErr)) {
      ({ data: insertedTasks, error: tasksErr } = await supabase
        .from('tasks')
        .insert(taskInserts.map((task) => stripManualDateFields(task)))
        .select());
    }

    if (tasksErr || !insertedTasks) {
      throw formatDbError(tasksErr, 'Failed to insert project tasks.');
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
      if (depErr) throw formatDbError(depErr, 'Failed to insert project dependencies.');
    }

    // Refresh everything to reflect changes
    await get().fetchData();
  },

  updateProjectFromDraft: async ({ projectId, name, startDate, tasks }) => {
    const state = get();
    const { phaseTemplates, dependencies, tasks: existingTasks } = state;
    const existingProject = state.projects.find((project) => project.id === projectId);
    if (!existingProject) throw new Error('Project not found.');
    let failingStep = 'initialization';

    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Project name is required.');
    if (!startDate) throw new Error('Project start date is required.');

    const sanitizedTasks = sanitizeProjectTaskDrafts(tasks);

    if (sanitizedTasks.length === 0) throw new Error('Add at least one scope before saving this project.');

    const existingProjectTasks = existingTasks.filter((task) => task.project_id === projectId);
    const existingProjectPhases = state.projectPhases.filter((phase) => phase.project_id === projectId);
    const existingProjectTaskIds = new Set(existingProjectTasks.map((task) => task.id));
    const existingTaskById = new Map(existingProjectTasks.map((task) => [task.id, task]));
    const existingPhaseByTemplateId = new Map(
      existingProjectPhases
        .filter((phase) => phase.phase_template_id)
        .map((phase) => [phase.phase_template_id as string, phase])
    );
    const phaseById = new Map(phaseTemplates.map((phase) => [phase.id, phase]));
    const usedPhaseIds = new Set(
      sanitizedTasks.map((task) => task.phase_template_id).filter((phaseTemplateId): phaseTemplateId is string => Boolean(phaseTemplateId))
    );
    const retainedSourceTaskIds = new Set(
      sanitizedTasks.map((task) => task.source_task_id).filter((taskId): taskId is string => Boolean(taskId))
    );

    const projectDependencies = dependencies.filter(
      (dependency) =>
        existingProjectTaskIds.has(dependency.predecessor_id) || existingProjectTaskIds.has(dependency.successor_id)
    );

    const projectDependencyPairs = projectDependencies
      .filter(
        (dependency) =>
          existingProjectTaskIds.has(dependency.predecessor_id) && existingProjectTaskIds.has(dependency.successor_id)
      )
      .map((dependency) => ({
        predecessor_source_task_id: dependency.predecessor_id,
        successor_source_task_id: dependency.successor_id
      }))
      .filter(
        (dependency) =>
          retainedSourceTaskIds.has(dependency.predecessor_source_task_id) &&
          retainedSourceTaskIds.has(dependency.successor_source_task_id)
      );
    const createdTaskIds: string[] = [];
    const removedTaskIds = existingProjectTasks
      .filter((task) => !retainedSourceTaskIds.has(task.id))
      .map((task) => task.id);

    logProjectUpdateEvent(projectId, 'start', {
      draftTaskCount: sanitizedTasks.length,
      existingTaskCount: existingProjectTasks.length,
      existingPhaseCount: existingProjectPhases.length,
      existingDependencyCount: projectDependencies.length,
      removedTaskCount: removedTaskIds.length,
      retainedTaskCount: retainedSourceTaskIds.size
    });

    try {
      failingStep = 'update_project_record';
      const { error: projectErr } = await supabase
        .from('projects')
        .update({ name: trimmedName, start_date: startDate })
        .eq('id', projectId);

      if (projectErr) throw projectErr;
      logProjectUpdateEvent(projectId, failingStep, { name: trimmedName, startDate });

      const phaseTemplateToProjectPhaseMap = new Map<string, string>();
      for (const phaseTemplateId of usedPhaseIds) {
        const phaseTemplate = phaseById.get(phaseTemplateId);
        if (!phaseTemplate) continue;

        const existingPhase = existingPhaseByTemplateId.get(phaseTemplateId);
        if (existingPhase) {
          phaseTemplateToProjectPhaseMap.set(phaseTemplateId, existingPhase.id);
          if (existingPhase.name !== phaseTemplate.name || existingPhase.phase_order !== phaseTemplate.phase_order) {
            failingStep = `update_project_phase:${existingPhase.id}`;
            const { error: updatePhaseError } = await supabase
              .from('project_phases')
              .update({ name: phaseTemplate.name, phase_order: phaseTemplate.phase_order })
              .eq('id', existingPhase.id);
            if (updatePhaseError) throw updatePhaseError;
            logProjectUpdateEvent(projectId, failingStep, {
              phaseTemplateId,
              projectPhaseId: existingPhase.id,
              phaseName: phaseTemplate.name
            });
          }
          continue;
        }

        failingStep = `insert_project_phase:${phaseTemplateId}`;
        const { data: insertedPhase, error: insertPhaseError } = await supabase
          .from('project_phases')
          .insert({
            project_id: projectId,
            phase_template_id: phaseTemplate.id,
            name: phaseTemplate.name,
            phase_order: phaseTemplate.phase_order
          })
          .select()
          .single();

        if (insertPhaseError || !insertedPhase) {
          throw insertPhaseError ?? new Error('Failed to save project phases.');
        }

        logProjectUpdateEvent(projectId, failingStep, {
          phaseTemplateId,
          projectPhaseId: insertedPhase.id,
          phaseName: insertedPhase.name
        });
        phaseTemplateToProjectPhaseMap.set(phaseTemplateId, insertedPhase.id);
      }

      const resolvedTaskIdBySourceTaskId = new Map<string, string>();

      for (const task of sanitizedTasks) {
        const phase = task.phase_template_id ? phaseById.get(task.phase_template_id) ?? null : null;
        const taskPayload = {
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
          lag: task.lag,
          manual_start: task.manual_start,
          manual_finish: task.manual_finish
        };

        if (task.source_task_id) {
          const existingTask = existingTaskById.get(task.source_task_id);
          if (!existingTask) {
            throw new Error('A project task could not be matched during save.');
          }

          resolvedTaskIdBySourceTaskId.set(task.source_task_id, existingTask.id);

          const hasChanges =
            existingTask.project_phase_id !== taskPayload.project_phase_id ||
            existingTask.template_id !== taskPayload.template_id ||
            existingTask.name !== taskPayload.name ||
            existingTask.phase_name !== taskPayload.phase_name ||
            (existingTask.phase_order ?? 0) !== taskPayload.phase_order ||
            (existingTask.task_order ?? 0) !== taskPayload.task_order ||
            existingTask.subcontractor !== taskPayload.subcontractor ||
            existingTask.bottleneck_vendor !== taskPayload.bottleneck_vendor ||
            (existingTask.duration ?? 1) !== taskPayload.duration ||
            (existingTask.lag ?? 0) !== taskPayload.lag ||
            (existingTask.manual_start ?? null) !== taskPayload.manual_start ||
            (existingTask.manual_finish ?? null) !== taskPayload.manual_finish;

          if (!hasChanges) continue;

          failingStep = `update_task:${existingTask.id}`;
          let { error: updateTaskError } = await supabase.from('tasks').update(taskPayload).eq('id', existingTask.id);
          if (updateTaskError && isManualDateColumnError(updateTaskError)) {
            logProjectUpdateEvent(projectId, `${failingStep}:manual-date-fallback`, {
              taskId: existingTask.id,
              sourceTaskId: task.source_task_id
            });
            ({ error: updateTaskError } = await supabase
              .from('tasks')
              .update(stripManualDateFields(taskPayload))
              .eq('id', existingTask.id));
          }
          if (updateTaskError) throw updateTaskError;
          logProjectUpdateEvent(projectId, failingStep, {
            taskId: existingTask.id,
            sourceTaskId: task.source_task_id,
            scope: task.scope
          });
          continue;
        }

        failingStep = `insert_task:${task.scope}`;
        let { data: insertedTask, error: insertTaskError } = await supabase
          .from('tasks')
          .insert(taskPayload)
          .select()
          .single();

        if (insertTaskError && isManualDateColumnError(insertTaskError)) {
          logProjectUpdateEvent(projectId, `${failingStep}:manual-date-fallback`, {
            scope: task.scope
          });
          ({ data: insertedTask, error: insertTaskError } = await supabase
            .from('tasks')
            .insert(stripManualDateFields(taskPayload))
            .select()
            .single());
        }

        if (insertTaskError || !insertedTask) {
          throw insertTaskError ?? new Error('Failed to save project tasks.');
        }

        createdTaskIds.push(insertedTask.id);
        logProjectUpdateEvent(projectId, failingStep, {
          taskId: insertedTask.id,
          scope: task.scope
        });
      }

      const desiredDependencyKeys = new Set<string>(
        projectDependencyPairs
          .map((dependency) => {
            const predecessorId = resolvedTaskIdBySourceTaskId.get(dependency.predecessor_source_task_id);
            const successorId = resolvedTaskIdBySourceTaskId.get(dependency.successor_source_task_id);
            if (!predecessorId || !successorId) return null;
            return `${predecessorId}->${successorId}`;
          })
          .filter((key): key is string => Boolean(key))
      );

      const existingDependencyByKey = new Map<string, EngineDependency>(
        projectDependencies
          .filter(
            (dependency) =>
              retainedSourceTaskIds.has(dependency.predecessor_id) &&
              retainedSourceTaskIds.has(dependency.successor_id)
          )
          .map((dependency) => [`${dependency.predecessor_id}->${dependency.successor_id}`, dependency] as const)
      );

      const dependencyIdsToDelete = projectDependencies
        .filter((dependency) => {
          const key = `${dependency.predecessor_id}->${dependency.successor_id}`;
          return !desiredDependencyKeys.has(key);
        })
        .map((dependency) => dependency.id);

      if (dependencyIdsToDelete.length > 0) {
        failingStep = 'delete_dependencies';
        const { error: deleteDependenciesError } = await supabase.from('dependencies').delete().in('id', dependencyIdsToDelete);
        if (deleteDependenciesError) throw deleteDependenciesError;
        logProjectUpdateEvent(projectId, failingStep, {
          deletedDependencyCount: dependencyIdsToDelete.length
        });
      }

      const dependencyInserts = Array.from(desiredDependencyKeys)
        .filter((key) => !existingDependencyByKey.has(key))
        .map((key) => {
          const [predecessor_id, successor_id] = key.split('->');
          return { predecessor_id, successor_id };
        });

      if (dependencyInserts.length > 0) {
        failingStep = 'insert_dependencies';
        const { error: insertDependenciesError } = await supabase.from('dependencies').insert(dependencyInserts);
        if (insertDependenciesError) throw insertDependenciesError;
        logProjectUpdateEvent(projectId, failingStep, {
          insertedDependencyCount: dependencyInserts.length
        });
      }

      if (removedTaskIds.length > 0) {
        failingStep = 'delete_removed_tasks';
        const { error: deleteTasksError } = await supabase.from('tasks').delete().in('id', removedTaskIds);
        if (deleteTasksError) throw deleteTasksError;
        logProjectUpdateEvent(projectId, failingStep, {
          removedTaskCount: removedTaskIds.length,
          removedTaskIds
        });
      }

      const phaseIdsToDelete = existingProjectPhases
        .filter((phase) => !phase.phase_template_id || !usedPhaseIds.has(phase.phase_template_id))
        .map((phase) => phase.id);

      if (phaseIdsToDelete.length > 0) {
        failingStep = 'delete_unused_phases';
        const { error: deletePhasesError } = await supabase.from('project_phases').delete().in('id', phaseIdsToDelete);
        if (deletePhasesError) throw deletePhasesError;
        logProjectUpdateEvent(projectId, failingStep, {
          deletedPhaseCount: phaseIdsToDelete.length,
          deletedPhaseIds: phaseIdsToDelete
        });
      }

      failingStep = 'refresh_project_data';
      await get().fetchData();
      logProjectUpdateEvent(projectId, 'completed', {
        createdTaskCount: createdTaskIds.length,
        removedTaskCount: removedTaskIds.length
      });
    } catch (error) {
      console.error('Failed to update project draft.', {
        projectId,
        failingStep,
        createdTaskIds,
        removedTaskIds,
        error
      });
      await get().fetchData();
      throw formatDbError(error, `Failed to update project during ${failingStep}.`);
    }
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

  updateTaskFields,

  updateTaskDuration: async (taskId: string, duration: number) => {
    await updateTaskFields(taskId, { duration });
  },

  updateTaskLag: async (taskId: string, lag: number) => {
    await updateTaskFields(taskId, { lag });
  },

  updateTaskSubcontractor: async (taskId: string, subcontractor: string | null, bottleneck_vendor: string | null) => {
    await updateTaskFields(taskId, { subcontractor, bottleneck_vendor });
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
  });
});
