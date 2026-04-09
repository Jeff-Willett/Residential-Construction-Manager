import { useState, useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { getCalendarDateFromProjectDay } from '../utils/cpm';
import type { Task } from '../utils/cpm';
import { X, Clock, CalendarDays, AlertTriangle, Link, Check } from 'lucide-react';
import clsx from 'clsx';

export function SidePanel({ task, onClose }: { task: Task, onClose: () => void }) {
  const { updateTaskDetails, setDependenciesForTask, dependencies, projectStartDate, tasks } = useProjectStore();
  const [durationInput, setDurationInput] = useState(task.duration.toString());
  const [nameInput, setNameInput] = useState(task.name);
  const [subInput, setSubInput] = useState(task.subcontractor);

  // Update local state if external task changes
  useEffect(() => {
    setDurationInput(task.duration.toString());
    setNameInput(task.name);
    setSubInput(task.subcontractor);
  }, [task]);

  const handleSave = () => {
    const val = parseInt(durationInput, 10);
    updateTaskDetails(task.id, {
      name: nameInput,
      subcontractor: subInput,
      duration: !isNaN(val) && val > 0 ? val : task.duration
    });
  };

  const startDate = getCalendarDateFromProjectDay(projectStartDate, task.es);
  const endDate = getCalendarDateFromProjectDay(projectStartDate, task.ef);

  const preds = dependencies.filter(d => d.successorId === task.id);

  return (
    <div className="w-80 bg-slate-800 border-l border-slate-700/50 shadow-2xl flex flex-col relative z-20 transform transition-transform duration-300">
      <div className="p-4 border-b border-slate-700/80 flex items-center justify-between">
        <h3 className="font-semibold text-lg text-slate-100">{task.name}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-auto space-y-6">
        <div>
           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Task Name</p>
           <input 
             type="text"
             value={nameInput}
             onChange={(e) => setNameInput(e.target.value)}
             className="w-full bg-slate-900 border border-slate-700/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 mb-3"
           />

           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Subcontractor</p>
           <input 
             type="text"
             value={subInput}
             onChange={(e) => setSubInput(e.target.value)}
             className="w-full bg-slate-900 border border-slate-700/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 mb-3"
           />

           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Duration (Days)</p>
           <div className="flex space-x-2">
             <input 
               type="number" 
               min="1"
               value={durationInput}
               onChange={(e) => setDurationInput(e.target.value)}
               className="flex-1 bg-slate-900 border border-slate-700/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 transition-all cursor-text"
             />
             <button 
               onClick={handleSave} 
               className="bg-blue-600 hover:bg-blue-500 px-4 rounded-md font-medium text-sm transition-colors text-white shadow-md shadow-blue-600/20"
             >
               Save Info
             </button>
           </div>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 space-y-3">
          <div className="flex items-center space-x-3 text-sm">
            <CalendarDays size={16} className="text-green-400" />
            <div>
              <p className="text-slate-400 text-xs">Start Date</p>
              <p className="text-slate-200">{startDate}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 text-sm">
            <Clock size={16} className="text-red-400" />
            <div>
              <p className="text-slate-400 text-xs">End Date</p>
              <p className="text-slate-200">{endDate}</p>
            </div>
          </div>
        </div>

        <div>
           <div className="flex items-center justify-between mb-2">
             <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Metrics</p>
             {task.isCritical && (
                 <span className="flex items-center text-xs font-medium text-red-400 bg-red-400/10 px-2 py-1 rounded-full">
                    <AlertTriangle size={12} className="mr-1" /> Critical
                 </span>
             )}
           </div>
           <div className="grid grid-cols-2 gap-2 text-sm">
             <div className="bg-slate-700/30 p-2 rounded border border-slate-700/50">
               <span className="text-slate-400 text-xs block">Total Float</span>
               <span className={clsx(task.float === 0 ? "text-red-400 font-bold" : "text-green-400")}>{task.float} days</span>
             </div>
             <div className="bg-slate-700/30 p-2 rounded border border-slate-700/50">
               <span className="text-slate-400 text-xs block">Project Day</span>
               <span className="text-slate-200">{task.es} to {task.ef}</span>
             </div>
           </div>
        </div>

        {/* Relationships */}
        <div>
           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
             <Link size={14} className="mr-1" /> Dependencies (Predecessors)
           </p>
           <div className="space-y-2 bg-slate-900/40 p-2 rounded-md border border-slate-700/50 max-h-48 overflow-y-auto">
             {tasks.filter(t => t.id !== task.id).map(t => {
               const isChecked = preds.some(p => p.predecessorId === t.id);
               return (
                 <label key={t.id} className="flex items-center space-x-3 p-2 rounded hover:bg-slate-800/80 cursor-pointer border border-transparent transition-colors group">
                    <div className={clsx(
                      "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                      isChecked ? "bg-blue-600 border-blue-500" : "bg-slate-800 border-slate-600 group-hover:border-blue-400"
                    )}>
                       {isChecked && <Check size={12} className="text-white" strokeWidth={3} />}
                    </div>
                    <input 
                      type="checkbox"
                      className="hidden"
                      checked={isChecked}
                      onChange={(e) => {
                        let newPredIds = preds.map(p => p.predecessorId);
                        if (e.target.checked) {
                           newPredIds.push(t.id);
                        } else {
                           newPredIds = newPredIds.filter(id => id !== t.id);
                        }
                        setDependenciesForTask(task.id, newPredIds);
                      }}
                    />
                    <div className="text-sm select-none">
                      <span className="text-slate-200">{t.name}</span>
                      <span className="text-slate-500 text-xs ml-2">({t.subcontractor})</span>
                    </div>
                 </label>
               );
             })}
           </div>
        </div>

      </div>
    </div>
  );
}
