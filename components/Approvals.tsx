
import React, { useState, useEffect } from 'react';
import { dbService } from '../lib/db';
import { ExpenseTransaction } from '../types';

interface ApprovalsProps {
  familyAdminId: string;
}

const Approvals: React.FC<ApprovalsProps> = ({ familyAdminId }) => {
  const [pending, setPending] = useState<ExpenseTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPending = async () => {
    setLoading(true);
    try {
      const data = await dbService.getPendingApprovals(familyAdminId);
      setPending(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPending(); }, [familyAdminId]);

  const handleApproval = async (id: string, approve: boolean) => {
    try {
      await dbService.updateExpenseStatus(id, approve ? 'APPROVED' : 'REJECTED');
      loadPending();
    } catch (error) {
      alert("Error en la acción");
    }
  };

  const currency = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Aprobaciones Familiares</h2>
          <p className="text-slate-500 font-medium text-sm">Revisa los gastos enviados por los miembros de tu familia</p>
        </div>
        <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center font-black">
          {pending.length}
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">
           <i className="fa-solid fa-spinner fa-spin text-2xl mb-2"></i>
           <p>Buscando solicitudes pendientes...</p>
        </div>
      ) : pending.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-[2rem] border border-dashed border-slate-200">
          <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
             <i className="fa-solid fa-check-double text-2xl"></i>
          </div>
          <p className="text-slate-400 font-bold">¡Todo al día!</p>
          <p className="text-slate-400 text-sm">No hay aprobaciones pendientes para el presupuesto familiar.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((expense) => (
            <div key={expense.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-indigo-100 transition-all group">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                   <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 uppercase">
                      {expense.profiles?.full_name?.charAt(0) || expense.profiles?.email.charAt(0)}
                   </div>
                   <div className="leading-none">
                      <p className="text-xs font-black text-slate-800">{expense.profiles?.full_name || expense.profiles?.email}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{expense.date}</p>
                   </div>
                </div>
                <div>
                   <h4 className="font-bold text-slate-900 text-lg">{expense.description}</h4>
                   <p className="text-sm font-black text-indigo-600 mt-1">{currency(expense.amount)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleApproval(expense.id, false)}
                  className="flex-1 md:flex-none px-6 py-3 rounded-2xl bg-rose-50 text-rose-600 font-bold text-xs uppercase tracking-widest hover:bg-rose-100 transition-all"
                >
                  Rechazar
                </button>
                <button 
                   onClick={() => handleApproval(expense.id, true)}
                   className="flex-1 md:flex-none px-6 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-lg transition-all"
                >
                  Aprobar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Approvals;
