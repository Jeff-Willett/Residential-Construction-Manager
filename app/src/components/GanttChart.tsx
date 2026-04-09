import { useMemo, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { getCalendarDateFromProjectDay } from '../utils/cpm';
import { differenceInDays, addDays, format, isWeekend, startOfWeek } from 'date-fns';
import { clsx } from 'clsx';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { DependencyLines } from './DependencyLines';

export function GanttChart({ onTaskClick, selectedTaskId }: { onTaskClick: (id: string) => void, selectedTaskId: string | null }) {
  const { tasks, dependencies, projectStartDate } = useProjectStore();
  const [colWidth, setColWidth] = useState(40);

  // Find min and max calendar dates
  const datesInfo = useMemo(() => {
    if (tasks.length === 0) return { dates: [], getColumnForDate: () => 1 };

    let maxProjectDay = 1;
    tasks.forEach(t => { if (t.lf > maxProjectDay) maxProjectDay = t.lf; });

    const maxCalendarDateStr = getCalendarDateFromProjectDay(projectStartDate, maxProjectDay);
    
    const start = new Date(projectStartDate);
    const end = addDays(new Date(maxCalendarDateStr), 5); // Add buffer
    
    const dayCount = differenceInDays(end, start) + 1;
    const dateArray = Array.from({ length: dayCount }).map((_, i) => addDays(start, i));

    const getCol = (dateStr: string) => {
      return differenceInDays(new Date(dateStr), start) + 1;
    };

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

    return { dates: dateArray, getColumnForDate: getCol, monthGroups, weekGroups };
  }, [tasks, projectStartDate]);

  const handleZoomIn = () => setColWidth(prev => Math.min(prev + 10, 80));
  const handleZoomOut = () => setColWidth(prev => Math.max(prev - 10, 20));

  const { monthGroups = [], weekGroups = [] } = datesInfo;
  const { dates = [] } = datesInfo;
  const getColumnForDate = datesInfo.getColumnForDate;

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex justify-between items-center px-4 py-2 bg-slate-800/80 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Project Timeline</h2>
        <div className="flex items-center space-x-2">
          <button onClick={handleZoomOut} className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition" title="Zoom Out">
             <ZoomOut size={16} />
          </button>
          <button onClick={handleZoomIn} className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition" title="Zoom In">
             <ZoomIn size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-auto relative">
        {/* Left Side: Task Table */}
        <div className="w-64 flex-shrink-0 border-r border-slate-700 bg-slate-800/90 z-10 sticky left-0">
          <div className="h-10 border-b border-slate-700 flex items-center px-4 text-xs font-medium text-slate-400">
            Task Name
          </div>
          <div className="py-2">
            {tasks.map(task => (
              <div 
                key={task.id} 
                onClick={() => onTaskClick(task.id)}
                className={clsx(
                  "h-12 px-4 flex flex-col justify-center border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/40 transition-colors",
                  selectedTaskId === task.id && "bg-slate-700/60 border-l-4 border-l-blue-500 pl-3"
                )}
              >
                <div className="text-sm font-medium text-slate-200 truncate">{task.name}</div>
                <div className="text-xs text-slate-500 truncate">{task.subcontractor}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Timeline Grid */}
        <div className="flex-1 relative overflow-auto pb-8">
          <div className="inline-flex min-w-full">
            <div className="flex flex-col w-full relative">
              {/* Month Header */}
              <div className="flex border-b border-slate-700 h-8 bg-slate-900/40 text-slate-400">
                {monthGroups.map((group, i) => (
                  <div 
                    key={i} 
                    style={{ width: group.days * colWidth }}
                    className="flex-shrink-0 border-r border-slate-700/50 flex items-center px-4 text-[10px] font-bold uppercase tracking-widest sticky left-64 z-20 overflow-hidden"
                  >
                    {group.label}
                  </div>
                ))}
              </div>

              {/* Week Header */}
              <div className="flex border-b border-slate-700 h-8 bg-slate-800/40 text-slate-400">
                {weekGroups.map((group, i) => (
                  <div 
                    key={i} 
                    style={{ width: group.days * colWidth }}
                    className="flex-shrink-0 border-r border-slate-700/50 flex items-center px-4 text-[9px] font-bold overflow-hidden"
                  >
                    {colWidth > 15 && group.label}
                  </div>
                ))}
              </div>

              {/* Header Days */}
              <div className="flex border-b border-slate-700 h-10">
                {dates.map((date, i) => {
                  const isWknd = isWeekend(date);
                  return (
                    <div 
                      key={i} 
                      style={{ minWidth: colWidth }}
                      className={clsx(
                        "flex-shrink-0 border-r border-slate-700/50 flex flex-col items-center justify-center text-[10px]",
                        isWknd ? "bg-slate-800/60 text-slate-600" : "bg-slate-800 border-b-blue-900 text-slate-400"
                      )}
                    >
                      {colWidth > 25 && <span className="opacity-60 truncate">{format(date, 'eee')}</span>}
                      <span className={clsx(isWknd ? "text-slate-600" : "text-slate-300")}>{format(date, 'd')}</span>
                    </div>
                  );
                })}
              </div>

              {/* Grid Body */}
              <div className="relative py-2" style={{ width: dates.length * colWidth }}>
                {/* Background Grid Lines rendering */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {dates.map((date, i) => (
                    <div 
                      key={i} 
                      style={{ minWidth: colWidth }}
                      className={clsx(
                        "border-r border-slate-700/20",
                        isWeekend(date) && "bg-slate-800/30"
                      )}
                    />
                  ))}
                </div>

                {/* SVG lines for dependencies would go here */}
                <DependencyLines tasks={tasks} dependencies={dependencies} getCol={getColumnForDate} startDate={projectStartDate} colWidth={colWidth} />

                {/* Task Bars */}
                {tasks.map((task) => {
                  const esCalendar = getCalendarDateFromProjectDay(projectStartDate, task.es);
                  const efCalendar = getCalendarDateFromProjectDay(projectStartDate, task.ef);
                  
                  const startCol = getColumnForDate(esCalendar);
                  const endCol = getColumnForDate(efCalendar) + 1; // +1 to cover the whole day column
                  const span = endCol - startCol;

                  return (
                    <div key={task.id} className="h-12 border-b border-slate-700/50 relative flex items-center group">
                      <div 
                        onClick={() => onTaskClick(task.id)}
                        className={clsx(
                          "absolute h-6 rounded-md shadow-lg transition-all duration-300 ease-out cursor-pointer flex items-center px-3 z-10 overflow-hidden",
                          task.isCritical 
                            ? "bg-red-500/80 border border-red-400 hover:bg-red-500 shadow-red-500/30" 
                            : "bg-blue-500/80 border border-blue-400 hover:bg-blue-500 shadow-blue-500/30",
                          selectedTaskId === task.id && "ring-2 ring-white ring-offset-2 ring-offset-slate-900"
                        )}
                        style={{
                          left: `${(startCol - 1) * colWidth + 4}px`,
                          width: `${span * colWidth - 8}px`,
                        }}
                      >
                         {colWidth > 25 && (
                           <span className="text-[10px] font-bold text-white drop-shadow-md truncate">
                              {task.duration}d
                           </span>
                         )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
