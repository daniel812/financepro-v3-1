
import React, { useState, useEffect } from 'react';
import { dbService } from '../lib/db';
import { MonthlyIncomePlan } from '../types';

interface IncomeProps {
  month: string;
  familyAdminId: string;
}

const Income: React.FC<IncomeProps> = ({ month, familyAdminId }) => {
  const [incomePlans, setIncomePlans] = useState<MonthlyIncomePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isReceivedModalOpen, setIsReceivedModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<MonthlyIncomePlan | null>(null);
  const [editingPlan, setEditingPlan] = useState<Partial<MonthlyIncomePlan> | null>(null);
  const [receivedOption, setReceivedOption] = useState<'TOTAL' | 'OTHER'>('TOTAL');
  const [customAmount, setCustomAmount] = useState<number>(0);

  const [newPlan, setNewPlan] = useState<Partial<MonthlyIncomePlan>>({
    name: '',
    expected_amount: 0,
    received_amount: 0,
    notes: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const plans = await dbService.getIncomePlans(month, familyAdminId);
      setIncomePlans(plans);
    } catch (err) {
      console.error("Error cargando planes de ingresos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [month, familyAdminId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const plan = {
        name: newPlan.name || '',
        expected_amount: newPlan.expected_amount || 0,
        received_amount: newPlan.received_amount || 0,
        notes: newPlan.notes || '',
        month,
        received_date: (newPlan.received_amount && newPlan.received_amount > 0) ? new Date().toISOString().split('T')[0] : null,
      };
      await dbService.addIncomePlan(plan, familyAdminId);
      setIsModalOpen(false);
      setNewPlan({ name: '', expected_amount: 0, received_amount: 0, notes: '' });
      loadData();
    } catch (err) {
      alert("Error añadiendo plan de ingresos");
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan || !editingPlan.id) return;
    try {
      await dbService.updateIncomePlan(editingPlan.id, {
        name: editingPlan.name,
        expected_amount: editingPlan.expected_amount,
        notes: editingPlan.notes,
      });
      setIsEditModalOpen(false);
      setEditingPlan(null);
      loadData();
    } catch (err) {
      alert("Error actualizando plan de ingresos");
    }
  };

  const openEditModal = (plan: MonthlyIncomePlan) => {
    setEditingPlan({ ...plan });
    setIsEditModalOpen(true);
  };

  const openReceivedModal = (plan: MonthlyIncomePlan) => {
    setSelectedPlan(plan);
    setReceivedOption('TOTAL');
    setCustomAmount(plan.expected_amount);
    setIsReceivedModalOpen(true);
  };

  const handleConfirmReceived = async () => {
    if (!selectedPlan) return;
    
    const amountToReceive = receivedOption === 'TOTAL' ? selectedPlan.expected_amount : customAmount;
    
    if (amountToReceive > selectedPlan.expected_amount) {
      alert("El valor recibido no puede ser superior al valor total esperado.");
      return;
    }

    try {
      await dbService.updateIncomeReceived(selectedPlan.id, amountToReceive);
      setIsReceivedModalOpen(false);
      setSelectedPlan(null);
      loadData();
    } catch (err) {
      alert("Error en actualización");
    }
  };

  const deletePlan = async (id: string) => {
    if (!confirm('¿Estás seguro?')) return;
    try {
      await dbService.deleteIncomePlan(id);
      loadData();
    } catch (err) {
      alert("Error al eliminar");
    }
  };

  const currency = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Ingresos Familiares</h2>
          <p className="text-xs text-slate-400">Gestiona las fuentes de ingresos del presupuesto familiar</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm font-semibold shadow-lg transition-all active:scale-95"
        >
          Añadir Plan de Ingresos
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400">Cargando fuentes de ingresos...</div>
        ) : incomePlans.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-dashed border-slate-200 text-slate-400">
            No hay planes de ingresos registrados para este mes.
          </div>
        ) : incomePlans.map((plan) => (
          <div key={plan.id} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative group">
            <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => openEditModal(plan)} className="text-slate-300 hover:text-indigo-500"><i className="fa-solid fa-pen-to-square text-xs"></i></button>
              <button onClick={() => deletePlan(plan.id)} className="text-slate-300 hover:text-rose-500"><i className="fa-solid fa-trash text-xs"></i></button>
            </div>
            <h4 className="font-bold text-slate-800 mb-4">{plan.name}</h4>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Esperado</span><span className="font-semibold">{currency(plan.expected_amount)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Recibido</span><span className="font-semibold text-emerald-600">{currency(plan.received_amount)}</span></div>
              {plan.received_amount < plan.expected_amount && (
                <>
                  <div className="flex justify-between text-[10px] font-bold text-rose-500 uppercase tracking-wider pt-1 border-t border-slate-50">
                    <span>Pendiente</span>
                    <span>{currency(plan.expected_amount - plan.received_amount)}</span>
                  </div>
                  <button onClick={() => openReceivedModal(plan)} className="w-full mt-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold uppercase transition-all hover:bg-emerald-100">Marcar como Recibido</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl">
            <h3 className="text-xl font-bold mb-6">Entrada de Ingresos</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <input type="text" required placeholder="Nombre (ej. Salario, Renta)" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" value={newPlan.name} onChange={e => setNewPlan({...newPlan, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <input type="number" required placeholder="Esperado" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" value={newPlan.expected_amount || ''} onChange={e => setNewPlan({...newPlan, expected_amount: Number(e.target.value)})} />
                <input type="number" placeholder="Recibido" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none" value={newPlan.received_amount || ''} onChange={e => setNewPlan({...newPlan, received_amount: Number(e.target.value)})} />
              </div>
              <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95">Crear Plan</button>
              <button type="button" onClick={() => setIsModalOpen(false)} className="w-full py-2 text-slate-400 font-bold text-xs uppercase tracking-widest">Cancelar</button>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl">
            <h3 className="text-xl font-bold mb-6">Editar Plan de Ingresos</h3>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre</label>
                <input type="text" required placeholder="Nombre" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" value={editingPlan.name || ''} onChange={e => setEditingPlan({...editingPlan, name: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Esperado</label>
                <input type="number" required placeholder="Esperado" className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500" value={editingPlan.expected_amount || ''} onChange={e => setEditingPlan({...editingPlan, expected_amount: Number(e.target.value)})} />
              </div>
              <div className="pt-4 space-y-3">
                <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95">Guardar Cambios</button>
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="w-full py-2 text-slate-400 font-bold text-xs uppercase tracking-widest">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isReceivedModalOpen && selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in duration-200">
            <h3 className="text-xl font-bold mb-2 text-slate-800">Selecciona el valor recibido</h3>
            <p className="text-xs text-slate-400 mb-6 uppercase font-bold tracking-widest">{selectedPlan.name}</p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setReceivedOption('TOTAL')}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${receivedOption === 'TOTAL' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                >
                  <span className={`text-[10px] font-black uppercase tracking-widest ${receivedOption === 'TOTAL' ? 'text-emerald-600' : 'text-slate-400'}`}>Total</span>
                  <span className="font-bold text-slate-800">{currency(selectedPlan.expected_amount)}</span>
                </button>
                <button 
                  onClick={() => setReceivedOption('OTHER')}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${receivedOption === 'OTHER' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                >
                  <span className={`text-[10px] font-black uppercase tracking-widest ${receivedOption === 'OTHER' ? 'text-emerald-600' : 'text-slate-400'}`}>Otro</span>
                  <span className="font-bold text-slate-800">Valor Parcial</span>
                </button>
              </div>

              {receivedOption === 'OTHER' && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ingresa el monto recibido</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-bold text-slate-800"
                    placeholder="0"
                    value={customAmount || ''}
                    onChange={(e) => setCustomAmount(Number(e.target.value))}
                  />
                  {customAmount > selectedPlan.expected_amount && (
                    <p className="text-[10px] text-rose-500 font-bold ml-1">El valor no puede superar {currency(selectedPlan.expected_amount)}</p>
                  )}
                </div>
              )}

              <div className="bg-slate-50 p-4 rounded-2xl space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <span>Monto Total Esperado</span>
                  <span>{currency(selectedPlan.expected_amount)}</span>
                </div>
                <div className="flex justify-between text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                  <span>Monto a Recibir</span>
                  <span>{currency(receivedOption === 'TOTAL' ? selectedPlan.expected_amount : customAmount)}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between text-xs font-black text-slate-800 uppercase tracking-widest">
                  <span>Saldo Pendiente</span>
                  <span className={selectedPlan.expected_amount - (receivedOption === 'TOTAL' ? selectedPlan.expected_amount : customAmount) > 0 ? 'text-rose-500' : 'text-slate-400'}>
                    {currency(Math.max(0, selectedPlan.expected_amount - (receivedOption === 'TOTAL' ? selectedPlan.expected_amount : customAmount)))}
                  </span>
                </div>
              </div>

              <div className="pt-4 space-y-3">
                <button 
                  onClick={handleConfirmReceived}
                  disabled={receivedOption === 'OTHER' && (customAmount <= 0 || customAmount > selectedPlan.expected_amount)}
                  className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                >
                  Confirmar Recepción
                </button>
                <button 
                  onClick={() => setIsReceivedModalOpen(false)} 
                  className="w-full py-2 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-600 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Income;
