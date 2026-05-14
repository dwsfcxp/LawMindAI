import { useState, useEffect } from 'react';
import { BookOpen, Loader2, Trash2, FileText } from 'lucide-react';
import { researchApi, caseApi, type ResearchReport as ReportType, type Case as CaseType } from '@/lib/api';

export default function Research() {
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<string[]>(['vector_db', 'ai_knowledge']);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [cases, setCases] = useState<CaseType[]>([]);
  const [generating, setGenerating] = useState(false);
  const [currentReport, setCurrentReport] = useState<ReportType | null>(null);
  const [history, setHistory] = useState<ReportType[]>([]);
  const [loading, setLoading] = useState(true);

  const sourceOptions = [
    { key: 'vector_db', label: '本地向量库（案例+法条）' },
    { key: 'ai_knowledge', label: 'AI法律知识' },
    { key: 'external_api', label: '外部法律数据库（北大法宝等）' },
  ];

  useEffect(() => {
    caseApi.list().then(setCases).catch(console.error);
    researchApi.list().then(setHistory).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleResearch = async () => {
    if (!query.trim()) return;
    setGenerating(true);
    setCurrentReport(null);
    try {
      const report = await researchApi.create({ query, sources, case_id: caseId || undefined });
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
    await researchApi.delete(id);
    setHistory(history.filter(r => r.id !== id));
    if (currentReport?.id === id) setCurrentReport(null);
  };

  const toggleSource = (key: string) => {
    setSources(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]);
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* 左侧面板：输入 + 历史 */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">法律研究</h1>
        </div>

        <div className="space-y-3">
          <textarea
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm resize-none"
            rows={4}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入法律研究问题，如：民间借贷纠纷中利息上限如何认定？"
          />

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
            <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>{new Date(currentReport.created_at).toLocaleString()}</span>
              <span>|</span>
              <span>来源: {currentReport.sources_used.join('、')}</span>
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
