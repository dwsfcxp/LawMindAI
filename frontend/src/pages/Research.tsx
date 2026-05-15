import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { BookOpen, Loader2, Trash2, FileText, Upload, Download, ChevronDown, ChevronRight, AlertCircle, X, Copy, Check, Columns, Type, PanelLeftClose, PanelLeft } from 'lucide-react';
import axios, { CancelTokenSource } from 'axios';
import { researchApi, caseApi, documentApi, knowledgeApi, type ResearchReport as ReportType, type Case as CaseType, type KnowledgeItem } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import MarkdownRenderer from '@/lib/markdown';
import { autoSave, loadAutoSave, clearAutoSave } from '@/lib/storage';
import { announceToScreenReader } from '@/lib/accessibility';

/** Extract headings for table of contents */
function extractHeadings(text: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  const regex = /^(#{1,4})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = `heading-${headings.length}`;
    headings.push({ level, text, id });
  }
  return headings;
}

/** Count words for Chinese + English text */
function countReportWords(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const englishWords = text.replace(/[一-鿿]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return chineseChars + englishWords;
}

/** Source quality indicators */
const SOURCE_QUALITY: Record<string, { label: string; color: string; icon: string }> = {
  vector_db: { label: '本地向量库', color: 'bg-blue-100 text-blue-700', icon: 'DB' },
  ai_knowledge: { label: 'AI法律知识', color: 'bg-purple-100 text-purple-700', icon: 'AI' },
  external_api: { label: '外部数据库', color: 'bg-amber-100 text-amber-700', icon: 'EX' },
  web_search: { label: '网络搜索', color: 'bg-gray-100 text-gray-700', icon: 'WEB' },
  knowledge_base: { label: '知识库', color: 'bg-green-100 text-green-700', icon: 'KB' },
};

const EXAMPLE_QUERIES = [
  '民间借贷纠纷中利息上限如何认定？',
  '劳动合同违法解除的赔偿金计算标准是什么？',
  '交通事故中的伤残等级评定标准及赔偿范围',
  '公司股东出资不实应承担什么法律责任？',
  '房屋买卖合同纠纷中违约金调整的裁判规则',
];

export default function Research() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<string[]>(['vector_db', 'ai_knowledge']);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [cases, setCases] = useState<CaseType[]>([]);
  const [generating, setGenerating] = useState(false);
  const [currentReport, setCurrentReport] = useState<ReportType | null>(null);
  const [history, setHistory] = useState<ReportType[]>([]);
  const [loading, setLoading] = useState(true);

  // 文件上传
  const [extractingFile, setExtractingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 知识库选项
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<number[]>([]);
  const [showKnowledgePicker, setShowKnowledgePicker] = useState(false);

  // 导出
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Copy button state
  const [copied, setCopied] = useState(false);

  // Report comparison
  const [compareReportId, setCompareReportId] = useState<number | null>(null);
  const [compareReport, setCompareReport] = useState<ReportType | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  // Show TOC sidebar
  const [showToc, setShowToc] = useState(true);

  // Mobile panel toggle
  const [showSidebar, setShowSidebar] = useState(true);

  // Request cancellation ref
  const cancelTokenRef = useRef<CancelTokenSource | null>(null);

  // Memoized filtered source options (excludes already-selected for UI purposes)
  const filteredSourceOptions = useMemo(() => sourceOptions, []);

  const sourceOptions = [
    { key: 'vector_db', label: '本地向量库（案例+法条）' },
    { key: 'ai_knowledge', label: 'AI法律知识' },
    { key: 'external_api', label: '外部法律数据库（北大法宝等）' },
    { key: 'web_search', label: '网络搜索' },
    { key: 'knowledge_base', label: '我的知识库' },
  ];

  useEffect(() => {
    caseApi.list().then(setCases).catch(() => { /* load failed silently */ });
    researchApi.list().then(setHistory).catch(() => { /* load failed silently */ }).finally(() => setLoading(false));
    knowledgeApi.list({ limit: 200 }).then(setKnowledgeItems).catch(() => { /* load failed silently */ });

    // Load auto-saved query
    const savedQuery = loadAutoSave('research_query');
    if (savedQuery?.value) setQuery(savedQuery.value);
  }, []);

  // Auto-save query every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (query.trim()) autoSave('research_query', query);
    }, 10000);
    return () => clearInterval(interval);
  }, [query]);

  // Headings for TOC
  const tocHeadings = useMemo(() => {
    if (!currentReport) return [];
    return extractHeadings(currentReport.report);
  }, [currentReport]);

  // Rendered markdown (handled by MarkdownRenderer component)
  const reportContent = useMemo(() => currentReport?.report ?? '', [currentReport]);
  const compareReportContent = useMemo(() => compareReport?.report ?? '', [compareReport]);

  // Word count
  const wordCount = useMemo(() => {
    if (!currentReport) return 0;
    return countReportWords(currentReport.report);
  }, [currentReport]);

  const handleResearch = useCallback(async () => {
    if (!query.trim()) return;

    // Cancel any previous in-flight request
    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel('New research request initiated');
    }
    const source = axios.CancelToken.source();
    cancelTokenRef.current = source;

    setGenerating(true);
    setCurrentReport(null);
    try {
      let researchQuery = query;

      // 如果选中了知识库条目，拼接到查询中
      if (sources.includes('knowledge_base') && selectedKnowledgeIds.length > 0) {
        const selectedItems = knowledgeItems.filter(k => selectedKnowledgeIds.includes(k.id));
        if (selectedItems.length > 0) {
          const kbContext = selectedItems.map(k => `【${k.title}】\n${k.content}`).join('\n\n');
          researchQuery = `${query}\n\n---\n以下为用户从知识库中选取的参考资料：\n${kbContext}`;
        }
      }

      const report = await researchApi.create({ query: researchQuery, sources, case_id: caseId || undefined }, 'research', source.token);
      setCurrentReport(report);
      setHistory([report, ...history]);
      toast({ type: 'success', title: '研究完成', description: `已从${sources.length}个来源生成报告` });
      announceToScreenReader('研究报告生成完成');
      clearAutoSave('research_query');
      // On mobile, auto-switch to report view
      setShowSidebar(false);
    } catch (e: any) {
      const msg = '研究失败: ' + (e.response?.data?.detail || e.message || '未知错误');
      setError(msg);
      toast({ type: 'error', title: '研究失败', description: e.response?.data?.detail || e.message || '未知错误' });
      announceToScreenReader('研究失败: ' + (e.response?.data?.detail || e.message || '未知错误'), 'assertive');
    } finally {
      setGenerating(false);
    }
  }, [query, sources, caseId, knowledgeItems, selectedKnowledgeIds, history, toast]);

  const handleLoadReport = useCallback(async (id: number) => {
    try {
      const report = await researchApi.get(id);
      setCurrentReport(report);
      setShowSidebar(false);
    } catch {
      setError('加载报告失败');
    }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('确定删除此报告？')) return;
    try {
      await researchApi.delete(id);
      setHistory(prev => prev.filter(r => r.id !== id));
      if (currentReport?.id === id) setCurrentReport(null);
      toast({ type: 'success', title: '报告已删除' });
    } catch (e) {
      setError('删除失败，请重试');
      toast({ type: 'error', title: '删除失败' });
    }
  }, [currentReport, toast]);

  const toggleSource = useCallback((key: string) => {
    setSources(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]);
  }, []);

  const toggleKnowledge = useCallback((id: number) => {
    setSelectedKnowledgeIds(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    );
  }, []);

  const handleFileExtract = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtractingFile(true);
    try {
      const result = await documentApi.extractText(file);
      if (result.text && !result.text.startsWith('[')) {
        setQuery(prev => prev ? prev + '\n\n' + result.text : result.text);
        toast({ type: 'success', title: '文件文字提取成功' });
      } else {
        setError(result.text || '文件文字提取失败');
        toast({ type: 'error', title: '文件文字提取失败' });
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || '文件上传失败';
      setError(msg);
      toast({ type: 'error', title: '文件上传失败', description: msg });
    } finally {
      setExtractingFile(false);
      e.target.value = '';
    }
  }, [toast]);

  const handleExportReport = useCallback(async (format: 'docx' | 'markdown') => {
    if (!currentReport) return;
    setExportLoading(format);
    try {
      const blob = format === 'docx'
        ? await researchApi.exportWord(currentReport.id)
        : await researchApi.exportMarkdown(currentReport.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `研究报告_${currentReport.query.slice(0, 20)}.${format === 'docx' ? 'docx' : 'md'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ type: 'success', title: `已导出 ${format.toUpperCase()} 格式` });
    } catch {
      setError('导出失败，请重试');
      toast({ type: 'error', title: '导出失败' });
    } finally {
      setExportLoading(null);
    }
  }, [currentReport, toast]);

  const handleCopyReport = useCallback(async () => {
    if (!currentReport) return;
    try {
      await navigator.clipboard.writeText(currentReport.report);
      setCopied(true);
      toast({ type: 'success', title: '报告已复制到剪贴板' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = currentReport.report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      toast({ type: 'success', title: '报告已复制到剪贴板' });
      setTimeout(() => setCopied(false), 2000);
    }
  }, [currentReport, toast]);

  const handleCompare = useCallback(async (id: number) => {
    try {
      const report = await researchApi.get(id);
      setCompareReport(report);
      setShowCompare(true);
    } catch {
      setError('加载报告失败');
    }
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-auto lg:h-[calc(100vh-8rem)]">
      {/* Mobile header with toggle */}
      <div className="flex items-center justify-between lg:hidden">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">法律研究</h1>
        </div>
        <button onClick={() => setShowSidebar(!showSidebar)} className="rounded-lg border p-2 hover:bg-accent">
          {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* 左侧面板：输入 + 历史 */}
      {showSidebar && (
        <div className="w-full lg:w-96 flex-shrink-0 flex flex-col gap-4 max-h-[60vh] lg:max-h-none overflow-y-auto">
          <div className="hidden lg:flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">法律研究</h1>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert" aria-live="polite">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
            </div>
          )}

          <div className="space-y-3">
            {/* 研究问题 + 上传文件 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-muted-foreground">研究问题</label>
                <label className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs cursor-pointer hover:bg-accent transition-colors">
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff,.mp3,.wav,.m4a,.ogg,.flac,.aac,.wma"
                    className="hidden"
                    onChange={handleFileExtract}
                    disabled={extractingFile}
                  />
                  {extractingFile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {extractingFile ? '提取中...' : '上传文件'}
                </label>
              </div>
              <textarea
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm resize-none"
                rows={4}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleResearch(); } }}
                placeholder="输入法律研究问题，也可以上传文件提取内容。如：民间借贷纠纷中利息上限如何认定？"
                aria-label="研究问题"
              />
            </div>

            {/* 信息来源 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">信息来源</label>
              <div className="mt-1 space-y-1">
                {sourceOptions.map(opt => (
                  <label key={opt.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={sources.includes(opt.key)} onChange={() => toggleSource(opt.key)} />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* 知识库选择 */}
            {sources.includes('knowledge_base') && (
              <div className="rounded-lg border p-2">
                <button
                  onClick={() => setShowKnowledgePicker(!showKnowledgePicker)}
                  className="flex items-center gap-1 text-xs font-medium w-full"
                >
                  {showKnowledgePicker ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  选择知识库条目 ({selectedKnowledgeIds.length > 0 ? `已选${selectedKnowledgeIds.length}条` : `${knowledgeItems.length}条可用`})
                </button>
                {showKnowledgePicker && (
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                    {knowledgeItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground">知识库为空，请先在知识库页面添加条目</p>
                    ) : (
                      knowledgeItems.map(k => (
                        <label key={k.id} className="flex items-start gap-2 text-xs p-1 rounded hover:bg-accent cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedKnowledgeIds.includes(k.id)}
                            onChange={() => toggleKnowledge(k.id)}
                            className="mt-0.5"
                          />
                          <span className="truncate">{k.title}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 关联案件 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">关联案件（可选）</label>
              <select className="mt-1 w-full rounded-md border bg-transparent px-2 py-1.5 text-sm"
                value={caseId || ''} onChange={(e) => setCaseId(Number(e.target.value) || null)}>
                <option value="">无</option>
                {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>

            <button
              onClick={handleResearch}
              disabled={generating || !query.trim() || sources.length === 0}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> 生成中...</> : '开始研究'}
            </button>
          </div>

          {/* 历史记录 */}
          <div className="flex-1 overflow-y-auto border-t pt-3">
            <h3 className="text-xs font-medium text-muted-foreground mb-2">历史报告</h3>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : history.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无历史报告</p>
            ) : (
              <div className="space-y-1">
                {history.map(r => (
                  <div key={r.id} className="flex items-center gap-1 group">
                    <button
                      onClick={() => handleLoadReport(r.id)}
                      className={`flex-1 text-left text-xs px-2 py-1.5 rounded truncate hover:bg-accent ${currentReport?.id === r.id ? 'bg-accent font-medium' : ''}`}
                    >
                      {r.query.slice(0, 40)}...
                    </button>
                    {/* Compare button */}
                    {currentReport && currentReport.id !== r.id && (
                      <button
                        onClick={() => handleCompare(r.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-primary"
                        title="与此报告对比"
                      >
                        <Columns className="h-3 w-3" />
                      </button>
                    )}
                    <button onClick={() => handleDelete(r.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 右侧面板：报告内容 */}
      <div className={cn('flex-1 flex overflow-hidden rounded-lg border bg-card min-h-[400px]', showCompare ? '' : '')}>
        {/* Mobile: show toggle when sidebar is open and no report */}
        {!showSidebar && (
          <button onClick={() => setShowSidebar(true)} className="lg:hidden absolute top-2 left-2 z-10 rounded-lg border bg-card p-1.5 hover:bg-accent">
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
        {/* Report view (with optional TOC sidebar) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {generating ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">正在从多个来源采集数据并生成研究报告...</p>
              <p className="text-xs text-muted-foreground">来源: {sources.map(s => sourceOptions.find(o => o.key === s)?.label).join('、')}</p>
            </div>
          ) : currentReport ? (
            <div className="max-w-none">
              {/* Report header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <FileText className="h-4 w-4" />
                  <span>{new Date(currentReport.created_at).toLocaleString()}</span>
                  <span>|</span>
                  <span className="flex items-center gap-1">
                    <Type className="h-3 w-3" />
                    {wordCount} 词
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Source quality indicators */}
                  {currentReport.sources_used.map(source => {
                    const quality = SOURCE_QUALITY[source];
                    if (!quality) return null;
                    return (
                      <span key={source} className={cn('text-xs px-2 py-0.5 rounded font-medium', quality.color)}>
                        {quality.icon} {quality.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Action buttons row */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <button
                  onClick={handleCopyReport}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? '已复制' : '复制报告'}
                </button>
                <button
                  onClick={() => handleExportReport('docx')}
                  disabled={exportLoading === 'docx'}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportLoading === 'docx' ? '导出中...' : '导出 Word'}
                </button>
                <button
                  onClick={() => handleExportReport('markdown')}
                  disabled={exportLoading === 'markdown'}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportLoading === 'markdown' ? '导出中...' : '导出 Markdown'}
                </button>
              </div>

              {/* Rendered Markdown report */}
              <div className="prose prose-sm max-w-none">
                <MarkdownRenderer content={reportContent} />
              </div>
            </div>
          ) : (
            /* Better empty state with example queries */
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <BookOpen className="h-16 w-16 mb-4 opacity-20" />
              <h3 className="text-lg font-semibold mb-2">开始您的法律研究</h3>
              <p className="text-sm mb-4 max-w-md text-center">
                输入研究课题，选择信息来源，开始法律研究。您也可以试试以下示例：
              </p>
              <div className="space-y-2 max-w-sm w-full">
                {EXAMPLE_QUERIES.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(q)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border hover:bg-accent hover:text-foreground transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* TOC sidebar (only when report is loaded) - hidden on mobile */}
        {currentReport && !generating && tocHeadings.length > 0 && showToc && (
          <div className="hidden md:block w-56 flex-shrink-0 border-l overflow-y-auto p-4 bg-muted/20">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">目录</h4>
              <button onClick={() => setShowToc(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-1">
              {tocHeadings.map((h, i) => (
                <button
                  key={i}
                  className={cn(
                    'block w-full text-left text-xs hover:text-primary hover:underline truncate transition-colors',
                    h.level === 1 ? 'font-semibold' : h.level === 2 ? 'font-medium pl-2' : 'pl-4',
                    h.level >= 3 && 'text-muted-foreground',
                  )}
                  title={h.text}
                >
                  {h.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Show TOC button when hidden */}
        {currentReport && !generating && tocHeadings.length > 0 && !showToc && (
          <button
            onClick={() => setShowToc(true)}
            className="hidden md:block absolute right-0 top-4 rounded-l-lg border border-r-0 bg-card px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            style={{ position: 'sticky', top: '1rem' }}
          >
            目录
          </button>
        )}
      </div>

      {/* Comparison Side Panel */}
      {showCompare && compareReport && (
        <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-black/50">
          <div className="flex-1 flex flex-col md:flex-row">
            {/* Left: current report */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 border-b md:border-b-0 md:border-r bg-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">当前报告</h3>
                <span className="text-xs text-muted-foreground">{new Date(currentReport!.created_at).toLocaleString()}</span>
              </div>
              <div className="prose prose-sm max-w-none"><MarkdownRenderer content={reportContent} /></div>
            </div>
            {/* Right: compare report */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-muted/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">对比报告</h3>
                <span className="text-xs text-muted-foreground">{new Date(compareReport.created_at).toLocaleString()}</span>
              </div>
              <div className="prose prose-sm max-w-none"><MarkdownRenderer content={compareReportContent} /></div>
            </div>
          </div>
          <button
            onClick={() => { setShowCompare(false); setCompareReport(null); }}
            className="fixed top-4 right-4 rounded-lg border bg-card p-2 hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
