// Milkdown 编辑器核心：CommonMark + 历史 + KaTeX + Prism + 监听回写
import { useEffect, useRef } from 'react';
import { defaultValueCtx, Editor, rootCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { math } from '@milkdown/plugin-math';
import { prism } from '@milkdown/plugin-prism';
import { nord } from '@milkdown/theme-nord';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import 'katex/dist/katex.min.css';
import '@milkdown/theme-nord/style.css';

interface MilkdownEditorProps {
  initialContent: string;
  onUpdate: (markdown: string) => void;
}

function MilkdownEditorInner({ initialContent, onUpdate }: MilkdownEditorProps) {
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // E5：initialContent 变化时重建编辑器（同 id 外部更新内容能热更新）
  useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, initialContent);
      })
      .config(nord)
      .use(commonmark)
      .use(history)
      .use(math)
      .use(prism)
      .use(listener)
      .config((ctx) => {
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          onUpdateRef.current(markdown);
        });
      });
  }, [initialContent]);

  return <Milkdown />;
}

export default function MilkdownEditor(props: MilkdownEditorProps) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner {...props} />
    </MilkdownProvider>
  );
}
