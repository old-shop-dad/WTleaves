@echo off
rem Code Review Gate 一键执行：typecheck + lint + build
rem 用法：双击运行，或在 CI 中调用；任一命令失败则 exit 非 0
title StudyDesk Code Review Gate
cd /d "%~dp0..\..\..\..\"

echo ============================================
echo   [1/3] TypeScript 类型检查
echo ============================================
call npm run typecheck
if errorlevel 1 goto :fail

echo.
echo ============================================
echo   [2/3] ESLint
echo ============================================
call npm run lint
if errorlevel 1 goto :fail

echo.
echo ============================================
echo   [3/3] 构建
echo ============================================
call npm run build
if errorlevel 1 goto :fail

echo.
echo ============================================
echo   [GATE] 全部通过 ✓
echo ============================================
exit /b 0

:fail
echo.
echo ============================================
echo   [GATE] 检查失败 ✗ 请修复后重跑
echo ============================================
exit /b 1
