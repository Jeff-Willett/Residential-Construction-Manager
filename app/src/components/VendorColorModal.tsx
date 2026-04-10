import { useProjectStore } from '../store/projectStore';
import { X, Palette } from 'lucide-react';

export function VendorColorModal({ onClose }: { onClose: () => void }) {
  const { tasks, vendorColors, setVendorColor } = useProjectStore();
  
  // Extract unique subcontractors
  const uniqueVendors = Array.from(new Set(tasks.map(t => t.subcontractor).filter(Boolean))) as string[];
  uniqueVendors.sort();

  const handleColorChange = (vendor: string, color: string) => {
    setVendorColor(vendor, color);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
       <div className="bg-slate-800 border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col transform transition-all">
          
          <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-900/50">
             <h2 className="text-lg font-bold text-slate-100 flex items-center">
               <Palette className="mr-2 text-cyan-400" size={20} />
               Subcontractor Matrix
             </h2>
             <button onClick={onClose} className="text-slate-400 hover:text-white transition rounded-full hover:bg-slate-700 p-1">
               <X size={20} />
             </button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[60vh] space-y-3">
             <p className="text-xs text-slate-400 mb-4 tracking-wide uppercase font-semibold">Assign Custom Colors</p>
             {uniqueVendors.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4 border border-dashed border-slate-700 rounded-lg">
                   No subcontractors detected in active projects.
                </p>
             ) : (
                uniqueVendors.map(vendor => (
                  <div key={vendor} className="flex justify-between items-center bg-slate-900/60 p-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition group">
                     <span className="text-sm font-medium text-slate-200">{vendor}</span>
                     <div className="flex items-center space-x-3">
                        <input 
                           type="color" 
                           value={vendorColors[vendor] || '#0891b2'} 
                           onChange={(e) => handleColorChange(vendor, e.target.value)}
                           className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent p-0"
                           title="Select Color"
                        />
                        {vendorColors[vendor] && (
                          <button 
                             onClick={() => handleColorChange(vendor, '')} 
                             className="text-[10px] text-slate-500 hover:text-red-400 px-2 py-1.5 rounded border border-slate-700 hover:border-red-500/50 hover:bg-red-500/10 transition uppercase tracking-wider font-bold"
                          >
                             Reset
                          </button>
                        )}
                     </div>
                  </div>
                ))
             )}
          </div>
       </div>
    </div>
  );
}
