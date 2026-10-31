// 课程 AI 解析类型
// EXPORTS: AiCourse

export interface AiCourse {
  title: string;
  dayOfWeek: number; // 0=周日 1=周一 ... 6=周六
  startMin: number; // 0-1440
  endMin: number;
  location?: string;
  teacher?: string;
  weekPattern: 'all' | 'odd' | 'even' | { type: 'weeks'; weeks: number[] };
  /** AI 保留的周次原文，便于展示与纠错 */
  weeksText?: string;
  periodStart?: number;
  periodEnd?: number;
}

export interface CourseAiOptions {
  totalWeeks: number;
  periods: Array<{ slot: number; startMin: number; endMin: number }>;
}

export const COURSE_SYSTEM_PROMPT = `你是一个课程表解析助手。
用户会粘贴一段从课程表（Excel/PDF/Word/图片OCR/网页）复制来的原始文本，可能包含噪声、合并单元格、跨页、表头、说明文字。
你要从中识别出所有"上课安排"，输出严格 JSON 数组，不要任何解释、不要 markdown 代码块。

每条对象字段：
- title: 课程名（字符串，必须有）
- dayOfWeek: 数字，0=周日 1=周一 2=周二 3=周三 4=周四 5=周五 6=周六（必须能从"周一/星期二/周X/星期X/周1/1"等推断）
- startMin: 数字，上课时间当天第几分钟（如 08:00 = 480）
- endMin: 数字，下课时间当天第几分钟（如 09:40 = 580）
- location: 地点/教室（字符串，没有就空字符串）
- teacher: 老师（字符串，没有就空字符串）
- weeksText: 原文里的周次描述（如 "1-16周(单)"、"1-8,10-16周"、"单周"），没有就空字符串
- weekPattern: 周次规则：
  - "all" = 每周都上
  - "odd" = 所有单周（仅在原文只写"单周"、没有范围时使用）
  - "even" = 所有双周（仅在原文只写"双周"、没有范围时使用）
  - {"type":"weeks","weeks":[1,3,5]} = 具体周次（有范围时优先展开成数组，如 1-16周(单) → [1,3,5,...,15]）
- periodStart / periodEnd: 节次数字（如 1、2），没有就省略

规则：
1. 无法确定 dayOfWeek 或时间的行，跳过，不要瞎编
2. 同一门课一周多次出现（如周一1-2节、周三3-4节），每行单独一条
3. **必须保留周次信息**：原文写了 1-16周、单周、双周、1-8,10-16周，就必须写进 weekPattern/weeksText，不能全部输出 all
4. 同一门课在同一时间有多个周次段（如 1-8周 和 10-16周），输出两条，不要合并
5. 忽略表头、注释、考试安排、体育课自选、"无课"等非上课信息
6. 时间统一转成 24 小时制分钟数；只有节次时按用户提供的作息表换算
7. 只输出 JSON 数组，例如：[{"title":"高等数学","dayOfWeek":1,"startMin":480,"endMin":580,"location":"教3-201","teacher":"王老师","weeksText":"1-16周(单)","weekPattern":{"type":"weeks","weeks":[1,3,5,7,9,11,13,15]},"periodStart":1,"periodEnd":2}]`;

export function buildCourseUserPrompt(text: string, options?: CourseAiOptions): string {
  const context = options
    ? `学期总周数：${options.totalWeeks}\n作息表（节次: 开始-结束）：\n${options.periods
        .map((p) => `${p.slot}: ${String(Math.floor(p.startMin / 60)).padStart(2, '0')}:${String(p.startMin % 60).padStart(2, '0')}-${String(Math.floor(p.endMin / 60)).padStart(2, '0')}:${String(p.endMin % 60).padStart(2, '0')}`)
        .join('\n')}\n\n`
    : '';
  return `${context}请解析下面这段课程表文本，输出 JSON 数组：\n\n"""\n${text}\n"""`;
}
