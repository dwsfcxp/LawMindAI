import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Upload, FileText, Trash2, Download, Loader2, Sparkles, ChevronDown, ChevronRight, Link2, MessageSquare, AlertCircle, X, Plus, Image, Mic, Volume2, Scale, Camera, Monitor, FileSpreadsheet, Clock, Eye } from 'lucide-react';
import { AxiosError } from 'axios';
import { caseApi, evidenceApi, evidenceChainApi, type Case as CaseType, type EvidenceItem } from '@/lib/api';
import { useToast } from '@/lib/toast';
import type { ChainAnalysisResult } from '@/lib/api';

const TYPE_LABELS: Record<string, string> = {
  documentary: '书证',
  physical: '物证',
  electronic: '电子数据',
  testimony: '证人证言',
  audio_visual: '视听资料',
  audio: '音频证据',
  expert: '鉴定意见',
};

const TYPE_COLORS: Record<string, string> = {
  documentary: 'bg-blue-100 text-blue-700',
  physical: 'bg-amber-100 text-amber-700',
  electronic: 'bg-green-100 text-green-700',
  testimony: 'bg-purple-100 text-purple-700',
  audio_visual: 'bg-pink-100 text-pink-700',
  audio: 'bg-cyan-100 text-cyan-700',
  expert: 'bg-red-100 text-red-700',
};

/** Evidence type icon mapping */
const TYPE_ICONS: Record<string, typeof FileText> = {
  documentary: FileText,
  physical: Camera,
  electronic: Monitor,
  testimony: MessageSquare,
  audio_visual: Volume2,
  audio: Mic,
  expert: Scale,
};

/** File type classification for preview */
function getFileCategory(fileName: string | null): 'image' | 'audio' | 'document' | 'unknown' {
  if (!fileName) return 'unknown';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac', 'wma'].includes(ext)) return 'audio';
  if (['pdf', 'docx', 'doc', 'txt', 'xlsx', 'xls'].includes(ext)) return 'document';
  return 'unknown';
}

function FilePreviewIcon({ fileName }: { fileName: string | null }) {
  const cat = getFileCategory(fileName);
  switch (cat) {
    case 'image': return <Image className="h-5 w-5 text-green-600" />;
    case 'audio': return <Mic className="h-5 w-5 text-cyan-600" />;
    case 'document': return <FileSpreadsheet className="h-5 w-5 text-blue-600" />;
    default: return <FileText className="h-5 w-5 text-muted-foreground" />;
  }
}

