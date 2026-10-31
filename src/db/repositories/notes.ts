// 笔记仓库：笔记 + 快照 + 附件元数据
import { db } from '@/db/db';
import { BaseRepository } from './base';
import type { IAttachment, INote, INoteSnapshot } from '@/db/types';

// EXPORTS: noteRepo, snapshotRepo, attachmentRepo

export const noteRepo = new BaseRepository<INote>(db.notes);
export const snapshotRepo = new BaseRepository<INoteSnapshot>(db.note_snapshots);
export const attachmentRepo = new BaseRepository<IAttachment>(db.attachments);
