import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Plus, Save, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import {
  useProjectStore,
  type PhaseTemplate,
  type ProjectTaskDraftInput
} from '../store/projectStore';
import { calculateScheduleEngine, type EngineDependency, type EngineTask, type Project } from '../utils/schedulingEngine';

type ProjectTaskDraft = ProjectTaskDraftInput & {
  localId: string;
};

type AddProjectModalProps =
  | {
      mode?: 'create';
      onClose: () => void;
    }
  | {
      mode: 'edit';
      projectId: string;
      onClose: () => void;
    };

function buildDraftTasks(
  templates: ReturnType<typeof useProjectStore.getState>['templates']
): ProjectTaskDraft[] {
  return templates.map((template) => ({
    localId: crypto.randomUUID(),
    source_task_id: null,
    template_id: template.id,
    phase_template_id: template.phase_template_id,
    task_order: template.task_order,
    scope: template.scope,
    subcontractor: template.subcontractor,
    duration: template.default_days,
    bottleneck_vendor: template.bottleneck_vendor,
    lag: 0,
    manual_start: null,
    manual_finish: null
  }));
}

function phaseLabel(phase: PhaseTemplate | undefined) {
  if (!phase) return 'Unphased scopes';
  return `${phase.phase_order}. ${phase.name}`;
}

function normalizeTaskOrder(drafts: ProjectTaskDraft[]): ProjectTaskDraft[] {
  const grouped = new Map<string, ProjectTaskDraft[]>();

  drafts.forEach((draft) => {
    const key = draft.phase_template_id ?? 'unphased';
    const next = grouped.get(key) ?? [];
    next.push(draft);
    grouped.set(key, next);
  });

  grouped.forEach((group) => {
    group
      .slice()
      .sort((a, b) => {
        if (a.task_order !== b.task_order) return a.task_order - b.task_order;
        return a.scope.localeCompare(b.scope);
      })
      .forEach((draft, index) => {
        draft.task_order = index + 1;
      });
  });

  return drafts;
}

function buildDraftTasksFromProject(
  projectId: string,
  tasks: ReturnType<typeof useProjectStore.getState>['tasks'],
  projectPhases: ReturnType<typeof useProjectStore.getState>['projectPhases']
): ProjectTaskDraft[] {
  const phaseTemplateIdByProjectPhaseId = new Map(
    projectPhases.map((phase) => [phase.id, phase.phase_template_id])
  );

  return tasks
    .filter((task) => task.project_id === projectId)
    .slice()
    .sort((a, b) => {
      if (a.phase_order !== b.phase_order) return a.phase_order - b.phase_order;
      if (a.task_order !== b.task_order) return a.task_order - b.task_order;
      return a.name.localeCompare(b.name);
    })
    .map((task) => ({
      localId: crypto.randomUUID(),
      source_task_id: task.id,
      template_id: task.template_id,
      phase_template_id: task.project_phase_id ? phaseTemplateIdByProjectPhaseId.get(task.project_phase_id) ?? null : null,
      task_order: task.task_order,
      scope: task.name,
      subcontractor: task.subcontractor,
      duration: task.duration,
      bottleneck_vendor: task.bottleneck_vendor,
      lag: task.lag,
      manual_start: task.manual_start ?? null,
      manual_finish: task.manual_finish ?? null
    }));
}

