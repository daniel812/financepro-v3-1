
import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../lib/db';
import { Category, PaymentMethod, Profile } from '../types';

interface SettingsProps {
  profile: Profile;
}

const Settings: React.FC<SettingsProps> = ({ profile }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [familyMembers, setFamilyMembers] = useState<Profile[]>([]);
  const [activeTab, setActiveTab] = useState<'categories' | 'payments' | 'family' | 'telegram'>('categories');
  const [loading, setLoading] = useState(true);
  
  const [isPMModalOpen, setIsPMModalOpen] = useState(false);
  const [isFamilyModalOpen, setIsFamilyModalOpen] = useState(false);
  const [editingPM, setEditingPM] = useState<Partial<PaymentMethod> | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cats, pms, members] = await Promise.all([
        dbService.getCategories(profile.id),
        dbService.getPaymentMethods(profile.id),
        dbService.getFamilyMembers(profile.id)
      ]);
      setCategories(cats);
      setPaymentMethods(pms);
      setFamilyMembers(members);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [profile.id]);

  const handleInitialize = async () => {
    if (!confirm('Esto cargará las categorías y métodos de pago por defecto. ¿Continuar?')) return;
    setLoading(true);
    try {
      await dbService.initializeDefaults(profile.id);
      await loadData();
      alert('Valores predeterminados inicializados.');
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = async (id: string, currentActive: boolean) => {
    try {
      await dbService.toggleCategory(id, !currentActive);
      loadData();
    } catch (err) {
      alert("Error en actualización");
    }
  };

  const togglePM = async (id: string, currentActive: boolean) => {
    try {
      await dbService.togglePaymentMethod(id, !currentActive);
      loadData();
    } catch (err) {
      alert("Error en actualización");
    }
  };

  const handlePMSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPM?.name || !editingPM?.type) return;

    try {
      if (editingPM.id) {
        await dbService.updatePaymentMethod(editingPM.id, {
          name: editingPM.name,
          type: editingPM.type
        });
      } else {
        await dbService.addPaymentMethod({
          name: editingPM.name,
          type: editingPM.type,
          is_active: true
        }, profile.id);
      }
      setIsPMModalOpen(false);
      setEditingPM(null);
      loadData();
    } catch (err: any) {
      alert("Error al guardar: " + err.message);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail) return;
    setSubmitting(true);
    try {
      await dbService.addFamilyMemberByEmail(profile.id, newMemberEmail);
      setIsFamilyModalOpen(false);
      setNewMemberEmail('');
      loadData();
      alert('¡Miembro añadido exitosamente!');
    } catch (err: any) {
      alert(err.message || 'Error al añadir miembro');
    } finally {
      setSubmitting(false);
    }
  };

  const removeMember = async (id: string) => {
    if (!confirm('¿Eliminar miembro? Perderá el acceso a los datos compartidos.')) return;
    try {
      await dbService.removeFamilyMember(id);
      loadData();
    } catch (err: any) {
      alert('Error al eliminar miembro');
    }
  };

  const deletePM = async (id: string) => {
    if (!confirm('¿Eliminar método de pago?')) return;
    try {
      await dbService.deletePaymentMethod(id);
      loadData();
    } catch (err: any) {
      alert("Error al eliminar. Podría estar vinculado a transacciones.");
    }
  };

  const structuredCategories = useMemo(() => {
    const parents = categories.filter(c => !c.parent_id);
    return parents.map(p => ({
      ...p,
      children: categories.filter(c => c.parent_id === p.id)
    }));
  }, [categories]);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h2 className="text-xl font-bold text-slate-800">Infraestructura Familiar</h2>
           <p className="text-sm text-slate-400">Configura tu ecosistema financiero compartido</p>
        </div>
        <button onClick={handleInitialize} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-indigo-100 transition-all active:scale-95 hover:bg-indigo-700">
          Reiniciar Listado de Conceptos
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
        <div className="flex border-b border-slate-100 items-center justify-between pr-6 overflow-x-auto">
          <div className="flex shrink-0">
            <button 
              onClick={() => setActiveTab('categories')} 
              className={`px-6 md:px-8 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'categories' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
            >
              Categorías
            </button>
            <button 
              onClick={() => setActiveTab('payments')} 
              className={`px-6 md:px-8 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'payments' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
            >
              Pagos
            </button>
            <button 
              onClick={() => setActiveTab('family')} 
              className={`px-6 md:px-8 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'family' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
            >
              Miembros
            </button>
            <button 
              onClick={() => setActiveTab('telegram')} 
              className={`px-6 md:px-8 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'telegram' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}
            >
              Telegram Bot
            </button>
          </div>
          <div className="shrink-0 flex items-center gap-2 py-2">
            {activeTab === 'payments' && (
              <button 
                onClick={() => { setEditingPM({ name: '', type: 'CARD' }); setIsPMModalOpen(true); }}
                className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-2"
              >
                <i className="fa-solid fa-plus"></i> Añadir Método
              </button>
            )}
            {activeTab === 'family' && (
              <button 
                onClick={() => setIsFamilyModalOpen(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-md shadow-indigo-100"
              >
                <i className="fa-solid fa-user-plus"></i> Invitar Miembro
              </button>
            )}
          </div>
        </div>

        <div className="p-6 md:p-8">
          {loading ? (
            <div className="text-center py-20 text-slate-400">
              <i className="fa-solid fa-spinner fa-spin text-3xl mb-4"></i>
              <p className="font-bold uppercase tracking-widest text-[10px]">Sincronizando...</p>
            </div>
          ) : activeTab === 'categories' ? (
            <div className="space-y-6">
              {structuredCategories.map(parent => (
                <div key={parent.id} className="bg-slate-50/50 rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="flex items-center justify-between p-4 bg-white border-b border-slate-100">
                    <div className="flex items-center gap-3">
                       <span className="font-black text-slate-800 uppercase tracking-wider text-xs">{parent.name}</span>
                    </div>
                    <button 
                      onClick={() => toggleCategory(parent.id, parent.is_active)} 
                      className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase border transition-all ${parent.is_active ? 'bg-white text-slate-500' : 'bg-emerald-500 text-white'}`}
                    >
                      {parent.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                  <div className="p-2 space-y-1">
                    {parent.children.map(child => (
                      <div key={child.id} className="flex items-center justify-between px-4 py-2 hover:bg-white rounded-xl transition-colors group">
                        <span className="text-sm font-medium text-slate-600">{child.name}</span>
                        <button 
                          onClick={() => toggleCategory(child.id, child.is_active)}
                          className={`opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-black uppercase tracking-widest ${child.is_active ? 'text-rose-500' : 'text-emerald-500'}`}
                        >
                          {child.is_active ? 'Deshabilitar' : 'Habilitar'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === 'payments' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paymentMethods.map(pm => (
                <div key={pm.id} className="p-5 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between group">
                  <div>
                    <p className="font-bold text-slate-800">{pm.name}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{pm.type}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingPM(pm); setIsPMModalOpen(true); }} className="text-slate-400 hover:text-indigo-600 transition-colors"><i className="fa-solid fa-pen-to-square"></i></button>
                    <button onClick={() => deletePM(pm.id)} className="text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><i className="fa-solid fa-trash-can"></i></button>
                    <button onClick={() => togglePM(pm.id, pm.is_active)} className="text-xl">
                      <i className={`fa-solid ${pm.is_active ? 'fa-toggle-on text-emerald-500' : 'fa-toggle-off text-slate-300'}`}></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === 'family' ? (
            <div className="space-y-4">
              {familyMembers.map(member => (
                <div key={member.id} className="p-5 bg-white border border-slate-100 rounded-2xl flex items-center justify-between group shadow-sm">
                   <div className="flex items-center gap-4">
                      <div>
                         <p className="font-bold text-slate-800">{member.full_name || 'Miembro'}</p>
                         <p className="text-[10px] text-slate-400">{member.email}</p>
                      </div>
                   </div>
                   <button onClick={() => removeMember(member.id)} className="px-3 py-1 bg-rose-50 text-rose-500 rounded-lg text-[10px] font-black uppercase transition-all opacity-0 group-hover:opacity-100">Eliminar</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto py-10 space-y-8 text-center">
              <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <i className="fa-brands fa-telegram text-4xl"></i>
              </div>
              
              <div>
                <h3 className="text-2xl font-black text-slate-800 mb-2">Asistente de Telegram</h3>
                <p className="text-slate-500 leading-relaxed">
                  Registra gastos instantáneamente por chat usando inteligencia artificial. 
                  El bot reconocerá el monto y la descripción, y te pedirá confirmar la categoría.
                </p>
              </div>

              {profile.telegram_chat_id ? (
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2rem]">
                  <div className="flex items-center justify-center gap-3 text-emerald-600 font-black uppercase tracking-widest text-xs mb-2">
                    <i className="fa-solid fa-circle-check"></i>
                    <span>Cuenta Vinculada</span>
                  </div>
                  <p className="text-emerald-800 text-sm">
                    Tu cuenta está conectada a Telegram. Puedes enviar mensajes como "Gasolina 50000" al bot para registrar gastos.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-slate-50 border border-slate-100 p-8 rounded-[2.5rem]">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Pasos para vincular</p>
                    <ol className="text-left space-y-4">
                      <li className="flex gap-4 items-start">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">1</span>
                        <p className="text-sm text-slate-600">Busca a tu bot de FinancePro en Telegram.</p>
                      </li>
                      <li className="flex gap-4 items-start">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">2</span>
                        <p className="text-sm text-slate-600">Presiona 'Iniciar' o envía el siguiente código de vinculación:</p>
                      </li>
                    </ol>
                    
                    <div className="mt-6 p-4 bg-white border border-dashed border-indigo-200 rounded-2xl">
                      <code className="text-lg font-black text-indigo-600 select-all tracking-wider">
                        /start {profile.id}
                      </code>
                    </div>
                  </div>
                  
                  <p className="text-[10px] text-slate-400 italic">
                    *Nota: Asegúrate de que el administrador de la plataforma haya configurado el TELEGRAM_BOT_TOKEN en las variables de entorno.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Método de Pago */}
      {isPMModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                  {editingPM?.id ? 'Editar Método' : 'Nuevo Método'}
                </h3>
                <button onClick={() => setIsPMModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <i className="fa-solid fa-xmark text-xl"></i>
                </button>
              </div>
              
              <form onSubmit={handlePMSave} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre del Método</label>
                  <input 
                    type="text" 
                    required
                    value={editingPM?.name || ''}
                    onChange={e => setEditingPM({ ...editingPM, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    placeholder="Ej: TC Visa, Efectivo..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Cuenta</label>
                  <select 
                    value={editingPM?.type || 'CARD'}
                    onChange={e => setEditingPM({ ...editingPM, type: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all appearance-none"
                  >
                    <option value="CARD">Tarjeta de Crédito</option>
                    <option value="CASH">Efectivo</option>
                    <option value="TRANSFER">Transferencia / Débito</option>
                    <option value="OTHER">Otro</option>
                  </select>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsPMModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Invitar Miembro */}
      {isFamilyModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Invitar Miembro</h3>
                <button onClick={() => setIsFamilyModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <i className="fa-solid fa-xmark text-xl"></i>
                </button>
              </div>
              
              <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                Ingresa el correo electrónico de la persona que deseas invitar. El usuario debe estar registrado previamente en FinancePro.
              </p>

              <form onSubmit={handleAddMember} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Correo Electrónico</label>
                  <input 
                    type="email" 
                    required
                    value={newMemberEmail}
                    onChange={e => setNewMemberEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    placeholder="usuario@ejemplo.com"
                  />
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsFamilyModalOpen(false)}
                    className="flex-1 py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {submitting ? 'Invitando...' : 'Enviar Invitación'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
