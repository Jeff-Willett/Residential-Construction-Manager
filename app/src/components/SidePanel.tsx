import { useState, useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import type { EngineTask } from '../utils/schedulingEngine';
import { X, Clock, CalendarDays, AlertTriangle, Link } from 'lucide-react';
import clsx from 'clsx';
import { format, parseISO, isWeekend, addDays } from 'date-fns';

function getWorkingDaysDiff(startStr: string, endStr: string): number {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    if (start.getTime() === end.getTime()) return 0;
    
    let current = start;
    let count = 0;
    const isForward = end > start;
    
    while (isForward ? current < end : current > end) {
        if (!isWeekend(current)) count++;
        current = addDays(current, isForward ? 1 : -1);
    }
    return isForward ? count : -count;
}

function addWorkingDaysLocal(startDateStr: string, daysToAdd: number): string {
  let currentDate = parseISO(startDateStr);
  while (isWeekend(currentDate)) currentDate = addDays(currentDate, 1);
  let daysAdded = 0;
  while (daysAdded < daysToAdd - 1) {
    currentDate = addDays(currentDate, 1);
    if (!isWeekend(currentDate)) daysAdded++;
  }
  return format(currentDate, 'yyyy-MM-dd');
}

export function SidePanel({ task, onClose }: { task: EngineTask, onClose: () => void }) {
  const { updateTaskDuration, updateTaskLag, updateTaskSubcontractor, projects, tasks } = useProjectStore();
  
  const [durationInput, setDurationInput] = useState(task.duration.toString());
  const [lagInput, setLagInput] = useState(task.lag.toString());
  const [vendorInput, setVendorInput] = useState(task.subcontractor || '');
  const [startDateStr, setStartDateStr] = useState(task.calculated_start || '');
  const [finishDateStr, setFinishDateStr] = useState(task.calculated_finish || '');

  // Extract unique subcontractors for dropdown
  const uniqueVendors = Array.from(new Set(tasks.map(t => t.subcontractor).filter(Boolean))) as string[];
  uniqueVendors.sort();

  // Update local state if external task changes
  useEffect(() => {
    setDurationInput(task.duration.toString());
    setLagInput(task.lag.toString());
    setVendorInput(task.subcontractor || '');
    setStartDateStr(task.calculated_start || '');
    setFinishDateStr(task.calculated_finish || '');
  }, [task]);

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const dur = parseInt(e.target.value, 10);
      setDurationInput(e.target.value);
      if (!isNaN(dur) && dur > 0 && startDateStr) {
          setFinishDateStr(addWorkingDaysLocal(startDateStr, dur));
      }
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newStart = e.target.value;
      if (!newStart) return;
      setStartDateStr(newStart);
      const dur = parseInt(durationInput, 10) || 1;
      setFinishDateStr(addWorkingDaysLocal(newStart, dur));
  };

  const handleFinishDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newFinish = e.target.value;
      if (!newFinish) return;
      setFinishDateStr(newFinish);
      if (startDateStr) {
          const diff = getWorkingDaysDiff(startDateStr, newFinish);
          const calculatedDur = Math.max(1, diff + 1);
          setDurationInput(calculatedDur.toString());
      }
  };

  const project = projects.find(p => p.id === task.project_id);
  const conflictTask = task.delay_cause_task_id ? tasks.find(t => t.id === task.delay_cause_task_id) : null;
  const conflictProject = conflictTask ? projects.find(p => p.id === conflictTask.project_id) : null;

  const handleSave = () => {
    const dur = parseInt(durationInput, 10);
    
    // Convert absolute Start Date visual string to engine Lag physics
    let finalLag = task.lag;
    if (startDateStr && startDateStr !== task.calculated_start) {
        const dateDrift = getWorkingDaysDiff(task.calculated_start || '', startDateStr);
        finalLag = Math.max(0, task.lag + dateDrift);
    }
    
    if (!isNaN(dur) && dur > 0 && dur !== task.duration) updateTaskDuration(task.id, dur);
    if (finalLag !== task.lag) updateTaskLag(task.id, finalLag);
    if (vendorInput !== (task.subcontractor || '')) updateTaskSubcontractor(task.id, vendorInput || null, vendorInput || null);
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
           <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Subcontractor Constraint</p>
           <select 
             value={vendorInput}
             onChange={(e) => setVendorInput(e.target.value)}
             className="w-full bg-slate-900 border border-slate-700/80 rounded-md px-3 py-2 text-slate-200 mb-4 focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
           >
             <option value="">Unassigned (No constraints)</option>
             {uniqueVendors.map(v => <option key={v} value={v}>{v}</option>)}
           </select>

           <div className="grid grid-cols-2 gap-3 mb-4">
               <div className="col-span-2">
                 <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Duration (Days)</p>
                 <input 
                   type="number" 
                   min="1"
                   value={durationInput}
                   onChange={handleDurationChange}
                   className="w-full bg-slate-900 border border-slate-700/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 transition-all cursor-text"
                 />
               </div>
           </div>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 space-y-4">
          <div>
            <p className="text-slate-400 text-xs flex items-center mb-1">
              <CalendarDays size={14} className="mr-1 text-green-400" /> Target Start Date
            </p>
            <input 
               type="date"
               value={startDateStr}
               onChange={handleStartDateChange}
               className="w-full bg-slate-800 border border-slate-700/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-green-500 transition-all cursor-pointer"
            />
          </div>
          <div>
            <p className="text-slate-400 text-xs flex items-center mb-1">
              <Clock size={14} className="mr-1 text-orange-400" /> Target Finish Date
            </p>
            <input 
               type="date"
               value={finishDateStr}
               onChange={handleFinishDateChange}
               className="w-full bg-slate-800 border border-slate-700/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-orange-500 transition-all cursor-pointer"
            />
          </div>
        </div>
        
        <button 
           onClick={handleSave} 
           className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 py-3 rounded-md font-bold text-sm transition-colors text-white shadow-lg shadow-cyan-600/30 tracking-wider uppercase mt-4"
        >
           Save Matrix Target
        </button>

        <div>
           <div className="flex items-center justify-between mb-2">
             <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Engine Metrics</p>
           </div>
           
           {/* Bottleneck Resolution Engine */}
           {(task.delay_days || 0) > 0 && (
             <div className="mb-4 bg-red-500/10 border border-red-500/30 p-3 rounded-md flex flex-col space-y-3">
                <div className="flex items-start space-x-2">
                  <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                     <span className="text-red-400 font-bold text-sm tracking-wide uppercase block">Collision Detected</span>
                     <span className="text-slate-300 text-xs mt-1 block">
                       Task logic was ready on <span className="font-bold text-white">{format(parseISO(task.logic_start!), 'MMM d')}</span>. 
                       However, <span className="font-bold text-white">{task.bottleneck_vendor}</span> is actively deployed on 
                       <span className="font-bold text-cyan-300"> Project {conflictProject?.name || 'Unknown'} </span> 
                       performing the <span className="italic">{conflictTask?.name || 'Unknown Task'}</span>.
                     </span>
                     <span className="text-red-300 text-xs font-semibold block mt-1">Total Delay Penalty: {task.delay_days} days.</span>
                  </div>
                </div>
                
                {/* Proposed Solutions */}
                <div className="flex flex-col space-y-2 mt-2 pt-2 border-t border-red-500/20">
                   <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Engine Solutions</span>
                   <button 
                     onClick={() => {
                        setVendorInput('');
                        updateTaskSubcontractor(task.id, null, null);
                     }}
                     className="w-full text-xs font-bold py-1.5 px-3 bg-red-500/20 hover:bg-red-500/40 text-red-100 rounded transition border border-red-500/50 hover:border-red-400/80 shadow text-left flex justify-between items-center"
                   >
                     <span>1. Release Vendor Constraint</span>
                     <span className="text-[10px] text-red-300/80 font-normal">Reassigns task</span>
                   </button>
                   
                   {conflictTask && (
                     <button 
                       onClick={() => {
                          const optimizedDur = Math.max(1, conflictTask.duration - (task.delay_days || 0));
                          updateTaskDuration(conflictTask.id, optimizedDur);
                       }}
                       className="w-full text-xs font-bold py-1.5 px-3 bg-slate-700/50 hover:bg-slate-600/70 text-slate-200 rounded transition border border-slate-600 shadow text-left flex justify-between items-center"
                     >
                       <span>2. Squeeze Conflicting Task</span>
                       <span className="text-[10px] text-slate-400 font-normal">Cuts {task.delay_days}d from {conflictProject?.name || ''}</span>
                     </button>
                   )}
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
