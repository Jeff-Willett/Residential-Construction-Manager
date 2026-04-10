import { useState, useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import type { EngineTask } from '../utils/schedulingEngine';
import { X, Clock, CalendarDays, AlertTriangle, Link } from 'lucide-react';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';

export function SidePanel({ task, onClose }: { task: EngineTask, onClose: () => void }) {
  const { updateTaskDetails, projects } = useProjectStore();
  const [durationInput, setDurationInput] = useState(task.duration.toString());

  // Update local state if external task changes
  useEffect(() => {
    setDurationInput(task.duration.toString());
  }, [task]);

  const project = projects.find(p => p.id === task.project_id);

  const handleSave = () => {
    const dur = parseInt(durationInput, 10);
    updateTaskDetails(task.id, !isNaN(dur) && dur > 0 ? dur : task.duration);
  };

  return (
    <div className="w-80 bg-slate-800 border-l border-slate-700/50 shadow-2xl flex flex-col relative z-20 transform transition-transform duration-300">
      <div className="p-4 border-b border-slate-700/80 flex items-center justify-between">
        <div>
           <h3 className="font-semibold text-lg text-slate-100">{task.name}</h3>
           <p className="text-xs text-slate-400">{project?.name || 'Unknown Project'}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-auto space-y-6">
        <div>
           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Subcontractor</p>
           <div className="w-full bg-slate-900 border border-slate-700/80 rounded-md px-3 py-2 text-slate-400 mb-3 select-none">
              {task.subcontractor || 'Unassigned'}
           </div>

           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Duration (Working Days)</p>
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
               Save
             </button>
           </div>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 space-y-4">
          <div>
            <p className="text-slate-400 text-xs flex items-center mb-1">
              <CalendarDays size={14} className="mr-1 text-green-400" /> Start Date
            </p>
            <div className="w-full bg-slate-800 rounded px-2 py-1 text-sm text-slate-300">
               {task.calculated_start ? format(parseISO(task.calculated_start), 'MMM d, yyyy') : 'Pending'}
            </div>
          </div>
          <div>
            <p className="text-slate-400 text-xs flex items-center mb-1">
              <Clock size={14} className="mr-1 text-orange-400" /> Finish Date
            </p>
            <div className="w-full bg-slate-800 rounded px-2 py-1 text-sm text-slate-300">
               {task.calculated_finish ? format(parseISO(task.calculated_finish), 'MMM d, yyyy') : 'Pending'}
            </div>
          </div>
        </div>

        <div>
           <div className="flex items-center justify-between mb-2">
             <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Engine Metrics</p>
           </div>
           
           {(task.delay_days || 0) > 0 && (
             <div className="mb-4 bg-red-500/10 border border-red-500/30 p-3 rounded-md flex items-start space-x-2">
                <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                   <span className="text-red-400 font-medium text-sm block">Bottleneck Delay</span>
                   <span className="text-slate-400 text-xs">
                     Ready on {format(parseISO(task.logic_start!), 'MMM d')}, but {task.bottleneck_vendor} was busy. Pushed {task.delay_days} days.
                   </span>
                </div>
             </div>
           )}

           <div className="grid grid-cols-2 gap-2 text-sm">
             <div className="bg-slate-700/30 p-2 rounded border border-slate-700/50">
               <span className="text-slate-400 text-xs block">Logic Start</span>
               <span className="text-slate-200">
                 {task.logic_start ? format(parseISO(task.logic_start), 'MMM d') : '-'}
               </span>
             </div>
             <div className="bg-slate-700/30 p-2 rounded border border-slate-700/50">
               <span className="text-slate-400 text-xs block">Bottleneck</span>
               <span className="text-slate-200">{task.bottleneck_vendor || 'None'}</span>
             </div>
           </div>
        </div>

      </div>
    </div>
  );
}
