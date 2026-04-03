
import React, { useState } from 'react';
import { getFinancialInsights, FinancialInsight } from '../services/geminiService';
import { dbService } from '../lib/db';
import { AppRole } from '../types';

interface InsightPanelProps {
  month: string;
  role: AppRole;
  familyAdminId: string;
}

const InsightPanel: React.FC<InsightPanelProps> = ({ month, role, familyAdminId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<FinancialInsight | null>(null);

  const fetchInsights = async () => {
    setLoading(true);
    setIsOpen(true);
    
    try {
      const [expenses, categories, budgets, income] = await Promise.all([
        dbService.getExpenses(month, familyAdminId),
        dbService.getCategories(familyAdminId),
        dbService.getBudgets(month, familyAdminId),
        dbService.getIncomePlans(month, familyAdminId)
      ]);

      const totalIncome = income.reduce((sum, i) => sum + i.received_amount, 0);
      const expectedIncome = income.reduce((sum, i) => sum + i.expected_amount, 0);
      
      const categorySummary = categories
        .filter(c => !c.parent_id)
        .map(parent => {
          const childIds = categories.filter(c => c.parent_id === parent.id).map(c => c.id);
          const planned = budgets.filter(b => childIds.includes(b.category_id)).reduce((sum, b) => sum + b.planned_amount, 0);
          const spent = expenses
            .filter(e => childIds.includes(e.category_id) && (e.status === 'PAID' || e.status === 'APPROVED'))
            .reduce((sum, e) => sum + e.amount, 0);
          return {
            category: parent.name,
            planned,
            spent,
            status: spent > planned ? "OVER_BUDGET" : "ON_TRACK"
          };
        })
        .filter(c => c.planned > 0 || c.spent > 0);

      const summaryData = {
        month,
        currency: "COP",
        income: { received: totalIncome, expected: expectedIncome },
        spending: categorySummary,
        overallSpent: categorySummary.reduce((sum, c) => sum + c.spent, 0),
        overallPlanned: categorySummary.reduce((sum, c) => sum + c.planned, 0)
      };

      const result = await getFinancialInsights(summaryData);
      setInsight(result);
    } catch (err) {
      console.error("Error calculando ideas:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={fetchInsights}
        className="fixed bottom-24 left-6 md:bottom-8 md:right-8 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40 group"
      >
        <div className="absolute -top-12 left-0 md:left-auto md:right-0 bg-indigo-900 text-white text-[10px] font-bold px-3 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Asesor IA
        </div>
        <i className="fa-solid fa-sparkles text-xl"></i>
      </button>

      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex justify-end"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                  <i className="fa-solid fa-brain"></i>
                </div>
                <h3 className="font-bold text-xl text-slate-800">Análisis Familiar</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <i className="fa-solid fa-xmark text-xl"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4">
                  <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                  <p className="text-slate-500 font-medium animate-pulse">Analizando resumen...</p>
                </div>
              ) : insight ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
                        insight.riskLevel === 'LOW' ? 'bg-emerald-100 text-emerald-700' : 
                        insight.riskLevel === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        Estado: Riesgo {insight.riskLevel === 'LOW' ? 'Bajo' : insight.riskLevel === 'MEDIUM' ? 'Medio' : 'Alto'}
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed text-lg italic">"{insight.summary}"</p>
                  </section>

                  <section className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Pasos Estratégicos</h4>
                    <div className="space-y-3">
                      {insight.recommendations.map((rec, i) => (
                        <div key={i} className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <div className="w-6 h-6 bg-white rounded-full flex-shrink-0 flex items-center justify-center text-indigo-600 text-xs font-bold shadow-sm">
                            {i + 1}
                          </div>
                          <p className="text-sm text-slate-700 leading-normal">{rec}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="text-center py-20">
                  <i className="fa-solid fa-circle-exclamation text-slate-300 text-4xl mb-4"></i>
                  <p className="text-slate-500">Sin datos analizados.</p>
                </div>
              )}
            </div>
            
            <div className="p-8 bg-slate-50 border-t border-slate-100">
              <button 
                onClick={fetchInsights}
                className="w-full bg-white border border-slate-200 text-slate-700 font-bold py-3 rounded-2xl hover:shadow-md transition-all flex items-center justify-center gap-2"
              >
                <i className="fa-solid fa-arrows-rotate"></i> Actualizar Análisis
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InsightPanel;
