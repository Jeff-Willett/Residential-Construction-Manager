import { useState } from 'react';
import { useProjectStore } from './store/projectStore';
import { GanttChart } from './components/GanttChart';
import { SidePanel } from './components/SidePanel';

function App() {
  const { tasks } = useProjectStore();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

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
               onClick={() => {
                 useProjectStore.getState().addTask({
                   name: 'New Task',
                   subcontractor: 'Unassigned',
                   duration: 3
                 });
               }}
               className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md font-medium text-sm transition-colors shadow-lg shadow-blue-500/20"
             >
               + Add Task
             </button>
          </div>
        </header>
        
        <main className="flex-1 overflow-auto p-6">
          <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden shadow-2xl backdrop-blur-md">
            <GanttChart onTaskClick={(id) => setSelectedTaskId(id)} selectedTaskId={selectedTaskId} />
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
