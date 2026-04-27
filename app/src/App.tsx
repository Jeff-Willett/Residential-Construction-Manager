import { useState, useEffect, useRef, useMemo } from 'react';
import { useProjectStore, type ActiveFilters } from './store/projectStore';
import { GanttChart, type GanttChartHandle } from './components/GanttChart';
import { SidePanel } from './components/SidePanel';
import { FilterModal } from './components/FilterModal';
import { TemplateStudioModal, type TemplateStudioTab } from './components/TemplateStudioModal';
import { AddProjectModal } from './components/AddProjectModal';
import { PublicSubcontractorSchedule } from './components/PublicSubcontractorSchedule';
import { Filter, LogOut, RotateCcw, RotateCw, FileText, ZoomIn, ZoomOut } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from './lib/supabase';

const APP_VERSION = __APP_VERSION__;
const APP_BRANCH = __GIT_BRANCH__;
const APP_COMMIT = __GIT_COMMIT__;
const APP_VERCEL_ENV = __VERCEL_ENV__;
const CHART_VIEW_STATE_STORAGE_KEY = 'gantt:view-state';
const HOME_FILTERS: ActiveFilters = { projects: [], vendors: [], scopes: [] };

type ViewModal = 'filter' | 'template' | 'add-project' | 'edit-project';
type UrlViewState = {
  selectedTaskId: string | null;
  editingProjectId: string | null;
  modal: ViewModal | null;
  filters: ActiveFilters;
};

type ResettableChartViewState = {
  version: 2;
  zoomLevel: 'day' | 'week' | 'month' | 'year';
  verticalZoomLevel: 'minCompressed' | 'maxCompressed' | 'ultraCompressed' | 'extraCompressed' | 'compressed' | 'standard';
  leftPanelWidth: number;
  visibleProjectPhases: Record<string, boolean>;
  expandedPhases: Record<string, boolean>;
  hiddenProjectBars: Record<string, boolean>;
  hiddenPhaseBars: Record<string, boolean>;
  scrollTop: number;
  scrollLeft: number;
};

type AccessState = 'loading' | 'signed_out' | 'checking' | 'approved' | 'unauthorized';

const completeOAuthSessionFromHash = async () => {
  if (typeof window === 'undefined' || !window.location.hash.includes('access_token=')) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return null;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  if (!error) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }

  return { session: data.session, error };
};

const getEnvironmentLabel = () => {
  if (import.meta.env.DEV) return 'local testing';
  if (APP_VERCEL_ENV === 'production') return 'production';
  if (APP_VERCEL_ENV === 'preview') return 'preview testing';
  if (APP_BRANCH === 'main') return 'production';
  return 'preview testing';
};

const parseUrlViewState = (): UrlViewState => {
  if (typeof window === 'undefined') {
    return { selectedTaskId: null, editingProjectId: null, modal: null, filters: HOME_FILTERS };
  }

  const params = new URLSearchParams(window.location.search);
  const modal = params.get('modal');
  const allowedModals: ViewModal[] = ['filter', 'template', 'add-project', 'edit-project'];
  const normalizedModal = modal === 'settings' ? 'template' : modal;

  return {
    selectedTaskId: params.get('task'),
    editingProjectId: params.get('project'),
    modal: allowedModals.includes(normalizedModal as ViewModal) ? (normalizedModal as ViewModal) : null,
    filters: {
      projects: params.getAll('filterProject'),
      vendors: params.getAll('filterVendor'),
      scopes: params.getAll('filterScope')
    }
  };
};

const writeUrlViewState = ({ selectedTaskId, editingProjectId, modal, filters }: UrlViewState) => {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams();

  if (selectedTaskId) params.set('task', selectedTaskId);
  if (modal) params.set('modal', modal);
  if (modal === 'edit-project' && editingProjectId) params.set('project', editingProjectId);

  filters.projects.forEach((projectId) => params.append('filterProject', projectId));
  filters.vendors.forEach((vendor) => params.append('filterVendor', vendor));
  filters.scopes.forEach((scope) => params.append('filterScope', scope));

  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', nextUrl);
};

