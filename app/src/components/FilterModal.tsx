import { useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { X, Filter, Check, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

export function FilterModal({ onClose }: { onClose: () => void }) {
  const { projects, tasks, activeFilters, toggleFilter, clearFilters, vendorColors } = useProjectStore();
  const [expandedSections, setExpandedSections] = useState({
    projects: false,
    vendors: false,
    scopes: false
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section]
    }));
  };

  const projectOptions = [...projects]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((project) => ({ id: project.id, label: project.name }));
  const uniqueVendors = Array.from(new Set(tasks.map(t => t.subcontractor).filter(Boolean))) as string[];
  uniqueVendors.sort();
  const uniqueScopes = Array.from(new Set(tasks.map(t => t.name))).sort();
  const activeCount = activeFilters.projects.length + activeFilters.vendors.length + activeFilters.scopes.length;

  const renderFilterItem = ({
    id,
    label,
    isActive,
    onToggle,
    accent
  }: {
    id: string;
    label: string;
    isActive: boolean;
    onToggle: () => void;
    accent?: React.ReactNode;
  }) => (
    <div
      key={id}
      onClick={onToggle}
      className={clsx(
        'flex items-center space-x-3 p-2.5 rounded-lg cursor-pointer transition select-none group border border-transparent',
        isActive ? 'bg-cyan-500/10 border-cyan-500/20 shadow-sm' : 'hover:bg-slate-700/40'
      )}
    >
      <div
        className={clsx(
          'w-4 h-4 rounded border flex items-center justify-center transition-all duration-200 flex-shrink-0',
          isActive
            ? 'bg-cyan-500 border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]'
            : 'border-slate-500 group-hover:border-slate-400 shadow-inner group-hover:bg-slate-700'
        )}
      >
        {isActive && <Check size={12} className="text-blue-900" strokeWidth={4} />}
      </div>
      <div className="flex items-center justify-between w-full gap-3 min-w-0">
        <span className={clsx('text-sm transition-colors truncate', isActive ? 'text-cyan-300 font-bold' : 'text-slate-300 group-hover:text-slate-200')}>
          {label}
        </span>
        {accent}
      </div>
    </div>
  );

  const renderSection = ({
    title,
    count,
    expanded,
    onToggle,
    children
  }: {
    title: string;
    count: number;
    expanded: boolean;
    onToggle: () => void;
    children: React.ReactNode;
  }) => (
    <div className="border-b border-slate-700/40">
      <button
        onClick={onToggle}
        className="w-full px-5 py-3 flex items-center justify-between bg-slate-800/90 hover:bg-slate-700/70 transition text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <ChevronRight
            size={16}
            className={clsx('text-cyan-400 transition-transform flex-shrink-0', expanded && 'rotate-90')}
          />
          <span className="text-xs font-bold text-cyan-400/80 uppercase tracking-widest">{title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {count > 0 && (
            <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
              {count} selected
            </span>
          )}
        </div>
      </button>
      {expanded && <div className="p-3 space-y-0.5">{children}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/60 backdrop-blur-sm shadow-2xl">
       <div className="bg-slate-800 border-l border-slate-700 flex flex-col shadow-[rgba(0,0,0,0.5)_0px_0px_50px] w-[350px] animate-in slide-in-from-right duration-200">
          
          <div className="flex items-center justify-between p-5 border-b border-slate-700/80 bg-slate-900/80 backdrop-blur-lg">
             <h2 className="text-lg font-bold text-slate-100 flex items-center tracking-wide">
               <Filter className="mr-3 text-cyan-400 bg-cyan-400/10 p-1.5 rounded-lg" size={28} />
               Global Filters
               {activeCount > 0 && <span className="ml-3 bg-blue-500 text-white text-[11px] px-2.5 py-0.5 rounded-full font-bold shadow-md animate-pulse">{activeCount}</span>}
             </h2>
             <button onClick={onClose} className="text-slate-400 hover:text-white transition rounded-full hover:bg-slate-700 p-2">
               <X size={20} />
             </button>
          </div>

          <div className="px-5 py-3 border-b border-slate-700/50 bg-slate-900/40 flex justify-between items-center shadow-inner">
             <span className="text-xs font-semibold text-slate-500">DYNAMIC SLICING</span>
             <button disabled={activeCount === 0} onClick={clearFilters} className="text-xs text-slate-400 hover:text-red-400 disabled:opacity-30 disabled:hover:text-slate-400 font-bold px-3 py-1.5 transition rounded hover:bg-red-400/10 tracking-wider uppercase">Reset All Filters</button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar pb-10">
             {renderSection({
               title: 'Projects',
               count: activeFilters.projects.length,
               expanded: expandedSections.projects,
               onToggle: () => toggleSection('projects'),
               children:
                 projectOptions.length === 0 ? (
                   <p className="text-slate-400 text-sm text-center py-4 border border-dashed border-slate-700 rounded-lg">
                     No projects available.
                   </p>
                 ) : (
                   projectOptions.map((project) =>
                     renderFilterItem({
                       id: project.id,
                       label: project.label,
                       isActive: activeFilters.projects.includes(project.id),
                       onToggle: () => toggleFilter('projects', project.id)
                     })
                   )
                 )
             })}

             {renderSection({
               title: 'Subcontractors',
               count: activeFilters.vendors.length,
               expanded: expandedSections.vendors,
               onToggle: () => toggleSection('vendors'),
               children:
                 uniqueVendors.length === 0 ? (
                   <p className="text-slate-400 text-sm text-center py-4 border border-dashed border-slate-700 rounded-lg">
                     No subcontractors detected in active projects.
                   </p>
                 ) : (
                   uniqueVendors.map((vendor) =>
                     renderFilterItem({
                       id: vendor,
                       label: vendor,
                       isActive: activeFilters.vendors.includes(vendor),
                       onToggle: () => toggleFilter('vendors', vendor),
                       accent: vendorColors[vendor] ? (
                         <div
                           className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm border border-black/20"
                           style={{ backgroundColor: vendorColors[vendor] }}
                           title="Assigned Color"
                         />
                       ) : undefined
                     })
                   )
                 )
             })}

             {renderSection({
               title: 'Task Scopes',
               count: activeFilters.scopes.length,
               expanded: expandedSections.scopes,
               onToggle: () => toggleSection('scopes'),
               children:
                 uniqueScopes.length === 0 ? (
                   <p className="text-slate-400 text-sm text-center py-4 border border-dashed border-slate-700 rounded-lg">
                     No task scopes available.
                   </p>
                 ) : (
                   uniqueScopes.map((scope) =>
                     renderFilterItem({
                       id: scope,
                       label: scope,
                       isActive: activeFilters.scopes.includes(scope),
                       onToggle: () => toggleFilter('scopes', scope)
                     })
                   )
                 )
             })}
          </div>
          
          <div className="p-5 border-t border-slate-700/80 bg-slate-900 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
            <button onClick={onClose} className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 ring-1 ring-cyan-400/50 text-white font-bold tracking-wide py-3 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] transition-all flex items-center justify-center">
               Apply & Render Matrix
            </button>
          </div>
       </div>
    </div>
  );
}
