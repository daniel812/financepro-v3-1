
import React from 'react';
import { ExpenseTransaction, Category, PaymentMethod, AppRole, ExpenseStatus } from '../types';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (e: React.FormEvent) => Promise<void>;
  editingId: string | null;
  newExpense: Partial<ExpenseTransaction>;
  setNewExpense: (expense: Partial<ExpenseTransaction>) => void;
  categories: Category[];
  paymentMethods: PaymentMethod[];
  submitting: boolean;
  role: AppRole;
}

const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingId,
  newExpense,
  setNewExpense,
  categories,
  paymentMethods,
  submitting,
  role
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div 
        className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg shadow-2xl p-6 md:p-8 animate-in slide-in-from-bottom duration-300 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black text-slate-800">
            {editingId ? 'Editar Transacción' : (role === 'ADMIN' ? 'Registrar Gasto' : 'Enviar Gasto')}
          </h3>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-lg transition-colors md:hidden"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        
        <form onSubmit={onSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Fecha</label>
              <input 
                type="date" 
                required 
                className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                value={newExpense.date || ''} 
                onChange={e => setNewExpense({...newExpense, date: e.target.value})} 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Monto</label>
              <input 
                type="number" 
                required 
                placeholder="0" 
                className="w-full px-4 py-3 bg-slate-50 rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                value={newExpense.amount || ''} 
                onChange={e => setNewExpense({...newExpense, amount: Number(e.target.value)})} 
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Descripción</label>
            <input 
              type="text" 
              required 
              placeholder="¿En qué se gastó?" 
              className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
              value={newExpense.description || ''} 
              onChange={e => setNewExpense({...newExpense, description: e.target.value})} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Categoría</label>
              <select 
                required 
                className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer" 
                value={newExpense.category_id || ''} 
                onChange={e => setNewExpense({...newExpense, category_id: e.target.value})}
              >
                <option value="">Seleccionar Categoría</option>
                {categories.filter(c => c.is_active && c.parent_id).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Método</label>
              <select 
                required 
                className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer" 
                value={newExpense.payment_method_id || ''} 
                onChange={e => setNewExpense({...newExpense, payment_method_id: e.target.value})}
              >
                <option value="">Seleccionar Método</option>
                {paymentMethods.filter(p => p.is_active).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button 
            type="submit" 
            disabled={submitting}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-wider shadow-lg shadow-indigo-100 disabled:opacity-50 transition-all active:scale-95 mt-2"
          >
            {submitting ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : null}
            {editingId ? 'Actualizar Transacción' : (role === 'ADMIN' ? 'Guardar Transacción' : 'Enviar para Aprobación')}
          </button>
          <button 
            type="button" 
            onClick={onClose} 
            className="w-full py-2 text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:text-slate-600 transition-colors"
          >
            Descartar Entrada
          </button>
        </form>
      </div>
    </div>
  );
};

export default ExpenseModal;
