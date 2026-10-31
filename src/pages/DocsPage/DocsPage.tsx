import { useState, useRef } from 'react';
import { toast } from 'sonner';
import type { PDFDocument } from 'pdf-lib';
import PdfJsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import { Upload, FileImage, FileText, Combine, ImageDown, Eye, RefreshCw, Image as ImageIcon, File as FileIcon, Loader2, BookOpen, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { noteRepo } from '@/db/repositories/notes';

type Tab = 'convert' | 'img2pdf' | 'pdfmerge' | 'imgcompress' | 'docxpreview';

interface ConvertAction {
  fmt: string;
  mime?: string;
  kind: 'img' | 'img2pdf' | 'pdf2img' | 'docx2md';
}

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const loadImage = (f: File) => new Promise<HTMLImageElement>((res, rej) => {
  const url = URL.createObjectURL(f);
  const i = new Image();
  i.onload = () => { URL.revokeObjectURL(url); res(i); };
  i.onerror = () => { URL.revokeObjectURL(url); rej(new Error(`无法解码图片：${f.name}`)); };
  i.src = url;
});

const canvasToBlob = (canvas: HTMLCanvasElement, mime: string, q?: number) =>
  new Promise<Blob | null>((r) => canvas.toBlob(r, mime, q));

const baseName = (name: string) => name.replace(/\.\w+$/, '');

// 重量级依赖按需加载：pdf-lib / docx-preview / mammoth 只在真正转换时拉取，不进入首屏 chunk
const loadPdfLib = () => import('pdf-lib');
const loadDocxPreview = () => import('docx-preview');
const loadMammoth = () => import('mammoth');

const getActions = (f: File): ConvertAction[] => {
  const name = f.name.toLowerCase();
  if (f.type.startsWith('image/')) {
    const acts: ConvertAction[] = [];
    if (!name.endsWith('.png')) acts.push({ fmt: 'PNG', mime: 'image/png', kind: 'img' });
    if (!name.endsWith('.jpg') && !name.endsWith('.jpeg')) acts.push({ fmt: 'JPG', mime: 'image/jpeg', kind: 'img' });
    if (!name.endsWith('.webp')) acts.push({ fmt: 'WebP', mime: 'image/webp', kind: 'img' });
    acts.push({ fmt: 'PDF', kind: 'img2pdf' });
    return acts;
  }
  if (f.type === 'application/pdf' || name.endsWith('.pdf')) {
    return [
      { fmt: 'PNG', mime: 'image/png', kind: 'pdf2img' },
      { fmt: 'JPG', mime: 'image/jpeg', kind: 'pdf2img' },
    ];
  }
  // 阶段四：Word → Markdown（mammoth 本地转换，可一键存为笔记）
  if (name.endsWith('.docx')) {
    return [{ fmt: 'MD', kind: 'docx2md' }];
  }
  return [];
};

const fmtColor: Record<string, string> = {
  PNG: 'bg-emerald-500', JPG: 'bg-orange-500', WebP: 'bg-sky-500', PDF: 'bg-red-500', MD: 'bg-violet-500',
};

export default function DocsPage() {
  const [tab, setTab] = useState<Tab>('convert');
  const [files, setFiles] = useState<File[]>([]);
  const [quality, setQuality] = useState(0.7);
  const [processing, setProcessing] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  // 阶段四：Word→Markdown 转换结果（展示 + 存为笔记）
  const [mdResult, setMdResult] = useState<{ fileName: string; markdown: string; saved: boolean } | null>(null);
  const docxPreviewRef = useRef<HTMLDivElement>(null);
  // 复用 pdfjs worker（组件级单例，避免每次转换新建，也不在渲染期改模块变量）
  const pdfWorkerRef = useRef<Worker | null>(null);

  const onPick = (list: FileList | null) => {
    if (!list) return;
    setFiles(Array.from(list));
  };

  // 图片嵌入 PDF（PNG/JPEG 直嵌，其它先 canvas 解码）
  const embedImage = async (pdf: PDFDocument, f: File) => {
    if (f.type === 'image/png') return pdf.embedPng(await f.arrayBuffer());
    if (f.type === 'image/jpeg') return pdf.embedJpg(await f.arrayBuffer());
    const img = await loadImage(f);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    if (!blob) throw new Error(`图片转 JPEG 失败：${f.name}`);
    return pdf.embedJpg(await blob.arrayBuffer());
  };

  // ── 环形菜单转换（Filee 风格）──
  const doConvert = async (f: File, a: ConvertAction) => {
    if (converting) return;
    setConverting(f.name);
    const base = baseName(f.name);
    try {
      if (a.kind === 'img') {
        const img = await loadImage(f);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        if (a.fmt === 'JPG') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(img, 0, 0);
        const blob = await canvasToBlob(canvas, a.mime!, a.fmt === 'JPG' ? 0.92 : undefined);
        if (!blob) throw new Error('转换失败');
        download(blob, `${base}.${a.fmt.toLowerCase()}`);
        toast.success(`已转换 ${f.name} → ${a.fmt}`);
      } else if (a.kind === 'img2pdf') {
        const { PDFDocument: PdfLib } = await loadPdfLib();
        const pdf = await PdfLib.create();
        const img = await embedImage(pdf, f);
        const page = pdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        const bytes = await pdf.save();
        download(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${base}.pdf`);
        toast.success(`已转换 ${f.name} → PDF`);
      } else if (a.kind === 'docx2md') {
        // 阶段四：Word → Markdown（mammoth 本地转换，可一键存为笔记）
        const mammoth = await loadMammoth();
        const result = await mammoth.convertToMarkdown({ arrayBuffer: await f.arrayBuffer() });
        setMdResult({ fileName: f.name, markdown: result.value ?? '', saved: false });
        setConverting(null);
        toast.success(`已转换 ${f.name} → Markdown（可预览或存为笔记）`);
        return;
      } else if (a.kind === 'pdf2img') {
        const pdfjs = await import('pdfjs-dist');
        // 用 Vite ?worker 创建并复用 pdfjs worker（workerPort 方式绕开 workerSrc URL 解析问题）
        if (!pdfWorkerRef.current) {
          pdfWorkerRef.current = new PdfJsWorker();
        }
        pdfjs.GlobalWorkerOptions.workerPort = pdfWorkerRef.current as never;
        const data = await f.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data });
        try {
          const doc = await loadingTask.promise;
          const mime = a.mime!;
          const MAX_PAGES = 20;
          const total = Math.min(doc.numPages, MAX_PAGES);
          for (let p = 1; p <= total; p++) {
            const page = await doc.getPage(p);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d')!;
            if (a.fmt === 'JPG') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
            // pdfjs-dist v6：render 必须显式传 canvas
            await page.render({ canvas, canvasContext: ctx, viewport }).promise;
            const blob = await canvasToBlob(canvas, mime, a.fmt === 'JPG' ? 0.92 : undefined);
            if (blob) download(blob, `${base}-第${p}页.${a.fmt.toLowerCase()}`);
          }
          if (doc.numPages > MAX_PAGES) {
            toast.success(`已导出前 ${total} 页为 ${a.fmt}（共 ${doc.numPages} 页，为避免卡顿只转前 ${MAX_PAGES} 页）`);
          } else {
            toast.success(`已导出 ${doc.numPages} 页为 ${a.fmt}`);
          }
        } finally {
          // v6 由 loadingTask 统一销毁文档与 worker 连接
          await loadingTask.destroy().catch(() => {});
        }
      }
    } catch (e) {
      toast.error(`转换失败：${(e as Error).message}`);
    }
    setConverting(null);
  };

  // ── 原有功能 ──
  const img2pdf = async () => {
    if (files.length === 0) return toast.error('请先选择图片');
    setProcessing(true);
    try {
      const { PDFDocument: PdfLib } = await loadPdfLib();
      const pdf = await PdfLib.create();
      for (const f of files) {
        const img = await embedImage(pdf, f);
        const page = pdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      const bytes = await pdf.save();
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      download(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `图片合集-${baseName(files[0]?.name ?? '')}-${stamp}.pdf`);
      toast.success(`已合成 ${files.length} 张图为 PDF`);
    } catch (e) { toast.error(`失败：${(e as Error).message}`); }
    setProcessing(false);
  };

  const pdfmerge = async () => {
    if (files.length < 2) return toast.error('请选择至少 2 个 PDF');
    setProcessing(true);
    try {
      const { PDFDocument: PdfLib } = await loadPdfLib();
      const merged = await PdfLib.create();
      for (const f of files) {
        let src: PDFDocument;
        try {
          src = await PdfLib.load(await f.arrayBuffer());
        } catch {
          toast.error(`文件「${f.name}」可能加密或损坏，已跳过`);
          continue;
        }
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      }
      if (merged.getPageCount() === 0) {
        toast.error('没有可合并的有效页面');
        return;
      }
      const bytes = await merged.save();
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      download(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `合并-${baseName(files[0]?.name ?? '')}-${stamp}.pdf`);
      toast.success(`已合并 ${files.length} 个 PDF`);
    } catch (e) { toast.error(`失败：${(e as Error).message}`); }
    setProcessing(false);
  };

  const imgcompress = async () => {
    if (files.length === 0) return toast.error('请先选择图片');
    setProcessing(true);
    try {
      for (const f of files) {
        const img = await loadImage(f);
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        if (blob) {
          const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
          download(blob, `压缩-${baseName(f.name)}-${stamp}.jpg`);
        }
      }
      toast.success(`已压缩 ${files.length} 张图（质量 ${Math.round(quality * 100)}%）`);
    } catch (e) { toast.error(`失败：${(e as Error).message}`); }
    setProcessing(false);
  };

  const docxpreview = async () => {
    if (files.length === 0) return toast.error('请先选择 docx 文件');
    setProcessing(true);
    try {
      if (docxPreviewRef.current) {
        docxPreviewRef.current.innerHTML = '';
        const { renderAsync } = await loadDocxPreview();
        await renderAsync(files[0], docxPreviewRef.current, undefined, { inWrapper: true });
        toast.success('Word 已渲染（Electron 下可直接 Ctrl+P 打印为 PDF）');
      }
    } catch (e) { toast.error(`渲染失败：${(e as Error).message}`); }
    setProcessing(false);
  };

  const runTab = () => {
    if (tab === 'img2pdf') void img2pdf();
    else if (tab === 'pdfmerge') void pdfmerge();
    else if (tab === 'imgcompress') void imgcompress();
    else void docxpreview();
  };

  const tabs: { k: Tab; label: string; icon: React.ReactNode; accept: string }[] = [
    { k: 'convert', label: '文件转换', icon: <RefreshCw className="h-4 w-4" />, accept: '*' },
    { k: 'img2pdf', label: '图片转PDF', icon: <FileImage className="h-4 w-4" />, accept: 'image/*' },
    { k: 'pdfmerge', label: '合并PDF', icon: <Combine className="h-4 w-4" />, accept: '.pdf' },
    { k: 'imgcompress', label: '图片压缩', icon: <ImageDown className="h-4 w-4" />, accept: 'image/*' },
    { k: 'docxpreview', label: 'Word预览', icon: <Eye className="h-4 w-4" />, accept: '.docx' },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">文档处理中心</h1>
        <p className="mt-1 text-sm text-gray-500">文件本地转换，不上传云端。悬停文件卡片会弹出环形菜单，点击格式即可转换。</p>
      </header>

      {/* Tab 切换 */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => { setTab(t.k); setFiles([]); if (docxPreviewRef.current) docxPreviewRef.current.innerHTML = ''; }}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm',
              tab === t.k ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300',
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 上传区 */}
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center dark:border-white/10 dark:bg-white/5">
        <Upload className="h-8 w-8 text-gray-400" />
        <div className="text-sm text-gray-600 dark:text-gray-300">拖文件到这里，或点击选择</div>
        <div className="text-xs text-gray-400">
          {tab === 'convert' && '支持图片互转（PNG/JPG/WebP）、图片转PDF、PDF 导出图片，可多选批量'}
          {tab === 'img2pdf' && '支持多张图片（JPG/PNG），合成一个 PDF'}
          {tab === 'pdfmerge' && '选择多个 PDF 文件合并'}
          {tab === 'imgcompress' && '选择图片，输出 JPG'}
          {tab === 'docxpreview' && '选择 .docx 文件，在页面内渲染'}
        </div>
        <input type="file" multiple accept={tabs.find(t => t.k === tab)!.accept} className="hidden" onChange={(e) => onPick(e.target.files)} />
      </label>

      {/* ── 文件转换：环形菜单 ── */}
      {tab === 'convert' && files.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((f, i) => {
            const actions = getActions(f);
            const isImage = f.type.startsWith('image/');
            return (
              <div
                key={i}
                className={cn(
                  'group relative rounded-2xl border border-gray-200/60 bg-white/80 p-4 shadow-sm transition-all dark:border-white/10 dark:bg-white/5',
                  actions.length > 0 && 'hover:-translate-y-0.5 hover:shadow-lg hover:ring-2 hover:ring-blue-400/40',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white', isImage ? 'bg-sky-500' : 'bg-red-500')}>
                    {isImage ? <ImageIcon className="h-5 w-5" /> : <FileIcon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{f.name}</div>
                    <div className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)} KB</div>
                    {actions.length === 0 && (
                      <div className="mt-1 text-[11px] text-amber-500">暂不支持转换此格式</div>
                    )}
                  </div>
                </div>

                {/* 环形菜单（悬停弹出） */}
                {actions.length > 0 && (
                  <div className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    {/* 中心提示 */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-900/85 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
                      转换到
                    </div>
                    {actions.map((a, idx) => {
                      const angle = (idx / actions.length) * 2 * Math.PI - Math.PI / 2;
                      const r = 84;
                      const x = Math.cos(angle) * r;
                      const y = Math.sin(angle) * r;
                      return (
                        <button
                          key={a.fmt}
                          disabled={converting === f.name}
                          onClick={() => void doConvert(f, a)}
                          style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
                          className={cn(
                            'pointer-events-auto absolute left-1/2 top-1/2 flex h-14 w-14 flex-col items-center justify-center rounded-full text-white shadow-lg ring-2 ring-white/70 transition-transform hover:scale-110 active:scale-95 dark:ring-white/20',
                            fmtColor[a.fmt] ?? 'bg-gray-500',
                          )}
                        >
                          <span className="text-xs font-bold">{a.fmt}</span>
                          {a.kind === 'img2pdf' && <FileImage className="mt-0.5 h-3.5 w-3.5" />}
                          {a.kind === 'pdf2img' && <ImageIcon className="mt-0.5 h-3.5 w-3.5" />}
                          {a.kind === 'img' && <RefreshCw className="mt-0.5 h-3.5 w-3.5" />}
                          {a.kind === 'docx2md' && <FileText className="mt-0.5 h-3.5 w-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 转换中遮罩 */}
                {converting === f.name && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-gray-900/50 backdrop-blur-sm">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 已选文件（其它 Tab） */}
      {tab !== 'convert' && files.length > 0 && (
        <div className="rounded-xl bg-white p-4 dark:bg-white/5">
          <div className="mb-2 text-xs text-gray-500">已选 {files.length} 个文件：</div>
          <ul className="space-y-1 text-sm">
            {files.map((f, i) => <li key={i} className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-gray-400" /> {f.name} <span className="text-xs text-gray-400">({(f.size/1024).toFixed(0)} KB)</span></li>)}
          </ul>
          {tab === 'imgcompress' && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              质量 <input type="range" min={10} max={100} value={Math.round(quality*100)} onChange={(e) => setQuality(Number(e.target.value)/100)} />
              <span className="font-mono">{Math.round(quality*100)}%</span>
            </div>
          )}
        </div>
      )}

      {/* 执行按钮（其它 Tab） */}
      {tab !== 'convert' && (
        <button
          onClick={runTab}
          disabled={processing || files.length === 0}
          className="w-full rounded-xl bg-blue-500 py-3 text-white disabled:opacity-30"
        >
          {processing ? '处理中…' : tabs.find(t => t.k === tab)!.label}
        </button>
      )}

      {/* Word 预览区 */}
      {tab === 'docxpreview' && (
        <div ref={docxPreviewRef} className="min-h-[400px] rounded-xl bg-white p-8 shadow-sm dark:bg-white/5" />
      )}

      {/* 阶段四：Word→Markdown 结果（预览 + 存为笔记） */}
      {mdResult && tab === 'convert' && (
        <div className="rounded-2xl border border-violet-200/60 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
              {mdResult.fileName} → Markdown
            </span>
            {mdResult.saved && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                <Check className="h-3 w-3" /> 已存为笔记
              </span>
            )}
            <button
              onClick={async () => {
                try {
                  await noteRepo.create({
                    title: baseName(mdResult.fileName),
                    content: mdResult.markdown,
                    format: 'markdown',
                    tags: [],
                    quick: false,
                  });
                  setMdResult({ ...mdResult, saved: true });
                  toast.success('已保存到笔记模块');
                } catch (e) {
                  toast.error(`保存失败：${(e as Error).message}`);
                }
              }}
              disabled={mdResult.saved}
              className="ml-auto flex items-center gap-1.5 rounded-full bg-violet-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-40"
            >
              <BookOpen className="h-3.5 w-3.5" /> 存为笔记
            </button>
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-700 dark:bg-black/20 dark:text-gray-300">
            {mdResult.markdown || '（未提取到可转换的文本）'}
          </pre>
        </div>
      )}
    </div>
  );
}
