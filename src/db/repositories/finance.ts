// 财务仓库：收支记录 / 预算（V3 记账模块）
import { db } from '@/db/db';
import { BaseRepository } from './base';
import type { IBudget, IFinanceRecord } from '@/db/types';

// EXPORTS: financeRecordRepo, budgetRepo

export const financeRecordRepo = new BaseRepository<IFinanceRecord>(db.finance_records);
export const budgetRepo = new BaseRepository<IBudget>(db.budgets);
