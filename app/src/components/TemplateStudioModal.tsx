import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { ArrowRight, FileText, GitBranch, Info, Layers3, Plus, Save, Trash2, X } from 'lucide-react';
import { useProjectStore } from '../store/projectStore';

type StudioTab = 'overview' | 'phases' | 'templates' | 'dependencies';

type PhaseDraft = {
  name: string;
  phase_order: number;
};

type TemplateDraft = {
  phase_template_id: string | null;
  task_order: number;
  scope: string;
  subcontractor: string;
  default_days: number;
  bottleneck_vendor: string;
};

const STUDIO_TABS: { id: StudioTab; label: string; icon: typeof Info }[] = [
  { id: 'overview', label: 'Rules', icon: Info },
  { id: 'phases', label: 'Phases', icon: Layers3 },
  { id: 'templates', label: 'Scopes', icon: FileText },
  { id: 'dependencies', label: 'Dependencies', icon: GitBranch }
];

function buildTemplateDrafts(
  templates: ReturnType<typeof useProjectStore.getState>['templates']
): Record<string, TemplateDraft> {
  return Object.fromEntries(
    templates.map((template) => [
      template.id,
      {
        phase_template_id: template.phase_template_id,
        task_order: template.task_order,
        scope: template.scope,
        subcontractor: template.subcontractor ?? '',
        default_days: template.default_days,
        bottleneck_vendor: template.bottleneck_vendor ?? ''
      }
    ])
  );
}

function wouldCreateCycle(
  existingDependencies: ReturnType<typeof useProjectStore.getState>['templateDependencies'],
  predecessorId: string,
  successorId: string
) {
  const adjacency = new Map<string, string[]>();

  existingDependencies.forEach((dependency) => {
    const next = adjacency.get(dependency.predecessor_id) ?? [];
    next.push(dependency.successor_id);
    adjacency.set(dependency.predecessor_id, next);
  });

  const stack = [successorId];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === predecessorId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    (adjacency.get(current) ?? []).forEach((next) => {
      if (!visited.has(next)) stack.push(next);
    });
  }

  return false;
}

