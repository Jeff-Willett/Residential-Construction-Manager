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

function buildDraftTasks(
  templates: ReturnType<typeof useProjectStore.getState>['templates']
): ProjectTaskDraft[] {
  return templates.map((template) => ({
    localId: crypto.randomUUID(),
    template_id: template.id,
    phase_template_id: template.phase_template_id,
    task_order: template.task_order,
    scope: template.scope,
    subcontractor: template.subcontractor,
    duration: template.default_days,
    bottleneck_vendor: template.bottleneck_vendor
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

export function AddProjectModal({ onClose }: { onClose: () => void }) {
  const { phaseTemplates, templates, templateDependencies, addProjectFromDraft } = useProjectStore(
    useShallow((state) => ({
      phaseTemplates: state.phaseTemplates,
      templates: state.templates,
      templateDependencies: state.templateDependencies,
      addProjectFromDraft: state.addProjectFromDraft
    }))
  );

  const [projectName, setProjectName] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [taskDrafts, setTaskDrafts] = useState<ProjectTaskDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTaskDrafts(buildDraftTasks(templates));
  }, [templates]);

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
    const project: Project = {
      id: 'draft-project',
      name: projectName.trim() || 'Draft Project',
      start_date: startDate || new Date().toISOString().split('T')[0]
    };

    const draftTasks: EngineTask[] = taskDrafts
      .filter((draft) => draft.scope.trim().length > 0)
      .map((draft) => {
        const phase = draft.phase_template_id ? phaseById.get(draft.phase_template_id) ?? null : null;
        return {
          id: draft.localId,
          project_id: project.id,
          project_phase_id: draft.phase_template_id,
          template_id: draft.template_id,
          name: draft.scope.trim(),
          phase_name: phase?.name ?? null,
          phase_order: phase?.phase_order ?? 0,
          task_order: Math.max(1, draft.task_order),
          subcontractor: draft.subcontractor,
          bottleneck_vendor: draft.bottleneck_vendor,
          duration: Math.max(1, draft.duration),
          lag: 0
        };
      });

    const localIdByTemplateId = new Map<string, string>();
    taskDrafts.forEach((draft) => {
      if (draft.template_id && draft.scope.trim()) {
        localIdByTemplateId.set(draft.template_id, draft.localId);
      }
    });

    const draftDependencies: EngineDependency[] = templateDependencies
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
      calculateScheduleEngine([project], draftTasks, draftDependencies).map((task) => [task.id, task])
    );
  }, [phaseById, projectName, startDate, taskDrafts, templateDependencies]);

  const updateDraft = (localId: string, updates: Partial<ProjectTaskDraft>) => {
    setTaskDrafts((current) =>
      normalizeTaskOrder(current.map((draft) => (draft.localId === localId ? { ...draft, ...updates } : draft)))
    );
  };

  const buildBlankScope = (phaseTemplateId: string | null, taskOrder: number): ProjectTaskDraft => ({
    localId: crypto.randomUUID(),
    template_id: null,
    phase_template_id: phaseTemplateId,
    task_order: taskOrder,
    scope: '',
    subcontractor: null,
    duration: 1,
    bottleneck_vendor: null
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

  const handleCreateProject = async () => {
    setIsSaving(true);
    setError(null);

    try {
      await addProjectFromDraft({
        name: projectName,
        startDate,
        tasks: taskDrafts.map(({ localId: _localId, ...draft }) => draft)
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create project.');
    } finally {
      setIsSaving(false);
    }
  };

  const createDisabled =
    isSaving || !projectName.trim() || !startDate || taskDrafts.every((draft) => !draft.scope.trim());

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4">
      <div className="h-full w-full rounded-3xl border border-slate-700 bg-slate-900 shadow-[0_30px_120px_rgba(0,0,0,0.55)] overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/80 px-6 py-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-400">Issue 16</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-100">Create Project From Template</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">
                Start with the current schedule template, customize the scopes for this one project, then save it into
                the gantt without changing the master template studio.
              </p>
            </div>
            <button
              onClick={onClose}
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
                  No template scopes found yet. Add a scope above to create the first project draft item.
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
                      <div className="min-w-[1260px]">
                        <div className="border-b border-slate-800 bg-slate-950/60 px-4 py-2">
                          <div className="grid gap-2 xl:grid-cols-[150px_56px_minmax(220px,1.6fr)_minmax(150px,1fr)_72px_minmax(150px,1fr)_92px_92px_152px]">
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
                          <div className="grid gap-2 xl:grid-cols-[150px_56px_minmax(220px,1.6fr)_minmax(150px,1fr)_72px_minmax(150px,1fr)_92px_92px_152px]">
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
                            <div className="flex h-9 items-center rounded-md border border-slate-800 bg-slate-950 px-2">
                              <div className="text-sm text-slate-200 whitespace-nowrap">
                                {scheduledDrafts.get(draft.localId)?.calculated_start ?? '--'}
                              </div>
                            </div>
                            <div className="flex h-9 items-center rounded-md border border-slate-800 bg-slate-950 px-2">
                              <div className="text-sm text-slate-200 whitespace-nowrap">
                                {scheduledDrafts.get(draft.localId)?.calculated_finish ?? '--'}
                              </div>
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
            </div>
          </div>

          <div className="border-t border-slate-800 bg-slate-950/80 px-6 py-4">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
              <div className="text-sm text-slate-400">
                {error ? <span className="text-red-300">{error}</span> : 'Changes here affect only the project you are creating.'}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="rounded-2xl border border-slate-700 px-4 py-3 text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  disabled={createDisabled}
                  onClick={handleCreateProject}
                  className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-medium text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none"
                >
                  <Save size={16} />
                  {isSaving ? 'Creating Project...' : 'Create Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
