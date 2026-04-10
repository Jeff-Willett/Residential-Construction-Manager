import { useProjectStore } from '../store/projectStore';
import { X, Filter, Check } from 'lucide-react';
import { clsx } from 'clsx';

export function FilterModal({ onClose }: { onClose: () => void }) {
  const { tasks, activeFilters, toggleFilter, clearFilters, vendorColors } = useProjectStore();
  
  const uniqueVendors = Array.from(new Set(tasks.map(t => t.subcontractor).filter(Boolean))) as string[];
  uniqueVendors.sort();

  const uniqueScopes = Array.from(new Set(tasks.map(t => t.name))).sort();

  const activeCount = activeFilters.vendors.length + activeFilters.scopes.length;

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
             {/* Subcontractor Section */}
             <div className="sticky top-0 bg-slate-800/90 backdrop-blur z-20 px-5 py-2.5 border-b border-slate-700/50 shadow-sm text-xs font-bold text-cyan-400/80 uppercase tracking-widest flex items-center">
                Subcontractors
             </div>
             <div className="p-3 space-y-0.5">
                {uniqueVendors.map(vendor => {
                   const isActive = activeFilters.vendors.includes(vendor);
                   const vColor = vendorColors[vendor];
                   return (
                     <div key={vendor} onClick={() => toggleFilter('vendors', vendor)} className={clsx("flex items-center space-x-3 p-2.5 rounded-lg cursor-pointer transition select-none group border border-transparent", isActive ? "bg-cyan-500/10 border-cyan-500/20 shadow-sm" : "hover:bg-slate-700/40")}>
                        <div className={clsx("w-4 h-4 rounded border flex items-center justify-center transition-all duration-200 flex-shrink-0", isActive ? "bg-cyan-500 border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]" : "border-slate-500 group-hover:border-slate-400 shadow-inner group-hover:bg-slate-700")} >
                           {isActive && <Check size={12} className="text-blue-900" strokeWidth={4} />}
                        </div>
                        <div className="flex items-center justify-between w-full">
                           <span className={clsx("text-sm transition-colors truncate pr-2", isActive ? "text-cyan-300 font-bold" : "text-slate-300 group-hover:text-slate-200")}>{vendor}</span>
                           {vColor && (
                              <div 
                                className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm border border-black/20" 
                                style={{ backgroundColor: vColor }} 
                                title={`Assigned Color`}
                              />
                           )}
                        </div>
                     </div>
                   )
                })}
             </div>

             {/* Scopes Section */}
             <div className="sticky top-0 bg-slate-800/90 backdrop-blur z-20 px-5 py-2.5 border-b border-t border-slate-700/50 shadow-sm text-xs font-bold text-cyan-400/80 uppercase tracking-widest flex items-center mt-2">
                Task Scopes
             </div>
             <div className="p-3 space-y-0.5">
                {uniqueScopes.map(scope => {
                   const isActive = activeFilters.scopes.includes(scope);
                   return (
                     <div key={scope} onClick={() => toggleFilter('scopes', scope)} className={clsx("flex items-center space-x-3 p-2.5 rounded-lg cursor-pointer transition select-none group border border-transparent", isActive ? "bg-cyan-500/10 border-cyan-500/20 shadow-sm" : "hover:bg-slate-700/40")}>
                        <div className={clsx("w-4 h-4 rounded border flex items-center justify-center transition-all duration-200", isActive ? "bg-cyan-500 border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]" : "border-slate-500 group-hover:border-slate-400 shadow-inner group-hover:bg-slate-700")} >
                           {isActive && <Check size={12} className="text-blue-900" strokeWidth={4} />}
                        </div>
                        <span className={clsx("text-sm transition-colors truncate", isActive ? "text-cyan-300 font-bold" : "text-slate-300 group-hover:text-slate-200")}>{scope}</span>
                     </div>
                   )
                })}
             </div>
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
