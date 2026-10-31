---
name: studydesk-ui-system
description: StudyDesk 液态玻璃设计系统的可执行规范。任何 UI 组件、页面重构、样式修改、颜色调整、字号调整时必须加载。触发词：UI 重构、样式、玻璃卡片、配色、主题、字号、布局调整、组件修改。
---

# StudyDesk 液态玻璃 UI 系统

本 Skill 给出 **AI 可以直接复制的 token 与组件片段**，禁止"凭感觉生成玻璃效果"。

## 1. 核心原则

1. **Token 优先**：所有颜色、字号、圆角、间距必须走 CSS 变量（token），禁止硬编码。
2. **玻璃效果唯一入口**：玻璃卡片/面板必须用 `.glass-card` / `.glass-panel` 变体，禁止在组件内写内联 `backdrop-filter`。
3. **深浅主题**：所有 token 必须同时提供 `:root`（浅色）与 `.dark`（深色）两套值，禁止只适配一种主题。
4. **跟随设计系统**：使用 `components/ui/*`（shadcn 风格）基础组件，不重复造轮子；自研组件进 `components/glass/*`。

## 2. Token 定义（唯一事实源：`src/tailwind-theme.css`）

> 历史版本使用过 `--sd-*` 平行 token，已废弃；不要新增或引用 `--sd-*`。颜色与材质统一收敛到 shadcn 语义变量 + `--glass-*`。

### 2.1 语义色（`:root` 浅色 / `.dark` 深色）

| 用途 | CSS 变量 | Tailwind 类 |
|---|---|---|
| 页面背景 | `--background` | `bg-background` |
| 主文本 | `--foreground` | `text-foreground` |
| 卡片 | `--card` / `--card-border` | `bg-card` / `border-card-border` |
| 主色 | `--primary` / `--primary-foreground` | `bg-primary` / `text-primary-foreground` |
| 次要文本 | `--muted-foreground` | `text-muted-foreground` |
| 强调 | `--accent` / `--accent-foreground` | `bg-accent` |
| 边框 | `--border` | `border-border` |
| 状态色 | `--destructive` / `--success` / `--warning` | `text-destructive` / `text-success` / `text-warning` |

### 2.2 液态玻璃材质（`--glass-*`）

```css
:root {
  --glass-bg: rgba(255, 255, 255, 0.4);
  --glass-border: rgba(255, 255, 255, 0.7);
  --glass-blur: 40px;
  --glass-saturate: 1.5;
  --glass-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 -1px 0 rgba(255, 255, 255, 0.18),
    0 8px 28px -12px rgba(30, 60, 70, 0.28);
  --glass-shadow-hover:
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    inset 0 -1px 0 rgba(255, 255, 255, 0.22),
    0 14px 34px -14px rgba(30, 60, 70, 0.32);
}

.dark {
  --glass-bg: rgba(255, 255, 255, 0.07);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 8px 28px -12px rgba(0, 0, 0, 0.55);
  --glass-shadow-hover:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 14px 34px -14px rgba(0, 0, 0, 0.6);
}
```

### 2.3 玻璃类（`src/index.css`，唯一入口）

```css
@layer components {
  .glass-card,
  .glass-panel {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
    box-shadow: var(--glass-shadow);
  }
  .glass-card {
    border-radius: 16px;
    transition: box-shadow 0.3s ease;
  }
  .glass-card:hover {
    box-shadow: var(--glass-shadow-hover);
  }
  .glass-panel {
    border-radius: 20px;
  }
}
```

### 2.4 字号基线

字号在 `tailwind-theme.css` 的 `@theme` 中定义：正文 `--text-base: 1.0625rem`（≈17px），`--text-sm: 0.9375rem`。禁止全局缩小字号。

## 3. 禁止事项

- ❌ 禁止使用非 token 的硬编码颜色（如 `#333`、`rgb(200,200,200)` 散落组件内）
- ❌ 禁止使用 `bg-gray-100` 等脱离主题的 Tailwind 类表达玻璃/背景（仅可用 `bg-muted` 等语义类）
- ❌ 禁止在组件内写内联 `backdrop-filter` / `background: rgba(...)`（玻璃效果必须走 `.glass-card` / `.glass-panel`，页面优先用 `GlassCard`）
- ❌ 禁止缩小全局字号；正文基准 ≈17px（1.0625rem），小字号仅用于辅助信息
- ❌ 禁止新增一套平行设计 token（全部收敛到 `tailwind-theme.css` 的语义变量与 `--glass-*`）
- ❌ 禁止移除或改名现有 token（`tailwind-theme.css` / `index.css` 中已有的变量）

## 4. 组件化要求

| 场景 | 使用 |
|---|---|
| 卡片容器 | `GlassCard`（`components/glass/GlassCard.tsx`） |
| 空状态 | `EmptyState`（`components/glass/EmptyState.tsx`） |
| 按钮/输入/弹窗 | `components/ui/*`（button/input/dialog/select/...） |
| 页面布局 | Layout 组件 + 各页面 section 结构 |
| 图表 | Recharts + shadcn `ChartContainer` 封装（记账页范式） |

## 5. 验收

- [ ] 切换深浅主题后所有页面无死色/无突兀色块
- [ ] 全局字号符合基线（正文 ≥ 16px 等效）
- [ ] 无硬编码颜色、无内联 backdrop-filter
- [ ] 玻璃卡片在深浅主题下均有可辨识的高光与描边
