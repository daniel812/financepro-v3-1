
import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Expenses from './components/Expenses';
import Budgets from './components/Budgets';
import Income from './components/Income';
import Reports from './components/Reports';
import Settings from './components/Settings';
import Login from './components/Login';
import ChangePassword from './components/ChangePassword';
import Approvals from './components/Approvals';
import Notes from './components/Notes';
import MonthSelector from './components/MonthSelector';
import InsightPanel from './components/InsightPanel';
import { isDbConfigured, supabase, dbService } from './lib/db';
import { Profile } from './types';

const App: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    const syncProfile = async (sessionUser: any) => {
      if (!sessionUser) {
        if (mounted) {
          setUser(null);
          setProfile(null);
          setAuthLoading(false);
        }
        return;
      }

      if (mounted) setUser(sessionUser);

      try {
        const p = await dbService.getProfile(sessionUser.id);
        if (mounted) {
          setProfile(p);
          setInitialLoadError(null);
        }
      } catch (err: any) {
        console.error("Error sincronizando perfil:", err);
        if (mounted) {
          setInitialLoadError(err.message || "No se pudo cargar el perfil del usuario.");
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) syncProfile(session?.user ?? null);
    }).catch(err => {
      if (mounted) {
        setInitialLoadError("Error de comunicación con el servicio de autenticación.");
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        if (mounted) setIsPasswordRecovery(true);
      } else {
        if (mounted) setIsPasswordRecovery(false);
      }
      if (mounted) syncProfile(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      await supabase.auth.signOut();
    }
  };

  if (!isDbConfigured) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
        <div className="max-w-md bg-white p-10 rounded-3xl shadow-xl border border-rose-100 flex flex-col items-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mb-6">
            <i className="fa-solid fa-triangle-exclamation text-3xl"></i>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">Conexión a Base de Datos Requerida</h2>
          <p className="text-slate-500 mb-8 leading-relaxed">Por favor, revisa tus variables de entorno: SUPABASE_URL y SUPABASE_ANON_KEY.</p>
        </div>
      </div>
    );
  }

  if (authLoading) return (
    <div className="h-screen flex items-center justify-center bg-slate-50">
       <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Autenticando Sesión...</p>
       </div>
    </div>
  );

  if (initialLoadError && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-xl p-8 md:p-12 border border-rose-100 text-center">
          <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <i className="fa-solid fa-database text-2xl"></i>
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-4">Error de Política</h2>
          <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl mb-8">
            <p className="text-rose-700 text-xs font-bold leading-relaxed">
              {initialLoadError}
            </p>
          </div>
          <p className="text-slate-500 text-sm mb-8">
            Esto suele ocurrir cuando las políticas RLS son recursivas. Por favor, revisa el script SQL en Supabase.
          </p>
          <div className="space-y-3">
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-100"
            >
              Reintentar Sincronización
            </button>
            <button 
              onClick={handleLogout}
              className="w-full py-4 text-slate-400 font-bold uppercase tracking-widest text-xs"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isPasswordRecovery && user) {
    return <ChangePassword onDone={() => setIsPasswordRecovery(false)} />;
  }

  if (!user || !profile) {
    return <Login />;
  }

  const isAdmin = profile.role === 'ADMIN';
  const familyAdminId = profile.family_admin_id || profile.id;

  const navItems = [
    { path: '/', label: 'Panel', icon: 'fa-chart-pie', visible: true },
    { path: '/reports', label: 'Informes', icon: 'fa-file-invoice-dollar', visible: true },
    { path: '/income', label: 'Ingresos', icon: 'fa-wallet', visible: true },
    { path: '/expenses', label: 'Gastos', icon: 'fa-list-ul', visible: true },
    { path: '/budgets', label: 'Presupuestos', icon: 'fa-bullseye', visible: isAdmin },
    { path: '/notes', label: 'Notas', icon: 'fa-clipboard-list', visible: true },
    { path: '/approvals', label: 'Aprobaciones', icon: 'fa-check-circle', visible: isAdmin },
    { path: '/settings', label: 'Ajustes', icon: 'fa-cog', visible: isAdmin },
  ];

  const visibleNav = navItems.filter(i => i.visible);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <aside className={`hidden md:flex flex-col ${isSidebarOpen ? 'w-64' : 'w-20'} transition-all duration-300 bg-white border-r border-slate-200 z-20`}>
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <i className="fa-solid fa-coins text-xl"></i>
          </div>
          {isSidebarOpen && <span className="font-bold text-xl tracking-tight text-indigo-900">FinancePro</span>}
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {visibleNav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${location.pathname === item.path ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <i className={`fa-solid ${item.icon} w-6 text-center text-lg`}></i>
              {isSidebarOpen && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-2">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
            <i className="fa-solid fa-right-from-bracket w-6 text-center"></i>
            {isSidebarOpen && <span>Cerrar Sesión</span>}
          </button>
          <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="w-full flex items-center gap-3 px-3 py-3 text-slate-400 hover:text-slate-600 rounded-xl">
            <i className={`fa-solid ${isSidebarOpen ? 'fa-angles-left' : 'fa-angles-right'} w-6 text-center`}></i>
            {isSidebarOpen && <span>Colapsar</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-14 md:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 z-30 sticky top-0">
          <div className="flex items-center gap-3 md:hidden">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
              <i className="fa-solid fa-coins text-lg"></i>
            </div>
            <span className="font-bold text-lg tracking-tight text-indigo-900">FinancePro</span>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            <MonthSelector value={selectedMonth} onChange={setSelectedMonth} />
            <button 
              onClick={handleLogout}
              className="md:hidden w-8 h-8 flex items-center justify-center text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
              title="Cerrar Sesión"
            >
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
            <div className="h-8 w-[1px] bg-slate-200 hidden md:block"></div>
            <div className="hidden md:flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-xs uppercase">
                {profile.full_name?.charAt(0) || profile.email.charAt(0)}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800 leading-none">{profile.full_name || 'Miembro'}</span>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter mt-1">{profile.role === 'ADMIN' ? 'Administrador' : 'Usuario'}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          <Routes>
            <Route path="/" element={<Dashboard month={selectedMonth} role={profile.role} familyAdminId={familyAdminId} />} />
            <Route path="/expenses" element={<Expenses month={selectedMonth} role={profile.role} userId={user.id} familyAdminId={familyAdminId} />} />
            <Route path="/notes" element={<Notes month={selectedMonth} userId={user.id} familyAdminId={familyAdminId} />} />
            <Route path="/approvals" element={isAdmin ? <Approvals familyAdminId={familyAdminId} /> : <Navigate to="/" />} />
            <Route path="/budgets" element={isAdmin ? <Budgets month={selectedMonth} familyAdminId={familyAdminId} /> : <Navigate to="/" />} />
            <Route path="/income" element={<Income month={selectedMonth} familyAdminId={familyAdminId} />} />
            <Route path="/reports" element={<Reports month={selectedMonth} role={profile.role} userId={user.id} familyAdminId={familyAdminId} />} />
            <Route path="/settings" element={isAdmin ? <Settings profile={profile} /> : <Navigate to="/" />} />
          </Routes>
        </main>

        <InsightPanel month={selectedMonth} role={profile.role} familyAdminId={familyAdminId} />

        <nav className="md:hidden h-16 bg-white border-t border-slate-200 flex items-center gap-6 px-6 z-40 fixed bottom-0 left-0 right-0 overflow-x-auto no-scrollbar">
          {visibleNav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 transition-all shrink-0 min-w-[64px] ${location.pathname === item.path ? 'text-indigo-600' : 'text-slate-400'}`}
            >
              <i className={`fa-solid ${item.icon} text-lg`}></i>
              <span className="text-[10px] font-bold uppercase tracking-tighter">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default App;
