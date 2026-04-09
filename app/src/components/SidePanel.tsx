import { useState, useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { getCalendarDateFromProjectDay, getProjectDayFromDate, getWorkingDaysCount } from '../utils/cpm';
import type { Task } from '../utils/cpm';
import { X, Clock, CalendarDays, AlertTriangle, Link, Check, Trash2 } from 'lucide-react';
import clsx from 'clsx';

export function SidePanel({ task, onClose }: { task: Task, onClose: () => void }) {
  const { updateTaskDetails, setDependenciesForTask, deleteTask, dependencies, projectStartDate, tasks } = useProjectStore();
  const [durationInput, setDurationInput] = useState(task.duration.toString());
  const [nameInput, setNameInput] = useState(task.name);
  const [subInput, setSubInput] = useState(task.subcontractor);
  const [startInput, setStartInput] = useState(getCalendarDateFromProjectDay(projectStartDate, task.es));
  const [endInput, setEndInput] = useState(getCalendarDateFromProjectDay(projectStartDate, task.ef));

  // Update local state if external task changes
  useEffect(() => {
    setDurationInput(task.duration.toString());
    setNameInput(task.name);
    setSubInput(task.subcontractor);
    setStartInput(getCalendarDateFromProjectDay(projectStartDate, task.es));
    setEndInput(getCalendarDateFromProjectDay(projectStartDate, task.ef));
  }, [task, projectStartDate]);

  const preds = dependencies.filter(d => d.successorId === task.id);

  // Helper to get max predecessor finish day
  const getMaxPredEF = () => {
    if (preds.length === 0) return 0;
    let max = 0;
    preds.forEach(p => {
      const pTask = tasks.find(t => t.id === p.predecessorId);
      if (pTask && pTask.ef > max) max = pTask.ef;
    });
    return max;
  };

  const handleStartChange = (newStart: string) => {
    setStartInput(newStart);
    const dur = parseInt(durationInput, 10);
    if (!isNaN(dur)) {
      // Calculate end date based on duration
      const startDay = getProjectDayFromDate(projectStartDate, newStart);
      const endDay = startDay + dur - 1;
      setEndInput(getCalendarDateFromProjectDay(projectStartDate, endDay));
    }
  };

  const handleEndChange = (newEnd: string) => {
    setEndInput(newEnd);
    const dur = parseInt(durationInput, 10);
    if (!isNaN(dur)) {
      // Calculate start date based on duration
      const endDay = getProjectDayFromDate(projectStartDate, newEnd);
      const startDay = Math.max(1, endDay - dur + 1);
      setStartInput(getCalendarDateFromProjectDay(projectStartDate, startDay));
    } else {
       // If no duration, maybe calculate duration?
       const startDay = getProjectDayFromDate(projectStartDate, startInput);
       const endDay = getProjectDayFromDate(projectStartDate, newEnd);
       const newDur = getWorkingDaysCount(startInput, newEnd);
       if (newDur > 0) setDurationInput(newDur.toString());
    }
  };

  const handleDurationChange = (newDurStr: string) => {
    setDurationInput(newDurStr);
    const dur = parseInt(newDurStr, 10);
    if (!isNaN(dur) && dur > 0) {
      const startDay = getProjectDayFromDate(projectStartDate, startInput);
      const endDay = startDay + dur - 1;
      setEndInput(getCalendarDateFromProjectDay(projectStartDate, endDay));
    }
  };

  const handleSave = () => {
    const dur = parseInt(durationInput, 10);
    const targetStartDay = getProjectDayFromDate(projectStartDate, startInput);
    const maxPredEF = getMaxPredEF();
    
    // lag = targetStartDay - (maxPredEF + 1)
    const newLag = Math.max(0, targetStartDay - (maxPredEF + 1));

    updateTaskDetails(task.id, {
      name: nameInput,
      subcontractor: subInput,
      duration: !isNaN(dur) && dur > 0 ? dur : task.duration,
      lag: newLag
    });
  };



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
                onChange={(e) => handleDurationChange(e.target.value)}
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

        <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 space-y-4">
          <div>
            <p className="text-slate-400 text-xs flex items-center mb-1">
              <CalendarDays size={14} className="mr-1 text-green-400" /> Start Date
            </p>
            <input 
              type="date"
              value={startInput}
              onChange={(e) => handleStartChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/50 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <p className="text-slate-400 text-xs flex items-center mb-1">
              <Clock size={14} className="mr-1 text-red-400" /> End Date
            </p>
            <input 
              type="date"
              value={endInput}
              onChange={(e) => handleEndChange(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/50 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            />
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
        {/* Delete Action */}
        <div className="pt-8 pb-4">
          <button 
            onClick={() => {
              if (confirm(`Are you sure you want to delete "${task.name}"? This will also remove any dependencies.`)) {
                onClose(); // Close panel first
                setTimeout(() => deleteTask(task.id), 0); // Then delete
              }
            }}
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-md border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all group font-medium"
          >
            <Trash2 size={16} className="group-hover:scale-110 transition-transform" />
            <span>Delete Task</span>
          </button>
        </div>
      </div>
    </div>
  );
}