const readPreservedLeftPanelWidth = () => {
  if (typeof window === 'undefined') return 272;

  try {
    const rawValue = window.localStorage.getItem(CHART_VIEW_STATE_STORAGE_KEY);
    if (!rawValue) return 272;

    const parsed = JSON.parse(rawValue) as Partial<ResettableChartViewState> | null;
    if (typeof parsed?.leftPanelWidth !== 'number' || !Number.isFinite(parsed.leftPanelWidth)) {
      return 272;
    }

    return Math.max(200, Math.min(520, parsed.leftPanelWidth));
  } catch {
    return 272;
  }
};

const resetPersistedChartViewState = () => {
  if (typeof window === 'undefined') return;

  const leftPanelWidth = readPreservedLeftPanelWidth();
  const resetState: ResettableChartViewState = {
    version: 2,
    zoomLevel: 'day',
    verticalZoomLevel: 'standard',
    leftPanelWidth,
    visibleProjectPhases: {},
    expandedPhases: {},
    hiddenProjectBars: {},
    hiddenPhaseBars: {},
    scrollTop: 0,
    scrollLeft: 0
  };

  window.localStorage.setItem(CHART_VIEW_STATE_STORAGE_KEY, JSON.stringify(resetState));
};

function AuthenticatedApp() {
  const { projects, tasks, isLoading, error, fetchData, activeFilters, setActiveFilters, undo, undoStack, redo, redoStack } = useProjectStore(
    useShallow((state) => ({
      projects: state.projects,
      tasks: state.tasks,
      isLoading: state.isLoading,
      error: state.error,
      fetchData: state.fetchData,
      activeFilters: state.activeFilters,
      setActiveFilters: state.setActiveFilters,
      undo: state.undo,
      undoStack: state.undoStack,
      redo: state.redo,
      redoStack: state.redoStack
    }))
  );
  const [initialUrlViewState] = useState(parseUrlViewState);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialUrlViewState.selectedTaskId);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(initialUrlViewState.editingProjectId);
  const [openModal, setOpenModal] = useState<ViewModal | null>(initialUrlViewState.modal);
  const [templateStudioInitialTab, setTemplateStudioInitialTab] = useState<TemplateStudioTab>('overview');
  const [zoomControls, setZoomControls] = useState({
    canZoomIn: false,
    canZoomOut: true,
    canZoomInVertical: true,
    canZoomOutVertical: true,
    verticalZoomPercent: 100
  });
  const [chartResetKey, setChartResetKey] = useState(0);
  const [accessState, setAccessState] = useState<AccessState>('loading');
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const hasInitialUrlFilters =
    initialUrlViewState.filters.projects.length > 0 ||
    initialUrlViewState.filters.vendors.length > 0 ||
    initialUrlViewState.filters.scopes.length > 0;
  const [hasHydratedUrlState, setHasHydratedUrlState] = useState(!hasInitialUrlFilters);
  const ganttChartRef = useRef<GanttChartHandle>(null);
  const environmentLabel = getEnvironmentLabel();

  const activeFilterCount = activeFilters.projects.length + activeFilters.vendors.length + activeFilters.scopes.length;

  useEffect(() => {
    let cancelled = false;

    const applySessionState = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => {
      const nextEmail = session?.user.email?.toLowerCase() ?? null;
      if (cancelled) return;

      setCurrentUserEmail(nextEmail);

      if (!session || !nextEmail) {
        setAccessState('signed_out');
        return;
      }

      setAccessState('checking');

      const { data, error: approvalError } = await supabase.rpc('get_my_app_access');
      if (cancelled) return;

      if (approvalError) {
        setAuthError(approvalError.message);
        setAccessState('signed_out');
        return;
      }

      if (!data?.[0]?.is_active) {
        setAccessState('unauthorized');
        return;
      }

      setAccessState('approved');
      setAuthError(null);
      await fetchData();
    };

    const hydrateSession = async () => {
      setAuthError(null);
      const callbackResult = await completeOAuthSessionFromHash();
      if (cancelled) return;

      if (callbackResult?.error) {
        setAuthError(callbackResult.error.message);
        setAccessState('signed_out');
        return;
      }

      if (callbackResult?.session) {
        await applySessionState(callbackResult.session);
        return;
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionError) {
        setAuthError(sessionError.message);
        setAccessState('signed_out');
        return;
      }

      await applySessionState(data.session);
    };

    void hydrateSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySessionState(session);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [fetchData]);

  useEffect(() => {
    if (!hasInitialUrlFilters) return;

    setActiveFilters(initialUrlViewState.filters);
    const hydrationTimer = window.setTimeout(() => setHasHydratedUrlState(true), 0);

    return () => window.clearTimeout(hydrationTimer);
  }, [hasInitialUrlFilters, initialUrlViewState.filters, setActiveFilters]);

  const validSelectedTaskId = useMemo(
    () => (selectedTaskId && tasks.some((task) => task.id === selectedTaskId) ? selectedTaskId : null),
    [selectedTaskId, tasks]
  );
  const validEditingProjectId = useMemo(
    () => (editingProjectId && projects.some((project) => project.id === editingProjectId) ? editingProjectId : null),
    [editingProjectId, projects]
  );
  const effectiveOpenModal = useMemo<ViewModal | null>(() => {
    if (openModal === 'edit-project' && !validEditingProjectId) {
      return null;
    }
    return openModal;
  }, [openModal, validEditingProjectId]);

  useEffect(() => {
    if (!hasHydratedUrlState) return;

    writeUrlViewState({
      selectedTaskId: validSelectedTaskId,
      editingProjectId: validEditingProjectId,
      modal: effectiveOpenModal,
      filters: activeFilters
    });
  }, [activeFilters, effectiveOpenModal, hasHydratedUrlState, validEditingProjectId, validSelectedTaskId]);

  const selectedTask = validSelectedTaskId ? tasks.find((task) => task.id === validSelectedTaskId) : undefined;
  const isFilterOpen = effectiveOpenModal === 'filter';
  const isTemplateStudioOpen = effectiveOpenModal === 'template';
  const isAddProjectOpen = effectiveOpenModal === 'add-project';

  const resetToHomeView = () => {
    setSelectedTaskId(null);
    setEditingProjectId(null);
    setOpenModal(null);
    setActiveFilters(HOME_FILTERS);
    resetPersistedChartViewState();
    setChartResetKey((current) => current + 1);
  };

  const handleLogOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.reload();
    }
  };

  const handleSignInWithGoogle = async () => {
    setAuthError(null);

    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account'
        }
      }
    });

    if (signInError) {
      setAuthError(signInError.message);
    }
  };

  if (accessState === 'loading' || accessState === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 px-8 py-6 shadow-2xl">
          <div className="flex items-center gap-3 text-slate-300">
            <svg className="h-5 w-5 animate-spin text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span>{accessState === 'loading' ? 'Restoring session...' : 'Checking access...'}</span>
          </div>
        </div>
      </div>
    );
  }

  if (accessState === 'signed_out') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-xl rounded-[2rem] border border-slate-800 bg-slate-900/85 p-10 shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
          <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300 w-fit">
            Phase 1 Access Control
          </div>
          <h1 className="mt-6 text-3xl font-semibold text-white">Residential Construction Manager</h1>
          <p className="mt-4 text-base text-slate-300">
            Sign in with an approved Google account to access the scheduling workspace and the branch database.
          </p>
          {authError && (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {authError}
            </div>
          )}
          <button
            onClick={handleSignInWithGoogle}
            className="mt-8 inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (accessState === 'unauthorized') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-xl rounded-[2rem] border border-slate-800 bg-slate-900/85 p-10 shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
          <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300 w-fit">
            Access Restricted
          </div>
          <h1 className="mt-6 text-3xl font-semibold text-white">This Google account is not approved yet</h1>
          <p className="mt-4 text-base text-slate-300">
            Signed in as <span className="font-medium text-white">{currentUserEmail ?? 'unknown user'}</span>.
          </p>
          <button
            onClick={handleLogOut}
            className="mt-8 inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-900 text-slate-50 font-sans">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
          <div>
            <button
              type="button"
              onClick={resetToHomeView}
              className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300 hover:from-cyan-300 hover:to-blue-200 transition-colors cursor-pointer"
              title="Return to the default home view"
            >
              Residential Construction
            </button>
            <p className="text-sm text-slate-400 flex items-center flex-wrap gap-2">
              Residential Construction Manager
              <span className="px-1.5 py-0.5 bg-slate-800 text-cyan-300 text-[10px] rounded border border-cyan-500/30 font-mono">
                v{APP_VERSION}
              </span>
              <span
                className="px-1.5 py-0.5 bg-slate-800 text-[10px] rounded border font-mono uppercase tracking-[0.14em] border-slate-700 text-slate-300"
                title="Current environment"
              >
                {environmentLabel}
              </span>
              <span
                className="px-1.5 py-0.5 bg-slate-800 text-[10px] rounded border border-slate-700 text-slate-400 font-mono"
                title="Current branch"
              >
                branch {APP_BRANCH}
              </span>
              <span
                className="px-1.5 py-0.5 bg-slate-800 text-[10px] rounded border border-slate-700 text-slate-500 font-mono"
                title="Current source commit"
              >
                source {APP_COMMIT}
              </span>
            </p>
          </div>
          <div className="flex items-center space-x-3">
             <button
               onClick={() => setOpenModal('filter')}
               className="relative p-2 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 shadow-sm transition-colors text-slate-300 hover:text-white"
               title="Filter Logic"
             >
               <Filter size={20} />
               {activeFilterCount > 0 && (
                 <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-bold text-white shadow shadow-cyan-500/50">
                   {activeFilterCount}
                 </span>
               )}
             </button>
             <button
               onClick={() => {
                 setTemplateStudioInitialTab('overview');
                 setOpenModal('template');
               }}
               className="p-2 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 shadow-sm transition-colors text-slate-300 hover:text-white"
               title="Scheduling Template Studio"
             >
               <FileText size={20} />
             </button>
              <button
                disabled={undoStack.length === 0 || isLoading}
                onClick={undo}
                className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-md border border-slate-700 shadow-sm transition-colors text-orange-400 hover:text-orange-300"
                title={`Undo Change (${undoStack.length} available)`}
              >
                <RotateCcw size={20} />
              </button>
              <button
                disabled={redoStack.length === 0 || isLoading}
                onClick={redo}
                className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-md border border-slate-700 shadow-sm transition-colors text-blue-400 hover:text-blue-300"
                title={`Redo Change (${redoStack.length} available)`}
              >
                <RotateCw size={20} />
              </button>
              <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Time</span>
                <button
                  disabled={!zoomControls.canZoomOut || isLoading || !!error}
                  onClick={() => ganttChartRef.current?.zoomOut()}
                  className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-md border border-slate-700 shadow-sm transition-colors text-slate-300 hover:text-white"
                  title="Horizontal Zoom Out"
                >
                  <ZoomOut size={20} />
                </button>
                <button
                  disabled={!zoomControls.canZoomIn || isLoading || !!error}
                  onClick={() => ganttChartRef.current?.zoomIn()}
                  className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-md border border-slate-700 shadow-sm transition-colors text-slate-300 hover:text-white"
                  title="Horizontal Zoom In"
                >
                  <ZoomIn size={20} />
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/60 px-2 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Rows {zoomControls.verticalZoomPercent}%
                </span>
                <button
                  disabled={!zoomControls.canZoomOutVertical || isLoading || !!error}
                  onClick={() => ganttChartRef.current?.zoomOutVertical()}
                  className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-md border border-slate-700 shadow-sm transition-colors text-slate-300 hover:text-white"
                  title="Vertical Zoom Out"
                >
                  <ZoomOut size={20} />
                </button>
                <button
                  disabled={!zoomControls.canZoomInVertical || isLoading || !!error}
                  onClick={() => ganttChartRef.current?.zoomInVertical()}
                  className="p-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed rounded-md border border-slate-700 shadow-sm transition-colors text-slate-300 hover:text-white"
                  title="Vertical Zoom In"
                >
                  <ZoomIn size={20} />
                </button>
              </div>
             <button 
               disabled={isLoading || !!error}
               onClick={() => setOpenModal('add-project')}
               className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none rounded-md font-medium text-sm transition-colors shadow-lg shadow-blue-500/20"
             >
               + Add Project
             </button>
             <button
               onClick={handleLogOut}
               className="inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-colors border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
               title="Log out and restart the sign-in flow"
             >
               <LogOut size={16} />
               <span>Log out</span>
             </button>
          </div>
        </header>
        
        <main className="flex-1 overflow-hidden px-4 pt-2 pb-4 flex flex-col">
          <div className="flex-1 flex flex-col bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden shadow-2xl backdrop-blur-md">
            {isLoading ? (
              <div className="flex items-center justify-center p-12 text-slate-400">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Loading engine data...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center p-12 text-red-400">
                <span className="font-medium text-lg mb-2">Error Connecting to Backend</span>
                <span className="text-sm border border-red-500/30 bg-red-500/10 p-3 rounded">{error}</span>
                <button title="Retry" onClick={fetchData} className="mt-4 px-4 py-2 bg-red-900/40 hover:bg-red-800/60 rounded text-slate-200">
                  Retry Connection
                </button>
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400 h-64">
                <span className="mb-4">No projects exist. Run the generated seed script in Supabase!</span>
              </div>
            ) : (
              <GanttChart
                key={chartResetKey}
                ref={ganttChartRef}
                onTaskClick={(id) => setSelectedTaskId(id)}
                onEditProject={(projectId) => {
                  setEditingProjectId(projectId);
                  setOpenModal('edit-project');
                }}
                selectedTaskId={validSelectedTaskId}
                onZoomStateChange={setZoomControls}
              />
            )}
          </div>
        </main>
      </div>

      {/* Side Panel */}
      {selectedTask && (
        <SidePanel 
          key={[
            selectedTask.id,
            selectedTask.duration,
            selectedTask.subcontractor ?? '',
            selectedTask.bottleneck_vendor ?? '',
            selectedTask.manual_start ?? '',
            selectedTask.manual_finish ?? '',
            selectedTask.calculated_start ?? '',
            selectedTask.calculated_finish ?? ''
          ].join(':')}
          task={selectedTask} 
          onClose={() => setSelectedTaskId(null)} 
        />
      )}

      {/* Filter Modal */}
      {isFilterOpen && (
        <FilterModal onClose={() => setOpenModal(null)} />
      )}

      {/* Template Studio */}
      {isTemplateStudioOpen && (
        <TemplateStudioModal
          initialTab={templateStudioInitialTab}
          onClose={() => {
            setTemplateStudioInitialTab('overview');
            setOpenModal(null);
          }}
        />
      )}

      {isAddProjectOpen && (
        <AddProjectModal onClose={() => setOpenModal(null)} />
      )}

      {effectiveOpenModal === 'edit-project' && validEditingProjectId && (
        <AddProjectModal
          mode="edit"
          projectId={validEditingProjectId}
          onClose={() => {
            setEditingProjectId(null);
            setOpenModal(null);
          }}
        />
      )}
    </div>
  );
}

function App() {
  const isPublicSubcontractorRoute =
    typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/subs';

  if (isPublicSubcontractorRoute) {
    return <PublicSubcontractorSchedule />;
  }

  return <AuthenticatedApp />;
}

export default App;
