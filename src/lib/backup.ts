// 备份与导入：导出全表 JSON / 校验并覆盖导入
// EXPORTS: exportBackup, importBackup, downloadJson

import { db } from '@/db/db';

export interface BackupFile {
  app: 'studydesk';
  version: 1;
  /** 导出时的 Dexie schema 版本（db.verno），恢复时用于跨版本兼容判断 */
  dbVersion?: number;
  exportedAt: number;
  data: Record<string, unknown[]>;
}

export async function exportBackup(): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    data[table.name] = await table.toArray();
  }
  return {
    app: 'studydesk',
    version: 1,
    dbVersion: db.verno,
    exportedAt: Date.now(),
    data,
  };
}

export function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importBackup(file: File): Promise<{ tables: number; rows: number }> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('备份文件不是有效的 JSON');
  }
  const p = parsed as BackupFile;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    p.app !== 'studydesk' ||
    // 版本协商：version 允许 1 或缺失（老备份），更高版本暂不支持
    (p.version != null && p.version > 1) ||
    typeof p.data !== 'object'
  ) {
    throw new Error('备份文件格式不正确（app/version/data 校验失败）');
  }
  // 跨版本恢复提示：备份来自更旧/更新的 schema，Dexie 将按本库 upgrade 链自动迁移字段；
  // 备份表缺新字段时运行时代码按 undefined 容忍
  const { data } = p;
  const tableNames = Object.keys(data);

  // S1: db.table(name) 对未知表名会抛异常，先探测过滤出本库真实存在的表
  const knownNames: string[] = [];
  for (const name of tableNames) {
    try {
      if (db.table(name)) knownNames.push(name);
    } catch {
      // 未知表，跳过
    }
  }

  let rows = 0;
  if (knownNames.length > 0) {
    // S2: 整库导入包进事务，中途失败全部回滚，避免数据库半残
    await db.transaction('rw', knownNames, async () => {
      for (const name of knownNames) {
        const table = db.table(name);
        await table.clear();
        const rowsArr = data[name] as unknown[];
        if (rowsArr.length > 0) {
          await table.bulkPut(rowsArr);
          rows += rowsArr.length;
        }
      }
    });
  }
  return { tables: knownNames.length, rows };
}
