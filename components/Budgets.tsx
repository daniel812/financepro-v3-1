
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

  useEffect(() => {
    const load = async () => {
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
            // Apply default if it exists in our map
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
    load();
  }, [month, familyAdminId]);

  const handleSave = async () => {
    const budgetsToSave = (Object.entries(editingBudgets) as [string, number][]).map(([catId, amount]) => ({
      category_id: catId,
      planned_amount: amount
    }));

    try {
      await dbService.saveBudgets(month, budgetsToSave, familyAdminId);
      alert('¡Presupuestos guardados exitosamente para la familia!');
    } catch (err) {
      console.error(err);
      alert('Error al guardar presupuestos.');
    }
  };

  const currency = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  const groupedCategories = useMemo(() => {
    const parents = categories.filter(c => !c.parent_id);
    return parents.map(p => {
      const children = categories.filter(c => c.parent_id === p.id);
      const parentPlanned = children.reduce((sum, child) => sum + (editingBudgets[child.id] || 0), 0);
      return { ...p, children, totalPlanned: parentPlanned };
    });
  }, [categories, editingBudgets]);

  if (loading) return <div className="text-center py-20"><i className="fa-solid fa-spinner fa-spin text-2xl"></i></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-slate-800">Asignación de Presupuesto</h2>
        <button onClick={handleSave} className="bg-indigo-600 text-white px-8 py-2 rounded-xl font-semibold shadow-lg transition-all active:scale-95">Guardar Cambios</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100">
        {groupedCategories.map((group) => (
          <div key={group.id}>
            <div className="px-6 py-4 bg-slate-50 flex justify-between items-center">
              <span className="font-bold text-slate-700 text-xs uppercase">{group.name}</span>
              <span className="text-xs font-bold text-indigo-600 px-2 py-1 bg-indigo-50 rounded">{currency(group.totalPlanned)}</span>
            </div>
            {group.children.map(child => (
              <div key={child.id} className="p-4 pl-14 grid grid-cols-2 items-center hover:bg-slate-50 transition-colors">
                <span className="font-medium text-slate-600 text-sm">{child.name}</span>
                <div className="flex justify-end">
                  <input 
                    type="number"
                    className="w-32 px-4 py-1.5 bg-slate-50 border border-transparent rounded-xl text-right font-bold outline-none text-sm focus:border-indigo-500"
                    value={editingBudgets[child.id] || 0}
                    onChange={(e) => setEditingBudgets({ ...editingBudgets, [child.id]: Number(e.target.value) })}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Budgets;
