// AI 模块统一导出
export { parseWithAi } from './client';
export { aiQuestionToDTO, aiQuestionsToDTO } from './toDTO';
export { saveAiConfig, loadAiConfig, clearAiConfig } from './storage';
export { SYSTEM_PROMPT } from './prompt';
export { DEEPSEEK_PRESET } from './types';
export type { AiConfig, AiQuestion, AiParseResult, AiParseOptions } from './types';
