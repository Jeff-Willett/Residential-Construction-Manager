import { getCalendarDateFromProjectDay } from '../utils/cpm';
import type { Task, Dependency } from '../utils/cpm';

interface Props {
  tasks: Task[];
  dependencies: Dependency[];
  getCol: (dateStr: string) => number;
  startDate: string;
  colWidth: number;
}

export function DependencyLines({ tasks, dependencies, getCol, startDate, colWidth }: Props) {
  const rowHeight = 48; // h-12 matches 48px
  
  return (
    <svg className="absolute inset-0 pointer-events-none z-0" style={{ width: '100%', height: '100%' }}>
      {dependencies.map(dep => {
        const pTask = tasks.find(t => t.id === dep.predecessorId);
        const sTask = tasks.find(t => t.id === dep.successorId);
        if (!pTask || !sTask) return null;

        const pIndex = tasks.findIndex(t => t.id === dep.predecessorId);
        const sIndex = tasks.findIndex(t => t.id === dep.successorId);

        // Predecessor finishes at ES + EF
        const pEndCol = getCol(getCalendarDateFromProjectDay(startDate, pTask.ef)) + 1;
        const sStartCol = getCol(getCalendarDateFromProjectDay(startDate, sTask.es));

        // Start point: right edge of predecessor
        const startX = (pEndCol - 1) * colWidth;
        const startY = pIndex * rowHeight + (rowHeight / 2);

        // End point: left edge of successor
        const endX = (sStartCol - 1) * colWidth + 4; // offset for the pill
        const endY = sIndex * rowHeight + (rowHeight / 2);

        // Draw an elbow path
        const isCritical = pTask.isCritical && sTask.isCritical;
        const color = isCritical ? 'rgba(239, 68, 68, 0.7)' : 'rgba(148, 163, 184, 0.4)';
        const strokeWidth = isCritical ? 2.5 : 1.5;

        // Create an L-shaped path
        let pathData = '';
        if (startX <= endX) {
            // Forward dependency
            pathData = `M ${startX} ${startY} 
                        L ${startX + 10} ${startY}
                        L ${startX + 10} ${endY}
                        L ${endX} ${endY}`;
        } else {
            // Backwards? Standard CPM shouldn't have negative lag unless delayed.
            pathData = `M ${startX} ${startY} L ${endX} ${endY}`;
        }

        return (
          <g key={dep.id}>
            <path
              d={pathData}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              className="drop-shadow-sm transition-all duration-300"
            />
            {/* Arrowhead */}
            <circle cx={endX} cy={endY} r="3" fill={color} />
          </g>
        );
      })}
    </svg>
  );
}
