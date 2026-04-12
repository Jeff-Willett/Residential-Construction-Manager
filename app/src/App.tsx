import { useState, useEffect } from 'react';
import { useProjectStore } from './store/projectStore';
import { GanttChart } from './components/GanttChart';
import { SidePanel } from './components/SidePanel';
import { VendorColorModal } from './components/VendorColorModal';
import { FilterModal } from './components/FilterModal';
import { TemplateStudioModal } from './components/TemplateStudioModal';
import { Settings, Filter, RotateCcw, RotateCw, FileText } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

function App() {
  const { projects, tasks, isLoading, error, fetchData, activeFilters, undo, undoStack, redo, redoStack } = useProjectStore(
    useShallow((state) => ({
      projects: state.projects,
      tasks: state.tasks,
      isLoading: state.isLoading,
      error: state.error,
      fetchData: state.fetchData,
      activeFilters: state.activeFilters,
      undo: state.undo,
      undoStack: state.undoStack,
      redo: state.redo,
      redoStack: state.redoStack
    }))
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isTemplateStudioOpen, setIsTemplateStudioOpen] = useState(false);

  const activeFilterCount = activeFilters.projects.length + activeFilters.vendors.length + activeFilters.scopes.length;

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) : undefined;

  return (
    <div className="flex h-screen bg-slate-900 text-slate-50 font-sans">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
              Residential Construction
            </h1>
            <p className="text-sm text-slate-400 flex items-center">
              Residential Construction Manager
              <span className="ml-2 px-1.5 py-0.5 bg-slate-800 text-slate-500 text-[10px] rounded border border-slate-700 font-mono">
                v0.0.9
              </span>
            </p>
          </div>
          <div className="flex items-center space-x-3">
             <button
               onClick={() => setIsFilterOpen(true)}
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
               onClick={() => setIsTemplateStudioOpen(true)}
               className="p-2 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 shadow-sm transition-colors text-slate-300 hover:text-white"
               title="Scheduling Template Studio"
             >
               <FileText size={20} />
             </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 shadow-sm transition-colors text-slate-300 hover:text-white"
                title="Color Matrix Settings"
              >
                <Settings size={20} />
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
             <button 
               disabled={isLoading || !!error}
               onClick={() => {
                 const name = prompt("Enter Project Name (e.g. IW12):");
                 if (!name) return;
                 const start = prompt("Enter Start Date (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
                 if (name && start) {
                    useProjectStore.getState().addProject(name, start);
                 }
               }}
               className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none rounded-md font-medium text-sm transition-colors shadow-lg shadow-blue-500/20"
             >
               + Add Project
             </button>
          </div>
        </header>
        
        <main className="flex-1 overflow-hidden p-6 flex flex-col">
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
              <GanttChart onTaskClick={(id) => setSelectedTaskId(id)} selectedTaskId={selectedTaskId} />
            )}
          </div>
        </main>
      </div>

      {/* Side Panel */}
      {selectedTask && (
        <SidePanel 
          key={selectedTask.id}
          task={selectedTask} 
          onClose={() => setSelectedTaskId(null)} 
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <VendorColorModal onClose={() => setIsSettingsOpen(false)} />
      )}

      {/* Filter Modal */}
      {isFilterOpen && (
        <FilterModal onClose={() => setIsFilterOpen(false)} />
      )}

      {/* Template Studio */}
      {isTemplateStudioOpen && (
        <TemplateStudioModal onClose={() => setIsTemplateStudioOpen(false)} />
      )}
    </div>
  );
}

export default App;
