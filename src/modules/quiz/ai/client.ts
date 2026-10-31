// AI 调用：OpenAI 兼容 Chat Completions（DeepSeek/智谱/通义均可）
// EXPORTS: parseWithAi

import type { AiConfig, AiParseOptions, AiParseResult, AiQuestion } from './types';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

const CHUNK_LIMIT = 6000; // 单块最大字符数，超过按空行切

/** 简单分块：按段落切，每块不超过 CHUNK_LIMIT */
function chunkText(text: string): string[] {
  if (text.length <= CHUNK_LIMIT) return [text];
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let cur = '';
  for (const p of paragraphs) {
    if ((cur + '\n\n' + p).length > CHUNK_LIMIT && cur) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export async function parseWithAi(
  text: string,
  options: AiParseOptions,
): Promise<AiParseResult> {
  const { config } = options;
  const trimmed = text.trim();
  if (!trimmed) return { questions: [], raw: '' };

  const chunks = chunkText(trimmed);
  options.onProgress?.(`共 ${chunks.length} 段，开始调用 AI…`);

  const all: AiQuestion[] = [];
  let rawAll = '';
  let failedChunks = 0;

  for (let i = 0; i < chunks.length; i++) {
    options.onProgress?.(`第 ${i + 1}/${chunks.length} 段…`);
    try {
      const qs = await callOnce(chunks[i], config, options);
      all.push(...qs);
      rawAll += `--- chunk ${i + 1} (ok, ${qs.length} questions) ---\n`;
    } catch (e) {
      // Q12: 单块失败不影响已解析块，记录并继续
      failedChunks += 1;
      console.warn(`AI 解析第 ${i + 1} 段失败：`, e);
      rawAll += `--- chunk ${i + 1} FAILED: ${(e as Error).message} ---\n`;
    }
  }

  if (failedChunks > 0) {
    options.onProgress?.(`${failedChunks} 段解析失败已跳过，成功 ${all.length} 题`);
  }

  return { questions: all, raw: rawAll };
}

async function callOnce(
  text: string,
  config: AiConfig,
  options: AiParseOptions,
): Promise<AiQuestion[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 60000);
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const baseUrl = (config.baseUrl || 'https://api.deepseek.com/v1').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'deepseek-chat',
        temperature: config.temperature ?? 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(text) },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`AI 接口返回 ${res.status}：${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    return extractQuestions(content);
  } finally {
    clearTimeout(timeout);
  }
}

/** 从 AI 输出里提取 JSON 数组，容忍代码块与前后杂字 */
function extractQuestions(content: string): AiQuestion[] {
  let s = content.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start < 0 || end < 0) return [];

  let arr: unknown;
  try {
    arr = JSON.parse(s.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  return arr
    .map(normalizeItem)
    .filter((q): q is AiQuestion => q !== null);
}

function normalizeItem(item: unknown): AiQuestion | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const stem = String(o.stem ?? o.question ?? o.title ?? '').trim();
  const answer = String(o.answer ?? o.correct ?? '').trim();
  const explanation = String(o.explanation ?? o.analysis ?? '').trim();
  if (!stem) return null;
  const options = Array.isArray(o.options)
    ? o.options.map((x) => String(x).trim()).filter(Boolean)
    : undefined;
  return {
    stem, answer, explanation,
    ...(options && options.length > 0 ? { options } : {}),
  };
}
