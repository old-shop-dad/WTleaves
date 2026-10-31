// AI 配置存取（复用 settings 表）
// EXPORTS: saveAiConfig, loadAiConfig, clearAiConfig

import { db } from '@/db/db';
import type { AiConfig } from './types';

const KEY = 'quiz.ai.config';

export async function saveAiConfig(config: AiConfig): Promise<void> {
  await db.settings.put({ key: KEY, value: JSON.stringify(config) });
}

export async function loadAiConfig(): Promise<AiConfig | null> {
  const row = await db.settings.get(KEY);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as AiConfig;
  } catch {
    return null;
  }
}

export async function clearAiConfig(): Promise<void> {
  await db.settings.delete(KEY);
}
