import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useShallow } from 'zustand/react/shallow';
import { ArrowRight, FileText, GitBranch, Info, Layers3, Palette, Plus, Save, Trash2, UserRound, X } from 'lucide-react';
import { useProjectStore } from '../store/projectStore';
import { buildSubcontractorOptions } from '../utils/subcontractors';
import { supabase } from '../lib/supabase';

export type TemplateStudioTab = 'overview' | 'phases' | 'templates' | 'subcontractors' | 'dependencies' | 'users';

type PhaseDraft = {
  name: string;
  phase_order: number;
};

type PendingPhaseDraft = PhaseDraft & {
  localId: string;
};

type TemplateDraft = {
  phase_template_id: string | null;
  task_order: number;
  scope: string;
  subcontractor: string;
  default_days: number;
  bottleneck_vendor: string;
};

type PendingTemplateDraft = TemplateDraft & {
  localId: string;
};

type PendingDependencyDraft = {
  localId: string;
  predecessor_id: string;
  successor_id: string;
};

type DependencyDraft = {
  predecessor_id: string;
  successor_id: string;
};

type SubcontractorDraft = {
  name: string;
  color: string;
};

type PendingSubcontractorDraft = SubcontractorDraft & {
  localId: string;
};

type AppUser = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string | null;
};

const PROTECTED_APP_USER_EMAILS = new Set(['jpwillett@gmail.com']);

const STUDIO_TABS: { id: TemplateStudioTab; label: string; icon: typeof Info }[] = [
  { id: 'overview', label: 'Rules', icon: Info },
  { id: 'phases', label: 'Phases', icon: Layers3 },
  { id: 'templates', label: 'Scopes', icon: FileText },
  { id: 'subcontractors', label: 'Subs', icon: Palette },
  { id: 'dependencies', label: 'Dependencies', icon: GitBranch },
  { id: 'users', label: 'Users', icon: UserRound }
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

function syncBottleneckVendor(currentBottleneckVendor: string, nextSubcontractor: string) {
  return currentBottleneckVendor ? nextSubcontractor : currentBottleneckVendor;
}

function formatDependencyTemplateLabel(template: {
  phaseName: string;
  phaseOrder: number;
  scope: string;
}) {
  const phasePrefix = template.phaseName === 'Unphased' ? 'Unphased' : `Phase ${template.phaseOrder}: ${template.phaseName}`;
  return `${phasePrefix} - ${template.scope}`;
}

function getDependencyGraphIssue(
  dependencies: Array<{ predecessor_id: string; successor_id: string }>
): string | null {
  const keys = new Set<string>();
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const dependency of dependencies) {
    if (!dependency.predecessor_id || !dependency.successor_id) return 'Each dependency needs both scope selections.';
    if (dependency.predecessor_id === dependency.successor_id) return 'A scope cannot depend on itself.';

    const key = `${dependency.predecessor_id}->${dependency.successor_id}`;
    if (keys.has(key)) return 'That dependency already exists in the current draft.';
    keys.add(key);

    const next = adjacency.get(dependency.predecessor_id) ?? [];
    next.push(dependency.successor_id);
    adjacency.set(dependency.predecessor_id, next);

    if (!inDegree.has(dependency.predecessor_id)) inDegree.set(dependency.predecessor_id, 0);
    inDegree.set(dependency.successor_id, (inDegree.get(dependency.successor_id) ?? 0) + 1);
  }

  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) queue.push(nodeId);
  });

  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visited += 1;
    (adjacency.get(current) ?? []).forEach((next) => {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    });
  }

  return visited === inDegree.size ? null : 'This dependency map contains a circular dependency.';
}