export function TemplateStudioModal({ onClose }: { onClose: () => void }) {
  const {
    phaseTemplates,
    templates,
    templateDependencies,
    tasks,
    projects,
    createPhaseTemplate,
    updatePhaseTemplate,
    deletePhaseTemplate,
    createTaskTemplate,
    updateTaskTemplate,
    deleteTaskTemplate,
    addTemplateDependency,
    removeTemplateDependency
  } = useProjectStore(
    useShallow((state) => ({
      phaseTemplates: state.phaseTemplates,
      templates: state.templates,
      templateDependencies: state.templateDependencies,
      tasks: state.tasks,
      projects: state.projects,
      createPhaseTemplate: state.createPhaseTemplate,
      updatePhaseTemplate: state.updatePhaseTemplate,
      deletePhaseTemplate: state.deletePhaseTemplate,
      createTaskTemplate: state.createTaskTemplate,
      updateTaskTemplate: state.updateTaskTemplate,
      deleteTaskTemplate: state.deleteTaskTemplate,
      addTemplateDependency: state.addTemplateDependency,
      removeTemplateDependency: state.removeTemplateDependency
    }))
  );

  const [activeTab, setActiveTab] = useState<StudioTab>('overview');
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [phaseDrafts, setPhaseDrafts] = useState<Record<string, PhaseDraft>>({});
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, TemplateDraft>>({});

  const [newPhase, setNewPhase] = useState<PhaseDraft>({ name: '', phase_order: phaseTemplates.length + 1 });
  const [newTemplate, setNewTemplate] = useState<TemplateDraft>({
    phase_template_id: phaseTemplates[0]?.id ?? null,
    task_order: templates.length + 1,
    scope: '',
    subcontractor: '',
    default_days: 1,
    bottleneck_vendor: ''
  });
  const [newDependency, setNewDependency] = useState({ predecessor_id: '', successor_id: '' });

  useEffect(() => {
    setPhaseDrafts(
      Object.fromEntries(
        phaseTemplates.map((phase) => [
          phase.id,
          {
            name: phase.name,
            phase_order: phase.phase_order
          }
        ])
      )
    );
  }, [phaseTemplates]);

  useEffect(() => {
    setTemplateDrafts(buildTemplateDrafts(templates));
  }, [templates]);

  useEffect(() => {
    setNewPhase((current) => ({
      ...current,
      phase_order: current.name ? current.phase_order : phaseTemplates.length + 1
    }));
  }, [phaseTemplates.length]);

  useEffect(() => {
    setNewTemplate((current) => ({
      ...current,
      phase_template_id: current.phase_template_id ?? phaseTemplates[0]?.id ?? null,
      task_order: current.scope ? current.task_order : templates.length + 1
    }));
  }, [phaseTemplates, templates.length]);

  const phaseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    templates.forEach((template) => {
      if (!template.phase_template_id) return;
      counts.set(template.phase_template_id, (counts.get(template.phase_template_id) ?? 0) + 1);
    });
    return counts;
  }, [templates]);

  const templateLabelById = useMemo(() => {
    return new Map(templates.map((template) => [template.id, template.scope]));
  }, [templates]);

  const templatesByPhase = useMemo(() => {
    const buckets = new Map<string, typeof templates>();
    const orderedTemplates = [...templates].sort((a, b) => {
      if (a.phase_order !== b.phase_order) return a.phase_order - b.phase_order;
      if (a.task_order !== b.task_order) return a.task_order - b.task_order;
      return a.scope.localeCompare(b.scope);
    });

    orderedTemplates.forEach((template) => {
      const key = template.phase_template_id ?? 'unphased';
      const next = buckets.get(key) ?? [];
      next.push(template);
      buckets.set(key, next);
    });

    return buckets;
  }, [templates]);

  const dependencyRows = useMemo(() => {
    return [...templateDependencies]
      .map((dependency) => ({
        ...dependency,
        predecessorLabel: templateLabelById.get(dependency.predecessor_id) ?? 'Unknown scope',
        successorLabel: templateLabelById.get(dependency.successor_id) ?? 'Unknown scope'
      }))
      .sort((a, b) => {
        if (a.successorLabel !== b.successorLabel) return a.successorLabel.localeCompare(b.successorLabel);
        return a.predecessorLabel.localeCompare(b.predecessorLabel);
      });
  }, [templateDependencies, templateLabelById]);

  const liveTemplateCount = useMemo(() => {
    return new Set(tasks.map((task) => task.template_id).filter(Boolean)).size;
  }, [tasks]);

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusyLabel(label);
    setError(null);
    setNotice(null);

    try {
      await action();
      setNotice(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong while saving.');
    } finally {
      setBusyLabel(null);
    }
  };

  const phaseNameForTemplate = (phaseId: string | null) => {
    if (!phaseId) return 'Unphased';
    return phaseTemplates.find((phase) => phase.id === phaseId)?.name ?? 'Unphased';
  };

  const dependencyDuplicate = useMemo(() => {
    return templateDependencies.some(
      (dependency) =>
        dependency.predecessor_id === newDependency.predecessor_id &&
        dependency.successor_id === newDependency.successor_id
    );
  }, [newDependency.predecessor_id, newDependency.successor_id, templateDependencies]);

  const dependencyCycle = useMemo(() => {
    if (!newDependency.predecessor_id || !newDependency.successor_id) return false;
    return wouldCreateCycle(templateDependencies, newDependency.predecessor_id, newDependency.successor_id);
  }, [newDependency.predecessor_id, newDependency.successor_id, templateDependencies]);

  const phaseDeleteBlocked = (phaseId: string) => (phaseCounts.get(phaseId) ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4">
      <div className="h-full w-full rounded-3xl border border-slate-700 bg-slate-900 shadow-[0_30px_120px_rgba(0,0,0,0.55)] overflow-hidden">
        <div className="flex h-full">
          <aside className="w-64 border-r border-slate-800 bg-slate-950/80 p-5 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-400 font-semibold">Issue 7</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-100">Schedule Template Studio</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Edit the spreadsheet-backed scheduling baseline from inside the app.
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Close template studio"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-2">
              {STUDIO_TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      'w-full rounded-2xl border px-4 py-3 text-left transition flex items-center gap-3',
                      active
                        ? 'border-cyan-500/40 bg-cyan-500/10 text-white shadow-[0_0_30px_rgba(6,182,212,0.15)]'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    )}
                  >
                    <Icon size={16} className={active ? 'text-cyan-300' : 'text-slate-500'} />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-auto rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Current footprint</div>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-2xl font-semibold text-slate-100">{phaseTemplates.length}</div>
                  <div className="text-sm text-slate-400">phase templates</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-100">{templates.length}</div>
                  <div className="text-sm text-slate-400">scope templates</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-100">{templateDependencies.length}</div>
                  <div className="text-sm text-slate-400">dependency rules</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-slate-100">{projects.length}</div>
                  <div className="text-sm text-slate-400">live projects loaded</div>
                </div>
              </div>
            </div>
          </aside>

          <section className="flex-1 flex flex-col min-w-0">
            <div className="border-b border-slate-800 px-6 py-4 flex items-center justify-between gap-4 bg-slate-900/70">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">
                  {STUDIO_TABS.find((tab) => tab.id === activeTab)?.label}
                </h3>
                <p className="text-sm text-slate-400">
                  Existing template edits sync to linked live schedule data when it is safe. New or removed rows stay template-only.
                </p>
              </div>
              <div className="min-h-6 text-sm text-right">
                {busyLabel && <span className="text-cyan-300">Saving: {busyLabel}</span>}
                {!busyLabel && notice && <span className="text-emerald-300">{notice}</span>}
                {!busyLabel && error && <span className="text-red-300">{error}</span>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'overview' && (
                <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">What this page controls</div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                        <div className="text-sm font-semibold text-slate-100">Phases</div>
                        <p className="mt-2 text-sm text-slate-400">
                          The major buckets shown in the gantt, plus the display order each project inherits.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                        <div className="text-sm font-semibold text-slate-100">Scope templates</div>
                        <p className="mt-2 text-sm text-slate-400">
                          Each spreadsheet line item, its default duration, and who owns that work.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                        <div className="text-sm font-semibold text-slate-100">Dependency rules</div>
                        <p className="mt-2 text-sm text-slate-400">
                          The predecessor and successor chain that determines when each scope becomes eligible to start.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                        <div className="text-sm font-semibold text-slate-100">Scheduling constraints</div>
                        <p className="mt-2 text-sm text-slate-400">
                          Bottleneck vendor assignments and default days that shape the resource-driven schedule.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">Engine rules in plain English</div>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                        A project starts from its own project start date.
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                        A scope cannot start until its latest predecessor is finished, plus any lag.
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                        If a scope has a bottleneck vendor, that vendor can only be active on one matching scope at a time across all loaded projects.
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                        Weekends are skipped when start and finish dates are calculated.
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                        Phase and scope edits sync into existing linked rows. Adding or deleting rows changes the baseline for future project builds.
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6 lg:col-span-2">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">Live sync snapshot</div>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                        <div className="text-3xl font-semibold text-white">{liveTemplateCount}</div>
                        <div className="mt-2 text-sm text-slate-400">template-backed scope rows active in loaded projects</div>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                        <div className="text-3xl font-semibold text-white">{tasks.length}</div>
                        <div className="mt-2 text-sm text-slate-400">live task rows currently calculated by the engine</div>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                        <div className="text-3xl font-semibold text-white">{templateDependencies.length}</div>
                        <div className="mt-2 text-sm text-slate-400">baseline dependency links maintained here</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'phases' && (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">Add a phase</div>
                        <p className="mt-2 text-sm text-slate-400">New phases are added to the template baseline and to currently loaded projects.</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[120px_minmax(0,1fr)_160px]">
                      <input
                        type="number"
                        min="1"
                        value={newPhase.phase_order}
                        onChange={(event) =>
                          setNewPhase((current) => ({
                            ...current,
                            phase_order: Math.max(1, Number(event.target.value) || 1)
                          }))
                        }
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                      <input
                        value={newPhase.name}
                        onChange={(event) => setNewPhase((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Phase name"
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        disabled={!newPhase.name.trim() || !!busyLabel}
                        onClick={() =>
                          runAction(`Added phase "${newPhase.name.trim()}"`, async () => {
                            await createPhaseTemplate(newPhase);
                            setNewPhase({ name: '', phase_order: phaseTemplates.length + 2 });
                          })
                        }
                        className="rounded-2xl bg-cyan-500/15 border border-cyan-500/30 px-4 py-3 font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        Add Phase
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {phaseTemplates
                      .slice()
                      .sort((a, b) => a.phase_order - b.phase_order)
                      .map((phase) => {
                        const draft = phaseDrafts[phase.id] ?? { name: phase.name, phase_order: phase.phase_order };
                        const dirty = draft.name !== phase.name || draft.phase_order !== phase.phase_order;
                        return (
                          <div key={phase.id} className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
                            <div className="grid gap-4 lg:grid-cols-[120px_minmax(0,1fr)_auto_auto] lg:items-center">
                              <input
                                type="number"
                                min="1"
                                value={draft.phase_order}
                                onChange={(event) =>
                                  setPhaseDrafts((current) => ({
                                    ...current,
                                    [phase.id]: {
                                      ...draft,
                                      phase_order: Math.max(1, Number(event.target.value) || 1)
                                    }
                                  }))
                                }
                                className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                              />
                              <div className="space-y-2">
                                <input
                                  value={draft.name}
                                  onChange={(event) =>
                                    setPhaseDrafts((current) => ({
                                      ...current,
                                      [phase.id]: {
                                        ...draft,
                                        name: event.target.value
                                      }
                                    }))
                                  }
                                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                />
                                <div className="text-sm text-slate-500">
                                  {(phaseCounts.get(phase.id) ?? 0)} scopes currently assigned to this phase
                                </div>
                              </div>
                              <button
                                disabled={!dirty || !draft.name.trim() || !!busyLabel}
                                onClick={() =>
                                  runAction(`Saved phase "${draft.name.trim()}"`, async () => {
                                    await updatePhaseTemplate(phase.id, draft);
                                  })
                                }
                                className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 font-medium text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                              >
                                <Save size={16} />
                                Save
                              </button>
                              <button
                                disabled={phaseDeleteBlocked(phase.id) || !!busyLabel}
                                onClick={() => {
                                  if (!confirm(`Delete phase "${phase.name}"?`)) return;
                                  runAction(`Deleted phase "${phase.name}"`, async () => {
                                    await deletePhaseTemplate(phase.id);
                                  });
                                }}
                                className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-medium text-red-200 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                                title={
                                  phaseDeleteBlocked(phase.id)
                                    ? 'Move or remove its scopes before deleting this phase.'
                                    : 'Delete empty phase'
                                }
                              >
                                <Trash2 size={16} />
                                Delete
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {activeTab === 'templates' && (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">Add a scope template</div>
                    <p className="mt-2 text-sm text-slate-400">New scope rows become part of the baseline for future projects.</p>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[180px_110px_minmax(0,1.4fr)_minmax(0,1fr)_110px_minmax(0,1fr)_150px]">
                      <select
                        value={newTemplate.phase_template_id ?? ''}
                        onChange={(event) =>
                          setNewTemplate((current) => ({
                            ...current,
                            phase_template_id: event.target.value || null
                          }))
                        }
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
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
                        value={newTemplate.task_order}
                        onChange={(event) =>
                          setNewTemplate((current) => ({
                            ...current,
                            task_order: Math.max(1, Number(event.target.value) || 1)
                          }))
                        }
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                      <input
                        value={newTemplate.scope}
                        onChange={(event) => setNewTemplate((current) => ({ ...current, scope: event.target.value }))}
                        placeholder="Scope name"
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                      <input
                        value={newTemplate.subcontractor}
                        onChange={(event) =>
                          setNewTemplate((current) => ({ ...current, subcontractor: event.target.value }))
                        }
                        placeholder="Contractor"
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                      <input
                        type="number"
                        min="1"
                        value={newTemplate.default_days}
                        onChange={(event) =>
                          setNewTemplate((current) => ({
                            ...current,
                            default_days: Math.max(1, Number(event.target.value) || 1)
                          }))
                        }
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                      <input
                        value={newTemplate.bottleneck_vendor}
                        onChange={(event) =>
                          setNewTemplate((current) => ({ ...current, bottleneck_vendor: event.target.value }))
                        }
                        placeholder="Bottleneck vendor"
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        disabled={!newTemplate.scope.trim() || !!busyLabel}
                        onClick={() =>
                          runAction(`Added scope "${newTemplate.scope.trim()}"`, async () => {
                            await createTaskTemplate({
                              ...newTemplate,
                              subcontractor: newTemplate.subcontractor.trim() || null,
                              bottleneck_vendor: newTemplate.bottleneck_vendor.trim() || null
                            });
                            setNewTemplate({
                              phase_template_id: phaseTemplates[0]?.id ?? null,
                              task_order: templates.length + 2,
                              scope: '',
                              subcontractor: '',
                              default_days: 1,
                              bottleneck_vendor: ''
                            });
                          })
                        }
                        className="rounded-2xl bg-cyan-500/15 border border-cyan-500/30 px-4 py-3 font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        Add Scope
                      </button>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {phaseTemplates
                      .slice()
                      .sort((a, b) => a.phase_order - b.phase_order)
                      .map((phase) => {
                        const phaseTemplatesForSection = templatesByPhase.get(phase.id) ?? [];
                        if (phaseTemplatesForSection.length === 0) return null;
                        return (
                          <div key={phase.id} className="rounded-3xl border border-slate-800 bg-slate-950/60 overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-100">{phase.name}</div>
                                  <div className="text-sm text-slate-500">{phaseTemplatesForSection.length} scopes in this phase</div>
                                </div>
                                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Order {phase.phase_order}</div>
                              </div>
                            </div>
                            <div className="divide-y divide-slate-800">
                              {phaseTemplatesForSection.map((template) => {
                                const draft = templateDrafts[template.id] ?? {
                                  phase_template_id: template.phase_template_id,
                                  task_order: template.task_order,
                                  scope: template.scope,
                                  subcontractor: template.subcontractor ?? '',
                                  default_days: template.default_days,
                                  bottleneck_vendor: template.bottleneck_vendor ?? ''
                                };
                                const dirty =
                                  draft.phase_template_id !== template.phase_template_id ||
                                  draft.task_order !== template.task_order ||
                                  draft.scope !== template.scope ||
                                  draft.subcontractor !== (template.subcontractor ?? '') ||
                                  draft.default_days !== template.default_days ||
                                  draft.bottleneck_vendor !== (template.bottleneck_vendor ?? '');

                                return (
                                  <div key={template.id} className="p-5">
                                    <div className="grid gap-3 xl:grid-cols-[180px_95px_minmax(0,1.4fr)_minmax(0,1fr)_100px_minmax(0,1fr)_auto_auto]">
                                      <select
                                        value={draft.phase_template_id ?? ''}
                                        onChange={(event) =>
                                          setTemplateDrafts((current) => ({
                                            ...current,
                                            [template.id]: {
                                              ...draft,
                                              phase_template_id: event.target.value || null
                                            }
                                          }))
                                        }
                                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                      >
                                        <option value="">Unphased</option>
                                        {phaseTemplates
                                          .slice()
                                          .sort((a, b) => a.phase_order - b.phase_order)
                                          .map((phaseOption) => (
                                            <option key={phaseOption.id} value={phaseOption.id}>
                                              {phaseOption.phase_order}. {phaseOption.name}
                                            </option>
                                          ))}
                                      </select>
                                      <input
                                        type="number"
                                        min="1"
                                        value={draft.task_order}
                                        onChange={(event) =>
                                          setTemplateDrafts((current) => ({
                                            ...current,
                                            [template.id]: {
                                              ...draft,
                                              task_order: Math.max(1, Number(event.target.value) || 1)
                                            }
                                          }))
                                        }
                                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                      />
                                      <input
                                        value={draft.scope}
                                        onChange={(event) =>
                                          setTemplateDrafts((current) => ({
                                            ...current,
                                            [template.id]: {
                                              ...draft,
                                              scope: event.target.value
                                            }
                                          }))
                                        }
                                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                      />
                                      <input
                                        value={draft.subcontractor}
                                        onChange={(event) =>
                                          setTemplateDrafts((current) => ({
                                            ...current,
                                            [template.id]: {
                                              ...draft,
                                              subcontractor: event.target.value
                                            }
                                          }))
                                        }
                                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                      />
                                      <input
                                        type="number"
                                        min="1"
                                        value={draft.default_days}
                                        onChange={(event) =>
                                          setTemplateDrafts((current) => ({
                                            ...current,
                                            [template.id]: {
                                              ...draft,
                                              default_days: Math.max(1, Number(event.target.value) || 1)
                                            }
                                          }))
                                        }
                                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                      />
                                      <input
                                        value={draft.bottleneck_vendor}
                                        onChange={(event) =>
                                          setTemplateDrafts((current) => ({
                                            ...current,
                                            [template.id]: {
                                              ...draft,
                                              bottleneck_vendor: event.target.value
                                            }
                                          }))
                                        }
                                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                      />
                                      <button
                                        disabled={!dirty || !draft.scope.trim() || !!busyLabel}
                                        onClick={() =>
                                          runAction(`Saved scope "${draft.scope.trim()}"`, async () => {
                                            await updateTaskTemplate(template.id, {
                                              ...draft,
                                              subcontractor: draft.subcontractor.trim() || null,
                                              bottleneck_vendor: draft.bottleneck_vendor.trim() || null
                                            });
                                          })
                                        }
                                        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 font-medium text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                                      >
                                        <Save size={16} />
                                        Save
                                      </button>
                                      <button
                                        disabled={!!busyLabel}
                                        onClick={() => {
                                          if (!confirm(`Delete scope template "${template.scope}"? Existing project scopes will remain as-is.`)) return;
                                          runAction(`Deleted scope "${template.scope}"`, async () => {
                                            await deleteTaskTemplate(template.id);
                                          });
                                        }}
                                        className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-medium text-red-200 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                                      >
                                        <Trash2 size={16} />
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                    {(templatesByPhase.get('unphased') ?? []).length > 0 && (
                      <div className="rounded-3xl border border-slate-800 bg-slate-950/60 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80">
                          <div className="text-sm font-semibold text-slate-100">Unphased scopes</div>
                          <div className="text-sm text-slate-500">Scopes that are not currently tied to a phase</div>
                        </div>
                        <div className="px-5 py-4 text-sm text-slate-400">
                          Move these into a phase if you want them grouped visually in the gantt.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'dependencies' && (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">Add a dependency</div>
                    <p className="mt-2 text-sm text-slate-400">
                      Dependency edits sync into existing template-linked project chains. Cycles are blocked here so the engine stays schedulable.
                    </p>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)_160px]">
                      <select
                        value={newDependency.predecessor_id}
                        onChange={(event) =>
                          setNewDependency((current) => ({
                            ...current,
                            predecessor_id: event.target.value
                          }))
                        }
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">Select predecessor</option>
                        {templates
                          .slice()
                          .sort((a, b) => a.task_order - b.task_order)
                          .map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.scope} · {phaseNameForTemplate(template.phase_template_id)}
                            </option>
                          ))}
                      </select>
                      <div className="flex items-center justify-center text-slate-500">
                        <ArrowRight size={18} />
                      </div>
                      <select
                        value={newDependency.successor_id}
                        onChange={(event) =>
                          setNewDependency((current) => ({
                            ...current,
                            successor_id: event.target.value
                          }))
                        }
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">Select successor</option>
                        {templates
                          .slice()
                          .sort((a, b) => a.task_order - b.task_order)
                          .map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.scope} · {phaseNameForTemplate(template.phase_template_id)}
                            </option>
                          ))}
                      </select>
                      <button
                        disabled={
                          !newDependency.predecessor_id ||
                          !newDependency.successor_id ||
                          newDependency.predecessor_id === newDependency.successor_id ||
                          dependencyDuplicate ||
                          dependencyCycle ||
                          !!busyLabel
                        }
                        onClick={() =>
                          runAction('Added dependency link', async () => {
                            await addTemplateDependency(newDependency.predecessor_id, newDependency.successor_id);
                            setNewDependency({ predecessor_id: '', successor_id: '' });
                          })
                        }
                        className="rounded-2xl bg-cyan-500/15 border border-cyan-500/30 px-4 py-3 font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        Add Link
                      </button>
                    </div>

                    <div className="mt-3 text-sm">
                      {newDependency.predecessor_id === newDependency.successor_id && newDependency.predecessor_id && (
                        <div className="text-red-300">A scope cannot depend on itself.</div>
                      )}
                      {!dependencyDuplicate && dependencyCycle && (
                        <div className="text-red-300">This link would create a circular dependency.</div>
                      )}
                      {!dependencyCycle && dependencyDuplicate && (
                        <div className="text-amber-300">That dependency already exists.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">Current dependency map</div>
                        <div className="text-sm text-slate-500">Template predecessor links mirrored into active schedule data</div>
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{dependencyRows.length} links</div>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {dependencyRows.map((dependency) => (
                        <div key={dependency.id} className="px-5 py-4 flex items-center gap-4">
                          <div className="min-w-0 flex-1 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
                            <span className="font-medium text-slate-100">{dependency.predecessorLabel}</span>
                            <span className="mx-2 text-slate-500">must finish before</span>
                            <span className="font-medium text-cyan-200">{dependency.successorLabel}</span>
                          </div>
                          <button
                            disabled={!!busyLabel}
                            onClick={() => {
                              if (!confirm(`Remove dependency from "${dependency.predecessorLabel}" to "${dependency.successorLabel}"?`)) return;
                              runAction('Removed dependency link', async () => {
                                await removeTemplateDependency(dependency.id);
                              });
                            }}
                            className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-medium text-red-200 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                          >
                            <Trash2 size={16} />
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
