import { useMemo, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { differenceInDays, addDays, format, isWeekend, startOfWeek, parseISO } from 'date-fns';
import { clsx } from 'clsx';
import { ZoomIn, ZoomOut, AlertTriangle, UserMinus } from 'lucide-react';

export function GanttChart({ onTaskClick, selectedTaskId }: { onTaskClick: (id: string) => void, selectedTaskId: string | null }) {
  const { projects, tasks, deleteProject, vendorColors, activeFilters } = useProjectStore();
  const [colWidth, setColWidth] = useState(40);

  const visibleTasks = useMemo(() => {
    const { vendors, scopes } = activeFilters;
    if (vendors.length === 0 && scopes.length === 0) return tasks;
    return tasks.filter(task => {
      const matchVendor = vendors.length === 0 || (task.subcontractor && vendors.includes(task.subcontractor));
      const matchScope = scopes.length === 0 || scopes.includes(task.name);
      return matchVendor && matchScope;
    });
  }, [tasks, activeFilters]);

  const datesInfo = useMemo(() => {
    if (tasks.length === 0 || projects.length === 0) return { dates: [], getCol: () => 1 };

    let minDateStr = projects[0].start_date;
    let maxDateStr = projects[0].start_date;
    
    tasks.forEach(t => {
       if (t.calculated_start && t.calculated_start < minDateStr) minDateStr = t.calculated_start;
       if (t.calculated_finish && t.calculated_finish > maxDateStr) maxDateStr = t.calculated_finish;
    });

    const start = parseISO(minDateStr);
    const end = addDays(parseISO(maxDateStr), 5); // Add buffer
    
    const dayCount = differenceInDays(end, start) + 1;
    const dateArray = Array.from({ length: dayCount }).map((_, i) => addDays(start, i));

    const getCol = (dateStr: string) => differenceInDays(parseISO(dateStr), start) + 1;

    // Group dates by Month and Week
    const monthGroups: { label: string; days: number }[] = [];
    const weekGroups: { label: string; days: number }[] = [];

    dateArray.forEach((date) => {
      const monthLabel = format(date, 'MMMM yyyy');
      if (monthGroups.length === 0 || monthGroups[monthGroups.length - 1].label !== monthLabel) {
        monthGroups.push({ label: monthLabel, days: 1 });
      } else {
        monthGroups[monthGroups.length - 1].days++;
      }

      const weekStartDate = startOfWeek(date, { weekStartsOn: 1 });
      const weekLabel = `Week of ${format(weekStartDate, 'MMM d')}`;
      if (weekGroups.length === 0 || weekGroups[weekGroups.length - 1].label !== weekLabel) {
        weekGroups.push({ label: weekLabel, days: 1 });
      } else {
        weekGroups[weekGroups.length - 1].days++;
      }
    });

    return { dates: dateArray, getCol, monthGroups, weekGroups };
  }, [tasks, projects]);

  const handleZoomIn = () => setColWidth(prev => Math.min(prev + 10, 80));
  const handleZoomOut = () => setColWidth(prev => Math.max(prev - 10, 20));

  const { monthGroups = [], weekGroups = [], dates = [], getCol } = datesInfo;

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex justify-between items-center px-4 py-2 bg-slate-800/80 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Multi-Project Engine</h2>
        <div className="flex items-center space-x-2">
          <button onClick={handleZoomOut} className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition" title="Zoom Out">
             <ZoomOut size={16} />
          </button>
          <button onClick={handleZoomIn} className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition" title="Zoom In">
             <ZoomIn size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-auto relative rounded-b-xl hide-scrollbar">
        {/* Left Side: Task Table */}
        <div className="w-64 flex-shrink-0 border-r border-slate-700 bg-slate-800/90 z-30 sticky left-0 shadow-[4px_0_12px_rgba(0,0,0,0.5)]">
          <div className="h-[104px] border-b border-slate-700 flex items-end pb-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/60 w-full z-10 sticky top-0">
            Task Name
          </div>
          <div className="py-0">
            {projects.map(proj => {
              const projectTasks = visibleTasks.filter(t => t.project_id === proj.id);
              if (projectTasks.length === 0) return null;

              return (
              <div key={proj.id}>
                {/* Project Header */}
                <div className="h-10 bg-slate-700/60 px-4 flex items-center justify-between text-sm font-bold text-slate-200 border-b border-slate-700 sticky top-[104px] z-10 shadow-sm backdrop-blur">
                  <span>{proj.name}</span>
                  <button onClick={() => { if(confirm('Delete project?')) deleteProject(proj.id); }} className="text-slate-400 hover:text-red-400 transition" title="Delete Project">
                     <UserMinus size={14} />
                  </button>
                </div>
                {/* Project Tasks */}
                {projectTasks.map(task => (
                  <div 
                    key={task.id} 
                    onClick={() => onTaskClick(task.id)}
                    className={clsx(
                      "h-8 px-4 flex items-center justify-between border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/40 transition-colors relative group",
                      selectedTaskId === task.id && "bg-slate-700/60"
                    )}
                  >
                    {selectedTaskId === task.id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 rounded-r shadow-[0_0_8px_rgba(34,211,238,0.8)]" />}
                    
                    <div className="flex items-center space-x-1.5 w-full group-hover:pl-1 transition-all overflow-hidden truncate">
                       <span className="text-[10px] px-1 py-0.5 rounded bg-slate-800/80 border border-slate-600/50 font-bold text-cyan-400 uppercase flex-shrink-0">
                         {proj.name}
                       </span>
                       <span className="text-xs font-medium text-slate-200 truncate">{task.name}</span>
                       <span className="text-[10px] text-slate-500 flex-shrink-0">({task.duration}d)</span>
                       {task.subcontractor && (
                           <span className={clsx(
                             "text-[9px] uppercase truncate font-bold",
                             (task.delay_days || 0) > 0 ? "text-red-400" 
                             : (task.lag || 0) > 0 ? "text-orange-400" 
                             : "text-green-400/80"
                           )}>
                             [{task.subcontractor}]
                           </span>
                       )}
                    </div>
                    {(task.delay_days || 0) > 0 && <AlertTriangle size={12} className="text-red-500 flex-shrink-0 drop-shadow ml-1" title={`Delay: ${task.delay_days} days`} />}
                  </div>
                ))}
              </div>
            )})}
          </div>
        </div>

        {/* Right Side: Timeline Grid */}
        <div className="flex-1 relative overflow-auto pb-8">
          <div className="inline-flex min-w-full">
            <div className="flex flex-col w-full relative">
              {/* Month Header */}
              <div className="flex border-b border-slate-700 h-8 bg-slate-900/80 text-slate-300 sticky top-0 z-20">
                {monthGroups.map((group, i) => (
                  <div 
                    key={i} 
                    style={{ width: group.days * colWidth }}
                    className="flex-shrink-0 border-r border-slate-700/50 flex items-center px-4 text-[10px] font-bold uppercase tracking-[0.2em] overflow-hidden whitespace-nowrap bg-slate-900/60 backdrop-blur-md"
                  >
                    {group.label}
                  </div>
                ))}
              </div>

              {/* Week Header */}
              <div className="flex border-b border-slate-700 h-8 bg-slate-800/80 text-slate-400 sticky top-8 z-20">
                {weekGroups.map((group, i) => (
                  <div 
                    key={i} 
                    style={{ width: group.days * colWidth }}
                    className="flex-shrink-0 border-r border-slate-700/50 flex items-center px-4 text-[9px] font-bold overflow-hidden whitespace-nowrap backdrop-blur-md"
                  >
                    {colWidth > 20 && group.label}
                  </div>
                ))}
              </div>

              {/* Header Days */}
              <div className="flex border-b border-slate-700 h-10 sticky top-[64px] z-20 shadow-sm backdrop-blur-md">
                {dates.map((date, i) => {
                  const isWknd = isWeekend(date);
                  return (
                    <div 
                      key={i} 
                      style={{ minWidth: colWidth }}
                      className={clsx(
                        "flex-shrink-0 border-r border-slate-700/50 flex flex-col items-center justify-center text-[10px]",
                        isWknd ? "bg-slate-800/90 text-slate-500" : "bg-slate-800 border-b border-b-cyan-500/30 text-slate-300"
                      )}
                    >
                      {colWidth > 25 && <span className="opacity-60 truncate font-medium">{format(date, 'eee')}</span>}
                      <span className={clsx(isWknd ? "text-slate-500" : "text-white font-bold")}>{format(date, 'd')}</span>
                    </div>
                  );
                })}
              </div>

              {/* Grid Body */}
              <div className="relative" style={{ width: dates.length * colWidth }}>
                <div className="absolute inset-0 flex pointer-events-none">
                  {dates.map((date, i) => (
                    <div 
                      key={i} 
                      style={{ minWidth: colWidth }}
                      className={clsx(
                        "border-r border-slate-700/20",
                        isWeekend(date) && "bg-slate-800/40"
                      )}
                    />
                  ))}
                </div>

                {projects.map(proj => {
                  const projectTasks = visibleTasks.filter(t => t.project_id === proj.id);
                  if (projectTasks.length === 0) return null;

                  return (
                  <div key={`grid-${proj.id}`}>
                    <div className="h-10 border-b border-slate-700/30 bg-slate-800/20" />
                    {projectTasks.map((task) => {
                      if (!task.calculated_start || !task.calculated_finish) return <div key={task.id} className="h-8" />;
                      
                      const startCol = getCol(task.calculated_start);
                      const endCol = getCol(task.calculated_finish);
                      const span = endCol - startCol + 1;

                      const isDelayed = (task.delay_days || 0) > 0;
                      const customColor = task.subcontractor ? vendorColors[task.subcontractor] : null;

                      return (
                        <div key={task.id} className="h-8 border-b border-slate-700/30 relative flex items-center group">
                          {isDelayed && task.logic_start && (
                             // Draw a dashed ghost bar for delay origin
                             <div 
                               className="absolute h-[10px] rounded-sm bg-slate-600/30 border border-slate-500 border-dashed z-0"
                               style={{
                                 left: `${(getCol(task.logic_start) - 1) * colWidth + 4}px`,
                                 width: `${Math.max(((startCol - getCol(task.logic_start)) * colWidth), 0)}px`,
                               }}
                             />
                          )}

                          <div 
                            onClick={() => onTaskClick(task.id)}
                            className={clsx(
                              "absolute h-5 rounded shadow-lg transition-transform hover:-translate-y-0.5 cursor-pointer flex items-center px-1.5 z-10 box-border hover:brightness-110",
                              !customColor && isDelayed && "bg-red-500/90 border border-red-400 shadow-[0_4px_12px_rgba(239,68,68,0.4)]",
                              !customColor && !isDelayed && "bg-gradient-to-r from-cyan-600 to-blue-600 border border-cyan-400/50 shadow-[0_4px_12px_rgba(8,145,178,0.3)]",
                              customColor && "shadow-md border border-black/20",
                              customColor && isDelayed && "border-2 border-red-500 ring-2 ring-red-500/60 ring-offset-1 ring-offset-slate-900",
                              selectedTaskId === task.id && "ring-2 ring-white ring-offset-1 ring-offset-slate-900 scale-105"
                            )}
                            style={{
                              left: `${(startCol - 1) * colWidth + 4}px`,
                              width: `${span * colWidth - 8}px`,
                              ...(customColor ? { backgroundColor: customColor } : {})
                            }}
                          >
                             {colWidth > 30 && (
                               <span className="text-[10px] font-bold text-white drop-shadow-md truncate">
                                  {isDelayed ? `${task.delay_days}d Delay (${task.bottleneck_vendor})` : `${task.duration}d`}
                               </span>
                             )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )})}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
