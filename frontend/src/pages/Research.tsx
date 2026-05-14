import { useState, useEffect, useRef } from 'react';
import { BookOpen, Loader2, Trash2, FileText, Upload, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { researchApi, caseApi, documentApi, knowledgeApi, type ResearchReport as ReportType, type Case as CaseType, type KnowledgeItem } from '@/lib/api';

export default function Research() {
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

  const sourceOptions = [
    { key: 'vector_db', label: '本地向量库（案例+法条）' },
    { key: 'ai_knowledge', label: 'AI法律知识' },
    { key: 'external_api', label: '外部法律数据库（北大法宝等）' },
    { key: 'web_search', label: '网络搜索' },
    { key: 'knowledge_base', label: '我的知识库' },
  ];

  useEffect(() => {
    caseApi.list().then(setCases).catch(console.error);
    researchApi.list().then(setHistory).catch(console.error).finally(() => setLoading(false));
    knowledgeApi.list({ limit: 200 }).then(setKnowledgeItems).catch(console.error);
  }, []);

  const handleResearch = async () => {
    if (!query.trim()) return;
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

      const report = await researchApi.create({ query: researchQuery, sources, case_id: caseId || undefined });
      setCurrentReport(report);
      setHistory([report, ...history]);
    } catch (e: any) {
      alert('研究失败: ' + (e.message || '未知错误'));
    } finally {
      setGenerating(false);
    }
  };

  const handleLoadReport = async (id: number) => {
    try {
      const report = await researchApi.get(id);
      setCurrentReport(report);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此报告？')) return;
    try {
      await researchApi.delete(id);
      setHistory(history.filter(r => r.id !== id));
      if (currentReport?.id === id) setCurrentReport(null);
    } catch (e) { alert('删除失败，请重试'); }
  };

  const toggleSource = (key: string) => {
    setSources(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]);
  };

  const toggleKnowledge = (id: number) => {
    setSelectedKnowledgeIds(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    );
  };

  const handleFileExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtractingFile(true);
    try {
      const result = await documentApi.extractText(file);
      if (result.text && !result.text.startsWith('[')) {
        setQuery(prev => prev ? prev + '\n\n' + result.text : result.text);
      } else {
        alert(result.text || '文件文字提取失败');
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || '文件上传失败');
    } finally {
      setExtractingFile(false);
      e.target.value = '';
    }
  };

  const handleExportReport = async (format: 'docx' | 'markdown') => {
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
    } catch {
      alert('导出失败，请重试');
    } finally {
      setExportLoading(null);
    }
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* 左侧面板：输入 + 历史 */}
      <div className="w-96 flex-shrink-0 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">法律研究</h1>
        </div>

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
              placeholder="输入法律研究问题，也可以上传文件提取内容。如：民间借贷纠纷中利息上限如何认定？"
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

      {/* 右侧面板：报告内容 */}
      <div className="flex-1 overflow-y-auto rounded-lg border bg-card p-6">
        {generating ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">正在从多个来源采集数据并生成研究报告...</p>
            <p className="text-xs text-muted-foreground">来源: {sources.map(s => sourceOptions.find(o => o.key === s)?.label).join('、')}</p>
          </div>
        ) : currentReport ? (
          <div className="prose prose-sm max-w-none">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>{new Date(currentReport.created_at).toLocaleString()}</span>
                <span>|</span>
                <span>来源: {currentReport.sources_used.join('、')}</span>
              </div>
              <div className="flex items-center gap-2">
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
            </div>
            <div className="whitespace-pre-wrap leading-relaxed text-sm">{currentReport.report}</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <BookOpen className="h-12 w-12 mb-3 opacity-30" />
            <p>输入研究课题，选择信息来源，开始法律研究</p>
          </div>
        )}
      </div>
    </div>
  );
}
