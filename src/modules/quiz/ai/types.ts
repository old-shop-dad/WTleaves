// AI 配置与输出类型
// EXPORTS: AiConfig, AiQuestion, AiParseResult, AiParseOptions

export interface AiConfig {
  apiKey: string;
  baseUrl: string;   // 默认 https://api.deepseek.com/v1
  model: string;     // 默认 deepseek-chat
  temperature?: number;
  timeoutMs?: number;
}

export interface AiQuestion {
  stem: string;
  answer: string;
  explanation: string;
  options?: string[];
}

export interface AiParseResult {
  questions: AiQuestion[];
  raw: string;
}

export interface AiParseOptions {
  config: AiConfig;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export const DEEPSEEK_PRESET = {
  label: 'DeepSeek（国内直连）',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
};
