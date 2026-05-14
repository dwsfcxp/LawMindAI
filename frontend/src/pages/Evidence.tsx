import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Trash2, Download, Loader2, Sparkles, ChevronDown, ChevronRight, Link2, MessageSquare } from 'lucide-react';
import { caseApi, evidenceApi, evidenceChainApi, type Case as CaseType, type EvidenceItem } from '@/lib/api';
import type { ChainAnalysisResult } from '@/lib/api';

const TYPE_LABELS: Record<string, string> = {
  documentary: '书证',
  physical: '物证',
  electronic: '电子数据',
  testimony: '证人证言',
  audio_visual: '视听资料',
  expert: '鉴定意见',
};

const TYPE_COLORS: Record<string, string> = {
  documentary: 'bg-blue-100 text-blue-700',
  physical: 'bg-amber-100 text-amber-700',
  electronic: 'bg-green-100 text-green-700',
  testimony: 'bg-purple-100 text-purple-700',
  audio_visual: 'bg-pink-100 text-pink-700',
  expert: 'bg-red-100 text-red-700',
};

export default function Evidence() {
  const [cases, setCases] = useState<CaseType[]>([]);
  const [selectedCase, setSelectedCase] = useState<number | null>(null);
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<number | null>(null);
  const [chainResult, setChainResult] = useState<ChainAnalysisResult | null>(null);
  const [analyzingChain, setAnalyzingChain] = useState(false);
  const [crossExamId, setCrossExamId] = useState<number | null>(null);
  const [crossExamText, setCrossExamText] = useState<Record<number, string>>({});

  const [form, setForm] = useState({ case_id: 0, type: 'documentary', title: '', tags: '' });

  useEffect(() => {
    caseApi.list().then(setCases).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedCase) loadEvidence();
  }, [selectedCase]);

  const loadEvidence = async () => {
    if (!selectedCase) return;
    setLoading(true);
    try {
      const data = await evidenceApi.list(selectedCase);
      setEvidenceList(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    try {
      await evidenceApi.create({ ...form, case_id: selectedCase!, tags: form.tags ? form.tags.split(',').map(t => t.trim()) : undefined });
      setShowCreate(false);
      setForm({ case_id: 0, type: 'documentary', title: '', tags: '' });
      loadEvidence();
    } catch (e) { alert('创建失败'); }
  };

  const handleUpload = async (evidenceId: number) => {
    fileInputRef.current?.click();
    setUploadTarget(evidenceId);
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    setUploading(uploadTarget);
    try {
      await evidenceApi.upload(uploadTarget, file);
      loadEvidence();
    } catch (err: any) { alert('上传失败: ' + (err.message || '')); }
    finally { setUploading(null); setUploadTarget(null); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleAnalyze = async (id: number) => {
    setAnalyzing(id);
    try {
      await evidenceApi.analyze(id);
      loadEvidence();
    } catch (e) { alert('分析失败'); }
    finally { setAnalyzing(null); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此证据？')) return;
    await evidenceApi.delete(id);
    loadEvidence();
  };

  const handleChainAnalysis = async () => {
    if (!selectedCase) return;
    setAnalyzingChain(true);
    setChainResult(null);
    try {
      const result = await evidenceChainApi.analyzeChain(selectedCase);
      setChainResult(result);
    } catch (e: any) {
      alert(e.response?.data?.detail || '证据链分析失败');
    } finally { setAnalyzingChain(false); }
  };

  const handleCrossExamination = async (id: number) => {
    setCrossExamId(id);
    try {
      const result = await evidenceChainApi.crossExamination(id);
      setCrossExamText(prev => ({ ...prev, [id]: result.cross_examination }));
    } catch (e: any) {
      alert(e.response?.data?.detail || '质证意见生成失败');
    } finally { setCrossExamId(null); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <input type="file" ref={fileInputRef} className="hidden" onChange={onFileSelected}
        accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.bmp,.tiff" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Upload className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">证据管理</h1>
        </div>
        {selectedCase && (
          <div className="flex gap-2">
            <button onClick={() => { setForm({ case_id: selectedCase, type: 'documentary', title: '', tags: '' }); setShowCreate(true); }}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> 添加证据
            </button>
            {evidenceList.length > 0 && (
              <button onClick={handleChainAnalysis} disabled={analyzingChain}
                className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">
                {analyzingChain ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                证据链分析
              </button>
            )}
          </div>
        )}
      </div>

      {/* 案件选择 */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">选择案件：</label>
        <select className="rounded-md border bg-transparent px-3 py-2 text-sm" value={selectedCase || ''}
          onChange={(e) => setSelectedCase(Number(e.target.value) || null)}>
          <option value="">请选择案件</option>
          {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>

      {!selectedCase ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          请先选择一个案件
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : evidenceList.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          暂无证据，点击"添加证据"开始
        </div>
      ) : (
        <div className="space-y-3">
          {evidenceList.map(ev => (
            <div key={ev.id} className="rounded-lg border bg-card">
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50"
                onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}>
                <div className="flex items-center gap-3">
                  {expandedId === ev.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <span className="font-medium">{ev.title}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${TYPE_COLORS[ev.type] || 'bg-gray-100'}`}>
                      {TYPE_LABELS[ev.type] || ev.type}
                    </span>
                    {ev.has_file && <span className="ml-2 text-xs text-green-600">已上传</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {!ev.has_file && (
                    <button onClick={() => handleUpload(ev.id)} disabled={uploading === ev.id}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50">
                      {uploading === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '上传文件'}
                    </button>
                  )}
                  {ev.has_file && (
                    <>
                      <button onClick={() => evidenceApi.download(ev.id)} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">
                        <Download className="h-3 w-3" />
                      </button>
                      <button onClick={() => handleAnalyze(ev.id)} disabled={analyzing === ev.id}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50 flex items-center gap-1">
                        {analyzing === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        AI分析
                      </button>
                    </>
                  )}
                  <button onClick={() => handleDelete(ev.id)} className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {expandedId === ev.id && (
                <div className="border-t p-4 space-y-3">
                  {ev.ocr_text && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">提取文字</h4>
                      <pre className="rounded-md bg-muted p-3 text-xs whitespace-pre-wrap max-h-60 overflow-y-auto">{ev.ocr_text}</pre>
                    </div>
                  )}
                  {ev.analysis && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">AI分析</h4>
                      <div className="rounded-md bg-blue-50 p-3 text-sm whitespace-pre-wrap max-h-80 overflow-y-auto">{ev.analysis}</div>
                    </div>
                  )}
                  {ev.ocr_text && (
                    <button onClick={() => handleCrossExamination(ev.id)} disabled={crossExamId === ev.id}
                      className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50">
                      {crossExamId === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                      生成质证意见
                    </button>
                  )}
                  {crossExamText[ev.id] && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">质证意见</h4>
                      <div className="rounded-md bg-amber-50 p-3 text-sm whitespace-pre-wrap max-h-80 overflow-y-auto">{crossExamText[ev.id]}</div>
                    </div>
                  )}
                  {ev.tags && ev.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {ev.tags.map((t, i) => <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">{t}</span>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Chain Analysis Result */}
      {chainResult && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">证据链分析</h3>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${chainResult.completeness_score && chainResult.completeness_score >= 70 ? 'text-green-600' : chainResult.completeness_score && chainResult.completeness_score >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                {chainResult.completeness_score ?? '-'}分
              </span>
              <span className="text-sm text-muted-foreground">{chainResult.chain_status}</span>
              <button onClick={() => setChainResult(null)} className="text-xs text-muted-foreground hover:underline">关闭</button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto text-sm whitespace-pre-wrap">{chainResult.chain_report}</div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">添加证据</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">证据名称</label>
                <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：合同原件" />
              </div>
              <div>
                <label className="text-sm font-medium">证据类型</label>
                <select className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">标签（逗号分隔）</label>
                <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="如：合同,原件,甲方" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">取消</button>
              <button onClick={handleCreate} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Plus({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}
