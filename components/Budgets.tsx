
import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../lib/db';
import { Category } from '../types';
import { DEFAULT_BUDGETS } from '../constants/budgets';

interface BudgetsProps {
  month: string;
  familyAdminId: string;
}

const Budgets: React.FC<BudgetsProps> = ({ month, familyAdminId }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingBudgets, setEditingBudgets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [cats, buds] = await Promise.all([
        dbService.getCategories(familyAdminId),
        dbService.getBudgets(month, familyAdminId)
      ]);
      setCategories(cats);
      
      const budgetMap: Record<string, number> = {};
      const isPostFeb2026 = month > '2026-02-01';
      const hasNoBudgets = buds.length === 0;

      cats.forEach(cat => {
        const budget = buds.find(b => b.category_id === cat.id);
        if (budget) {
          budgetMap[cat.id] = budget.planned_amount;
        } else if (isPostFeb2026 && hasNoBudgets) {
          budgetMap[cat.id] = DEFAULT_BUDGETS[cat.name] || 0;
        } else {
          budgetMap[cat.id] = 0;
        }
      });
      setEditingBudgets(budgetMap);
    } catch (err) {
      console.error("Error cargando presupuestos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [month, familyAdminId]);

  const handleSave = async () => {
    const budgetsToSave = (Object.entries(editingBudgets) as [string, number][])
      .filter(([_, amount]) => amount > 0) // Only save non-zero budgets to prevent cluttering future months if not needed
      .map(([catId, amount]) => ({
        category_id: catId,
        planned_amount: amount
      }));

    try {
      await dbService.saveBudgets(month, budgetsToSave, familyAdminId);
      alert('¡Presupuestos guardados exitosamente!');
      await loadData();
    } catch (err) {
      console.error(err);
      alert('Error al guardar presupuestos.');
    }
  };

  const handleAddItem = async (parentId: string) => {
    if (!newItemName.trim()) return;
    
    try {
      const newCat = await dbService.addCategory({
        name: newItemName.trim(),
        parent_id: parentId,
        group_name: null,
        is_active: true,
        user_id: familyAdminId
      });
      
      setCategories([...categories, newCat]);
      setEditingBudgets({ ...editingBudgets, [newCat.id]: 0 });
      setNewItemName('');
      setAddingToGroup(null);
    } catch (err) {
      console.error("Error agregando categoría:", err);
      alert("Error al agregar el ítem.");
    }
  };

  const currency = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  const groupedCategories = useMemo(() => {
    const parents = categories.filter(c => !c.parent_id);
    const hasAnyBudgets = Object.values(editingBudgets).some(v => v > 0);

    return parents.map(p => {
      let children = categories.filter(c => c.parent_id === p.id);
      
      // If we are in an older month, don't show categories that have 0 budget and didn't exist in the default list
      // This is a heuristic to help "not damage" past months visually
      if (hasAnyBudgets) {
        children = children.filter(child => 
          (editingBudgets[child.id] || 0) > 0 || 
          DEFAULT_BUDGETS[child.name] !== undefined ||
          addingToGroup === p.id // Show even if 0 if we just tried adding to it
        );
      }

      const parentPlanned = children.reduce((sum, child) => sum + (editingBudgets[child.id] || 0), 0);
      return { ...p, children, totalPlanned: parentPlanned };
    }).filter(p => p.children.length > 0 || addingToGroup === p.id);
  }, [categories, editingBudgets, addingToGroup]);

  if (loading) return <div className="text-center py-20"><i className="fa-solid fa-spinner fa-spin text-2xl text-indigo-600"></i></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Planificación Mensual</h2>
          <p className="text-slate-500 text-sm">Distribuye tus ingresos para el mes seleccionado</p>
        </div>
        <button 
          onClick={handleSave} 
          className="bg-indigo-600 text-white px-10 py-3 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-100 transition-all hover:bg-indigo-700 active:scale-95"
        >
          Guardar Cambios
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-50">
        {groupedCategories.map((group) => (
          <div key={group.id} className="group">
            <div className="px-6 py-4 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="font-black text-slate-400 text-[10px] uppercase tracking-widest">{group.name}</span>
                <button 
                  onClick={() => setAddingToGroup(group.id)}
                  className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all"
                >
                  <i className="fa-solid fa-plus text-[10px]"></i>
                </button>
              </div>
              <span className="text-xs font-black text-indigo-600 px-3 py-1 bg-white border border-indigo-50 rounded-full shadow-sm">
                {currency(group.totalPlanned)}
              </span>
            </div>

            <div className="divide-y divide-slate-50/50">
              {group.children.map(child => (
                <div key={child.id} className="p-4 pl-10 md:pl-14 flex items-center justify-between hover:bg-slate-50/30 transition-colors">
                  <span className="font-bold text-slate-600 text-sm">{child.name}</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-xs">$</span>
                    <input 
                      type="number"
                      className="w-40 px-6 py-2 bg-slate-50 border border-transparent rounded-xl text-right font-black outline-none text-sm focus:border-indigo-500 transition-all"
                      value={editingBudgets[child.id] || 0}
                      onChange={(e) => setEditingBudgets({ ...editingBudgets, [child.id]: Number(e.target.value) })}
                    />
                  </div>
                </div>
              ))}

              {addingToGroup === group.id && (
                <div className="p-4 pl-14 bg-indigo-50/30 flex items-center justify-between animate-in fade-in slide-in-from-left-2 duration-300">
                  <input 
                    autoFocus
                    type="text"
                    placeholder="Nombre del nuevo ítem..."
                    className="flex-1 bg-transparent border-b-2 border-indigo-200 outline-none font-bold text-sm text-indigo-900 mr-4 placeholder:text-indigo-200"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddItem(group.id);
                      if (e.key === 'Escape') setAddingToGroup(null);
                    }}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleAddItem(group.id)} className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-md">
                      <i className="fa-solid fa-check"></i>
                    </button>
                    <button onClick={() => setAddingToGroup(null)} className="w-8 h-8 rounded-lg bg-white text-slate-400 flex items-center justify-center border border-slate-200">
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {groupedCategories.length === 0 && !loading && (
        <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-200">
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No hay categorías configuradas</p>
        </div>
      )}
    </div>
  );
};

export default Budgets;
