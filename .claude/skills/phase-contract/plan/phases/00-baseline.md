# Phase 00 · 冻结基线

## 本 phase 只做
- [x] 全量备份（排除 node_modules / dist / release / backups / .git）
- [x] 逐文件 SHA-256 比对，生成 BACKUP-MANIFEST.md 与 ZIP
- [x] 记录重构前静态检查基线（typecheck / eslint / build）
- [x] git init + 基线提交 + tag `v1.0.0-baseline`

## 本 phase 不做
- ❌ 不修改任何业务代码
- ❌ 不引入新依赖
- ❌ 不改 schema

## 允许改动
- `backups/**`（备份产物）
- `.gitignore`（忽略 backups/）
- `.git/**`（版本控制，不参与打包）

## 验收标准（可执行）
- [x] 备份目录 190 文件，SHA-256 与源目录不一致数 = 0
- [x] ZIP 可读取，条目 196
- [x] `git tag` 存在 `v1.0.0-baseline`

## 基线记录
- typecheck：❌ 2 errors（DocsPage pdfjs v6 API）
- eslint：❌ 1 error / 7 warnings
- build：✅（1.07s，index chunk 1,048 kB，PWA precache 3 entries / 0 KiB）
- git：原本无仓库

## 状态
- 进度：done
- 完成时间：2026-10-19
- 验证结果：备份哈希 190/190 一致；基线提交建立
