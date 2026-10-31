// 任务类型 / 优先级元数据（非组件文件）
import type { AssignmentPriority, AssignmentType } from '@/db/types';

// EXPORTS: TYPE_LABEL, PRIORITY_LABEL, TYPE_OPTIONS, PRIORITY_OPTIONS

export const TYPE_LABEL: Record<AssignmentType, string> = {
  homework: '作业',
  exam: '考试',
  report: '报告',
  reading: '阅读',
  other: '其他',
};

export const PRIORITY_LABEL: Record<AssignmentPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const TYPE_OPTIONS: Array<{ value: AssignmentType; label: string }> = [
  { value: 'homework', label: '作业' },
  { value: 'exam', label: '考试' },
  { value: 'report', label: '报告' },
  { value: 'reading', label: '阅读' },
  { value: 'other', label: '其他' },
];

export const PRIORITY_OPTIONS: Array<{ value: AssignmentPriority; label: string }> = [
  { value: 'high', label: '高优先级' },
  { value: 'medium', label: '中优先级' },
  { value: 'low', label: '低优先级' },
];