export function TemplateStudioModal({
  onClose,
  initialTab = 'overview'
}: {
  onClose: () => void;
  initialTab?: TemplateStudioTab;
}) {
  const {
    phaseTemplates,
    templates,
    templateDependencies,
    tasks,
    projects,
    subcontractors,
    vendorColors,
    createPhaseTemplate,
    updatePhaseTemplate,
    deletePhaseTemplate,
    createTaskTemplate,
    updateTaskTemplate,
    deleteTaskTemplate,
    createSubcontractor,
    updateSubcontractor,
    deleteSubcontractor,
    setVendorColor,
    addTemplateDependency,
    removeTemplateDependency
  } = useProjectStore(
    useShallow((state) => ({
      phaseTemplates: state.phaseTemplates,
      templates: state.templates,
      templateDependencies: state.templateDependencies,
      tasks: state.tasks,
      projects: state.projects,
      subcontractors: state.subcontractors,
      vendorColors: state.vendorColors,
      createPhaseTemplate: state.createPhaseTemplate,
      updatePhaseTemplate: state.updatePhaseTemplate,
      deletePhaseTemplate: state.deletePhaseTemplate,
      createTaskTemplate: state.createTaskTemplate,
      updateTaskTemplate: state.updateTaskTemplate,
      deleteTaskTemplate: state.deleteTaskTemplate,
      createSubcontractor: state.createSubcontractor,
      updateSubcontractor: state.updateSubcontractor,
      deleteSubcontractor: state.deleteSubcontractor,
      setVendorColor: state.setVendorColor,
      addTemplateDependency: state.addTemplateDependency,
      removeTemplateDependency: state.removeTemplateDependency
    }))
  );

  const [activeTab, setActiveTab] = useState<TemplateStudioTab>(initialTab);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [phaseDrafts, setPhaseDrafts] = useState<Record<string, PhaseDraft>>({});
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, TemplateDraft>>({});
  const [pendingPhaseCreates, setPendingPhaseCreates] = useState<PendingPhaseDraft[]>([]);
  const [pendingPhaseDeletes, setPendingPhaseDeletes] = useState<string[]>([]);
  const [pendingTemplateCreates, setPendingTemplateCreates] = useState<PendingTemplateDraft[]>([]);
  const [pendingTemplateDeletes, setPendingTemplateDeletes] = useState<string[]>([]);
  const [dependencyDrafts, setDependencyDrafts] = useState<Record<string, DependencyDraft>>({});
  const [pendingDependencyCreates, setPendingDependencyCreates] = useState<PendingDependencyDraft[]>([]);
  const [pendingDependencyDeletes, setPendingDependencyDeletes] = useState<string[]>([]);
  const [subcontractorDrafts, setSubcontractorDrafts] = useState<Record<string, SubcontractorDraft>>({});
  const [pendingSubcontractorCreates, setPendingSubcontractorCreates] = useState<PendingSubcontractorDraft[]>([]);
  const [pendingSubcontractorDeletes, setPendingSubcontractorDeletes] = useState<string[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [hasLoadedUsers, setHasLoadedUsers] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');

  const [newPhase, setNewPhase] = useState<PhaseDraft>({ name: '', phase_order: phaseTemplates.length + 1 });
  const [newSubcontractorName, setNewSubcontractorName] = useState('');
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
    setPendingPhaseCreates([]);
    setPendingPhaseDeletes([]);
  }, [phaseTemplates]);

  useEffect(() => {
    setTemplateDrafts(buildTemplateDrafts(templates));
    setPendingTemplateCreates([]);
    setPendingTemplateDeletes([]);
  }, [templates]);

  useEffect(() => {
    setDependencyDrafts(
      Object.fromEntries(
        templateDependencies.map((dependency) => [
          dependency.id,
          {
            predecessor_id: dependency.predecessor_id,
            successor_id: dependency.successor_id
          }
        ])
      )
    );
    setPendingDependencyCreates([]);
    setPendingDependencyDeletes([]);
  }, [templateDependencies]);

  useEffect(() => {
    setSubcontractorDrafts(
      Object.fromEntries(
        subcontractors.map((subcontractor) => [
          subcontractor.id,
          {
            name: subcontractor.name,
            color: vendorColors[subcontractor.name] || ''
          }
        ])
      )
    );
    setPendingSubcontractorCreates([]);
    setPendingSubcontractorDeletes([]);
  }, [subcontractors, vendorColors]);

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

  useEffect(() => {
    if (activeTab !== 'users' || hasLoadedUsers) return;

    void loadAppUsers();
  }, [activeTab, hasLoadedUsers]);

  const visiblePhaseTemplates = useMemo(() => {
    return phaseTemplates.filter((phase) => !pendingPhaseDeletes.includes(phase.id));
  }, [pendingPhaseDeletes, phaseTemplates]);

  const displayedPhaseRows = useMemo(() => {
    return [
      ...visiblePhaseTemplates.map((phase) => ({
        id: phase.id,
        isNew: false,
        draft: phaseDrafts[phase.id] ?? { name: phase.name, phase_order: phase.phase_order },
        sourceName: phase.name
      })),
      ...pendingPhaseCreates.map((phase) => ({
        id: phase.localId,
        isNew: true,
        draft: { name: phase.name, phase_order: phase.phase_order },
        sourceName: phase.name
      }))
    ].sort((a, b) => {
      if (a.draft.phase_order !== b.draft.phase_order) return a.draft.phase_order - b.draft.phase_order;
      return a.draft.name.localeCompare(b.draft.name);
    });
  }, [pendingPhaseCreates, phaseDrafts, visiblePhaseTemplates]);

  const phaseNameById = useMemo(() => {
    return new Map(visiblePhaseTemplates.map((phase) => [phase.id, phase.name]));
  }, [visiblePhaseTemplates]);

  const visibleSubcontractors = useMemo(() => {
    return subcontractors.filter((subcontractor) => !pendingSubcontractorDeletes.includes(subcontractor.id));
  }, [pendingSubcontractorDeletes, subcontractors]);

  const displayedSubcontractorRows = useMemo(() => {
    return [
      ...visibleSubcontractors.map((subcontractor) => ({
        id: subcontractor.id,
        isNew: false,
        draft: subcontractorDrafts[subcontractor.id] ?? {
          name: subcontractor.name,
          color: vendorColors[subcontractor.name] || ''
        },
        sourceName: subcontractor.name
      })),
      ...pendingSubcontractorCreates.map((subcontractor) => ({
        id: subcontractor.localId,
        isNew: true,
        draft: {
          name: subcontractor.name,
          color: subcontractor.color
        },
        sourceName: subcontractor.name
      }))
    ].sort((a, b) => a.draft.name.localeCompare(b.draft.name));
  }, [pendingSubcontractorCreates, subcontractorDrafts, vendorColors, visibleSubcontractors]);

  const subcontractorOptions = useMemo(() => {
    return buildSubcontractorOptions(
      displayedSubcontractorRows.map((subcontractor) => subcontractor.draft.name),
      [
        ...templates.map((template) => template.subcontractor),
        ...pendingTemplateCreates.map((template) => template.subcontractor),
        ...tasks.map((task) => task.subcontractor)
      ]
    );
  }, [displayedSubcontractorRows, pendingTemplateCreates, tasks, templates]);

  const subcontractorUsage = useMemo(() => {
    const usage = new Map<string, number>();

    templates.forEach((template) => {
      if (!template.subcontractor) return;
      usage.set(template.subcontractor, (usage.get(template.subcontractor) ?? 0) + 1);
    });

    tasks.forEach((task) => {
      if (!task.subcontractor) return;
      usage.set(task.subcontractor, (usage.get(task.subcontractor) ?? 0) + 1);
    });

    return usage;
  }, [tasks, templates]);

  const phaseOrderById = useMemo(() => {
    return new Map(visiblePhaseTemplates.map((phase) => [phase.id, phase.phase_order]));
  }, [visiblePhaseTemplates]);

  const visibleTemplates = useMemo(() => {
    return templates.filter((template) => !pendingTemplateDeletes.includes(template.id));
  }, [pendingTemplateDeletes, templates]);

  const dependencyTemplateOptions = useMemo(() => {
    return visibleTemplates
      .slice()
      .sort((a, b) => {
        if (a.phase_order !== b.phase_order) return a.phase_order - b.phase_order;
        if (a.task_order !== b.task_order) return a.task_order - b.task_order;
        return a.scope.localeCompare(b.scope);
      })
      .map((template) => ({
        id: template.id,
        label: formatDependencyTemplateLabel({
          phaseName: template.phase_template_id ? phaseNameById.get(template.phase_template_id) ?? 'Unphased' : 'Unphased',
          phaseOrder: template.phase_order,
          scope: template.scope
        })
      }));
  }, [phaseNameById, visibleTemplates]);

  const displayedTemplateRows = useMemo(() => {
    return [
      ...visibleTemplates.map((template) => {
        const draft = templateDrafts[template.id] ?? {
          phase_template_id: template.phase_template_id,
          task_order: template.task_order,
          scope: template.scope,
          subcontractor: template.subcontractor ?? '',
          default_days: template.default_days,
          bottleneck_vendor: template.bottleneck_vendor ?? ''
        };

        return {
          id: template.id,
          isNew: false,
          draft,
          sourceScope: template.scope,
          phaseOrder: draft.phase_template_id ? phaseOrderById.get(draft.phase_template_id) ?? 0 : 0
        };
      }),
      ...pendingTemplateCreates.map((template) => ({
        id: template.localId,
        isNew: true,
        draft: {
          phase_template_id: template.phase_template_id,
          task_order: template.task_order,
          scope: template.scope,
          subcontractor: template.subcontractor,
          default_days: template.default_days,
          bottleneck_vendor: template.bottleneck_vendor
        },
        sourceScope: template.scope,
        phaseOrder: template.phase_template_id ? phaseOrderById.get(template.phase_template_id) ?? 0 : 0
      }))
    ];
  }, [pendingTemplateCreates, phaseOrderById, templateDrafts, visibleTemplates]);

  const phaseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    displayedTemplateRows.forEach((template) => {
      if (!template.draft.phase_template_id) return;
      counts.set(template.draft.phase_template_id, (counts.get(template.draft.phase_template_id) ?? 0) + 1);
    });
    return counts;
  }, [displayedTemplateRows]);

  const templateLabelById = useMemo(() => {
    return new Map(
      displayedTemplateRows.map((template) => [
        template.id,
        formatDependencyTemplateLabel({
          phaseName: template.draft.phase_template_id
            ? phaseNameById.get(template.draft.phase_template_id) ?? 'Unphased'
            : 'Unphased',
          phaseOrder: template.phaseOrder,
          scope: template.draft.scope || 'Untitled scope'
        })
      ])
    );
  }, [displayedTemplateRows, phaseNameById]);

  const templatesByPhase = useMemo(() => {
    const buckets = new Map<string, typeof displayedTemplateRows>();
    const orderedTemplates = [...displayedTemplateRows].sort((a, b) => {
      if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;
      if (a.draft.task_order !== b.draft.task_order) return a.draft.task_order - b.draft.task_order;
      return a.draft.scope.localeCompare(b.draft.scope);
    });

    orderedTemplates.forEach((template) => {
      const key = template.draft.phase_template_id ?? 'unphased';
      const next = buckets.get(key) ?? [];
      next.push(template);
      buckets.set(key, next);
    });

    return buckets;
  }, [displayedTemplateRows]);

  const effectiveDependencies = useMemo(() => {
    const removedIds = new Set(pendingDependencyDeletes);
    const next = templateDependencies
      .filter((dependency) => !removedIds.has(dependency.id))
      .map((dependency) => ({
        id: dependency.id,
        predecessor_id: dependencyDrafts[dependency.id]?.predecessor_id ?? dependency.predecessor_id,
        successor_id: dependencyDrafts[dependency.id]?.successor_id ?? dependency.successor_id
      }));
    next.push(
      ...pendingDependencyCreates.map((dependency) => ({
        id: dependency.localId,
        predecessor_id: dependency.predecessor_id,
        successor_id: dependency.successor_id
      }))
    );
    return next;
  }, [dependencyDrafts, pendingDependencyCreates, pendingDependencyDeletes, templateDependencies]);

  const dependencyRows = useMemo(() => {
    return [...effectiveDependencies]
      .map((dependency) => ({
        ...dependency,
        predecessorLabel: templateLabelById.get(dependency.predecessor_id) ?? 'Unknown scope',
        successorLabel: templateLabelById.get(dependency.successor_id) ?? 'Unknown scope',
        predecessorTemplate: displayedTemplateRows.find((template) => template.id === dependency.predecessor_id) ?? null,
        successorTemplate: displayedTemplateRows.find((template) => template.id === dependency.successor_id) ?? null
      }))
      .sort((a, b) => {
        const successorPhaseDelta = (a.successorTemplate?.phaseOrder ?? Number.MAX_SAFE_INTEGER) - (b.successorTemplate?.phaseOrder ?? Number.MAX_SAFE_INTEGER);
        if (successorPhaseDelta !== 0) return successorPhaseDelta;

        const successorTaskDelta =
          (a.successorTemplate?.draft.task_order ?? Number.MAX_SAFE_INTEGER) -
          (b.successorTemplate?.draft.task_order ?? Number.MAX_SAFE_INTEGER);
        if (successorTaskDelta !== 0) return successorTaskDelta;

        const predecessorPhaseDelta =
          (a.predecessorTemplate?.phaseOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.predecessorTemplate?.phaseOrder ?? Number.MAX_SAFE_INTEGER);
        if (predecessorPhaseDelta !== 0) return predecessorPhaseDelta;

        const predecessorTaskDelta =
          (a.predecessorTemplate?.draft.task_order ?? Number.MAX_SAFE_INTEGER) -
          (b.predecessorTemplate?.draft.task_order ?? Number.MAX_SAFE_INTEGER);
        if (predecessorTaskDelta !== 0) return predecessorTaskDelta;

        if (a.successorLabel !== b.successorLabel) return a.successorLabel.localeCompare(b.successorLabel);
        return a.predecessorLabel.localeCompare(b.predecessorLabel);
      });
  }, [displayedTemplateRows, effectiveDependencies, templateLabelById]);

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

  const loadAppUsers = async () => {
    setIsLoadingUsers(true);

    try {
      const { data, error } = await supabase.rpc('list_app_users');
      if (error) throw error;

      setAppUsers(
        ((data as AppUser[] | null) ?? []).slice().sort((left, right) => left.email.localeCompare(right.email))
      );
      setHasLoadedUsers(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load approved users.');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const addAppUser = () =>
    runAction('Added user', async () => {
      const trimmedEmail = newUserEmail.trim().toLowerCase();
      if (!trimmedEmail) throw new Error('Email address is required.');

      const { error } = await supabase.rpc('add_app_user', { input_email: trimmedEmail });
      if (error) throw error;

      setNewUserEmail('');
      await loadAppUsers();
    });

  const removeAppUser = (userId: string) =>
    runAction('Removed user', async () => {
      const { error } = await supabase.rpc('delete_app_user', { input_user_id: userId });
      if (error) throw error;

      await loadAppUsers();
    });

  const dependencyDuplicate = useMemo(() => {
    return effectiveDependencies.some(
      (dependency) =>
        dependency.predecessor_id === newDependency.predecessor_id &&
        dependency.successor_id === newDependency.successor_id
    );
  }, [effectiveDependencies, newDependency.predecessor_id, newDependency.successor_id]);

  const dependencyCycle = useMemo(() => {
    if (!newDependency.predecessor_id || !newDependency.successor_id) return false;
    return wouldCreateCycle(effectiveDependencies, newDependency.predecessor_id, newDependency.successor_id);
  }, [effectiveDependencies, newDependency.predecessor_id, newDependency.successor_id]);

  const dependencyGraphIssue = useMemo(() => {
    return getDependencyGraphIssue(effectiveDependencies);
  }, [effectiveDependencies]);

  const phaseDeleteBlocked = (phaseId: string) => (phaseCounts.get(phaseId) ?? 0) > 0;

  const phaseHasChanges = useMemo(() => {
    if (pendingPhaseCreates.length > 0 || pendingPhaseDeletes.length > 0) return true;
    return visiblePhaseTemplates.some((phase) => {
      const draft = phaseDrafts[phase.id];
      return draft ? draft.name !== phase.name || draft.phase_order !== phase.phase_order : false;
    });
  }, [pendingPhaseCreates.length, pendingPhaseDeletes.length, phaseDrafts, visiblePhaseTemplates]);

  const templateHasChanges = useMemo(() => {
    if (pendingTemplateCreates.length > 0 || pendingTemplateDeletes.length > 0) return true;
    return visibleTemplates.some((template) => {
      const draft = templateDrafts[template.id];
      return draft
        ? draft.phase_template_id !== template.phase_template_id ||
            draft.task_order !== template.task_order ||
            draft.scope !== template.scope ||
            draft.subcontractor !== (template.subcontractor ?? '') ||
            draft.default_days !== template.default_days ||
            draft.bottleneck_vendor !== (template.bottleneck_vendor ?? '')
        : false;
    });
  }, [pendingTemplateCreates.length, pendingTemplateDeletes.length, templateDrafts, visibleTemplates]);

  const dependencyHasChanges = useMemo(() => {
    if (pendingDependencyCreates.length > 0 || pendingDependencyDeletes.length > 0) return true;
    return templateDependencies.some((dependency) => {
      const draft = dependencyDrafts[dependency.id];
      return draft
        ? draft.predecessor_id !== dependency.predecessor_id || draft.successor_id !== dependency.successor_id
        : false;
    });
  }, [dependencyDrafts, pendingDependencyCreates.length, pendingDependencyDeletes.length, templateDependencies]);

  const resetPhaseChanges = () => {
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
    setPendingPhaseCreates([]);
    setPendingPhaseDeletes([]);
    setNewPhase({ name: '', phase_order: phaseTemplates.length + 1 });
  };

  const resetTemplateChanges = () => {
    setTemplateDrafts(buildTemplateDrafts(templates));
    setPendingTemplateCreates([]);
    setPendingTemplateDeletes([]);
    setNewTemplate({
      phase_template_id: visiblePhaseTemplates[0]?.id ?? null,
      task_order: templates.length + 1,
      scope: '',
      subcontractor: '',
      default_days: 1,
      bottleneck_vendor: ''
    });
  };

  const resetDependencyChanges = () => {
    setDependencyDrafts(
      Object.fromEntries(
        templateDependencies.map((dependency) => [
          dependency.id,
          {
            predecessor_id: dependency.predecessor_id,
            successor_id: dependency.successor_id
          }
        ])
      )
    );
    setPendingDependencyCreates([]);
    setPendingDependencyDeletes([]);
    setNewDependency({ predecessor_id: '', successor_id: '' });
  };

  const resetSubcontractorChanges = () => {
    setSubcontractorDrafts(
      Object.fromEntries(
        subcontractors.map((subcontractor) => [
          subcontractor.id,
          {
            name: subcontractor.name,
            color: vendorColors[subcontractor.name] || ''
          }
        ])
      )
    );
    setPendingSubcontractorCreates([]);
    setPendingSubcontractorDeletes([]);
    setNewSubcontractorName('');
  };

  const savePhaseChanges = () =>
    runAction('Saved phase changes', async () => {
      for (const phase of visiblePhaseTemplates) {
        const draft = phaseDrafts[phase.id];
        if (!draft) continue;
        if (draft.name === phase.name && draft.phase_order === phase.phase_order) continue;
        await updatePhaseTemplate(phase.id, draft);
      }

      for (const phase of pendingPhaseCreates) {
        await createPhaseTemplate({
          name: phase.name,
          phase_order: phase.phase_order
        });
      }

      for (const phaseId of pendingPhaseDeletes) {
        await deletePhaseTemplate(phaseId);
      }

      resetPhaseChanges();
    });

  const saveTemplateChanges = () =>
    runAction('Saved scope changes', async () => {
      for (const template of visibleTemplates) {
        const draft = templateDrafts[template.id];
        if (!draft) continue;
        const dirty =
          draft.phase_template_id !== template.phase_template_id ||
          draft.task_order !== template.task_order ||
          draft.scope !== template.scope ||
          draft.subcontractor !== (template.subcontractor ?? '') ||
          draft.default_days !== template.default_days ||
          draft.bottleneck_vendor !== (template.bottleneck_vendor ?? '');

        if (!dirty) continue;

        await updateTaskTemplate(template.id, {
          ...draft,
          subcontractor: draft.subcontractor.trim() || null,
          bottleneck_vendor: draft.bottleneck_vendor.trim() || null
        });
      }

      for (const template of pendingTemplateCreates) {
        await createTaskTemplate({
          ...template,
          subcontractor: template.subcontractor.trim() || null,
          bottleneck_vendor: template.bottleneck_vendor.trim() || null
        });
      }

      for (const templateId of pendingTemplateDeletes) {
        await deleteTaskTemplate(templateId);
      }

      resetTemplateChanges();
    });

  const saveSubcontractorChanges = () =>
    runAction('Saved subcontractor changes', async () => {
      for (const subcontractor of visibleSubcontractors) {
        const draft = subcontractorDrafts[subcontractor.id];
        if (!draft) continue;

        const nextName = draft.name.trim();
        const currentColor = vendorColors[subcontractor.name] || '';
        const nextColor = draft.color || '';

        if (nextName !== subcontractor.name) {
          await updateSubcontractor(subcontractor.id, nextName);
        }

        const effectiveName = nextName || subcontractor.name;
        if (nextColor !== currentColor) {
          await setVendorColor(effectiveName, nextColor);
        }
      }

      for (const subcontractor of pendingSubcontractorCreates) {
        await createSubcontractor(subcontractor.name);
        if (subcontractor.color) {
          await setVendorColor(subcontractor.name, subcontractor.color);
        }
      }

      for (const subcontractorId of pendingSubcontractorDeletes) {
        await deleteSubcontractor(subcontractorId);
      }

      resetSubcontractorChanges();
    });

  const saveDependencyChanges = () =>
    runAction('Saved dependency changes', async () => {
      const desiredDependencyKeys = new Set(
        effectiveDependencies.map((dependency) => `${dependency.predecessor_id}->${dependency.successor_id}`)
      );
      const currentDependencyKeys = new Set(
        templateDependencies.map((dependency) => `${dependency.predecessor_id}->${dependency.successor_id}`)
      );

      for (const dependency of templateDependencies) {
        const key = `${dependency.predecessor_id}->${dependency.successor_id}`;
        if (!desiredDependencyKeys.has(key)) {
          await removeTemplateDependency(dependency.id);
        }
      }

      for (const dependency of effectiveDependencies) {
        const key = `${dependency.predecessor_id}->${dependency.successor_id}`;
        if (!currentDependencyKeys.has(key)) {
          await addTemplateDependency(dependency.predecessor_id, dependency.successor_id);
        }
      }

      resetDependencyChanges();
    });

  const phaseSaveDisabled = !phaseHasChanges || !!busyLabel || displayedPhaseRows.some((phase) => !phase.draft.name.trim());
  const templateSaveDisabled =
    !templateHasChanges || !!busyLabel || displayedTemplateRows.some((template) => !template.draft.scope.trim());
  const subcontractorHasChanges = useMemo(() => {
    if (pendingSubcontractorCreates.length > 0 || pendingSubcontractorDeletes.length > 0) return true;
    return visibleSubcontractors.some((subcontractor) => {
      const draft = subcontractorDrafts[subcontractor.id];
      const currentColor = vendorColors[subcontractor.name] || '';
      return draft ? draft.name !== subcontractor.name || draft.color !== currentColor : false;
    });
  }, [pendingSubcontractorCreates.length, pendingSubcontractorDeletes.length, subcontractorDrafts, vendorColors, visibleSubcontractors]);
  const subcontractorSaveDisabled =
    !subcontractorHasChanges || !!busyLabel || displayedSubcontractorRows.some((subcontractor) => !subcontractor.draft.name.trim());
  const dependencySaveDisabled = !dependencyHasChanges || !!busyLabel || Boolean(dependencyGraphIssue);

  const activeTabMeta =
    activeTab === 'phases'
      ? {
          hasChanges: phaseHasChanges,
          saveDisabled: phaseSaveDisabled,
          onReset: resetPhaseChanges,
          onSave: savePhaseChanges,
          summary: `${pendingPhaseCreates.length} new, ${pendingPhaseDeletes.length} queued for delete`
        }
      : activeTab === 'templates'
        ? {
            hasChanges: templateHasChanges,
            saveDisabled: templateSaveDisabled,
            onReset: resetTemplateChanges,
            onSave: saveTemplateChanges,
            summary: `${pendingTemplateCreates.length} new, ${pendingTemplateDeletes.length} queued for delete`
          }
        : activeTab === 'subcontractors'
          ? {
              hasChanges: subcontractorHasChanges,
              saveDisabled: subcontractorSaveDisabled,
              onReset: resetSubcontractorChanges,
              onSave: saveSubcontractorChanges,
              summary: `${pendingSubcontractorCreates.length} new, ${pendingSubcontractorDeletes.length} queued for delete`
            }
        : activeTab === 'dependencies'
          ? {
              hasChanges: dependencyHasChanges,
              saveDisabled: dependencySaveDisabled,
              onReset: resetDependencyChanges,
              onSave: saveDependencyChanges,
              summary: `${pendingDependencyCreates.length} added, ${pendingDependencyDeletes.length} removed`
            }
          : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4">
      <div className="h-full w-full rounded-3xl border border-slate-700 bg-slate-900 shadow-[0_30px_120px_rgba(0,0,0,0.55)] overflow-hidden">
        <div className="flex h-full">
          <aside className="w-64 border-r border-slate-800 bg-slate-950/80 p-5 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-100">Schedule Template Studio</h2>
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
                <div>
                  <div className="text-2xl font-semibold text-slate-100">{appUsers.length}</div>
                  <div className="text-sm text-slate-400">approved app users</div>
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
                          Bottleneck flags and default days that shape the resource-driven schedule.
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
                        If a scope is marked as bottlenecked, its subcontractor can only be active on one matching scope at a time across all loaded projects.
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
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">Queue a phase</div>
                    <p className="mt-2 text-sm text-slate-400">Make as many phase edits as you want here, then save the tab once.</p>
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
                        onClick={() => {
                          setPendingPhaseCreates((current) => [
                            ...current,
                            { localId: crypto.randomUUID(), name: newPhase.name.trim(), phase_order: newPhase.phase_order }
                          ]);
                          setNewPhase({ name: '', phase_order: visiblePhaseTemplates.length + pendingPhaseCreates.length + 1 });
                        }}
                        className="rounded-2xl bg-cyan-500/15 border border-cyan-500/30 px-4 py-3 font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        Add Phase
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {displayedPhaseRows.map((phase) => (
                      <div key={phase.id} className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
                        <div className="grid gap-4 lg:grid-cols-[120px_minmax(0,1fr)_auto] lg:items-center">
                          <input
                            type="number"
                            min="1"
                            value={phase.draft.phase_order}
                            onChange={(event) => {
                              const nextOrder = Math.max(1, Number(event.target.value) || 1);
                              if (phase.isNew) {
                                setPendingPhaseCreates((current) =>
                                  current.map((item) => (item.localId === phase.id ? { ...item, phase_order: nextOrder } : item))
                                );
                                return;
                              }
                              setPhaseDrafts((current) => ({
                                ...current,
                                [phase.id]: { ...phase.draft, phase_order: nextOrder }
                              }));
                            }}
                            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                          />
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <input
                                value={phase.draft.name}
                                onChange={(event) => {
                                  if (phase.isNew) {
                                    setPendingPhaseCreates((current) =>
                                      current.map((item) => (item.localId === phase.id ? { ...item, name: event.target.value } : item))
                                    );
                                    return;
                                  }
                                  setPhaseDrafts((current) => ({
                                    ...current,
                                    [phase.id]: { ...phase.draft, name: event.target.value }
                                  }));
                                }}
                                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                              />
                              {phase.isNew && (
                                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200">
                                  New
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-slate-500">
                              {phase.isNew ? 'Queued for the next phase save.' : `${phaseCounts.get(phase.id) ?? 0} scopes currently assigned to this phase`}
                            </div>
                          </div>
                          <button
                            disabled={(!phase.isNew && phaseDeleteBlocked(phase.id)) || !!busyLabel}
                            onClick={() => {
                              if (phase.isNew) {
                                setPendingPhaseCreates((current) => current.filter((item) => item.localId !== phase.id));
                                return;
                              }
                              if (!confirm(`Delete phase "${phase.sourceName}" when you save this tab?`)) return;
                              setPendingPhaseDeletes((current) => [...current, phase.id]);
                            }}
                            className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-medium text-red-200 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                            title={!phase.isNew && phaseDeleteBlocked(phase.id) ? 'Move or remove its scopes before deleting this phase.' : 'Queue this phase for removal'}
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'templates' && (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">Queue a scope template</div>
                    <p className="mt-2 text-sm text-slate-400">Draft multiple scope edits in this tab, then save them together.</p>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[180px_110px_minmax(0,1.4fr)_minmax(0,1fr)_110px_160px_150px]">
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
                        {visiblePhaseTemplates
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
                      <select
                        value={newTemplate.subcontractor}
                        onChange={(event) =>
                          setNewTemplate((current) => ({
                            ...current,
                            subcontractor: event.target.value,
                            bottleneck_vendor: syncBottleneckVendor(current.bottleneck_vendor, event.target.value)
                          }))
                        }
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">Unassigned</option>
                        {subcontractorOptions.map((subcontractor) => (
                          <option key={subcontractor} value={subcontractor}>
                            {subcontractor}
                          </option>
                        ))}
                      </select>
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
                      <label className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={!!newTemplate.bottleneck_vendor}
                          onChange={(event) =>
                            setNewTemplate((current) => ({
                              ...current,
                              bottleneck_vendor: event.target.checked ? current.subcontractor : ''
                            }))
                          }
                          disabled={!newTemplate.subcontractor.trim()}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900 disabled:opacity-40"
                        />
                        <span>Bottleneck</span>
                      </label>
                      <button
                        disabled={!newTemplate.scope.trim() || !!busyLabel}
                        onClick={() => {
                          setPendingTemplateCreates((current) => [
                            ...current,
                            {
                              localId: crypto.randomUUID(),
                              phase_template_id: newTemplate.phase_template_id,
                              task_order: newTemplate.task_order,
                              scope: newTemplate.scope.trim(),
                              subcontractor: newTemplate.subcontractor,
                              default_days: newTemplate.default_days,
                              bottleneck_vendor: newTemplate.bottleneck_vendor
                            }
                          ]);
                          setNewTemplate({
                            phase_template_id: visiblePhaseTemplates[0]?.id ?? null,
                            task_order: displayedTemplateRows.length + 1,
                            scope: '',
                            subcontractor: '',
                            default_days: 1,
                            bottleneck_vendor: ''
                          });
                        }}
                        className="rounded-2xl bg-cyan-500/15 border border-cyan-500/30 px-4 py-3 font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        Add Scope
                      </button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                    <div className="border-b border-slate-800 bg-slate-950/70 px-5 py-3">
                      <div className="grid gap-3 xl:grid-cols-[180px_95px_minmax(0,1.4fr)_minmax(0,1fr)_100px_160px_auto]">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Phase</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Order</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scope</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Contractor</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Days</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Bottleneck</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {visiblePhaseTemplates
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
                              {phaseTemplatesForSection.map((template) => (
                                <div key={template.id} className="p-5">
                                  <div className="grid gap-3 xl:grid-cols-[180px_95px_minmax(0,1.4fr)_minmax(0,1fr)_100px_160px_auto]">
                                    <select
                                      value={template.draft.phase_template_id ?? ''}
                                      onChange={(event) => {
                                        const nextPhaseId = event.target.value || null;
                                        if (template.isNew) {
                                          setPendingTemplateCreates((current) =>
                                            current.map((item) => (item.localId === template.id ? { ...item, phase_template_id: nextPhaseId } : item))
                                          );
                                          return;
                                        }
                                        setTemplateDrafts((current) => ({
                                          ...current,
                                          [template.id]: { ...template.draft, phase_template_id: nextPhaseId }
                                        }));
                                      }}
                                      className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                    >
                                      <option value="">Unphased</option>
                                      {visiblePhaseTemplates
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
                                      value={template.draft.task_order}
                                      onChange={(event) => {
                                        const nextOrder = Math.max(1, Number(event.target.value) || 1);
                                        if (template.isNew) {
                                          setPendingTemplateCreates((current) =>
                                            current.map((item) => (item.localId === template.id ? { ...item, task_order: nextOrder } : item))
                                          );
                                          return;
                                        }
                                        setTemplateDrafts((current) => ({
                                          ...current,
                                          [template.id]: { ...template.draft, task_order: nextOrder }
                                        }));
                                      }}
                                      className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                    />
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-3">
                                        <input
                                          value={template.draft.scope}
                                          onChange={(event) => {
                                            if (template.isNew) {
                                              setPendingTemplateCreates((current) =>
                                                current.map((item) => (item.localId === template.id ? { ...item, scope: event.target.value } : item))
                                              );
                                              return;
                                            }
                                            setTemplateDrafts((current) => ({
                                              ...current,
                                              [template.id]: { ...template.draft, scope: event.target.value }
                                            }));
                                          }}
                                          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                        />
                                        {template.isNew && (
                                          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200">
                                            New
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <select
                                      value={template.draft.subcontractor}
                                      onChange={(event) => {
                                        const nextSubcontractor = event.target.value;
                                        if (template.isNew) {
                                          setPendingTemplateCreates((current) =>
                                            current.map((item) =>
                                              item.localId === template.id
                                                ? {
                                                    ...item,
                                                    subcontractor: nextSubcontractor,
                                                    bottleneck_vendor: syncBottleneckVendor(item.bottleneck_vendor, nextSubcontractor)
                                                  }
                                                : item
                                            )
                                          );
                                          return;
                                        }
                                        setTemplateDrafts((current) => ({
                                          ...current,
                                          [template.id]: {
                                            ...template.draft,
                                            subcontractor: nextSubcontractor,
                                            bottleneck_vendor: syncBottleneckVendor(template.draft.bottleneck_vendor, nextSubcontractor)
                                          }
                                        }));
                                      }}
                                      className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                    >
                                      <option value="">Unassigned</option>
                                      {subcontractorOptions.map((subcontractor) => (
                                        <option key={subcontractor} value={subcontractor}>
                                          {subcontractor}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="number"
                                      min="1"
                                      value={template.draft.default_days}
                                      onChange={(event) => {
                                        const nextDays = Math.max(1, Number(event.target.value) || 1);
                                        if (template.isNew) {
                                          setPendingTemplateCreates((current) =>
                                            current.map((item) => (item.localId === template.id ? { ...item, default_days: nextDays } : item))
                                          );
                                          return;
                                        }
                                        setTemplateDrafts((current) => ({
                                          ...current,
                                          [template.id]: { ...template.draft, default_days: nextDays }
                                        }));
                                      }}
                                      className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                    />
                                    <label className="flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200">
                                      <input
                                        type="checkbox"
                                        checked={!!template.draft.bottleneck_vendor}
                                        onChange={(event) => {
                                          if (template.isNew) {
                                            setPendingTemplateCreates((current) =>
                                              current.map((item) =>
                                                item.localId === template.id
                                                  ? {
                                                      ...item,
                                                      bottleneck_vendor: event.target.checked ? item.subcontractor : ''
                                                    }
                                                  : item
                                              )
                                            );
                                            return;
                                          }
                                          setTemplateDrafts((current) => ({
                                            ...current,
                                            [template.id]: {
                                              ...template.draft,
                                              bottleneck_vendor: event.target.checked ? template.draft.subcontractor : ''
                                            }
                                          }));
                                        }}
                                        disabled={!template.draft.subcontractor.trim()}
                                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-slate-900 disabled:opacity-40"
                                      />
                                    </label>
                                    <button
                                      disabled={!!busyLabel}
                                      onClick={() => {
                                        if (template.isNew) {
                                          setPendingTemplateCreates((current) => current.filter((item) => item.localId !== template.id));
                                          return;
                                        }
                                        if (!confirm(`Delete scope template "${template.sourceScope}" when you save this tab? Existing project scopes will remain as-is.`)) return;
                                        setPendingTemplateDeletes((current) => [...current, template.id]);
                                      }}
                                      className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-medium text-red-200 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                                    >
                                      <Trash2 size={16} />
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              ))}
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
                        <div className="divide-y divide-slate-800">
                          {(templatesByPhase.get('unphased') ?? []).map((template) => (
                            <div key={template.id} className="px-5 py-4 text-sm text-slate-300">
                              {template.draft.scope || 'Untitled scope'}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'subcontractors' && (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">Queue a subcontractor</div>
                    <p className="mt-2 text-sm text-slate-400">
                      Stage name and color edits here, then save them together like the rest of the template studio.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                      <input
                        value={newSubcontractorName}
                        onChange={(event) => setNewSubcontractorName(event.target.value)}
                        placeholder="Subcontractor name"
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        disabled={!newSubcontractorName.trim() || !!busyLabel}
                        onClick={() => {
                          setPendingSubcontractorCreates((current) => [
                            ...current,
                            {
                              localId: crypto.randomUUID(),
                              name: newSubcontractorName.trim(),
                              color: ''
                            }
                          ]);
                          setNewSubcontractorName('');
                        }}
                        className="rounded-2xl bg-cyan-500/15 border border-cyan-500/30 px-4 py-3 font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        Add Subcontractor
                      </button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                    <div className="border-b border-slate-800 bg-slate-950/70 px-5 py-3">
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_160px_120px_140px]">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Subcontractor</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Color</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Usage</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</div>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {displayedSubcontractorRows.length === 0 && (
                        <div className="px-5 py-8 text-sm text-slate-400">No subcontractors have been added yet.</div>
                      )}
                      {displayedSubcontractorRows.map((subcontractor) => {
                        const usageCount = subcontractorUsage.get(subcontractor.sourceName) ?? 0;
                        const inUse = usageCount > 0 && !subcontractor.isNew;

                        return (
                          <div key={subcontractor.id} className="p-5">
                            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_160px_120px_140px] xl:items-center">
                              <div className="flex items-center gap-3">
                                <input
                                  value={subcontractor.draft.name}
                                  onChange={(event) => {
                                    const nextName = event.target.value;
                                    if (subcontractor.isNew) {
                                      setPendingSubcontractorCreates((current) =>
                                        current.map((item) => (item.localId === subcontractor.id ? { ...item, name: nextName } : item))
                                      );
                                      return;
                                    }
                                    setSubcontractorDrafts((current) => ({
                                      ...current,
                                      [subcontractor.id]: { ...subcontractor.draft, name: nextName }
                                    }));
                                  }}
                                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                                />
                                {subcontractor.isNew && (
                                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200">
                                    New
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <input
                                  type="color"
                                  value={subcontractor.draft.color || '#0891b2'}
                                  onChange={(event) => {
                                    const nextColor = event.target.value;
                                    if (subcontractor.isNew) {
                                      setPendingSubcontractorCreates((current) =>
                                        current.map((item) => (item.localId === subcontractor.id ? { ...item, color: nextColor } : item))
                                      );
                                      return;
                                    }
                                    setSubcontractorDrafts((current) => ({
                                      ...current,
                                      [subcontractor.id]: { ...subcontractor.draft, color: nextColor }
                                    }));
                                  }}
                                  className="h-11 w-full rounded-2xl border border-slate-700 bg-slate-900 px-2 py-2"
                                />
                                <button
                                  onClick={() => {
                                    if (subcontractor.isNew) {
                                      setPendingSubcontractorCreates((current) =>
                                        current.map((item) => (item.localId === subcontractor.id ? { ...item, color: '' } : item))
                                      );
                                      return;
                                    }
                                    setSubcontractorDrafts((current) => ({
                                      ...current,
                                      [subcontractor.id]: { ...subcontractor.draft, color: '' }
                                    }));
                                  }}
                                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-300 transition hover:border-red-500/40 hover:text-red-200"
                                >
                                  Reset
                                </button>
                              </div>
                              <div className="text-sm text-slate-400">{inUse ? `${usageCount} refs` : 'Unused'}</div>
                              <button
                                disabled={inUse || !!busyLabel}
                                onClick={() => {
                                  if (subcontractor.isNew) {
                                    setPendingSubcontractorCreates((current) => current.filter((item) => item.localId !== subcontractor.id));
                                    return;
                                  }
                                  if (!confirm(`Delete subcontractor "${subcontractor.sourceName}" when you save this tab?`)) return;
                                  setPendingSubcontractorDeletes((current) => [...current, subcontractor.id]);
                                }}
                                className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-medium text-red-200 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                                title={inUse ? 'Remove its assignments before deleting this subcontractor.' : 'Queue this subcontractor for removal'}
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
                </div>
              )}

              {activeTab === 'users' && (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">Approved internal users</div>
                    <p className="mt-2 text-sm text-slate-400">
                      This allowlist controls which authenticated Google accounts can actually enter the app.
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                      <input
                        type="email"
                        value={newUserEmail}
                        onChange={(event) => setNewUserEmail(event.target.value)}
                        placeholder="name@company.com"
                        className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        disabled={!newUserEmail.trim() || !!busyLabel}
                        onClick={addAppUser}
                        className="rounded-2xl bg-cyan-500/15 border border-cyan-500/30 px-4 py-3 font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                      >
                        <Plus size={16} />
                        Add User
                      </button>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/40 overflow-hidden">
                    <div className="border-b border-slate-800 bg-slate-950/70 px-5 py-3">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_120px_140px_120px]">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Email</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Role</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</div>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {isLoadingUsers && (
                        <div className="px-5 py-8 text-sm text-slate-400">Loading approved users...</div>
                      )}
                      {!isLoadingUsers && appUsers.length === 0 && (
                        <div className="px-5 py-8 text-sm text-slate-400">No approved users found yet.</div>
                      )}
                      {!isLoadingUsers &&
                        appUsers.map((appUser) => (
                          <div key={appUser.id} className="p-5">
                            {(() => {
                              const isProtectedUser = PROTECTED_APP_USER_EMAILS.has(appUser.email.toLowerCase());

                              return (
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_120px_140px_120px] lg:items-center">
                              <div className="text-sm text-slate-100">{appUser.email}</div>
                              <div className="text-sm text-slate-300">{appUser.role || 'member'}</div>
                              <div>
                                <span
                                  className={clsx(
                                    'inline-flex rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]',
                                    appUser.is_active
                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                      : 'border-slate-600 bg-slate-800 text-slate-300'
                                  )}
                                >
                                  {appUser.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <div className="flex justify-end">
                                <button
                                  disabled={!!busyLabel || isProtectedUser}
                                  onClick={() => {
                                    if (!confirm(`Remove "${appUser.email}" from the approved users list?`)) return;
                                    void removeAppUser(appUser.id);
                                  }}
                                  className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-medium text-red-200 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                                  title={isProtectedUser ? 'Primary admin access cannot be removed.' : 'Remove this user'}
                                >
                                  <Trash2 size={16} />
                                  {isProtectedUser ? 'Protected' : 'Remove'}
                                </button>
                              </div>
                            </div>
                              );
                            })()}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'dependencies' && (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-400 font-semibold">Queue a dependency</div>
                    <p className="mt-2 text-sm text-slate-400">
                      Build out all the dependency changes you want in this tab, then save once to commit them.
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
                        {dependencyTemplateOptions.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.label}
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
                        {dependencyTemplateOptions.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.label}
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
                        onClick={() => {
                          setPendingDependencyCreates((current) => [
                            ...current,
                            {
                              localId: crypto.randomUUID(),
                              predecessor_id: newDependency.predecessor_id,
                              successor_id: newDependency.successor_id
                            }
                          ]);
                          setNewDependency({ predecessor_id: '', successor_id: '' });
                        }}
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
                        <div className="text-amber-300">That dependency already exists in the current draft.</div>
                      )}
                      {dependencyGraphIssue && <div className="text-red-300">{dependencyGraphIssue}</div>}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-800 bg-slate-950/60 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">Current dependency map</div>
                        <div className="text-sm text-slate-500">This list reflects queued adds and removals before you save.</div>
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{dependencyRows.length} links</div>
                    </div>
                    <div className="border-b border-slate-800 bg-slate-950/60 px-5 py-3">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)_110px]">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Predecessor</div>
                        <div />
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Successor</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</div>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {dependencyRows.map((dependency) => (
                        <div key={dependency.id} className="px-5 py-4">
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)_110px] items-center">
                            <select
                              value={
                                pendingDependencyCreates.some((item) => item.localId === dependency.id)
                                  ? dependency.predecessor_id
                                  : dependencyDrafts[dependency.id]?.predecessor_id ?? dependency.predecessor_id
                              }
                              onChange={(event) => {
                                const nextPredecessorId = event.target.value;
                                if (pendingDependencyCreates.some((item) => item.localId === dependency.id)) {
                                  setPendingDependencyCreates((current) =>
                                    current.map((item) =>
                                      item.localId === dependency.id ? { ...item, predecessor_id: nextPredecessorId } : item
                                    )
                                  );
                                  return;
                                }
                                setDependencyDrafts((current) => ({
                                  ...current,
                                  [dependency.id]: {
                                    predecessor_id: nextPredecessorId,
                                    successor_id: current[dependency.id]?.successor_id ?? dependency.successor_id
                                  }
                                }));
                              }}
                              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                            >
                              <option value="">Select predecessor</option>
                              {dependencyTemplateOptions.map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.label}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center justify-center text-slate-500">
                              <ArrowRight size={18} />
                            </div>
                            <select
                              value={
                                pendingDependencyCreates.some((item) => item.localId === dependency.id)
                                  ? dependency.successor_id
                                  : dependencyDrafts[dependency.id]?.successor_id ?? dependency.successor_id
                              }
                              onChange={(event) => {
                                const nextSuccessorId = event.target.value;
                                if (pendingDependencyCreates.some((item) => item.localId === dependency.id)) {
                                  setPendingDependencyCreates((current) =>
                                    current.map((item) =>
                                      item.localId === dependency.id ? { ...item, successor_id: nextSuccessorId } : item
                                    )
                                  );
                                  return;
                                }
                                setDependencyDrafts((current) => ({
                                  ...current,
                                  [dependency.id]: {
                                    predecessor_id: current[dependency.id]?.predecessor_id ?? dependency.predecessor_id,
                                    successor_id: nextSuccessorId
                                  }
                                }));
                              }}
                              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 focus:outline-none focus:border-cyan-500"
                            >
                              <option value="">Select successor</option>
                              {dependencyTemplateOptions.map((template) => (
                                <option key={template.id} value={template.id}>
                                  {template.label}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center justify-end gap-2">
                              {pendingDependencyCreates.some((item) => item.localId === dependency.id) && (
                                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-cyan-200">
                                  New
                                </span>
                              )}
                              <button
                                disabled={!!busyLabel}
                                onClick={() => {
                                  if (pendingDependencyCreates.some((item) => item.localId === dependency.id)) {
                                    setPendingDependencyCreates((current) => current.filter((item) => item.localId !== dependency.id));
                                    return;
                                  }
                                  if (!confirm(`Remove dependency from "${dependency.predecessorLabel}" to "${dependency.successorLabel}" when you save this tab?`)) return;
                                  setPendingDependencyDeletes((current) => [...current, dependency.id]);
                                }}
                                className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-medium text-red-200 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                              >
                                <Trash2 size={16} />
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {activeTabMeta && (
              <div className="border-t border-slate-800 bg-slate-950/80 px-6 py-4 flex items-center justify-between gap-4">
                <div className="text-sm text-slate-400">
                  {activeTabMeta.hasChanges ? activeTabMeta.summary : 'No unsaved changes in this tab.'}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    disabled={!activeTabMeta.hasChanges || !!busyLabel}
                    onClick={activeTabMeta.onReset}
                    className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium text-slate-200 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Reset Tab
                  </button>
                  <button
                    disabled={activeTabMeta.saveDisabled}
                    onClick={activeTabMeta.onSave}
                    className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                  >
                    <Save size={16} />
                    Save {STUDIO_TABS.find((tab) => tab.id === activeTab)?.label}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
