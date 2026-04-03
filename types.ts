
export type AppRole = 'ADMIN' | 'USER';
export type ExpenseStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'PAID';

export interface Profile {
  id: string;
  email: string;
  role: AppRole;
  full_name?: string;
  family_admin_id?: string | null;
}

export interface Category {
  id: string;
  name: string;
  group_name: string | null;
  parent_id: string | null;
  is_active: boolean;
  user_id: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: string | null;
  is_active: boolean;
  user_id: string;
}

export interface MonthlyCategoryBudget {
  id: string;
  month: string; // YYYY-MM-01
  category_id: string;
  planned_amount: number;
  user_id: string;
}

export interface MonthlyIncomePlan {
  id: string;
  month: string; // YYYY-MM-01
  name: string;
  expected_amount: number;
  received_amount: number;
  received_date: string | null;
  notes: string | null;
  user_id: string;
}

export interface ExpenseTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: ExpenseStatus;
  category_id: string;
  payment_method_id: string;
  user_id: string;
  profiles?: {
    email: string;
    full_name?: string;
  };
}

export interface CategoryReport {
  id: string;
  name: string;
  planned: number;
  spent: number;
  remaining: number;
}

export type TaskStatus = 'PENDING' | 'DOING' | 'DONE';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  month: string; // YYYY-MM-01
  position: number;
  user_id: string;
  family_admin_id: string;
  created_at: string;
}
