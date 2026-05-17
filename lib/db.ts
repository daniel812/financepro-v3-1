
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Category, PaymentMethod, ExpenseTransaction, MonthlyCategoryBudget, MonthlyIncomePlan, Profile, AppRole, Task, TaskStatus } from '../types';

const envUrl = process.env.SUPABASE_URL;
const envKey = process.env.SUPABASE_ANON_KEY;

export const isDbConfigured = !!(
  envUrl && 
  envKey && 
  envUrl !== 'undefined' && 
  envKey !== 'undefined' &&
  envUrl.length > 0 &&
  envKey.length > 0 &&
  envUrl.startsWith('http')
);

const supabaseUrl = isDbConfigured ? (envUrl as string) : 'https://placeholder-project.supabase.co';
const supabaseAnonKey = isDbConfigured ? (envKey as string) : 'placeholder-key';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const ensureClient = () => {
  if (!isDbConfigured) {
    throw new Error("Supabase no está configurado. Por favor, revisa tus variables de entorno.");
  }
  return supabase;
};

export const dbService = {
  // --- Auth & Perfil ---
  async getProfile(userId: string): Promise<Profile | null> {
    const client = ensureClient();
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data as Profile;
  },

  async createProfile(profile: Profile) {
    const client = ensureClient();
    const { error } = await client
      .from('profiles')
      .upsert(profile);
    if (error) throw error;
  },

  // --- Gestión Familiar ---
  async getFamilyMembers(adminId: string): Promise<Profile[]> {
    const client = ensureClient();
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('family_admin_id', adminId);
    if (error) throw error;
    return data || [];
  },

  async addFamilyMemberByEmail(adminId: string, email: string) {
    const client = ensureClient();
    const { data, error } = await client
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();
    
    if (error || !data) throw new Error("Usuario no encontrado. Asegúrese de que el usuario se haya registrado primero.");

    const { error: updateError } = await client
      .from('profiles')
      .update({ family_admin_id: adminId, role: 'USER' })
      .eq('id', data.id);
    
    if (updateError) throw updateError;
  },

  async removeFamilyMember(memberId: string) {
    const client = ensureClient();
    const { error } = await client
      .from('profiles')
      .update({ family_admin_id: null })
      .eq('id', memberId);
    if (error) throw error;
  },

  // --- Categorías ---
  async getCategories(familyAdminId: string) {
    const client = ensureClient();
    const { data, error } = await client
      .from('categories')
      .select('*')
      .eq('user_id', familyAdminId)
      .order('name');
    if (error) throw error;
    return (data || []) as Category[];
  },

  async toggleCategory(id: string, is_active: boolean) {
    const client = ensureClient();
    const { error } = await client
      .from('categories')
      .update({ is_active })
      .eq('id', id);
    if (error) throw error;
  },

  async addCategory(cat: Omit<Category, 'id'>) {
    const client = ensureClient();
    const { data, error } = await client
      .from('categories')
      .insert([cat])
      .select();
    if (error) throw error;
    return data[0] as Category;
  },

  // --- Métodos de Pago ---
  async getPaymentMethods(familyAdminId: string) {
    const client = ensureClient();
    const { data, error } = await client
      .from('payment_methods')
      .select('*')
      .eq('user_id', familyAdminId)
      .order('name');
    if (error) throw error;
    return (data || []) as PaymentMethod[];
  },

  async togglePaymentMethod(id: string, is_active: boolean) {
    const client = ensureClient();
    const { error } = await client
      .from('payment_methods')
      .update({ is_active })
      .eq('id', id);
    if (error) throw error;
  },

  async addPaymentMethod(pm: Omit<PaymentMethod, 'id' | 'user_id'>, userId: string) {
    const client = ensureClient();
    const { data, error } = await client
      .from('payment_methods')
      .insert([{ ...pm, user_id: userId }])
      .select();
    if (error) throw error;
    return data[0];
  },

  async updatePaymentMethod(id: string, pm: Partial<PaymentMethod>) {
    const client = ensureClient();
    const { error } = await client
      .from('payment_methods')
      .update(pm)
      .eq('id', id);
    if (error) throw error;
  },

  async deletePaymentMethod(id: string) {
    const client = ensureClient();
    const { error } = await client
      .from('payment_methods')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // --- Gastos ---
  async getExpenses(month: string, familyAdminId: string) {
    const client = ensureClient();
    // month is expected to be "YYYY-MM-DD" (usually YYYY-MM-01)
    const year = parseInt(month.substring(0, 4));
    const monthIdx = parseInt(month.substring(5, 7)) - 1; // 0-indexed for Date.UTC
    
    // Use Date.UTC to avoid timezone shifts that can exclude the end of the month
    const startOfMonth = new Date(Date.UTC(year, monthIdx, 1)).toISOString().split('T')[0];
    const endOfMonth = new Date(Date.UTC(year, monthIdx + 1, 1)).toISOString().split('T')[0];

    const { data: members } = await client
      .from('profiles')
      .select('id')
      .or(`id.eq.${familyAdminId},family_admin_id.eq.${familyAdminId}`);

    const memberIds = members?.map(m => m.id) || [familyAdminId];

    const { data, error } = await client
      .from('expenses')
      .select(`
        *,
        profiles:user_id (
          email,
          full_name
        )
      `)
      .in('user_id', memberIds)
      .gte('date', startOfMonth)
      .lt('date', endOfMonth)
      .order('date', { ascending: false });

    if (error) throw error;
    return (data || []) as ExpenseTransaction[];
  },

  async getPendingApprovals(familyAdminId: string) {
    const client = ensureClient();
    const { data: members } = await client
      .from('profiles')
      .select('id')
      .or(`id.eq.${familyAdminId},family_admin_id.eq.${familyAdminId}`);

    const memberIds = members?.map(m => m.id) || [familyAdminId];

    const { data, error } = await client
      .from('expenses')
      .select(`
        *,
        profiles:user_id (
          email,
          full_name
        )
      `)
      .in('user_id', memberIds)
      .eq('status', 'PENDING_APPROVAL')
      .order('date', { ascending: false });
    if (error) throw error;
    return (data || []) as ExpenseTransaction[];
  },

  async addExpense(expense: Omit<ExpenseTransaction, 'id' | 'user_id'>, userId: string) {
    const client = ensureClient();
    const { data, error } = await client
      .from('expenses')
      .insert([{ 
        ...expense, 
        user_id: userId
      }])
      .select();
    if (error) throw error;
    return data[0];
  },

  async updateExpense(id: string, expense: Partial<ExpenseTransaction>) {
    const client = ensureClient();
    const { error } = await client
      .from('expenses')
      .update(expense)
      .eq('id', id);
    if (error) throw error;
  },

  async updateExpenseStatus(id: string, status: string) {
    const client = ensureClient();
    const { error } = await client
      .from('expenses')
      .update({ status })
      .eq('id', id);
    if (error) throw error;
  },

  async bulkUpdateExpenseStatus(ids: string[], status: string) {
    const client = ensureClient();
    const { error } = await client
      .from('expenses')
      .update({ status })
      .in('id', ids);
    if (error) throw error;
  },

  async deleteExpense(id: string) {
    const client = ensureClient();
    const { error } = await client
      .from('expenses')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // --- Presupuestos ---
  async getBudgets(month: string, familyAdminId: string) {
    const client = ensureClient();
    const { data, error } = await client
      .from('monthly_budgets')
      .select('*')
      .eq('month', month)
      .eq('user_id', familyAdminId);
    if (error) throw error;
    return (data || []) as MonthlyCategoryBudget[];
  },

  async saveBudgets(month: string, budgets: { category_id: string, planned_amount: number }[], familyAdminId: string) {
    const client = ensureClient();
    const payload = budgets.map(b => ({
      month,
      category_id: b.category_id,
      planned_amount: b.planned_amount,
      user_id: familyAdminId
    }));
    
    const { error } = await client
      .from('monthly_budgets')
      .upsert(payload, { onConflict: 'month,category_id,user_id' });
    if (error) throw error;
  },

  // --- Ingresos ---
  async getIncomePlans(month: string, familyAdminId: string) {
    const client = ensureClient();
    const { data, error } = await client
      .from('income_plans')
      .select('*')
      .eq('month', month)
      .eq('user_id', familyAdminId);
    if (error) throw error;
    return (data || []) as MonthlyIncomePlan[];
  },

  async addIncomePlan(plan: Omit<MonthlyIncomePlan, 'id' | 'user_id'>, familyAdminId: string) {
    const client = ensureClient();
    const { error } = await client
      .from('income_plans')
      .insert([{ ...plan, user_id: familyAdminId }]);
    if (error) throw error;
  },

  async updateIncomeReceived(id: string, amount: number) {
    const client = ensureClient();
    const { error } = await client
      .from('income_plans')
      .update({ 
        received_amount: amount, 
        received_date: new Date().toISOString().split('T')[0] 
      })
      .eq('id', id);
    if (error) throw error;
  },

  async updateIncomePlan(id: string, updates: Partial<MonthlyIncomePlan>) {
    const client = ensureClient();
    const { error } = await client
      .from('income_plans')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  },

  async deleteIncomePlan(id: string) {
    const client = ensureClient();
    const { error } = await client
      .from('income_plans')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async initializeDefaults(userId: string) {
    const client = ensureClient();
    
    const hierarchy: Record<string, string[]> = {
      'Ahorro': ['Ahorro 5%'],
      'Vivienda': ['Arriendo'],
      'Servicios': ['EPM', 'Tigo Hogar', 'Celular Daniel'],
      'Comida': ['Mercado'],
      'Transporte': ['Gasolina', 'Lavado Carro', 'Pasajes', 'Transporte Isa'],
      'Salud': ['Salud General', 'Aporte Salud / Pensión', 'Ahorro Salud 3%'],
      'Personal': [
        'Seguro de Vida', 'Google Daniel', 'Google Julieth', 'OpenAI', 'Spotify', 
        'Rappi Prime', 'Netflix', 'Unicef', 'Barbería', 'Guardería', 
        'Gimnasio Julieth', 'Mesada Daniel', 'Mesada Julieth', 'Ahorro Salidas 3%', 
        'Gastos Isa', 'Fechas Especiales'
      ],
      'Deuda': ['Cristali', 'Carro', 'Seguro Todo Riesgo']
    };

    const defaultPaymentMethods = [
      { name: 'Efectivo', type: 'CASH', is_active: true, user_id: userId },
      { name: 'TC Bancolombia', type: 'CARD', is_active: true, user_id: userId },
      { name: 'TC Rappi', type: 'CARD', is_active: true, user_id: userId },
      { name: 'Débito / Nómina', type: 'TRANSFER', is_active: true, user_id: userId },
    ];

    const { data: currentCats } = await client.from('categories').select('id, name').eq('user_id', userId);
    const existingNames = new Set(currentCats?.map(c => c.name) || []);

    for (const parentName of Object.keys(hierarchy)) {
      let parentId;
      const existingParent = currentCats?.find(c => c.name === parentName);
      
      if (!existingParent) {
        const { data: parentData, error: pErr } = await client
          .from('categories')
          .insert([{ 
            name: parentName, 
            parent_id: null, 
            group_name: parentName === 'Ahorro' ? 'Metas' : (['Vivienda', 'Servicios', 'Deuda'].includes(parentName) ? 'Fijos' : 'Variables'),
            is_active: true, 
            user_id: userId 
          }])
          .select();
        
        if (pErr) throw pErr;
        parentId = parentData?.[0]?.id;
        existingNames.add(parentName);
      } else {
        parentId = existingParent.id;
      }

      if (parentId) {
        const childrenToInsert = hierarchy[parentName]
          .filter(childName => !existingNames.has(childName))
          .map(childName => {
            existingNames.add(childName);
            return {
              name: childName,
              parent_id: parentId,
              group_name: null,
              is_active: true,
              user_id: userId
            };
          });

        if (childrenToInsert.length > 0) {
          await client.from('categories').insert(childrenToInsert);
        }
      }
    }

    const { data: existingPMs } = await client
      .from('payment_methods')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (!existingPMs || existingPMs.length === 0) {
      await client.from('payment_methods').insert(defaultPaymentMethods);
    }
  },

  // --- Tareas (Notas) ---
  async getTasks(month: string, familyAdminId: string): Promise<Task[]> {
    const client = ensureClient();
    const { data, error } = await client
      .from('tasks')
      .select('*')
      .eq('month', month)
      .eq('family_admin_id', familyAdminId)
      .order('position', { ascending: true });
    
    if (error) throw error;
    return (data || []) as Task[];
  },

  async createTask(task: Omit<Task, 'id' | 'created_at'>) {
    const client = ensureClient();
    const { data, error } = await client
      .from('tasks')
      .insert([task])
      .select();
    
    if (error) throw error;
    return data[0] as Task;
  },

  async updateTask(id: string, updates: Partial<Task>) {
    const client = ensureClient();
    const { error } = await client
      .from('tasks')
      .update(updates)
      .eq('id', id);
    
    if (error) throw error;
  },

  async deleteTask(id: string) {
    const client = ensureClient();
    const { error } = await client
      .from('tasks')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
};
