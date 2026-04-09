import { useState, useEffect } from 'react';
import { useProjectStore } from './store/projectStore';
import { GanttChart } from './components/GanttChart';
import { SidePanel } from './components/SidePanel';

function App() {
  const { tasks, isLoading, error, fetchData } = useProjectStore();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : undefined;

  return (
    <div className="flex h-screen bg-slate-900 text-slate-50 font-sans">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
              Residential Construction
            </h1>
            <p className="text-sm text-slate-400">Manager</p>
          </div>
          <div className="flex items-center space-x-3">
             <button 
               disabled={isLoading || !!error}
               onClick={() => {
                 useProjectStore.getState().addTask({
                   name: 'New Task',
                   subcontractor: 'Unassigned',
                   duration: 3,
                   lag: 0
                 });
               }}
               className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none rounded-md font-medium text-sm transition-colors shadow-lg shadow-blue-500/20"
             >
               + Add Task
             </button>
          </div>
        </header>
        
        <main className="flex-1 overflow-auto p-6">
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden shadow-2xl backdrop-blur-md">
            {isLoading ? (
              <div className="flex items-center justify-center p-12 text-slate-400">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Loading project data...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center p-12 text-red-400">
                <span className="font-medium text-lg mb-2">Error Connecting to Backend</span>
                <span className="text-sm border border-red-500/30 bg-red-500/10 p-3 rounded">{error}</span>
                <button title="Retry" onClick={fetchData} className="mt-4 px-4 py-2 bg-red-900/40 hover:bg-red-800/60 rounded text-slate-200">
                  Retry Connection
                </button>
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400 h-64">
                <span className="mb-4">No tasks exist.</span>
                <button 
                  onClick={() => {
                    useProjectStore.getState().addTask({
                      name: 'New Task', subcontractor: 'Unassigned', duration: 3, lag: 0
                    });
                  }}
                  className="px-4 py-2 border border-blue-500/50 hover:bg-blue-500/10 text-blue-400 rounded transition-colors"
                >
                  Create First Task
                </button>
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
          task={selectedTask} 
          onClose={() => setSelectedTaskId(null)} 
        />
      )}
    </div>
  );
}

export default App;
