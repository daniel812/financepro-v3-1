
import React, { useMemo, useState, useEffect } from 'react';
import { dbService } from '../lib/db';
import { Category, PaymentMethod, ExpenseTransaction, MonthlyCategoryBudget, MonthlyIncomePlan, AppRole } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell 
} from 'recharts';

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6366f1'];

interface DashboardProps {
  month: string;
  role: AppRole;
  familyAdminId: string;
}

const Dashboard: React.FC<DashboardProps> = ({ month, role, familyAdminId }) => {
  const [data, setData] = useState<{
    expenses: ExpenseTransaction[],
    categories: Category[],
    pm: PaymentMethod[],
    budgets: MonthlyCategoryBudget[],
    income: MonthlyIncomePlan[]
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [expenses, categories, pm, budgets, income] = await Promise.all([
          dbService.getExpenses(month, familyAdminId),
          dbService.getCategories(familyAdminId),
          dbService.getPaymentMethods(familyAdminId),
          dbService.getBudgets(month, familyAdminId),
          dbService.getIncomePlans(month, familyAdminId)
        ]);
        setData({ expenses, categories, pm, budgets, income });
      } catch (err) {
        console.error("Error cargando datos del panel:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [month, familyAdminId]);

  const report = useMemo(() => {
    if (!data) return null;
    const { expenses, categories, pm, budgets, income } = data;

    const totalSpent = expenses
      .filter(e => e.status === 'PAID' || e.status === 'APPROVED')
      .reduce((acc, curr) => acc + curr.amount, 0);
      
    const totalPlanned = budgets.reduce((acc, curr) => acc + curr.planned_amount, 0);
    const totalIncomeExpected = income.reduce((acc, curr) => acc + curr.expected_amount, 0);
    const totalIncomeReceived = income.reduce((acc, curr) => acc + curr.received_amount, 0);
    
    const paidExpenses = expenses.filter(e => e.status === 'PAID').reduce((acc, curr) => acc + curr.amount, 0);
    const pendingExpenses = expenses.filter(e => e.status === 'APPROVED').reduce((acc, curr) => acc + curr.amount, 0);

    const parentCategories = categories.filter(c => !c.parent_id);
    const parentData = parentCategories.map(parent => {
      const childIds = categories.filter(c => c.parent_id === parent.id).map(c => c.id);
      const planned = budgets.filter(b => childIds.includes(b.category_id)).reduce((sum, b) => sum + b.planned_amount, 0);
      const spent = expenses
        .filter(e => childIds.includes(e.category_id) && (e.status === 'PAID' || e.status === 'APPROVED'))
        .reduce((sum, e) => sum + e.amount, 0);
      return { name: parent.name, planned, spent };
    }).filter(d => d.planned > 0 || d.spent > 0);

    const pmData = pm.map(p => {
      const total = expenses
        .filter(e => e.payment_method_id === p.id && (e.status === 'PAID' || e.status === 'APPROVED'))
        .reduce((acc, curr) => acc + curr.amount, 0);
      return { name: p.name, value: total };
    }).filter(d => d.value > 0);

    return { totalSpent, totalPlanned, totalIncomeExpected, totalIncomeReceived, paidExpenses, pendingExpenses, parentData, pmData };
  }, [data]);

  const currency = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 space-y-4">
      <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
      <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Preparando Panel...</p>
    </div>
  );

  if (!report) return <div>Error cargando datos.</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white p-5 md:p-6 rounded-3xl border border-slate-100 shadow-sm overflow-hidden relative group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ingresos Recibidos</span>
              <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                <i className="fa-solid fa-wallet text-xs"></i>
              </div>
            </div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">{currency(report.totalIncomeReceived)}</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Meta: {currency(report.totalIncomeExpected)}</p>
            <div className="mt-5 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${Math.min(100, (report.totalIncomeReceived / (report.totalIncomeExpected || 1)) * 100)}%` }}></div>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-5 md:p-6 rounded-3xl border border-slate-100 shadow-sm overflow-hidden relative group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-50 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gasto Total</span>
              <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
                <i className="fa-solid fa-receipt text-xs"></i>
              </div>
            </div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">{currency(report.totalSpent)}</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Presupuesto: {currency(report.totalPlanned)}</p>
            <div className="mt-5 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-1000 ${report.totalSpent > report.totalPlanned ? 'bg-rose-500' : 'bg-indigo-600'}`} style={{ width: `${Math.min(100, (report.totalSpent / (report.totalPlanned || 1)) * 100)}%` }}></div>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 md:p-6 rounded-3xl border border-slate-100 shadow-sm overflow-hidden relative group">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-50 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Por Pagar (Aprobado)</span>
              <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center">
                <i className="fa-solid fa-clock text-xs"></i>
              </div>
            </div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">{currency(report.pendingExpenses)}</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Listos para pago</p>
            <div className="mt-5 flex gap-2">
              <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap border border-emerald-100">Pagado: {currency(report.paidExpenses)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-5 md:p-8 rounded-3xl border border-slate-100 shadow-sm">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Planificado vs Gastado</h4>
          <div className="h-[280px] md:h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.parentData} layout="vertical" margin={{ left: 0, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} width={70} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', fontSize: '12px' }} formatter={(val: any) => currency(val)} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }} />
                <Bar dataKey="planned" name="Presupuesto" fill="#e2e8f0" radius={[0, 4, 4, 0]} barSize={12} />
                <Bar dataKey="spent" name="Gastado" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-5 md:p-8 rounded-3xl border border-slate-100 shadow-sm">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Distribución de Gastos</h4>
          <div className="h-[280px] md:h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={report.pmData} 
                  innerRadius={80} 
                  outerRadius={120} 
                  paddingAngle={5} 
                  dataKey="value"
                  stroke="none"
                >
                  {report.pmData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', fontSize: '12px' }} formatter={(val: any) => currency(val)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
