export type EventStatus = "planning" | "active" | "completed" | "cancelled";
export type TransactionType = "income" | "expense";
export type TransactionCategory = 
  | "bilheteira" | "patrocinios" | "bar_food" | "merchandising" | "outros_receita"
  | "artistas" | "producao" | "logistica" | "marketing" | "staff" | "aluguer" | "seguros" | "outros_despesa";

export interface Event {
  id: string;
  name: string;
  date: string;
  location: string;
  status: EventStatus;
  budget: number;
  totalIncome: number;
  totalExpenses: number;
  ticketsSold: number;
  ticketsTotal: number;
}

export interface Transaction {
  id: string;
  eventId: string;
  eventName: string;
  type: TransactionType;
  category: TransactionCategory;
  description: string;
  amount: number;
  date: string;
  status: "paid" | "pending" | "overdue";
}

export const categoryLabels: Record<TransactionCategory, string> = {
  bilheteira: "Bilheteira",
  patrocinios: "Patrocínios",
  bar_food: "Bar & Alimentação",
  merchandising: "Merchandising",
  outros_receita: "Outros (Receita)",
  artistas: "Artistas / Cachês",
  producao: "Produção",
  logistica: "Logística",
  marketing: "Marketing",
  staff: "Staff",
  aluguer: "Aluguer de Espaço",
  seguros: "Seguros",
  outros_despesa: "Outros (Despesa)",
};

