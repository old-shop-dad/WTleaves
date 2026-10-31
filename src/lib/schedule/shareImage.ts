// 课表分享图：把当前周渲染为 PNG（纯 canvas，无新依赖）
import { minutesToClock, toDateKey } from '@/lib/dates';
import type { CourseOccurrence } from '@/lib/schedule/occurrences';
import { courseTimeOf, type Period } from '@/lib/schedule/periods';

export interface ShareWeekOptions {
  semesterName: string;
  weekNumber: number;
  weekDates: Date[];
  coursesByDate: Record<string, CourseOccurrence[]>;
  periods: Period[];
  todayKey: string;
}

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const W = 1400;
const H = 900;
const MARGIN = 40;
const HEADER_H = 110;
const AXIS_W = 74;
const GRID_TOP = HEADER_H + 54;
const GRID_BOTTOM = H - 46;

function rgba(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(74,144,217,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const chars = [...text];
  const lines: string[] = [];
  let current = '';
  for (const ch of chars) {
    const next = current + ch;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = ch;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  return lines;
}

export async function renderWeekImage(opts: ShareWeekOptions): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  await document.fonts.ready.catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const font = '"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif';
  ctx.fillStyle = '#F7FAFB';
  ctx.fillRect(0, 0, W, H);

  // 标题
  ctx.fillStyle = '#14212B';
  ctx.font = `700 30px ${font}`;
  ctx.fillText(`${opts.semesterName} · 第 ${opts.weekNumber} 周`, MARGIN, 58);
  const range = `${opts.weekDates[0].getMonth() + 1}月${opts.weekDates[0].getDate()}日 - ${opts.weekDates[6].getMonth() + 1}月${opts.weekDates[6].getDate()}日`;
  ctx.fillStyle = '#6B7A85';
  ctx.font = `400 15px ${font}`;
  ctx.fillText(range, MARGIN, 86);

  ctx.fillStyle = '#3E7E8C';
  ctx.font = `600 14px ${font}`;
  ctx.fillText('StudyDesk', W - MARGIN - 78, 58);

  // 时间范围
  const startCandidates = [8 * 60, ...opts.periods.map((p) => p.startMin)];
  const endCandidates = [21 * 60, ...opts.periods.map((p) => p.endMin)];
  for (const list of Object.values(opts.coursesByDate)) {
    for (const c of list) {
      const t = courseTimeOf(c, opts.periods);
      startCandidates.push(t.startMin);
      endCandidates.push(t.endMin);
    }
  }
  const rangeStart = Math.max(0, Math.floor(Math.min(...startCandidates) / 30) * 30);
  const rangeEnd = Math.min(24 * 60, Math.ceil(Math.max(...endCandidates) / 30) * 30);
  const gridW = W - MARGIN * 2 - AXIS_W;
  const colW = gridW / 7;
  const gridH = GRID_BOTTOM - GRID_TOP;
  const pxPerMin = gridH / (rangeEnd - rangeStart);

  // 星期表头
  opts.weekDates.forEach((date, i) => {
    const x = MARGIN + AXIS_W + i * colW;
    const isToday = toDateKey(date) === opts.todayKey;
    ctx.fillStyle = isToday ? '#3E7E8C' : '#41505B';
    ctx.font = `600 14px ${font}`;
    ctx.textAlign = 'center';
    ctx.fillText(DAY_LABELS[i], x + colW / 2, GRID_TOP - 28);
    ctx.fillStyle = isToday ? '#3E7E8C' : '#6B7A85';
    ctx.font = `500 13px ${font}`;
    ctx.fillText(`${date.getMonth() + 1}/${date.getDate()}`, x + colW / 2, GRID_TOP - 10);
  });
  ctx.textAlign = 'left';

  // 横向网格线 + 时间刻度
  for (let m = rangeStart; m <= rangeEnd; m += 60) {
    const y = GRID_TOP + (m - rangeStart) * pxPerMin;
    ctx.strokeStyle = m % 120 === 0 ? '#DDE7EA' : '#EAF0F2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGIN + AXIS_W, y);
    ctx.lineTo(W - MARGIN, y);
    ctx.stroke();
    ctx.fillStyle = '#8A98A2';
    ctx.font = `400 11px ${font}`;
    ctx.textAlign = 'right';
    ctx.fillText(minutesToClock(m), MARGIN + AXIS_W - 10, y + 4);
  }
  ctx.textAlign = 'left';

  // 列分隔线
  for (let i = 0; i <= 7; i++) {
    const x = MARGIN + AXIS_W + i * colW;
    ctx.strokeStyle = '#E3EBEE';
    ctx.beginPath();
    ctx.moveTo(x, GRID_TOP - 2);
    ctx.lineTo(x, GRID_BOTTOM);
    ctx.stroke();
  }

  // 课程卡片
  opts.weekDates.forEach((date, i) => {
    const key = toDateKey(date);
    const withTime = (opts.coursesByDate[key] ?? []).map((c) => ({ c, t: courseTimeOf(c, opts.periods) }));
    const list = [...withTime].sort((a, b) => a.t.startMin - b.t.startMin);
    const laneEnds: number[] = [];
    const placed = list.map(({ c, t }) => {
      let lane = laneEnds.findIndex((end) => end <= t.startMin);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(t.endMin);
      } else {
        laneEnds[lane] = t.endMin;
      }
      return { c, t, lane };
    });
    const lanes = Math.max(1, laneEnds.length);
    const x0 = MARGIN + AXIS_W + i * colW;

    for (const { c, t, lane } of placed) {
      const top = GRID_TOP + (t.startMin - rangeStart) * pxPerMin;
      const height = Math.max(44, (t.endMin - t.startMin) * pxPerMin - 3);
      const cardW = colW / lanes - 6;
      const x = x0 + lane * (colW / lanes) + 3;
      const color = c.color ?? '#4A90D9';

      ctx.save();
      roundRect(ctx, x, top, cardW, height, 8);
      ctx.fillStyle = rgba(color, 0.16);
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(x, top, 4, height);
      ctx.restore();

      ctx.fillStyle = '#1F2D36';
      ctx.font = `600 12px ${font}`;
      const lines = wrapLines(ctx, c.title, cardW - 14, height >= 76 ? 3 : 2);
      lines.forEach((line, idx) => ctx.fillText(line, x + 9, top + 18 + idx * 15));

      if (height >= 52) {
        ctx.fillStyle = '#5E6E79';
        ctx.font = `400 10px ${font}`;
        ctx.fillText(`${minutesToClock(t.startMin)}-${minutesToClock(t.endMin)}`, x + 9, top + height - 14);
      }
    }
  });

  // 底部
  ctx.fillStyle = '#8A98A2';
  ctx.font = `400 12px ${font}`;
  ctx.fillText('StudyDesk · 学生本地学习工作台 · 数据只存本机', MARGIN, H - 20);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function downloadWeekImage(opts: ShareWeekOptions): Promise<boolean> {
  const blob = await renderWeekImage(opts);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `课表-第${opts.weekNumber}周.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