/** Evidence timeline node component */
function TimelineNode({ ev, isActive, onClick, index }: {
  ev: EvidenceItem;
  isActive: boolean;
  onClick: () => void;
  index: number;
}) {
  const Icon = TYPE_ICONS[ev.type] || FileText;
  const colorClass = TYPE_COLORS[ev.type] || 'bg-gray-100 text-gray-700';
  return (
    <button
      onClick={onClick}
      className={`relative flex items-start gap-3 w-full text-left p-2 rounded-lg transition-colors ${isActive ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-accent/50'}`}
    >
      {/* Timeline line */}
      <div className="flex flex-col items-center">
        <div className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${colorClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        {index >= 0 && <div className="w-px h-4 bg-border mt-1" />}
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <p className="text-sm font-medium truncate">{ev.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${colorClass}`}>
            {TYPE_LABELS[ev.type] || ev.type}
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {new Date(ev.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </button>
  );
}

/** Chain analysis visual connection diagram */
function ChainVisualization({ result, evidenceList }: { result: ChainAnalysisResult; evidenceList: EvidenceItem[] }) {
  const score = result.completeness_score ?? 0;
  let scoreColor = 'text-red-600';
  let scoreBg = 'bg-red-50';
  if (score >= 70) { scoreColor = 'text-green-600'; scoreBg = 'bg-green-50'; }
  else if (score >= 40) { scoreColor = 'text-amber-600'; scoreBg = 'bg-amber-50'; }

  return (
    <div className="space-y-4">
      {/* Score and status */}
      <div className={`rounded-lg border p-4 ${scoreBg}`}>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Score circle */}
          <div className="relative h-20 w-20">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="35" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
              <circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" strokeWidth="6"
                strokeDasharray={`${(score / 100) * 220} 220`} strokeLinecap="round"
                className={score >= 70 ? 'text-green-500' : score >= 40 ? 'text-amber-500' : 'text-red-500'} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-lg font-bold ${scoreColor}`}>{score}</span>
            </div>
          </div>
          <div className="text-center sm:text-left flex-1">
            <h3 className="font-semibold text-sm">证据链完整度评分</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {result.chain_status}
              {result.missing_evidence && result.missing_evidence.length > 0 &&
                ` - 缺失 ${result.missing_evidence.length} 项关键证据`}
            </p>
          </div>
        </div>
      </div>

      {/* Evidence connection map */}
      <div className="rounded-lg border p-4">
        <h4 className="text-sm font-semibold mb-3">证据关联图</h4>
        <div className="flex flex-wrap gap-2">
          {evidenceList.map((ev, i) => {
            const Icon = TYPE_ICONS[ev.type] || FileText;
            return (
              <div key={ev.id} className="flex items-center gap-1">
                <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${TYPE_COLORS[ev.type] || 'bg-gray-100'}`}>
                  <Icon className="h-3 w-3" />
                  <span className="max-w-[100px] truncate">{ev.title}</span>
                </div>
                {i < evidenceList.length - 1 && (
                  <div className="w-4 h-px bg-border" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Missing evidence suggestions */}
      {result.missing_evidence && result.missing_evidence.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h4 className="text-sm font-semibold text-amber-800 mb-2">建议补充证据</h4>
          <div className="space-y-2">
            {result.missing_evidence.map((m, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`rounded px-1.5 py-0.5 font-medium shrink-0 ${
                  m.urgency === 'high' ? 'bg-red-100 text-red-700' :
                  m.urgency === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {m.urgency === 'high' ? '紧急' : m.urgency === 'medium' ? '重要' : '建议'}
                </span>
                <div>
                  <span className="font-medium text-amber-900">{m.type}</span>
                  <span className="text-amber-700 ml-1">- {m.purpose}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full report */}
      {result.chain_report && (
        <div className="rounded-lg border p-4">
          <h4 className="text-sm font-semibold mb-2">详细分析报告</h4>
          <div className="text-sm whitespace-pre-wrap max-h-80 overflow-y-auto">{result.chain_report}</div>
        </div>
      )}
    </div>
  );
}

export default function Evidence() {
  const { toast } = useToast();
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
  const [casesLoading, setCasesLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

  // Drag-and-drop state for the upload zone
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({ case_id: 0, type: 'documentary', title: '', tags: '' });

  // Confirmation dialog state (replaces browser confirm())
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // Memoized evidence filtering: sorted by date for timeline view
  const sortedByDate = useMemo(() =>
    [...evidenceList].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [evidenceList]
  );

  // Memoized evidence type summary counts
  const evidenceTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ev of evidenceList) {
      counts[ev.type] = (counts[ev.type] || 0) + 1;
    }
    return counts;
  }, [evidenceList]);

  useEffect(() => {
    caseApi.list().then(setCases).catch(e => setError('加载案件列表失败')).finally(() => setCasesLoading(false));
  }, []);

  useEffect(() => {
    if (selectedCase) loadEvidence();
  }, [selectedCase]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showCreate) {
        setShowCreate(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showCreate]);

  const loadEvidence = useCallback(async () => {
    if (!selectedCase) return;
    setLoading(true);
    try {
      const data = await evidenceApi.list(selectedCase);
      setEvidenceList(data);
    } catch {
      setError('加载证据列表失败');
    } finally { setLoading(false); }
  }, [selectedCase]);

  const handleCreate = useCallback(async () => {
    try {
      await evidenceApi.create({ ...form, case_id: selectedCase!, tags: form.tags ? form.tags.split(',').map(t => t.trim()) : undefined });
      setShowCreate(false);
      setForm({ case_id: 0, type: 'documentary', title: '', tags: '' });
      loadEvidence();
      toast({ type: 'success', title: '证据已创建' });
    } catch (e) {
      setError('创建失败');
      toast({ type: 'error', title: '创建失败' });
    }
  }, [form, selectedCase, loadEvidence, toast]);

  const handleUpload = useCallback(async (evidenceId: number) => {
    fileInputRef.current?.click();
    setUploadTarget(evidenceId);
  }, []);

  const onFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadTarget) return;
    setUploading(uploadTarget);
    try {
      await evidenceApi.upload(uploadTarget, file);
      loadEvidence();
      toast({ type: 'success', title: '文件上传成功' });
    } catch (err: unknown) {
      const msg = '上传失败: ' + (err instanceof Error ? err.message : '');
      setError(msg);
      toast({ type: 'error', title: '上传失败' });
    }
    finally { setUploading(null); setUploadTarget(null); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }, [uploadTarget, loadEvidence, toast]);

  /** Handle drag-and-drop file onto a specific evidence item */
  const handleDropOnEvidence = useCallback(async (evidenceId: number, file: File) => {
    setUploading(evidenceId);
    try {
      await evidenceApi.upload(evidenceId, file);
      loadEvidence();
      toast({ type: 'success', title: '文件上传成功' });
    } catch (err: unknown) {
      setError('上传失败: ' + (err instanceof Error ? err.message : ''));
      toast({ type: 'error', title: '上传失败' });
    } finally {
      setUploading(null);
      setDropTarget(null);
    }
  }, [loadEvidence, toast]);

  const handleDragOverEvidence = useCallback((e: React.DragEvent, evidenceId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(evidenceId);
  }, []);

  const handleDragLeaveEvidence = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
  }, []);

  const handleDropOnZone = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !uploadTarget) return;
    handleDropOnEvidence(uploadTarget, file);
  }, [uploadTarget, handleDropOnEvidence]);

  const handleAnalyze = useCallback(async (id: number) => {
    setAnalyzing(id);
    try {
      await evidenceApi.analyze(id);
      loadEvidence();
      toast({ type: 'success', title: 'AI分析完成' });
    } catch (e) {
      setError('分析失败');
      toast({ type: 'error', title: 'AI分析失败' });
    }
    finally { setAnalyzing(null); }
  }, [loadEvidence, toast]);

  const handleDelete = useCallback((id: number) => {
    setConfirmDialog({ message: '确定删除此证据？', onConfirm: async () => {
      try {
        await evidenceApi.delete(id);
        loadEvidence();
        toast({ type: 'success', title: '证据已删除' });
      } catch (e) {
        setError('删除失败');
        toast({ type: 'error', title: '删除失败' });
      }
      setConfirmDialog(null);
    }});
  }, [loadEvidence, toast]);

  const handleChainAnalysis = useCallback(async () => {
    if (!selectedCase) return;
    setAnalyzingChain(true);
    setChainResult(null);
    try {
      const result = await evidenceChainApi.analyzeChain(selectedCase);
      setChainResult(result);
      toast({ type: 'success', title: '证据链分析完成', description: `完整度评分: ${result.completeness_score ?? '-'}` });
    } catch (e: unknown) {
      const msg = e instanceof AxiosError ? (e.response?.data?.detail || '证据链分析失败') : '证据链分析失败';
      setError(msg);
      toast({ type: 'error', title: '证据链分析失败', description: msg });
    } finally { setAnalyzingChain(false); }
  }, [selectedCase, toast]);

  const handleCrossExamination = useCallback(async (id: number) => {
    setCrossExamId(id);
    try {
      const result = await evidenceChainApi.crossExamination(id);
      setCrossExamText(prev => ({ ...prev, [id]: result.cross_examination }));
      toast({ type: 'success', title: '质证意见已生成' });
    } catch (e: unknown) {
      const msg = e instanceof AxiosError ? (e.response?.data?.detail || '质证意见生成失败') : '质证意见生成失败';
      setError(msg);
      toast({ type: 'error', title: '质证意见生成失败' });
    } finally { setCrossExamId(null); }
  }, [toast]);

  /** Export evidence list as CSV */
  const handleExportEvidenceList = useCallback(() => {
    if (evidenceList.length === 0) return;
    const headers = ['编号', '名称', '类型', '标签', '已上传文件', '创建日期'];
    const rows = evidenceList.map((ev, i) => [
      i + 1,
      ev.title,
      TYPE_LABELS[ev.type] || ev.type,
      ev.tags?.join('; ') || '',
      ev.has_file ? '是' : '否',
      new Date(ev.created_at).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const bom = '﻿';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `证据清单_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ type: 'success', title: '证据清单已导出' });
  }, [evidenceList, toast]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 px-4 sm:px-0">
      <input type="file" ref={fileInputRef} className="hidden" onChange={onFileSelected}
        accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff,.mp3,.wav,.m4a,.ogg,.flac,.aac,.wma" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Upload className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">证据管理</h1>
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 max-w-md">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}
        {selectedCase && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setForm({ case_id: selectedCase, type: 'documentary', title: '', tags: '' }); setShowCreate(true); }}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> 添加证据
            </button>
            {evidenceList.length > 0 && (
              <>
                <button onClick={handleChainAnalysis} disabled={analyzingChain}
                  className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50">
                  {analyzingChain ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  证据链分析
                </button>
                <button onClick={handleExportEvidenceList}
                  className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent">
                  <Download className="h-4 w-4" /> 导出清单
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Case selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium">选择案件：</label>
        {casesLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : cases.length === 0 ? (
          <span className="text-sm text-muted-foreground">暂无案件，请先创建案件</span>
        ) : (
        <select className="rounded-md border bg-transparent px-3 py-2 text-sm" value={selectedCase || ''}
          onChange={(e) => setSelectedCase(Number(e.target.value) || null)}>
          <option value="">请选择案件</option>
          {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        )}
        {selectedCase && evidenceList.length > 1 && (
          <div className="flex gap-1 border rounded-md p-0.5">
            <button onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-xs rounded ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
              列表
            </button>
            <button onClick={() => setViewMode('timeline')}
              className={`px-3 py-1 text-xs rounded ${viewMode === 'timeline' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
              时间线
            </button>
          </div>
        )}
      </div>

      {!selectedCase ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          请先选择一个案件
        </div>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : evidenceList.length === 0 ? (
        <div className="space-y-4">
          {/* Drag-and-drop upload zone for empty state */}
          <div
            ref={dropZoneRef}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
            onDrop={handleDropOnZone}
            className={`rounded-xl border-2 border-dashed p-8 sm:p-12 text-center transition-all ${
              isDragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <Upload className={`h-12 w-12 mx-auto mb-4 ${isDragOver ? 'text-primary' : 'text-muted-foreground/40'}`} />
            <h3 className="text-lg font-semibold mb-2">
              {isDragOver ? '松开以上传文件' : '拖拽文件到此处上传'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              支持 PDF, Word, Excel, TXT, 图片, 音频格式
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-3 py-1">PDF</span>
              <span className="rounded-full bg-muted px-3 py-1">Word</span>
              <span className="rounded-full bg-muted px-3 py-1">图片</span>
              <span className="rounded-full bg-muted px-3 py-1">音频</span>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground">或点击"添加证据"手动创建</p>
        </div>
      ) : viewMode === 'timeline' ? (
        /* Timeline view */
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground">证据时间线（按创建日期排序）</h3>
          </div>
          <div className="space-y-0">
            {sortedByDate.map((ev, i) => (
              <TimelineNode
                key={ev.id}
                ev={ev}
                index={i}
                isActive={expandedId === ev.id}
                onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
              />
            ))}
          </div>
          {/* Expanded detail for timeline */}
          {expandedId && (() => {
            const ev = evidenceList.find(e => e.id === expandedId);
            if (!ev) return null;
            return (
              <div className="border-t mt-4 p-4 space-y-3">
                {/* File preview */}
                {ev.has_file && (
                  <div className="flex items-center gap-2 text-sm">
                    <FilePreviewIcon fileName={ev.file_path} />
                    <span className="text-muted-foreground">{ev.file_path || '已上传文件'}</span>
                    <button onClick={() => evidenceApi.download(ev.id)} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">
                      <Download className="h-3 w-3" />
                    </button>
                  </div>
                )}
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
              </div>
            );
          })()}
        </div>
      ) : (
        /* List view with drag-drop per item */
        <div className="space-y-3">
          {evidenceList.map(ev => {
            const TypeIcon = TYPE_ICONS[ev.type] || FileText;
            const isDropTarget = dropTarget === ev.id;
            return (
              <div key={ev.id}
                className={`rounded-lg border bg-card transition-all ${isDropTarget ? 'ring-2 ring-primary bg-primary/5' : ''}`}
                onDragOver={(e) => handleDragOverEvidence(e, ev.id)}
                onDragLeave={handleDragLeaveEvidence}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropTarget(null);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleDropOnEvidence(ev.id, file);
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer hover:bg-accent/50 gap-2"
                  onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    {expandedId === ev.id ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    {/* Type-specific icon */}
                    <TypeIcon className={`h-5 w-5 shrink-0 ${TYPE_COLORS[ev.type]?.split(' ')[1] || 'text-muted-foreground'}`} />
                    {/* File preview icon if file uploaded */}
                    {ev.has_file && <FilePreviewIcon fileName={ev.file_path} />}
                    <div className="min-w-0">
                      <span className="font-medium">{ev.title}</span>
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${TYPE_COLORS[ev.type] || 'bg-gray-100'}`}>
                        {TYPE_LABELS[ev.type] || ev.type}
                      </span>
                      {ev.has_file && <span className="ml-2 text-xs text-green-600">已上传</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
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
                    <button onClick={() => handleDelete(ev.id)} aria-label="删除证据" className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Drop hint for items without files */}
                {!ev.has_file && isDropTarget && (
                  <div className="px-4 pb-2">
                    <div className="rounded-md border-2 border-dashed border-primary/40 bg-primary/5 p-3 text-center text-xs text-primary">
                      松开以上传文件到此证据
                    </div>
                  </div>
                )}

                {expandedId === ev.id && (
                  <div className="border-t p-4 space-y-3">
                    {/* File preview section */}
                    {ev.has_file && ev.file_path && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                        <FilePreviewIcon fileName={ev.file_path} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{ev.file_path.split('/').pop()}</p>
                          <p className="text-xs text-muted-foreground">
                            {getFileCategory(ev.file_path) === 'image' ? '图片文件' :
                             getFileCategory(ev.file_path) === 'audio' ? '音频文件' : '文档文件'}
                          </p>
                        </div>
                        <button onClick={() => evidenceApi.download(ev.id)}
                          className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-1">
                          <Download className="h-3 w-3" /> 下载
                        </button>
                      </div>
                    )}
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
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      创建于 {new Date(ev.created_at).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Chain Analysis Result */}
      {chainResult && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="font-semibold">证据链分析</h3>
            <button onClick={() => setChainResult(null)} className="text-xs text-muted-foreground hover:underline">关闭</button>
          </div>
          <ChainVisualization result={chainResult} evidenceList={evidenceList} />
        </div>
      )}

      {/* Create Evidence Modal - responsive */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-lg bg-background p-4 sm:p-6 shadow-xl my-4" onClick={(e) => e.stopPropagation()}>
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
                  {Object.entries(TYPE_LABELS).map(([k, v]) => {
                    const Icon = TYPE_ICONS[k] || FileText;
                    return <option key={k} value={k}>{v}</option>;
                  })}
                </select>
                {/* Type icon preview */}
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  {(() => { const Icon = TYPE_ICONS[form.type] || FileText; return <Icon className="h-4 w-4" />; })()}
                  <span>{TYPE_LABELS[form.type]}类型证据</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">标签（逗号分隔）</label>
                <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="如：合同,原件,甲方" onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">取消</button>
              <button onClick={handleCreate} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog (replaces browser confirm()) */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setConfirmDialog(null)} role="dialog" aria-modal="true">
          <div className="bg-card rounded-xl shadow-lg p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium mb-4">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 rounded-lg border text-sm hover:bg-accent">取消</button>
              <button onClick={() => confirmDialog.onConfirm()} className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm hover:bg-destructive/90">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
