// 课程 AI 解析客户端：调 DeepSeek/OpenAI 兼容接口
// EXPORTS: parseCoursesWithAi

import { loadAiConfig } from '@/modules/quiz/ai/storage';
import type { AiConfig } from '@/modules/quiz/ai/types';
import { parseWeekText } from '../../../lib/semester.ts';
import { COURSE_SYSTEM_PROMPT, buildCourseUserPrompt, type AiCourse, type CourseAiOptions } from './types';

/** 单块文本超过该长度时自动分块，避免 AI 截断或超时 */
const CHUNK_LIMIT = 5000;

export async function parseCoursesWithAi(
  rawText: string,
  onProgress?: (msg: string) => void,
  options?: CourseAiOptions,
): Promise<AiCourse[]> {
  const config = await loadAiConfig();
  if (!config || !config.apiKey) {
    throw new Error('未配置 AI。请先到 设置 → AI 题库识别 里填 DeepSeek API Key');
  }
  const text = rawText.trim();
  if (!text) throw new Error('文本为空，请先上传文件或粘贴课程表文字');

  const baseUrl = (config.baseUrl || 'https://api.deepseek.com/v1').replace(/\/$/, '');

  // 短文本：单次调用
  if (text.length <= CHUNK_LIMIT) {
    onProgress?.('调用 AI 解析中…');
    return callAiOnce(baseUrl, config, text, options);
  }

  // 长文本：按行边界分块，逐块解析；单块失败不影响其他块（部分失败降级）
  onProgress?.(`文本较长（${text.length} 字），分块解析…`);
  const chunks = splitText(text, CHUNK_LIMIT);
  const all: AiCourse[] = [];
  let failed = 0;
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`分块解析中…（${i + 1}/${chunks.length}）`);
    try {
      const part = await callAiOnce(baseUrl, config, chunks[i], options);
      all.push(...part);
    } catch (e) {
      failed++;
      onProgress?.(`第 ${i + 1}/${chunks.length} 块解析失败，已跳过：${(e as Error).message}`);
    }
  }
  if (all.length === 0) {
    throw new Error(failed > 0 ? `所有分块均解析失败（${failed} 块），请检查 AI 配置或网络` : 'AI 没有识别到课程');
  }
  // 跨块去重（按 名称+星期+开始时间）
  const seen = new Set<string>();
  return all.filter((c) => {
    const k = `${c.title}|${c.dayOfWeek}|${c.startMin}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 按行边界把长文本切成不超过 limit 的块 */
function splitText(text: string, limit: number): string[] {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let buf = '';
  for (const line of lines) {
    const candidate = buf ? buf + '\n' + line : line;
    if (candidate.length > limit && buf) {
      chunks.push(buf);
      buf = line;
    } else {
      buf = candidate;
    }
  }
  if (buf.trim()) chunks.push(buf);
  return chunks;
}

/** 单次 AI 调用 */
async function callAiOnce(
  baseUrl: string,
  config: AiConfig,
  text: string,
  options?: CourseAiOptions,
): Promise<AiCourse[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'deepseek-chat',
        temperature: 0.1,
        messages: [
          { role: 'system', content: COURSE_SYSTEM_PROMPT },
          { role: 'user', content: buildCourseUserPrompt(text, options) },
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
    return extractCourses(content, options?.totalWeeks ?? 20);
  } finally {
    clearTimeout(timeout);
  }
}

function extractCourses(content: string, totalWeeks: number): AiCourse[] {
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
    .map((item) => normalize(item, totalWeeks))
    .filter((c): c is AiCourse => c !== null);
}

function normalize(item: unknown, totalWeeks: number): AiCourse | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const title = String(o.title ?? '').trim();
  const day = Number(o.dayOfWeek);
  const start = Number(o.startMin);
  const end = Number(o.endMin);
  if (!title || !Number.isInteger(day) || day < 0 || day > 6) return null;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  // 校验并钳制时间到 [0, 1440]，避免 AI 返回越界时间
  const s = Math.round(start);
  const e = Math.round(end);
  if (s < 0 || e > 1440 || s >= e) return null;

  const weeksText = String(o.weeksText ?? '').trim();
  const total = Math.max(1, Math.round(totalWeeks || 20));
  let weekPattern: AiCourse['weekPattern'] = 'all';

  // 1) 原文周次优先（能正确处理 “1-16周(单)” 的范围）
  const parsedText = weeksText ? parseWeekText(weeksText, total) : null;
  if (parsedText) {
    weekPattern = parsedText.type === 'all'
      ? 'all'
      : parsedText.type === 'weeks'
        ? { type: 'weeks', weeks: parsedText.weeks }
        : parsedText.type;
  } else {
    const wp = o.weekPattern;
    if (wp === 'odd' || wp === 'even') weekPattern = wp;
    else if (wp && typeof wp === 'object' && Array.isArray((wp as { weeks?: unknown }).weeks)) {
      const weeks = (wp as { weeks: unknown[] }).weeks
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= total);
      if (weeks.length > 0) {
        weekPattern = { type: 'weeks', weeks: [...new Set(weeks)].sort((a, b) => a - b) };
      }
    }
  }

  return {
    title,
    dayOfWeek: day,
    startMin: s,
    endMin: e,
    location: String(o.location ?? '').trim() || undefined,
    teacher: String(o.teacher ?? '').trim() || undefined,
    weekPattern,
    weeksText: weeksText || undefined,
    periodStart: Number.isInteger(Number(o.periodStart)) ? Number(o.periodStart) : undefined,
    periodEnd: Number.isInteger(Number(o.periodEnd)) ? Number(o.periodEnd) : undefined,
  };
}

export type { AiConfig };