export function AddProjectModal(props: AddProjectModalProps) {
  const isEditMode = props.mode === 'edit';
  const projectId = isEditMode ? props.projectId : null;

  const {
    projects,
    tasks,
    dependencies,
    projectPhases,
    phaseTemplates,
    templates,
    templateDependencies,
    addProjectFromDraft,
    updateProjectFromDraft,
    deleteProject
  } = useProjectStore(
    useShallow((state) => ({
      projects: state.projects,
      tasks: state.tasks,
      dependencies: state.dependencies,
      projectPhases: state.projectPhases,
      phaseTemplates: state.phaseTemplates,
      templates: state.templates,
      templateDependencies: state.templateDependencies,
      addProjectFromDraft: state.addProjectFromDraft,
      updateProjectFromDraft: state.updateProjectFromDraft,
      deleteProject: state.deleteProject
    }))
  );

  const project = useMemo(
    () => (projectId ? projects.find((entry) => entry.id === projectId) ?? null : null),
    [projectId, projects]
  );

  const [projectName, setProjectName] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [taskDrafts, setTaskDrafts] = useState<ProjectTaskDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isEditMode) {
      if (!project) return;
      setProjectName(project.name);
      setStartDate(project.start_date);
      setTaskDrafts(normalizeTaskOrder(buildDraftTasksFromProject(project.id, tasks, projectPhases)));
      return;
    }

    setProjectName('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setTaskDrafts(buildDraftTasks(templates));
  }, [isEditMode, project, projectPhases, tasks, templates]);

  const phaseById = useMemo(() => new Map(phaseTemplates.map((phase) => [phase.id, phase])), [phaseTemplates]);

  const groupedDrafts = useMemo(() => {
    const buckets = new Map<string, ProjectTaskDraft[]>();

    taskDrafts
      .slice()
      .sort((a, b) => {
        const phaseA = a.phase_template_id ? phaseById.get(a.phase_template_id)?.phase_order ?? 999 : 999;
        const phaseB = b.phase_template_id ? phaseById.get(b.phase_template_id)?.phase_order ?? 999 : 999;
        if (phaseA !== phaseB) return phaseA - phaseB;
        if (a.task_order !== b.task_order) return a.task_order - b.task_order;
        return a.scope.localeCompare(b.scope);
      })
      .forEach((draft) => {
        const key = draft.phase_template_id ?? 'unphased';
        const next = buckets.get(key) ?? [];
        next.push(draft);
        buckets.set(key, next);
      });

    return buckets;
  }, [phaseById, taskDrafts]);

  const orderedSections = useMemo(() => {
    const phased = phaseTemplates
      .slice()
      .sort((a, b) => a.phase_order - b.phase_order)
      .map((phase) => ({
        key: phase.id,
        title: phaseLabel(phase),
        subtitle: `${groupedDrafts.get(phase.id)?.length ?? 0} scopes in this phase`,
        tasks: groupedDrafts.get(phase.id) ?? []
      }))
      .filter((section) => section.tasks.length > 0);

    const unphased = groupedDrafts.get('unphased') ?? [];
    if (unphased.length > 0) {
      phased.push({
        key: 'unphased',
        title: 'Unphased scopes',
        subtitle: `${unphased.length} scopes not assigned to a phase`,
        tasks: unphased
      });
    }

    return phased;
  }, [groupedDrafts, phaseTemplates]);

  const scheduledDrafts = useMemo(() => {
    const draftProject: Project = {
      id: projectId ?? 'draft-project',
      name: projectName.trim() || (isEditMode ? project?.name ?? 'Project Draft' : 'Draft Project'),
      start_date: startDate || project?.start_date || new Date().toISOString().split('T')[0]
    };

    const draftTasks: EngineTask[] = taskDrafts
      .filter((draft) => draft.scope.trim().length > 0)
      .map((draft) => {
        const phase = draft.phase_template_id ? phaseById.get(draft.phase_template_id) ?? null : null;
        return {
          id: draft.localId,
          project_id: draftProject.id,
          project_phase_id: draft.phase_template_id,
          template_id: draft.template_id,
          name: draft.scope.trim(),
          phase_name: phase?.name ?? null,
          phase_order: phase?.phase_order ?? 0,
          task_order: Math.max(1, draft.task_order),
          subcontractor: draft.subcontractor,
          bottleneck_vendor: draft.bottleneck_vendor,
          duration: Math.max(1, draft.duration),
          lag: draft.lag ?? 0,
          manual_start: draft.manual_start ?? null,
          manual_finish: draft.manual_finish ?? null
        };
      });

    const localIdByTemplateId = new Map<string, string>();
    const localIdBySourceTaskId = new Map<string, string>();

    taskDrafts.forEach((draft) => {
      if (draft.template_id && draft.scope.trim()) {
        localIdByTemplateId.set(draft.template_id, draft.localId);
      }
      if (draft.source_task_id && draft.scope.trim()) {
        localIdBySourceTaskId.set(draft.source_task_id, draft.localId);
      }
    });

    const relevantDependencies: EngineDependency[] = isEditMode
      ? dependencies
          .map((dependency) => {
            const predecessorId = localIdBySourceTaskId.get(dependency.predecessor_id);
            const successorId = localIdBySourceTaskId.get(dependency.successor_id);
            if (!predecessorId || !successorId) return null;

            return {
              id: dependency.id,
              predecessor_id: predecessorId,
              successor_id: successorId
            };
          })
          .filter((dependency): dependency is EngineDependency => Boolean(dependency))
      : templateDependencies
          .map((dependency) => {
            const predecessorId = localIdByTemplateId.get(dependency.predecessor_id);
            const successorId = localIdByTemplateId.get(dependency.successor_id);
            if (!predecessorId || !successorId) return null;

            return {
              id: dependency.id,
              predecessor_id: predecessorId,
              successor_id: successorId
            };
          })
          .filter((dependency): dependency is EngineDependency => Boolean(dependency));

    return new Map(
      calculateScheduleEngine([draftProject], draftTasks, relevantDependencies).map((task) => [task.id, task])
    );
  }, [dependencies, isEditMode, phaseById, project?.name, project?.start_date, projectId, projectName, startDate, taskDrafts, templateDependencies]);

  const updateDraft = (localId: string, updates: Partial<ProjectTaskDraft>) => {
    setTaskDrafts((current) =>
      normalizeTaskOrder(current.map((draft) => (draft.localId === localId ? { ...draft, ...updates } : draft)))
    );
  };

  const buildBlankScope = (phaseTemplateId: string | null, taskOrder: number): ProjectTaskDraft => ({
    localId: crypto.randomUUID(),
    source_task_id: null,
    template_id: null,
    phase_template_id: phaseTemplateId,
    task_order: taskOrder,
    scope: '',
    subcontractor: null,
    duration: 1,
    bottleneck_vendor: null,
    lag: 0,
    manual_start: null,
    manual_finish: null
  });

  const addScope = (phaseTemplateId: string | null = phaseTemplates[0]?.id ?? null) => {
    setTaskDrafts((current) => [
      ...normalizeTaskOrder(current),
      buildBlankScope(
        phaseTemplateId,
        current.filter((draft) => draft.phase_template_id === phaseTemplateId).length + 1
      )
    ]);
  };

  const insertScopeBelow = (localId: string) => {
    setTaskDrafts((current) => {
      const index = current.findIndex((draft) => draft.localId === localId);
      if (index === -1) return current;

      const target = current[index];
      const next = [...current];
      next.splice(index + 1, 0, buildBlankScope(target.phase_template_id, target.task_order + 1));
      return normalizeTaskOrder(next);
    });
  };

  const moveScope = (localId: string, direction: -1 | 1) => {
    setTaskDrafts((current) => {
      const normalized = normalizeTaskOrder([...current]);
      const index = normalized.findIndex((draft) => draft.localId === localId);
      if (index === -1) return normalized;

      const target = normalized[index];
      const phaseRows = normalized
        .filter((draft) => draft.phase_template_id === target.phase_template_id)
        .sort((a, b) => a.task_order - b.task_order);
      const phaseIndex = phaseRows.findIndex((draft) => draft.localId === localId);
      const swapTarget = phaseRows[phaseIndex + direction];
      if (!swapTarget) return normalized;

      const targetOrder = target.task_order;
      const swapOrder = swapTarget.task_order;

      return normalizeTaskOrder(
        normalized.map((draft) => {
          if (draft.localId === target.localId) {
            return { ...draft, task_order: swapOrder };
          }
          if (draft.localId === swapTarget.localId) {
            return { ...draft, task_order: targetOrder };
          }
          return draft;
        })
      );
    });
  };

  const removeScope = (localId: string) => {
    setTaskDrafts((current) => normalizeTaskOrder(current.filter((draft) => draft.localId !== localId)));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const sanitizedDrafts = taskDrafts.map(({ localId: _localId, ...draft }) => draft);
      if (isEditMode && projectId) {
        await updateProjectFromDraft({
          projectId,
          name: projectName,
          startDate,
          tasks: sanitizedDrafts
        });
      } else {
        await addProjectFromDraft({
          name: projectName,
          startDate,
          tasks: sanitizedDrafts
        });
      }
      props.onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditMode
            ? 'Unable to update project.'
            : 'Unable to create project.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!projectId || !project) return;
    if (deleteConfirmation !== project.name) {
      setDeleteError('Type the exact project name to enable deletion.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteProject(projectId);
      props.onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete project.');
    } finally {
      setIsDeleting(false);
    }
  };

  const saveDisabled =
    isSaving || !projectName.trim() || !startDate || taskDrafts.every((draft) => !draft.scope.trim());

  const heading = isEditMode ? 'Edit Project' : 'Create Project From Template';
  const description = isEditMode
    ? 'Update this project using the current scopes already in the gantt. Changes here affect only this project.'
    : 'Start with the current schedule template, customize the scopes for this one project, then save it into the gantt without changing the master template studio.';
  const footerMessage = error
    ? error
    : isEditMode
      ? 'Changes here affect only this project.'
      : 'Changes here affect only the project you are creating.';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4">
      <div className="h-full w-full rounded-3xl border border-slate-700 bg-slate-900 shadow-[0_30px_120px_rgba(0,0,0,0.55)] overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/80 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-400">
                {isEditMode ? 'Project Editor' : 'Issue 16'}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-100">{heading}</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">{description}</p>
            </div>
            <button
              onClick={props.onClose}
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
              <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_260px_auto]">
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Project Name
                    </span>
                    <input
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      placeholder="Enter project name"
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Project Start Date
                    </span>
                    <div className="relative">
                      <CalendarDays
                        size={16}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                      />
                      <input
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-10 pr-3 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </label>
                  <div className="flex items-end">
                    <button
                      onClick={() => addScope()}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/15"
                    >
                      <Plus size={16} />
                      Add Scope
                    </button>
                  </div>
                </div>
              </div>

              {orderedSections.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/50 p-10 text-center text-slate-400">
                  No scopes found yet. Add a scope above to create the first project item.
                </div>
              ) : (
                orderedSections.map((section) => (
                  <div key={section.key} className="rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden">
                    <div className="border-b border-slate-800 bg-slate-950/80 px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-100">{section.title}</div>
                          <div className="text-sm text-slate-500">{section.subtitle}</div>
                        </div>
                        <button
                          onClick={() => addScope(section.key === 'unphased' ? null : section.key)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/15"
                        >
                          <Plus size={15} />
                          Add Scope To Phase
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <div className="min-w-[1380px]">
                        <div className="border-b border-slate-800 bg-slate-950/60 px-4 py-2">
                          <div className="grid gap-2 xl:grid-cols-[150px_56px_minmax(220px,1.6fr)_minmax(150px,1fr)_72px_minmax(150px,1fr)_128px_128px_152px]">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Phase</div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Order</div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scope Item</div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Contractor</div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Days</div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Bottleneck</div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Start</div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Finish</div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</div>
                          </div>
                        </div>
                        <div className="divide-y divide-slate-800">
                          {section.tasks.map((draft) => (
                            <div key={draft.localId} className="px-4 py-2">
                              <div className="grid gap-2 xl:grid-cols-[150px_56px_minmax(220px,1.6fr)_minmax(150px,1fr)_72px_minmax(150px,1fr)_128px_128px_152px]">
                                <select
                                  value={draft.phase_template_id ?? ''}
                                  onChange={(event) =>
                                    updateDraft(draft.localId, {
                                      phase_template_id: event.target.value || null
                                    })
                                  }
                                  className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                                >
                                  <option value="">Unphased</option>
                                  {phaseTemplates
                                    .slice()
                                    .sort((a, b) => a.phase_order - b.phase_order)
                                    .map((phase) => (
                                      <option key={phase.id} value={phase.id}>
                                        {phase.phase_order}. {phase.name}
                                      </option>
                                    ))}
                                </select>
                                <input
                                  type="number"
                                  min="1"
                                  value={draft.task_order}
                                  onChange={(event) =>
                                    updateDraft(draft.localId, {
                                      task_order: Math.max(1, Number(event.target.value) || 1)
                                    })
                                  }
                                  className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                                />
                                <input
                                  value={draft.scope}
                                  onChange={(event) =>
                                    updateDraft(draft.localId, {
                                      scope: event.target.value
                                    })
                                  }
                                  placeholder="Scope name"
                                  className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                                />
                                <input
                                  value={draft.subcontractor ?? ''}
                                  onChange={(event) =>
                                    updateDraft(draft.localId, {
                                      subcontractor: event.target.value || null
                                    })
                                  }
                                  placeholder="Contractor"
                                  className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                                />
                                <input
                                  type="number"
                                  min="1"
                                  value={draft.duration}
                                  onChange={(event) =>
                                    updateDraft(draft.localId, {
                                      duration: Math.max(1, Number(event.target.value) || 1)
                                    })
                                  }
                                  className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                                />
                                <input
                                  value={draft.bottleneck_vendor ?? ''}
                                  onChange={(event) =>
                                    updateDraft(draft.localId, {
                                      bottleneck_vendor: event.target.value || null
                                    })
                                  }
                                  placeholder="Bottleneck vendor"
                                  className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                                />
                                <div className="relative">
                                  <CalendarDays
                                    size={14}
                                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"
                                  />
                                  <input
                                    type="date"
                                    value={draft.manual_start ?? scheduledDrafts.get(draft.localId)?.calculated_start ?? ''}
                                    onChange={(event) =>
                                      updateDraft(draft.localId, {
                                        manual_start: event.target.value || null
                                      })
                                    }
                                    className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 py-2 pl-7 pr-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                                  />
                                </div>
                                <div className="relative">
                                  <CalendarDays
                                    size={14}
                                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"
                                  />
                                  <input
                                    type="date"
                                    value={draft.manual_finish ?? scheduledDrafts.get(draft.localId)?.calculated_finish ?? ''}
                                    onChange={(event) =>
                                      updateDraft(draft.localId, {
                                        manual_finish: event.target.value || null
                                      })
                                    }
                                    className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 py-2 pl-7 pr-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                                  />
                                </div>
                                <div className="flex h-9 items-center gap-1">
                                  <button
                                    onClick={() => moveScope(draft.localId, -1)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900 font-medium text-slate-200 transition hover:bg-slate-800"
                                    title="Move up"
                                  >
                                    <ArrowUp size={14} />
                                  </button>
                                  <button
                                    onClick={() => moveScope(draft.localId, 1)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-900 font-medium text-slate-200 transition hover:bg-slate-800"
                                    title="Move down"
                                  >
                                    <ArrowDown size={14} />
                                  </button>
                                  <button
                                    onClick={() => insertScopeBelow(draft.localId)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 font-medium text-cyan-200 transition hover:bg-cyan-500/15"
                                    title="Insert scope below"
                                  >
                                    <Plus size={14} />
                                  </button>
                                  <button
                                    onClick={() => removeScope(draft.localId)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 font-medium text-red-200 transition hover:bg-red-500/15"
                                    title={`Remove ${draft.scope || 'scope'}`}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {isEditMode && project && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 overflow-hidden">
                  <div className="border-b border-red-500/20 bg-slate-950/40 px-5 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-red-400">
                      Delete Project
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      This removes the project and its schedule data. Type the project name exactly to confirm.
                    </p>
                  </div>
                  <div className="px-5 py-5">
                    <label className="block">
                      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Type Project Name
                      </div>
                      <input
                        value={deleteConfirmation}
                        onChange={(event) => {
                          setDeleteConfirmation(event.target.value);
                          if (deleteError) setDeleteError(null);
                        }}
                        placeholder={project.name}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-red-400 focus:outline-none"
                      />
                    </label>

                    <div className="mt-3 text-sm text-slate-500">
                      Required: <span className="font-medium text-slate-300">{project.name}</span>
                    </div>

                    {deleteError && <div className="mt-3 text-sm text-red-300">{deleteError}</div>}

                    <div className="mt-4">
                      <button
                        onClick={handleDelete}
                        disabled={isDeleting || deleteConfirmation !== project.name}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isDeleting ? 'Deleting...' : 'Delete Project'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-800 bg-slate-950/80 px-6 py-4">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
              <div className="text-sm text-slate-400">
                {error ? <span className="text-red-300">{footerMessage}</span> : footerMessage}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={props.onClose}
                  className="rounded-2xl border border-slate-700 px-4 py-3 text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  disabled={saveDisabled}
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                >
                  <Save size={16} />
                  {isSaving ? (isEditMode ? 'Saving...' : 'Creating...') : isEditMode ? 'Save Project' : 'Create Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
