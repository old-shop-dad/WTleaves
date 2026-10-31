// 记账分类体系：预置收支分类（id 作为 finance_records.categoryId 存储）
// EXPORTS: FinanceCategory, EXPENSE_CATEGORIES, INCOME_CATEGORIES, ALL_CATEGORIES, categoryById

export interface FinanceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export const EXPENSE_CATEGORIES: FinanceCategory[] = [
  { id: 'food', name: '餐饮', icon: '🍜', color: '#F2903D' },
  { id: 'transport', name: '交通', icon: '🚌', color: '#4A90D9' },
  { id: 'study', name: '学习', icon: '📚', color: '#8B74C8' },
  { id: 'entertainment', name: '娱乐', icon: '🎮', color: '#E0616A' },
  { id: 'shopping', name: '购物', icon: '🛍️', color: '#E5B93E' },
  { id: 'daily', name: '日用', icon: '🧻', color: '#4FB3C4' },
  { id: 'other', name: '其他', icon: '📦', color: '#6BA75A' },
];

export const INCOME_CATEGORIES: FinanceCategory[] = [
  { id: 'allowance', name: '生活费', icon: '💰', color: '#3E7E8C' },
  { id: 'parttime', name: '兼职', icon: '💼', color: '#4A90D9' },
  { id: 'bonus', name: '红包', icon: '🧧', color: '#E0616A' },
];

export const ALL_CATEGORIES: FinanceCategory[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

export function categoryById(id: string): FinanceCategory | undefined {
  return ALL_CATEGORIES.find((c) => c.id === id);
}

export function categoryName(id: string): string {
  return categoryById(id)?.name ?? '未分类';
}
