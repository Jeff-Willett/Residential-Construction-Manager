import { useEffect, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { getFinishDateFromDuration, type EngineTask } from '../utils/schedulingEngine';
import { X, Clock, CalendarDays, AlertTriangle } from 'lucide-react';
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

export function SidePanel({ task, onClose }: { task: EngineTask, onClose: () => void }) {
  const {
    updateTaskFields,
    updateTaskDuration,
    updateTaskLag,
    updateTaskSubcontractor,
    updateDependencyFollowSetting,
    projects,
    tasks,
    dependencies
  } = useProjectStore();
  
  const [durationInput, setDurationInput] = useState(task.duration.toString());
  const [vendorInput, setVendorInput] = useState(task.subcontractor || '');
  const [isResourceConstrained, setIsResourceConstrained] = useState(Boolean(task.bottleneck_vendor));
  const [startDateStr, setStartDateStr] = useState(task.manual_start || task.calculated_start || '');
  const [finishDateStr, setFinishDateStr] = useState(task.manual_finish || task.calculated_finish || '');

  const uniqueVendors = Array.from(new Set(tasks.map(t => t.subcontractor).filter(Boolean))) as string[];
  uniqueVendors.sort();

  useEffect(() => {
    setDurationInput(task.duration.toString());
    setVendorInput(task.subcontractor || '');
    setIsResourceConstrained(Boolean(task.bottleneck_vendor));
    setStartDateStr(task.manual_start || task.calculated_start || '');
    setFinishDateStr(task.manual_finish || task.calculated_finish || '');
  }, [
    task.id,
    task.duration,
    task.subcontractor,
    task.bottleneck_vendor,
    task.manual_start,
    task.manual_finish,
    task.calculated_start,
    task.calculated_finish
  ]);

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const dur = parseInt(e.target.value, 10);
      setDurationInput(e.target.value);
      if (!isNaN(dur) && dur > 0 && startDateStr) {
          setFinishDateStr(getFinishDateFromDuration(startDateStr, dur));
      }
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newStart = e.target.value;
      if (!newStart) return;
      setStartDateStr(newStart);
      const dur = parseInt(durationInput, 10) || 1;
      setFinishDateStr(getFinishDateFromDuration(newStart, dur));
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
  const conflictProjectName = conflictProject?.name || task.delay_cause_project_name || null;
  const conflictTaskName = conflictTask?.name || task.delay_cause_task_name || null;

  const predIds = dependencies.filter(d => d.successor_id === task.id).map(d => d.predecessor_id);
  const predecessors = tasks.filter(t => predIds.includes(t.id));
  const downstreamDependencies = dependencies
    .filter((dependency) => dependency.predecessor_id === task.id)
    .map((dependency) => ({
      dependency,
      successor: tasks.find((candidate) => candidate.id === dependency.successor_id) ?? null
    }))
    .filter((item): item is { dependency: typeof dependencies[number]; successor: EngineTask } => Boolean(item.successor))
    .sort((a, b) => a.successor.name.localeCompare(b.successor.name));
  const latestPred = [...predecessors].sort((a,b) => (b.calculated_finish || '').localeCompare(a.calculated_finish || ''))[0];
  const hasLogicConflict = (task.logic_violation_days || 0) > 0 && latestPred;
  const hasAcceptedLogicOverride = Boolean(task.manual_start) && (task.lag || 0) < 0 && (task.logic_violation_days || 0) === 0 && latestPred;
  const acceptedLag = (task.lag || 0) + (task.delay_days || 0);
  const hasVendorCollision = (task.delay_days || 0) > 0 && Boolean(task.bottleneck_vendor) && Boolean(task.delay_cause_task_id || task.delay_cause_task_name);
  const acceptedLogicOffsetDays =
    task.logic_start && task.calculated_start ? Math.abs(getWorkingDaysDiff(task.logic_start, task.calculated_start)) : Math.abs(task.lag || 0);

  const getFollowingSuccessorIds = () => {
    const visited = new Set<string>();
    const queue = [task.id];

    while (queue.length > 0) {
      const currentTaskId = queue.shift()!;
      const nextDependencies = dependencies.filter(
        (dependency) => dependency.predecessor_id === currentTaskId && dependency.follow_predecessor_changes !== false
      );

      nextDependencies.forEach((dependency) => {
        if (visited.has(dependency.successor_id)) return;
        visited.add(dependency.successor_id);
        queue.push(dependency.successor_id);
      });
    }

    return Array.from(visited);
  };

  const applyTaskScheduleChanges = async ({
    duration,
    lag,
    subcontractor,
    bottleneckVendor,
    manualStart,
    manualFinish
  }: {
    duration?: number;
    lag: number;
    subcontractor: string | null;
    bottleneckVendor: string | null;
    manualStart: string | null;
    manualFinish: string | null;
  }) => {
    const hasScheduleChanges =
      (duration !== undefined ? duration !== task.duration : false) ||
      lag !== task.lag ||
      manualStart !== (task.manual_start ?? null) ||
      manualFinish !== (task.manual_finish ?? null);

    const frozenSuccessors = hasScheduleChanges
      ? downstreamDependencies
          .filter(({ dependency }) => dependency.follow_predecessor_changes === false)
          .map(({ successor }) => ({
            taskId: successor.id,
            manual_start: successor.manual_start ?? successor.calculated_start ?? null,
            manual_finish: successor.manual_finish ?? successor.calculated_finish ?? null
          }))
      : [];

    await updateTaskFields(task.id, {
      duration,
      lag,
      subcontractor,
      bottleneck_vendor: bottleneckVendor,
      manual_start: manualStart,
      manual_finish: manualFinish
    });

    for (const successor of frozenSuccessors) {
      await updateTaskFields(successor.taskId, {
        manual_start: successor.manual_start,
        manual_finish: successor.manual_finish
      });
    }
  };

  const handleSave = async () => {
    const dur = parseInt(durationInput, 10);
    let finalLag = task.lag;
    if (startDateStr && startDateStr !== task.calculated_start) {
        const baseDate = task.logic_start || task.calculated_start || '';
        const dateDrift = getWorkingDaysDiff(baseDate, startDateStr);
        finalLag = task.lag + dateDrift;
    }

    const normalizedManualStart = startDateStr || null;
    const normalizedManualFinish = finishDateStr || null;
    await applyTaskScheduleChanges({
      duration: !isNaN(dur) && dur > 0 ? dur : undefined,
      lag: finalLag,
      subcontractor: vendorInput || null,
      bottleneckVendor: isResourceConstrained && vendorInput ? vendorInput : null,
      manualStart: normalizedManualStart,
      manualFinish: normalizedManualFinish
    });
  };

  const handleAcceptLogicOverride = async () => {
    const desiredStart = startDateStr || task.manual_start || task.calculated_start || null;
    const dur = parseInt(durationInput, 10);
    if (!task.logic_start || !desiredStart) return;

    const overrideLag = getWorkingDaysDiff(task.logic_start, desiredStart);
    await applyTaskScheduleChanges({
      duration: !isNaN(dur) && dur > 0 ? dur : undefined,
      lag: overrideLag,
      subcontractor: vendorInput || null,
      bottleneckVendor: isResourceConstrained && vendorInput ? vendorInput : null,
      manualStart: desiredStart,
      manualFinish: finishDateStr || task.manual_finish || task.calculated_finish || null
    });

    const followingSuccessorIds = getFollowingSuccessorIds();
    for (const successorId of followingSuccessorIds) {
      const successor = tasks.find((candidate) => candidate.id === successorId);
      if (!successor) continue;
      if (!successor.manual_start && !successor.manual_finish) continue;

      await updateTaskFields(successor.id, {
        manual_start: null,
        manual_finish: null
      });
    }
  };

  return (
    <div className="w-80 bg-slate-800 border-l border-slate-700/50 shadow-2xl flex flex-col relative z-20">
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
           <select 
             value={vendorInput}
             onChange={(e) => setVendorInput(e.target.value)}
             className="w-full bg-slate-900 border border-slate-700/80 rounded-md px-3 py-2 text-slate-200 mb-4 focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
           >
             <option value="">Unassigned (No constraints)</option>
             {uniqueVendors.map(v => <option key={v} value={v}>{v}</option>)}
           </select>

           <label className="flex items-center gap-2 mb-4 text-sm text-slate-300">
             <input
               type="checkbox"
               checked={isResourceConstrained}
               onChange={(e) => setIsResourceConstrained(e.target.checked)}
               className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50"
             />
             <span>Treat this subcontractor as a single-resource bottleneck</span>
           </label>

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
               className="w-full bg-slate-800 border border-slate-700/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-green-500 transition-all"
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
               className="w-full bg-slate-800 border border-slate-700/80 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-orange-500 transition-all"
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
           {hasVendorCollision && (
             <div className="mb-4 bg-red-500/10 border border-red-500/30 p-3 rounded-md flex flex-col space-y-3">
                <div className="flex items-start space-x-2">
                  <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                     <span className="text-red-400 font-bold text-sm tracking-wide uppercase block">Collision Detected</span>
                     <span className="text-slate-300 text-xs mt-1 block">
                       Task logic was ready on <span className="font-bold text-white">{format(parseISO(task.logic_start!), 'MMM d')}</span>. 
                       However, <span className="font-bold text-white">{task.bottleneck_vendor}</span> is actively deployed on 
                       <span className="font-bold text-cyan-300"> {conflictProjectName ? `Project ${conflictProjectName}` : 'another scheduled project'} </span> 
                       performing the <span className="italic">{conflictTaskName || 'blocking task'}</span>.
                     </span>
                     <span className="text-red-300 text-xs font-semibold block mt-1">Total Delay Penalty: {task.delay_days} days.</span>
                  </div>
                </div>
                
                <div className="flex flex-col space-y-2 mt-2 pt-2 border-t border-red-500/20">
                   <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Engine Solutions</span>
                   <button 
                     onClick={() => {
                       updateTaskLag(task.id, acceptedLag);
                     }}
                     className="w-full text-xs font-bold py-1.5 px-3 bg-red-500/20 hover:bg-red-500/40 text-red-100 rounded transition border border-red-500/50 hover:border-red-400/80 shadow text-left flex justify-between items-center"
                   >
                     <span>1. Accept Proposed Date</span>
                     <span className="text-[10px] text-red-300/80 font-normal">Keeps vendor, locks shown date</span>
                   </button>
                   
                   <button 
                     onClick={() => {
                       updateTaskSubcontractor(task.id, task.subcontractor || null, null);
                     }}
                     className="w-full text-xs font-bold py-1.5 px-3 bg-red-500/20 hover:bg-red-500/40 text-red-100 rounded transition border border-red-500/50 hover:border-red-400/80 shadow text-left flex justify-between items-center"
                   >
                     <span>2. Release Resource Constraint</span>
                     <span className="text-[10px] text-red-300/80 font-normal">Keeps contractor name</span>
                   </button>

                   {conflictTask && (
                     <button 
                       onClick={() => {
                          const optimizedDur = Math.max(1, conflictTask.duration - (task.delay_days || 0));
                          updateTaskDuration(conflictTask.id, optimizedDur);
                       }}
                       className="w-full text-xs font-bold py-1.5 px-3 bg-slate-700/50 hover:bg-slate-600/70 text-slate-200 rounded transition border border-slate-600 shadow text-left flex justify-between items-center"
                     >
                       <span>3. Squeeze Conflicting Task</span>
                       <span className="text-[10px] text-slate-400 font-normal">Cuts {task.delay_days}d from {conflictProject?.name || ''}</span>
                     </button>
                   )}
                </div>
             </div>
           )}

           {hasAcceptedLogicOverride && (
             <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-md flex flex-col space-y-3">
               <div className="flex items-start space-x-2">
                 <AlertTriangle size={16} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                 <div>
                   <span className="text-emerald-300 font-bold text-sm tracking-wide uppercase block">Override Accepted</span>
                   <span className="text-slate-300 text-xs mt-1 block">
                     This task is intentionally scheduled {acceptedLogicOffsetDays} working day{acceptedLogicOffsetDays === 1 ? '' : 's'} ahead of
                     <span className="font-bold text-white"> {latestPred.name}</span>. The active error indicators are cleared, but this note remains so the approved logic exception is still visible later.
                   </span>
                 </div>
               </div>
             </div>
           )}

           {/* Logic Overlap Engine */}
           {hasLogicConflict && (
             <div className="mb-4 bg-orange-500/10 border border-orange-500/30 p-3 rounded-md flex flex-col space-y-3">
                <div className="flex items-start space-x-2">
                  <AlertTriangle size={16} className="text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                     <span className="text-orange-400 font-bold text-sm tracking-wide uppercase block">Logic Overlap</span>
                     <span className="text-slate-300 text-xs mt-1 block">
                       This task is forced to start before its predecessor <span className="font-bold text-white">{latestPred.name}</span> is finished. 
                       Predecessor finishes on <span className="font-bold text-white">{format(parseISO(latestPred.calculated_finish!), 'MMM d')}</span>.
                     </span>
                     <span className="text-orange-300 text-xs font-semibold block mt-1">Overlap Penalty: {task.logic_violation_days || Math.abs(task.lag || 0)} days.</span>
                  </div>
                </div>
                
                <div className="flex flex-col space-y-2 mt-2 pt-2 border-t border-orange-500/20">
                   <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Engine Solutions</span>
                   <button
                     onClick={() => {
                       void handleAcceptLogicOverride();
                     }}
                     className="w-full text-xs font-bold py-1.5 px-3 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-100 rounded transition border border-emerald-500/50 hover:border-emerald-400/80 shadow text-left flex justify-between items-center"
                   >
                     <span>1. Accept Override</span>
                     <span className="text-[10px] text-emerald-300/80 font-normal">Respects checked downstream links</span>
                   </button>
                   <button 
                     onClick={() => {
                       updateTaskLag(task.id, 0);
                     }}
                     className="w-full text-xs font-bold py-1.5 px-3 bg-orange-500/20 hover:bg-orange-500/40 text-orange-100 rounded transition border border-orange-500/50 hover:border-orange-400/80 shadow text-left flex justify-between items-center"
                   >
                     <span>2. Snap to Earliest Possible Start</span>
                     <span className="text-[10px] text-orange-300/80 font-normal">Resets Lag to 0</span>
                   </button>
                   
                   <button 
                     onClick={() => {
                       if (latestPred) {
                          const newDur = Math.max(1, latestPred.duration + (task.lag || 0));
                          updateTaskDuration(latestPred.id, newDur);
                       }
                     }}
                     className="w-full text-xs font-bold py-1.5 px-3 bg-orange-500/20 hover:bg-orange-500/40 text-orange-100 rounded transition border border-orange-500/50 hover:border-orange-400/80 shadow text-left flex justify-between items-center"
                   >
                     <span>3. Squeeze Predecessor Duration</span>
                     <span className="text-[10px] text-orange-300/80 font-normal">Shortens {latestPred?.name}</span>
                   </button>
                </div>
             </div>
           )}

           <div className="grid grid-cols-2 gap-2 text-sm mt-4">
             <div className="bg-slate-700/30 p-2 rounded border border-slate-700/50">
               <span className="text-slate-400 text-xs block">Logic Start</span>
               <span className="text-slate-200">
                 {task.logic_start ? format(parseISO(task.logic_start), 'MMM d') : '-'}
               </span>
             </div>
             <div className="bg-slate-700/30 p-2 rounded border border-slate-700/50">
               <span className="text-slate-400 text-xs block">Bottleneck</span>
               <span className="text-slate-200 tracking-tight truncate block">{task.bottleneck_vendor || 'None'}</span>
             </div>
           </div>

           <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
             <div className="flex items-center justify-between gap-3">
               <div>
                 <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Downstream Dependencies</div>
                 <div className="mt-1 text-[11px] text-slate-500">
                   Checked items will follow manual movement on this scope. Uncheck to hold their current dates when you save this scope.
                 </div>
               </div>
               <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{downstreamDependencies.length} links</div>
             </div>

             {downstreamDependencies.length === 0 ? (
               <div className="mt-3 text-sm text-slate-500">No downstream items are linked to this scope yet.</div>
             ) : (
               <div className="mt-3 space-y-2">
                 {downstreamDependencies.map(({ dependency, successor }) => (
                   <label
                     key={dependency.id}
                     className="flex items-start gap-3 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-200"
                   >
                     <input
                       type="checkbox"
                       checked={dependency.follow_predecessor_changes !== false}
                       onChange={(event) => {
                         void updateDependencyFollowSetting(dependency.id, event.target.checked);
                       }}
                       className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500/50"
                     />
                     <div className="min-w-0 flex-1">
                       <div className="font-medium text-slate-100">{successor.name}</div>
                       <div className="mt-1 text-[11px] text-slate-500">
                         Current start {successor.calculated_start ? format(parseISO(successor.calculated_start), 'MMM d') : '-'}
                       </div>
                     </div>
                   </label>
                 ))}
               </div>
             )}
           </div>
        </div>
      </div>
    </div>
  );
}