export const statusLabels: Record<EventStatus, string> = {
  planning: "Planeamento",
  active: "Em Curso",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export const events: Event[] = [
  {
    id: "1",
    name: "NOS Alive 2026",
    date: "2026-07-10",
    location: "Passeio Marítimo de Algés, Lisboa",
    status: "planning",
    budget: 2500000,
    totalIncome: 1800000,
    totalExpenses: 950000,
    ticketsSold: 35000,
    ticketsTotal: 55000,
  },
  {
    id: "2",
    name: "Festival do Crato",
    date: "2026-08-20",
    location: "Crato, Portalegre",
    status: "planning",
    budget: 800000,
    totalIncome: 320000,
    totalExpenses: 180000,
    ticketsSold: 8000,
    ticketsTotal: 20000,
  },
  {
    id: "3",
    name: "Concerto Ana Moura",
    date: "2026-03-15",
    location: "Coliseu dos Recreios, Lisboa",
    status: "active",
    budget: 150000,
    totalIncome: 120000,
    totalExpenses: 95000,
    ticketsSold: 3200,
    ticketsTotal: 3500,
  },
  {
    id: "4",
    name: "Summer Beach Fest",
    date: "2025-08-01",
    location: "Praia de Carcavelos",
    status: "completed",
    budget: 600000,
    totalIncome: 750000,
    totalExpenses: 520000,
    ticketsSold: 15000,
    ticketsTotal: 15000,
  },
  {
    id: "5",
    name: "Noite de Fado",
    date: "2025-12-20",
    location: "Casa da Música, Porto",
    status: "completed",
    budget: 80000,
    totalIncome: 95000,
    totalExpenses: 62000,
    ticketsSold: 1200,
    ticketsTotal: 1200,
  },
];

export const transactions: Transaction[] = [
  { id: "t1", eventId: "1", eventName: "NOS Alive 2026", type: "income", category: "bilheteira", description: "Venda de passes gerais - Lote 1", amount: 850000, date: "2026-01-15", status: "paid" },
  { id: "t2", eventId: "1", eventName: "NOS Alive 2026", type: "income", category: "patrocinios", description: "Patrocínio NOS", amount: 500000, date: "2026-02-01", status: "paid" },
  { id: "t3", eventId: "1", eventName: "NOS Alive 2026", type: "income", category: "bilheteira", description: "Venda de passes VIP", amount: 350000, date: "2026-02-20", status: "pending" },
  { id: "t4", eventId: "1", eventName: "NOS Alive 2026", type: "expense", category: "artistas", description: "Cachê headliner - Arctic Monkeys", amount: 400000, date: "2026-03-01", status: "paid" },
  { id: "t5", eventId: "1", eventName: "NOS Alive 2026", type: "expense", category: "producao", description: "Montagem de palcos", amount: 250000, date: "2026-04-15", status: "pending" },
  { id: "t6", eventId: "1", eventName: "NOS Alive 2026", type: "expense", category: "marketing", description: "Campanha digital e outdoors", amount: 150000, date: "2026-02-10", status: "paid" },
  { id: "t7", eventId: "1", eventName: "NOS Alive 2026", type: "expense", category: "logistica", description: "Transporte e alojamento artistas", amount: 80000, date: "2026-06-01", status: "pending" },
  { id: "t8", eventId: "3", eventName: "Concerto Ana Moura", type: "income", category: "bilheteira", description: "Bilhetes - lotação quase esgotada", amount: 96000, date: "2026-02-01", status: "paid" },
  { id: "t9", eventId: "3", eventName: "Concerto Ana Moura", type: "income", category: "patrocinios", description: "Patrocínio local", amount: 24000, date: "2026-01-20", status: "paid" },
  { id: "t10", eventId: "3", eventName: "Concerto Ana Moura", type: "expense", category: "artistas", description: "Cachê Ana Moura", amount: 45000, date: "2026-03-10", status: "paid" },
  { id: "t11", eventId: "3", eventName: "Concerto Ana Moura", type: "expense", category: "aluguer", description: "Aluguer Coliseu", amount: 25000, date: "2026-03-01", status: "paid" },
  { id: "t12", eventId: "4", eventName: "Summer Beach Fest", type: "income", category: "bilheteira", description: "Bilhetes vendidos", amount: 520000, date: "2025-06-01", status: "paid" },
  { id: "t13", eventId: "4", eventName: "Summer Beach Fest", type: "income", category: "bar_food", description: "Receita bar e alimentação", amount: 180000, date: "2025-08-05", status: "paid" },
  { id: "t14", eventId: "4", eventName: "Summer Beach Fest", type: "expense", category: "producao", description: "Produção completa", amount: 320000, date: "2025-07-01", status: "paid" },
  { id: "t15", eventId: "4", eventName: "Summer Beach Fest", type: "expense", category: "staff", description: "Equipa de 200 pessoas", amount: 120000, date: "2025-08-10", status: "paid" },
  { id: "t16", eventId: "2", eventName: "Festival do Crato", type: "income", category: "patrocinios", description: "Patrocínio câmara municipal", amount: 120000, date: "2026-03-01", status: "pending" },
  { id: "t17", eventId: "2", eventName: "Festival do Crato", type: "income", category: "bilheteira", description: "Pré-venda bilhetes", amount: 200000, date: "2026-04-01", status: "pending" },
  { id: "t18", eventId: "2", eventName: "Festival do Crato", type: "expense", category: "artistas", description: "Line-up artistas", amount: 120000, date: "2026-05-01", status: "pending" },
  { id: "t19", eventId: "5", eventName: "Noite de Fado", type: "income", category: "bilheteira", description: "Bilhetes esgotados", amount: 72000, date: "2025-11-15", status: "paid" },
  { id: "t20", eventId: "5", eventName: "Noite de Fado", type: "expense", category: "artistas", description: "Fadistas e músicos", amount: 35000, date: "2025-12-15", status: "paid" },
];

export const monthlyData = [
  { month: "Jan", receitas: 850000, despesas: 150000 },
  { month: "Fev", receitas: 524000, despesas: 400000 },
  { month: "Mar", receitas: 296000, despesas: 225000 },
  { month: "Abr", receitas: 200000, despesas: 120000 },
  { month: "Mai", receitas: 0, despesas: 0 },
  { month: "Jun", receitas: 0, despesas: 80000 },
];

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
