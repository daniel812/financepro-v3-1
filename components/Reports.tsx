
import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../lib/db';
import { Category, ExpenseTransaction, MonthlyCategoryBudget, AppRole, PaymentMethod, ExpenseStatus } from '../types';
import ExpenseModal from './ExpenseModal';

interface ReportsProps {
  month: string;
  role: AppRole;
  userId: string;
  familyAdminId: string;
}

const Reports: React.FC<ReportsProps> = ({ month, role, userId, familyAdminId }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [budgets, setBudgets] = useState<MonthlyCategoryBudget[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const initialFormState: Partial<ExpenseTransaction> = {
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: 0,
    category_id: '',
    payment_method_id: '',
  };

  const [newExpense, setNewExpense] = useState<Partial<ExpenseTransaction>>(initialFormState);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cats, exps, buds, pms] = await Promise.all([
        dbService.getCategories(familyAdminId),
        dbService.getExpenses(month, familyAdminId),
        dbService.getBudgets(month, familyAdminId),
        dbService.getPaymentMethods(familyAdminId)
      ]);
      setCategories(cats);
      setExpenses(exps);
      setBudgets(buds);
      setPaymentMethods(pms);
      setExpandedParents(new Set(cats.filter(c => !c.parent_id).map(c => c.id)));
    } catch (err) {
      console.error("Error cargando datos del reporte:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [month, familyAdminId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newExpense.description || !newExpense.amount || !newExpense.category_id || !newExpense.payment_method_id || !newExpense.date) {
      alert("Por favor, completa todos los campos requeridos.");
      return;
    }
    
    setSubmitting(true);
    try {
      const initialStatus: ExpenseStatus = role === 'ADMIN' ? 'APPROVED' : 'PENDING_APPROVAL';
      const payload = {
        date: newExpense.date,
        description: newExpense.description,
        amount: Number(newExpense.amount),
        category_id: newExpense.category_id,
        payment_method_id: newExpense.payment_method_id,
        status: initialStatus
      };
      await dbService.addExpense(payload as any, userId);
      
      setIsModalOpen(false);
      setNewExpense(initialFormState);
      await loadData();
    } catch (err: any) {
      console.error("Error guardando gasto:", err);
      alert(`Error al guardar el gasto: ${err.message || "Error desconocido"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleParent = (id: string) => {
    const newSet = new Set(expandedParents);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedParents(newSet);
  };

  const currency = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  const reportData = useMemo(() => {
    const parents = categories.filter(c => !c.parent_id);
    
    return parents.map(parent => {
      const children = categories.filter(c => c.parent_id === parent.id);
      
      const childrenReports = children.map(child => {
        const planned = budgets.find(b => b.category_id === child.id)?.planned_amount || 0;
        const spent = expenses
          .filter(e => e.category_id === child.id && (e.status === 'PAID' || e.status === 'APPROVED'))
          .reduce((sum, e) => sum + e.amount, 0);
        const remaining = planned - spent;
        const percent = planned > 0 ? (spent / planned) * 100 : 0;
        
        return { ...child, planned, spent, remaining, percent };
      }).filter(c => c.planned > 0 || c.spent > 0);

      const totalPlanned = childrenReports.reduce((sum, c) => sum + c.planned, 0);
      const totalSpent = childrenReports.reduce((sum, c) => sum + c.spent, 0);
      const totalRemaining = totalPlanned - totalSpent;
      const totalPercent = totalPlanned > 0 ? (totalSpent / totalPlanned) * 100 : 0;

      return {
        ...parent,
        children: childrenReports,
        totalPlanned,
        totalSpent,
        totalRemaining,
        totalPercent
      };
    }).filter(p => p.children.length > 0 || p.totalPlanned > 0 || p.totalSpent > 0);
  }, [categories, expenses, budgets]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium">Analizando datos del presupuesto...</p>
      </div>
    );
  }

  const grandTotalRemaining = reportData.reduce((s, p) => s + p.totalRemaining, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2 md:px-0">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Reporte de Rendimiento</h2>
            <p className="text-slate-500 text-sm italic">Presupuesto Consolidado vs Gastos Reales</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 w-fit"
          >
            <i className="fa-solid fa-plus"></i>
            Crear Gasto
          </button>
        </div>
        <div className="bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between md:justify-start gap-4">
           <div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Global Restante</p>
             <p className={`text-xl font-black ${grandTotalRemaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
               {currency(grandTotalRemaining)}
             </p>
           </div>
           <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${grandTotalRemaining >= 0 ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
              <i className={`fa-solid ${grandTotalRemaining >= 0 ? 'fa-face-smile' : 'fa-face-frown'}`}></i>
           </div>
        </div>
      </div>

      <div className="space-y-4">
        {reportData.map((parent) => (
          <div key={parent.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden transition-all">
            <button 
              onClick={() => toggleParent(parent.id)}
              className="w-full px-5 py-4 flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-indigo-500 shadow-sm">
                  <i className="fa-solid fa-folder-open text-xs"></i>
                </div>
                <div className="text-left">
                  <span className="font-black text-slate-800 uppercase tracking-tight text-xs block">{parent.name}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{parent.children.length} sub-ítems</span>
                </div>
              </div>
              <div className="text-right flex items-center gap-4">
                 <div className="hidden md:block">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Balance del Grupo</p>
                    <p className={`text-sm font-black ${parent.totalRemaining >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{currency(parent.totalRemaining)}</p>
                 </div>
                 <i className={`fa-solid fa-chevron-down text-slate-300 text-xs transition-transform ${expandedParents.has(parent.id) ? 'rotate-180' : ''}`}></i>
              </div>
            </button>

            {expandedParents.has(parent.id) && (
              <div className="border-t border-slate-50">
                <div className="hidden md:grid grid-cols-5 px-6 py-2 bg-slate-50/30 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <div className="col-span-1">Subcategoría</div>
                  <div className="text-right">Presupuestado</div>
                  <div className="text-right">Gastado</div>
                  <div className="text-right">Restante</div>
                  <div className="pl-6">Progreso</div>
                </div>

                <div className="divide-y divide-slate-50">
                  {parent.children.map(child => (
                    <div key={child.id} className="px-5 py-4 md:px-6 md:py-3 md:grid md:grid-cols-5 items-center hover:bg-slate-50/50 transition-colors">
                      <div className="flex justify-between items-center md:col-span-1 mb-2 md:mb-0">
                        <div className="flex items-center gap-2">
                           <i className="fa-solid fa-turn-up rotate-90 text-slate-200 text-[10px]"></i>
                           <span className="text-sm font-bold text-slate-700">{child.name}</span>
                        </div>
                        <span className="md:hidden text-[10px] font-black text-slate-400">{Math.round(child.percent)}%</span>
                      </div>

                      <div className="grid grid-cols-3 md:block gap-2 mb-3 md:mb-0">
                        <div className="md:text-right">
                          <p className="md:hidden text-[8px] font-black text-slate-300 uppercase">Presupuesto</p>
                          <p className="text-xs md:text-sm text-slate-500">{currency(child.planned)}</p>
                        </div>
                        <div className="md:text-right">
                          <p className="md:hidden text-[8px] font-black text-slate-300 uppercase">Gasto</p>
                          <p className="text-xs md:text-sm font-bold text-slate-800">{currency(child.spent)}</p>
                        </div>
                        <div className="md:text-right">
                          <p className="md:hidden text-[8px] font-black text-slate-300 uppercase">Saldo</p>
                          <p className={`text-xs md:text-sm font-black ${child.remaining >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{currency(child.remaining)}</p>
                        </div>
                      </div>

                      <div className="md:pl-6">
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                           <div 
                             className={`h-full transition-all duration-1000 ${child.percent > 100 ? 'bg-rose-400' : 'bg-indigo-400'}`} 
                             style={{ width: `${Math.min(100, child.percent)}%` }}
                           ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <ExpenseModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSubmit}
        editingId={null}
        newExpense={newExpense}
        setNewExpense={setNewExpense}
        categories={categories}
        paymentMethods={paymentMethods}
        submitting={submitting}
        role={role}
      />
    </div>
  );
};

export default Reports;
