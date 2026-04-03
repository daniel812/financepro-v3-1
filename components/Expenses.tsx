
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { dbService } from '../lib/db';
import { ExpenseTransaction, ExpenseStatus, Category, PaymentMethod, AppRole } from '../types';
import { DayPicker, DateRange } from 'react-day-picker';
import { format, isWithinInterval, parseISO, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

interface ExpensesProps {
  month: string;
  role: AppRole;
  userId: string;
  familyAdminId: string;
}

type SortKey = 'date' | 'description' | 'amount' | 'category' | 'member' | 'status';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

const Expenses: React.FC<ExpensesProps> = ({ month, role, userId, familyAdminId }) => {
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados de Selección
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Estados de Filtro
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  
  // Estado de Orden
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'date', direction: 'desc' });
  
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
      const [exps, cats, pms] = await Promise.all([
        dbService.getExpenses(month, familyAdminId),
        dbService.getCategories(familyAdminId),
        dbService.getPaymentMethods(familyAdminId)
      ]);
      setExpenses(exps);
      setCategories(cats);
      setPaymentMethods(pms);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    loadData(); 
    setDateRange(undefined);
    setIsCalendarOpen(false);
  }, [month, familyAdminId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newExpense.description || !newExpense.amount || !newExpense.category_id || !newExpense.payment_method_id || !newExpense.date) {
      alert("Por favor, completa todos los campos requeridos.");
      return;
    }
    
    setSubmitting(true);
    try {
      if (editingId) {
        const payload = {
          date: newExpense.date,
          description: newExpense.description,
          amount: Number(newExpense.amount),
          category_id: newExpense.category_id,
          payment_method_id: newExpense.payment_method_id,
        };
        await dbService.updateExpense(editingId, payload as any);
      } else {
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
      }
      
      closeModal();
      await loadData();
    } catch (err: any) {
      console.error("Error guardando gasto:", err);
      alert(`Error al guardar el gasto: ${err.message || "Error desconocido"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (expense: ExpenseTransaction) => {
    if (isSelectionMode) return; 
    setEditingId(expense.id);
    setNewExpense({
      date: expense.date,
      description: expense.description,
      amount: expense.amount,
      category_id: expense.category_id,
      payment_method_id: expense.payment_method_id,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setNewExpense(initialFormState);
  };

  const markAsPaid = async (id: string) => {
    try {
      await dbService.updateExpenseStatus(id, 'PAID');
      loadData();
    } catch (err: any) {
      alert("Error al actualizar pago: " + err.message);
    }
  };

  const markSelectedAsPaid = async () => {
    if (selectedIds.size === 0) return;
    setSubmitting(true);
    try {
      await dbService.bulkUpdateExpenseStatus(Array.from(selectedIds), 'PAID');
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      await loadData();
    } catch (err: any) {
      alert("Error en actualización masiva: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta transacción?')) return;
    try {
      await dbService.deleteExpense(id);
      loadData();
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    }
  };

  const toggleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setSelectedIds(new Set());
    }
    setIsSelectionMode(!isSelectionMode);
  };

  const currency = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  const filteredExpenses = useMemo(() => {
    const term = searchTerm.toLowerCase();
    
    let result = expenses.filter(exp => {
      const cat = categories.find(c => c.id === exp.category_id);
      const pm = paymentMethods.find(p => p.id === exp.payment_method_id);
      
      const matchesSearch = exp.description.toLowerCase().includes(term) ||
             cat?.name.toLowerCase().includes(term) ||
             pm?.name.toLowerCase().includes(term) ||
             exp.amount.toString().includes(term) ||
             exp.profiles?.email?.toLowerCase().includes(term) ||
             exp.profiles?.full_name?.toLowerCase().includes(term);
             
      const matchesStatus = statusFilter === 'ALL' || exp.status === statusFilter;
      const matchesMethod = methodFilter === 'ALL' || exp.payment_method_id === methodFilter;
      const matchesCategory = categoryFilter === 'ALL' || exp.category_id === categoryFilter;
              
      let matchesDate = true;
      if (dateRange?.from) {
        // Extraer año, mes y día de la cadena "YYYY-MM-DD" para evitar problemas de zona horaria
        const [y, m, d] = exp.date.split('-').map(Number);
        const expenseDate = new Date(y, m - 1, d).getTime();
        
        const fromDate = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate()).getTime();
        
        if (dateRange.to) {
          const toDate = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate()).getTime();
          matchesDate = expenseDate >= fromDate && expenseDate <= toDate;
        } else {
          matchesDate = expenseDate === fromDate;
        }
      }

      return matchesSearch && matchesStatus && matchesMethod && matchesCategory && matchesDate;
    });

    result.sort((a, b) => {
      let valA: any, valB: any;

      switch (sortConfig.key) {
        case 'description':
          valA = a.description.toLowerCase();
          valB = b.description.toLowerCase();
          break;
        case 'amount':
          valA = a.amount;
          valB = b.amount;
          break;
        case 'date':
          valA = a.date;
          valB = b.date;
          break;
        case 'category':
          valA = (categories.find(c => c.id === a.category_id)?.name || '').toLowerCase();
          valB = (categories.find(c => c.id === b.category_id)?.name || '').toLowerCase();
          break;
        case 'member':
          valA = (a.profiles?.full_name || a.profiles?.email || '').toLowerCase();
          valB = (b.profiles?.full_name || b.profiles?.email || '').toLowerCase();
          break;
        case 'status':
          valA = a.status;
          valB = b.status;
          break;
        default:
          valA = a.date;
          valB = b.date;
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [expenses, searchTerm, categories, paymentMethods, statusFilter, methodFilter, categoryFilter, dateRange, sortConfig]);

  const allFilteredSelected = useMemo(() => {
    if (filteredExpenses.length === 0) return false;
    return filteredExpenses.every(e => selectedIds.has(e.id));
  }, [filteredExpenses, selectedIds]);

  const handleSelectAllToggle = () => {
    if (allFilteredSelected) {
      const newSelected = new Set(selectedIds);
      filteredExpenses.forEach(e => newSelected.delete(e.id));
      setSelectedIds(newSelected);
    } else {
      const newSelected = new Set(selectedIds);
      filteredExpenses.forEach(e => newSelected.add(e.id));
      setSelectedIds(newSelected);
    }
  };

  const selectedTotal = useMemo(() => {
    return Array.from(selectedIds).reduce((sum, id) => {
      const exp = expenses.find(e => e.id === id);
      return sum + (exp?.amount || 0);
    }, 0);
  }, [selectedIds, expenses]);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setMethodFilter('ALL');
    setCategoryFilter('ALL');
    setDateRange(undefined);
    setSortConfig({ key: 'date', direction: 'desc' });
  };

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'ALL' || methodFilter !== 'ALL' || categoryFilter !== 'ALL' || dateRange !== undefined || sortConfig.key !== 'date';

  const getStatusDisplay = (status: ExpenseStatus) => {
    switch(status) {
      case 'PENDING_APPROVAL': return { label: 'Pendiente Aprobación', style: 'bg-amber-50 text-amber-600 border border-amber-100' };
      case 'APPROVED': return { label: 'Por Pagar', style: 'bg-orange-50 text-orange-600 border border-orange-200' };
      case 'PAID': return { label: 'Pagado', style: 'bg-emerald-50 text-emerald-600 border border-emerald-100' };
      case 'REJECTED': return { label: 'Rechazado', style: 'bg-rose-50 text-rose-600 border border-rose-100' };
      default: return { label: status, style: 'bg-slate-50 text-slate-500' };
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortConfig.key !== column) return <i className="fa-solid fa-sort ml-1 opacity-20 group-hover:opacity-100 transition-opacity"></i>;
    return <i className={`fa-solid ${sortConfig.direction === 'asc' ? 'fa-sort-up' : 'fa-sort-down'} ml-1 text-indigo-500`}></i>;
  };

  return (
    <div className="space-y-6 relative pb-32">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
          <div className="relative flex-1 group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
              <i className="fa-solid fa-magnifying-glass"></i>
            </div>
            <input 
              type="text"
              placeholder="Buscar descripción, miembro o monto..."
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 rounded-2xl transition-all outline-none text-sm shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={toggleSelectionMode}
              className={`px-6 py-3 rounded-2xl text-sm font-black transition-all border flex items-center gap-2 ${isSelectionMode ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-500'}`}
            >
              <i className={`fa-solid ${isSelectionMode ? 'fa-xmark' : 'fa-check-double'}`}></i>
              <span>{isSelectionMode ? 'Cancelar' : 'Seleccionar'}</span>
            </button>
            <button 
              onClick={() => setIsModalOpen(true)} 
              className="fixed bottom-24 right-6 md:static md:bottom-auto md:right-auto z-30 bg-indigo-600 text-white w-14 h-14 md:w-auto md:h-auto md:px-6 md:py-3 rounded-full md:rounded-2xl text-sm font-black shadow-xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all active:scale-95"
            >
              <i className="fa-solid fa-plus text-xl md:text-sm"></i>
              <span className="hidden md:inline">{role === 'ADMIN' ? 'Añadir Gasto' : 'Enviar Gasto'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pb-2">
          {isSelectionMode && (
            <div className="flex items-center gap-2 bg-indigo-50 px-3 py-2 rounded-xl border border-indigo-100 shadow-sm shrink-0 md:hidden">
              <button 
                onClick={handleSelectAllToggle}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-600"
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${allFilteredSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-indigo-200'}`}>
                  {allFilteredSelected && <i className="fa-solid fa-check text-[8px]"></i>}
                </div>
                Seleccionar Todo
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm shrink-0">
            <i className="fa-solid fa-filter text-[10px] text-slate-400"></i>
            <select 
              className="bg-transparent border-none outline-none text-[10px] font-black uppercase tracking-widest text-slate-600 cursor-pointer"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">Todas las Categorías</option>
              {categories.filter(c => c.is_active && c.parent_id).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm shrink-0">
            <i className="fa-solid fa-credit-card text-[10px] text-slate-400"></i>
            <select 
              className="bg-transparent border-none outline-none text-[10px] font-black uppercase tracking-widest text-slate-600 cursor-pointer"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              <option value="ALL">Todos los Métodos</option>
              {paymentMethods.filter(p => p.is_active).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="relative" ref={calendarRef}>
            <button 
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border shadow-sm shrink-0 transition-all ${dateRange ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-100 text-slate-600'}`}
            >
              <i className="fa-solid fa-calendar-day text-[10px]"></i>
              <span className="text-[10px] font-black uppercase tracking-widest">
                {dateRange?.from ? (
                  dateRange.to ? `${format(dateRange.from, 'dd MMM')} - ${format(dateRange.to, 'dd MMM')}` : format(dateRange.from, 'dd MMM')
                ) : 'Cualquier Día'}
              </span>
              <i className={`fa-solid fa-chevron-down text-[8px] transition-transform ${isCalendarOpen ? 'rotate-180' : ''}`}></i>
            </button>

            {isCalendarOpen && (
              <div className="absolute top-full left-0 mt-2 z-[100] bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 animate-in fade-in zoom-in-95 duration-200">
                <DayPicker
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  locale={es}
                  defaultMonth={parseISO(month)}
                  fromMonth={startOfMonth(parseISO(month))}
                  toMonth={endOfMonth(parseISO(month))}
                  modifiers={{
                    hasExpense: expenses.map(e => parseISO(e.date))
                  }}
                  modifiersClassNames={{
                    hasExpense: "font-black text-indigo-600 underline decoration-indigo-200 underline-offset-4"
                  }}
                  classNames={{
                    months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                    month: "space-y-4",
                    caption: "flex justify-center pt-1 relative items-center px-8",
                    caption_label: "text-sm font-black text-slate-900 capitalize",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 transition-opacity",
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex",
                    head_cell: "text-slate-400 rounded-md w-9 font-black uppercase text-[10px]",
                    row: "flex w-full mt-2",
                    cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-100/50 [&:has([aria-selected])]:bg-slate-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                    day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-slate-100 rounded-md transition-colors",
                    day_range_start: "day-range-start bg-indigo-600 text-white hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white rounded-l-md",
                    day_range_end: "day-range-end bg-indigo-600 text-white hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white rounded-r-md",
                    day_selected: "bg-indigo-600 text-white hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white",
                    day_today: "bg-slate-100 text-slate-900 font-black",
                    day_outside: "day-outside text-slate-400 opacity-50 aria-selected:bg-slate-100/50 aria-selected:text-slate-400 aria-selected:opacity-30",
                    day_disabled: "text-slate-400 opacity-50",
                    day_range_middle: "aria-selected:bg-indigo-50 aria-selected:text-indigo-600",
                    day_hidden: "invisible",
                  }}
                />
                <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                  <button 
                    onClick={() => { setDateRange(undefined); setIsCalendarOpen(false); }}
                    className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
                  >
                    Limpiar
                  </button>
                  <button 
                    onClick={() => setIsCalendarOpen(false)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm shrink-0">
            <i className="fa-solid fa-circle-check text-[10px] text-slate-400"></i>
            <select 
              className="bg-transparent border-none outline-none text-[10px] font-black uppercase tracking-widest text-slate-600 cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Todos los Estados</option>
              <option value="PENDING_APPROVAL">Pendiente Aprobación</option>
              <option value="APPROVED">Por Pagar</option>
              <option value="PAID">Pagado</option>
              <option value="REJECTED">Rechazado</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm shrink-0">
            <i className="fa-solid fa-arrow-up-z-a text-[10px] text-slate-400"></i>
            <select 
              className="bg-transparent border-none outline-none text-[10px] font-black uppercase tracking-widest text-slate-600 cursor-pointer"
              value={`${sortConfig.key}-${sortConfig.direction}`}
              onChange={(e) => {
                const [key, direction] = e.target.value.split('-') as [SortKey, SortDirection];
                setSortConfig({ key, direction });
              }}
            >
              <option value="date-desc">Más Recientes</option>
              <option value="date-asc">Más Antiguos</option>
              <option value="amount-desc">Monto (Mayor a Menor)</option>
              <option value="amount-asc">Monto (Menor a Mayor)</option>
              <option value="description-asc">Descripción (A-Z)</option>
              <option value="description-desc">Descripción (Z-A)</option>
              <option value="member-asc">Miembro (A-Z)</option>
              <option value="category-asc">Categoría (A-Z)</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button 
              onClick={clearFilters}
              className="text-[9px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 px-2 transition-colors shrink-0"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400"><i className="fa-solid fa-spinner fa-spin text-2xl"></i></div>
      ) : (
        <div className="space-y-4">
          {filteredExpenses.length === 0 ? (
            <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
              <i className="fa-solid fa-box-open text-4xl text-slate-200 mb-4"></i>
              <p className="text-slate-400 font-bold">No se encontraron transacciones.</p>
              <p className="text-slate-300 text-sm mt-1">Ajusta tus filtros o términos de búsqueda.</p>
            </div>
          ) : (
            <>
              {/* Mobile Card List */}
              <div className="md:hidden space-y-3">
                {filteredExpenses.map((expense) => {
                  const cat = categories.find(c => c.id === expense.category_id);
                  const pm = paymentMethods.find(p => p.id === expense.payment_method_id);
                  const statusInfo = getStatusDisplay(expense.status);
                  const isSelected = selectedIds.has(expense.id);
                  return (
                    <div 
                      key={expense.id} 
                      onClick={() => isSelectionMode && toggleSelection(expense.id)}
                      className={`bg-white p-4 rounded-2xl border transition-all duration-300 shadow-sm animate-in fade-in slide-in-from-bottom-2 ${isSelectionMode && isSelected ? 'border-indigo-600 ring-2 ring-indigo-50' : 'border-slate-100'}`}
                    >
                      <div className="flex items-center gap-4 mb-3">
                        {isSelectionMode && (
                          <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200'}`}>
                            {isSelected && <i className="fa-solid fa-check text-[10px]"></i>}
                          </div>
                        )}
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center justify-between mb-1">
                             <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tight">{cat?.name}</span>
                             <div className="flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                               <i className="fa-solid fa-calendar text-[8px] text-slate-400"></i>
                               <span className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">{expense.date.split('-')[2]}</span>
                             </div>
                          </div>
                          <p className="font-bold text-slate-800 truncate">{expense.description}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <div className="flex items-center gap-1">
                               <i className="fa-solid fa-user text-[8px] text-slate-300"></i>
                               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{expense.profiles?.full_name || expense.profiles?.email?.split('@')[0] || '---'}</span>
                             </div>
                             <span className="text-slate-300 text-[8px]">•</span>
                             <div className="flex items-center gap-1">
                               <i className="fa-solid fa-credit-card text-[8px] text-slate-300"></i>
                               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{pm?.name}</span>
                             </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-slate-900">{currency(expense.amount)}</p>
                        </div>
                      </div>
                      
                      {!isSelectionMode && (
                        <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${statusInfo.style}`}>
                            {statusInfo.label}
                          </span>
                          
                          <div className="flex items-center gap-3">
                            {role === 'ADMIN' && expense.status === 'APPROVED' && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); markAsPaid(expense.id); }}
                                className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest"
                              >
                                Pagar
                              </button>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleEditClick(expense); }} className="text-slate-300 hover:text-indigo-500">
                                <i className="fa-solid fa-pen-to-square text-sm"></i>
                            </button>
                            {expense.status !== 'PAID' && (
                              <button onClick={(e) => { e.stopPropagation(); deleteExpense(expense.id); }} className="text-slate-300 hover:text-rose-500">
                                <i className="fa-solid fa-trash-can text-sm"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-in fade-in duration-500">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {isSelectionMode && (
                        <th className="px-6 py-4 w-10">
                          <div 
                            onClick={handleSelectAllToggle}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-all ${allFilteredSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300 hover:border-indigo-400'}`}
                          >
                            {allFilteredSelected && <i className="fa-solid fa-check text-[10px]"></i>}
                          </div>
                        </th>
                      )}
                      <th onClick={() => toggleSort('status')} className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase cursor-pointer group">
                        Estado <SortIcon column="status" />
                      </th>
                      <th onClick={() => toggleSort('date')} className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase cursor-pointer group">
                        Fecha <SortIcon column="date" />
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Método</th>
                      <th onClick={() => toggleSort('member')} className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase cursor-pointer group">
                        Miembro <SortIcon column="member" />
                      </th>
                      <th onClick={() => toggleSort('description')} className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase cursor-pointer group">
                        Descripción <SortIcon column="description" />
                      </th>
                      <th onClick={() => toggleSort('category')} className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase cursor-pointer group">
                        Categoría <SortIcon column="category" />
                      </th>
                      <th onClick={() => toggleSort('amount')} className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right cursor-pointer group">
                        Monto <SortIcon column="amount" />
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredExpenses.map((expense) => {
                      const cat = categories.find(c => c.id === expense.category_id);
                      const pm = paymentMethods.find(p => p.id === expense.payment_method_id);
                      const statusInfo = getStatusDisplay(expense.status);
                      const isSelected = selectedIds.has(expense.id);
                      return (
                        <tr 
                          key={expense.id} 
                          onClick={() => isSelectionMode && toggleSelection(expense.id)}
                          className={`transition-colors group ${isSelectionMode ? 'cursor-pointer' : ''} ${isSelectionMode && isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}
                        >
                          {isSelectionMode && (
                            <td className="px-6 py-4">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                                {isSelected && <i className="fa-solid fa-check text-[10px]"></i>}
                              </div>
                            </td>
                          )}
                          <td className="px-6 py-4">
                             <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${statusInfo.style}`}>
                               {statusInfo.label}
                             </span>
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex flex-col">
                               <span className="text-sm font-bold text-slate-700">{expense.date.split('-')[2]}</span>
                               <span className="text-[10px] text-slate-400 font-medium uppercase">{expense.date.split('-')[1]}/{expense.date.split('-')[0]}</span>
                             </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-500 whitespace-nowrap">{pm?.name || '---'}</td>
                          <td className="px-6 py-4">
                             <div className="flex items-center gap-2">
                               <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">
                                 {(expense.profiles?.full_name || expense.profiles?.email || '?')[0]}
                               </div>
                               <span className="text-sm font-bold text-slate-700">{expense.profiles?.full_name || expense.profiles?.email?.split('@')[0] || '---'}</span>
                             </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-800">{expense.description}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-500">{cat?.name}</td>
                          <td className="px-6 py-4 text-sm font-bold text-right">{currency(expense.amount)}</td>
                          <td className="px-6 py-4 text-right">
                            {!isSelectionMode && (
                              <div className="flex items-center justify-end gap-2">
                                {role === 'ADMIN' && expense.status === 'APPROVED' && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); markAsPaid(expense.id); }}
                                    className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                  >
                                    Marcar Pagado
                                  </button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); handleEditClick(expense); }} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100">
                                  <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                {expense.status !== 'PAID' && (
                                  <button onClick={(e) => { e.stopPropagation(); deleteExpense(expense.id); }} className="p-2 text-slate-300 hover:text-rose-600 transition-colors">
                                    <i className="fa-solid fa-trash-can"></i>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {isSelectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl z-[100] animate-in slide-in-from-bottom-10 duration-500">
          <div className="bg-slate-900 text-white p-4 md:p-6 rounded-[2rem] shadow-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ítems Seleccionados</span>
                <span className="text-xl font-black text-indigo-400">{selectedIds.size}</span>
              </div>
              <div className="w-px h-8 bg-slate-800 hidden md:block"></div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Seleccionado</span>
                <span className="text-xl font-black text-white">{currency(selectedTotal)}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button 
                onClick={() => setSelectedIds(new Set())}
                className="flex-1 md:flex-none px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
              >
                Limpiar
              </button>
              <button 
                onClick={markSelectedAsPaid}
                disabled={submitting}
                className="flex-[2] md:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-900/40 transition-all active:scale-95 disabled:opacity-50"
              >
                {submitting ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : null}
                Marcar como Pagados
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Bottom Sheet */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-lg shadow-2xl p-6 md:p-8 animate-in slide-in-from-bottom duration-300">
            <h3 className="text-xl font-black mb-6 text-slate-800">
              {editingId ? 'Editar Transacción' : (role === 'ADMIN' ? 'Registrar Gasto' : 'Enviar Gasto')}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Fecha</label>
                  <input type="date" required className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Monto</label>
                  <input type="number" required placeholder="0" className="w-full px-4 py-3 bg-slate-50 rounded-xl font-bold outline-none" value={newExpense.amount || ''} onChange={e => setNewExpense({...newExpense, amount: Number(e.target.value)})} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Descripción</label>
                <input type="text" required placeholder="¿En qué se gastó?" className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Categoría</label>
                  <select required className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none" value={newExpense.category_id} onChange={e => setNewExpense({...newExpense, category_id: e.target.value})}>
                    <option value="">Seleccionar Categoría</option>
                    {categories.filter(c => c.is_active && c.parent_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Método</label>
                  <select required className="w-full px-4 py-3 bg-slate-50 rounded-xl outline-none" value={newExpense.payment_method_id} onChange={e => setNewExpense({...newExpense, payment_method_id: e.target.value})}>
                    <option value="">Seleccionar Método</option>
                    {paymentMethods.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <button 
                type="submit" 
                disabled={submitting}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-wider shadow-lg disabled:opacity-50 transition-all active:scale-95"
              >
                {submitting ? <i className="fa-solid fa-spinner fa-spin mr-2"></i> : null}
                {editingId ? 'Actualizar Transacción' : (role === 'ADMIN' ? 'Guardar Transacción' : 'Enviar para Aprobación')}
              </button>
              <button type="button" onClick={closeModal} className="w-full py-2 text-slate-400 font-bold uppercase text-[10px] tracking-widest">Descartar Entrada</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
