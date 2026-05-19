import React, { useState } from 'react';
import { supabase } from '../lib/db';

interface Props {
  onDone: () => void;
}

const ChangePassword: React.FC<Props> = ({ onDone }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(onDone, 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 p-8 md:p-12 border border-slate-100 animate-in fade-in zoom-in duration-500">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-lg shadow-indigo-100 mx-auto mb-6">
            <i className="fa-solid fa-lock text-3xl"></i>
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Nueva Contraseña</h1>
          <p className="text-slate-400 font-medium mt-2">Elige una contraseña segura</p>
        </div>

        {success ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <i className="fa-solid fa-check text-3xl"></i>
            </div>
            <p className="text-slate-700 font-bold">¡Contraseña actualizada!</p>
            <p className="text-slate-400 text-sm mt-1">Redirigiendo...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Nueva Contraseña
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="w-full px-5 py-4 bg-slate-50 border-0 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Confirmar Contraseña
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="w-full px-5 py-4 bg-slate-50 border-0 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-100 text-rose-600 text-sm font-medium px-4 py-3 rounded-2xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50"
            >
              {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Actualizar Contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangePassword;
