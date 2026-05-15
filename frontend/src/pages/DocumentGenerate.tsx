import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  FileText,
  Sparkles,
  Download,
  Edit3,
  Eye,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  RotateCcw,
  Shield,
  Upload,
  Save,
  Clock,
  RefreshCw,
  Search,
  Layers,
} from 'lucide-react';
import axios from 'axios';
import { documentApi, caseApi, researchApi } from '@/lib/api';
import { useToast } from '@/lib/toast';
import type { Document, Case, CaseCreate, ResearchReport } from '@/lib/api';
import { cn } from '@/lib/utils';
import { autoSave, loadAutoSave, clearAutoSave } from '@/lib/storage';
import { announceToScreenReader } from '@/lib/accessibility';

const DOC_TYPES = [
  { value: 'complaint', label: '民事起诉状', desc: '向法院提起民事诉讼，要求被告承担民事责任' },
  { value: 'criminal_complaint', label: '刑事自诉状', desc: '被害人直接向法院提起刑事诉讼' },
  { value: 'defense', label: '答辩状', desc: '对原告起诉状的答辩和反驳意见' },
  { value: 'representation', label: '代理词', desc: '诉讼代理人在庭审中发表的代理意见' },
  { value: 'appeal', label: '上诉状', desc: '对一审判决不服，向上级法院提起上诉' },
  { value: 'opinion', label: '法律意见书', desc: '律师就特定法律问题出具的专业意见' },
  { value: 'application', label: '申请书', desc: '向法院提出的各类程序性申请' },
  { value: 'evidence_list', label: '证据清单', desc: '列明提交法院的证据材料清单' },
  { value: 'mediation', label: '调解协议', desc: '双方当事人达成的调解和解协议' },
  { value: 'contract', label: '合同/协议', desc: '各类合同或协议文本' },
  { value: 'other', label: '其他文书', desc: '其他类型的法律文书' },
];

const BUNDLE_PRESETS = [
  {
    key: 'civil_complaint_full',
    label: '民事起诉全套',
    desc: '起诉状 + 证据清单 + 代理词',
    types: ['complaint', 'evidence_list', 'representation'],
  },
  {
    key: 'defense_full',
    label: '答辩全套',
    desc: '答辩状 + 证据清单 + 代理词',
    types: ['defense', 'evidence_list', 'representation'],
  },
  {
    key: 'appeal_full',
    label: '上诉全套',
    desc: '上诉状 + 证据清单 + 代理词',
    types: ['appeal', 'evidence_list', 'representation'],
  },
];

/** Count Chinese characters and words */
function countWords(text: string): { chars: number; words: number } {
  const cleaned = text.replace(/\s+/g, '');
  const chineseChars = (cleaned.match(/[一-鿿]/g) || []).length;
  const englishWords = cleaned.replace(/[一-鿿]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return { chars: cleaned.length, words: chineseChars + englishWords };
}

interface Draft {
  id: string;
  docType: string;
  caseFacts: string;
  extraInstructions: string;
  selectedCaseId: string;
  selectedReportIds: number[];
  savedAt: string;
}

const DRAFTS_KEY = 'lawmind_doc_drafts';

function loadDrafts(): Draft[] {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
  } catch { return []; }
}

function saveDrafts(drafts: Draft[]) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

/** Memoized document type selector component */
const DocumentTypeSelector = memo(function DocumentTypeSelector({
  value,
  onChange,
  disabled,
  selectedLabel,
  selectedDesc,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled: boolean;
  selectedLabel: string;
  selectedDesc: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">
        文书类型 <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          disabled={disabled}
          className="w-full appearance-none rounded-lg border border-input bg-background px-3.5 py-2.5 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
        >
          <option value="">请选择文书类型</option>
          {DOC_TYPES.map((dt) => (
            <option key={dt.value} value={dt.value}>
              {dt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      {selectedDesc && (
        <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {selectedDesc}
        </p>
      )}
    </div>
  );
});

export default function DocumentGenerate() {
  const { toast } = useToast();

  // Active mode: single or bundle
  const [mode, setMode] = useState<'single' | 'bundle'>('single');

  // Form state
  const [docType, setDocType] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [caseFacts, setCaseFacts] = useState('');
  const [extraInstructions, setExtraInstructions] = useState('');

  // Data state
  const [cases, setCases] = useState<Case[]>([]);
  const [generatedDoc, setGeneratedDoc] = useState<Document | null>(null);
  const [reviewResult, setReviewResult] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any[] | null>(null);
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [error, setError] = useState('');
  const [showNewCase, setShowNewCase] = useState(false);
  const [newCase, setNewCase] = useState<CaseCreate>({
    title: '',
    case_type: 'civil',
    description: '',
  });
  const [creatingCase, setCreatingCase] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [extractingFile, setExtractingFile] = useState(false);

  // 研究报告选择
  const [researchReports, setResearchReports] = useState<ResearchReport[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<number[]>([]);
  const [showReportPicker, setShowReportPicker] = useState(false);
  const [reportSearch, setReportSearch] = useState('');

  // Progress steps
  const [progressStep, setProgressStep] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const progressSteps = [
    '正在分析案情描述...',
    '正在检索相关法律条文...',
    '正在匹配文书模板...',
    '正在生成法律文书...',
    '正在校验文书格式...',
  ];

  // Drafts
  const [drafts, setDrafts] = useState<Draft[]>(loadDrafts());
  const [showDrafts, setShowDrafts] = useState(false);

  // Document version history
  const [docVersions, setDocVersions] = useState<{ version: number; updated_at: string; title: string }[]>([]);

  // Bundle generation state
  const [bundleDocTypes, setBundleDocTypes] = useState<string[]>([]);
  const [bundleGenerating, setBundleGenerating] = useState(false);
  const [bundleResults, setBundleResults] = useState<Document[]>([]);
  const [bundleProgress, setBundleProgress] = useState({ current: 0, total: 0, currentLabel: '' });

  // Character / word counter
  const wordCount = useMemo(() => countWords(caseFacts), [caseFacts]);

  // Estimated remaining time
  const estimatedRemaining = useMemo(() => {
    if (progressStep === 0) return '约30-60秒';
    const stepsLeft = progressSteps.length - progressStep;
    const avgPerStep = elapsedSeconds / (progressStep || 1);
    const remaining = Math.round(avgPerStep * stepsLeft);
    if (remaining < 10) return '即将完成';
    return `约${remaining}秒`;
  }, [progressStep, elapsedSeconds, progressSteps.length]);

  // Filtered reports for searchable dropdown
  const filteredReports = useMemo(() => {
    if (!reportSearch.trim()) return researchReports;
    const q = reportSearch.toLowerCase();
    return researchReports.filter(r => r.query.toLowerCase().includes(q));
  }, [researchReports, reportSearch]);

  useEffect(() => {
    caseApi.list({ limit: 100 }).then((data) => setCases(data)).catch(() => {}).finally(() => setInitialLoading(false));
    researchApi.list().then(setResearchReports).catch(() => {});

    // Load auto-saved form data
    const savedCaseFacts = loadAutoSave('doc_gen_caseFacts');
    if (savedCaseFacts?.value) setCaseFacts(savedCaseFacts.value);
    const savedExtra = loadAutoSave('doc_gen_extraInstructions');
    if (savedExtra?.value) setExtraInstructions(savedExtra.value);
  }, []);

  // Auto-save caseFacts and extraInstructions every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (caseFacts.trim()) autoSave('doc_gen_caseFacts', caseFacts);
      if (extraInstructions.trim()) autoSave('doc_gen_extraInstructions', extraInstructions);
    }, 10000);
    return () => clearInterval(interval);
  }, [caseFacts, extraInstructions]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showNewCase) {
        setShowNewCase(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showNewCase]);

  const startProgressSimulation = useCallback(() => {
    setProgressStep(0);
    setElapsedSeconds(0);
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < progressSteps.length) {
        setProgressStep(step);
      } else {
        clearInterval(interval);
      }
    }, 2000);
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => { clearInterval(interval); clearInterval(timer); };
  }, [progressSteps.length]);

  const handleGenerate = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!docType || !caseFacts.trim()) return;

    setLoading(true);
    setError('');
    setGeneratedDoc(null);
    setReviewResult(null);
    setEditMode(false);

    const cleanup = startProgressSimulation();

    try {
      const doc = await documentApi.generate({
        type: docType,
        case_id: selectedCaseId ? Number(selectedCaseId) : undefined,
        case_facts: caseFacts.trim(),
        extra_instructions: extraInstructions.trim() || undefined,
        research_report_ids: selectedReportIds.length > 0 ? selectedReportIds : undefined,
      }, 'doc-generate');
      setGeneratedDoc(doc);
      setEditedContent(doc.content);
      setEditedTitle(doc.title);
      setDocVersions([{ version: doc.version, updated_at: doc.updated_at, title: doc.title }]);
      toast({ type: 'success', title: '文书生成完成' });
      announceToScreenReader('文书生成完成');
      clearAutoSave('doc_gen_caseFacts');
      clearAutoSave('doc_gen_extraInstructions');
    } catch (err: any) {
      if (axios.isCancel(err)) {
        setError('生成已取消');
      } else {
        const msg = err.response?.data?.detail || '文书生成失败，请重试';
        setError(msg);
        toast({ type: 'error', title: '文书生成失败', description: msg });
      }
    } finally {
      cleanup();
      setLoading(false);
    }
  }, [docType, caseFacts, selectedCaseId, extraInstructions, selectedReportIds, startProgressSimulation, toast]);

  const handleExport = useCallback(async (format: 'word' | 'markdown' | 'html' | 'pdf') => {
    if (!generatedDoc) return;
    setExportLoading(format);
    try {
      let blob: Blob;
      let ext: string;
      if (format === 'word') {
        blob = await documentApi.exportWord(generatedDoc.id);
        ext = 'docx';
      } else if (format === 'html') {
        blob = await documentApi.exportHtml(generatedDoc.id);
        ext = 'html';
      } else if (format === 'pdf') {
        blob = await documentApi.exportPdf(generatedDoc.id);
        ext = 'pdf';
      } else {
        blob = await documentApi.exportMarkdown(generatedDoc.id);
        ext = 'md';
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${generatedDoc.title || '法律文书'}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ type: 'success', title: `已导出 ${ext.toUpperCase()} 格式` });
    } catch {
      setError('导出失败，请重试');
      toast({ type: 'error', title: '导出失败' });
    } finally {
      setExportLoading(null);
    }
  }, [generatedDoc, toast]);

  const handleReview = useCallback(async () => {
    if (!generatedDoc) return;
    setReviewLoading(true);
    setReviewResult(null);
    try {
      const doc = await documentApi.review(generatedDoc.id) as Document & { review_result?: string };
      setReviewResult(doc.review_result || '审校完成，未发现问题。');
      if (doc.content !== generatedDoc.content) {
        setGeneratedDoc(doc);
        setEditedContent(doc.content);
        setDocVersions((prev) => [...prev, { version: doc.version, updated_at: doc.updated_at, title: doc.title }]);
      }
      toast({ type: 'success', title: 'AI审校完成' });
    } catch {
      setError('AI审校失败，请重试');
      toast({ type: 'error', title: 'AI审校失败' });
    } finally {
      setReviewLoading(false);
    }
  }, [generatedDoc, toast]);

  const handleVerifyLaws = useCallback(async () => {
    if (!generatedDoc) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const result = await documentApi.verifyLaws(generatedDoc.id);
      setVerifyResult(result.verification_results);
      const hasIssues = result.verification_results.some((v: any) => !v.overall_consistent);
      if (hasIssues) {
        toast({ type: 'warning', title: '法条引用待核实', description: `${result.verification_results.filter((v: any) => !v.overall_consistent).length}条引用需要核实` });
      } else {
        toast({ type: 'success', title: '法条核查通过', description: `共${result.verification_results.length}条引用均核实无误` });
      }
    } catch {
      setError('法条核查失败，请重试');
      toast({ type: 'error', title: '法条核查失败' });
    } finally {
      setVerifyLoading(false);
    }
  }, [generatedDoc, toast]);

  const handleSaveEdit = useCallback(async () => {
    if (!generatedDoc) return;
    try {
      const updated = await documentApi.update(generatedDoc.id, {
        title: editedTitle,
        content: editedContent,
      });
      setGeneratedDoc(updated);
      setEditMode(false);
      setDocVersions((prev) => [...prev, { version: updated.version, updated_at: updated.updated_at, title: updated.title }]);
      toast({ type: 'success', title: '修改已保存' });
    } catch {
      setError('保存失败，请重试');
      toast({ type: 'error', title: '保存失败' });
    }
  }, [generatedDoc, editedTitle, editedContent, toast]);

  const handleCreateCase = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCase(true);
    try {
      const created = await caseApi.create(newCase);
      setCases((prev) => [created, ...prev]);
      setSelectedCaseId(String(created.id));
      setShowNewCase(false);
      setNewCase({ title: '', case_type: 'civil', description: '' });
      toast({ type: 'success', title: '案件创建成功' });
    } catch {
      setError('创建案件失败');
      toast({ type: 'error', title: '创建案件失败' });
    } finally {
      setCreatingCase(false);
    }
  }, [newCase, toast]);

  const handleReset = useCallback(() => {
    setDocType('');
    setSelectedCaseId('');
    setCaseFacts('');
    setExtraInstructions('');
    setGeneratedDoc(null);
    setReviewResult(null);
    setEditMode(false);
    setError('');
    setSelectedReportIds([]);
    setShowReportPicker(false);
    setDocVersions([]);
    setBundleResults([]);
    setBundleDocTypes([]);
  }, []);

  const handleFileExtract = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtractingFile(true);
    try {
      const result = await documentApi.extractText(file);
      if (result.text && !result.text.startsWith('[')) {
        setCaseFacts((prev) => (prev ? prev + '\n\n' + result.text : result.text));
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

  // Draft management
  const handleSaveDraft = useCallback(() => {
    if (!caseFacts.trim() && !docType) return;
    const draft: Draft = {
      id: Date.now().toString(),
      docType,
      caseFacts,
      extraInstructions,
      selectedCaseId,
      selectedReportIds,
      savedAt: new Date().toISOString(),
    };
    const updated = [draft, ...drafts.filter(d => !(d.docType === draft.docType && d.caseFacts === draft.caseFacts))];
    setDrafts(updated);
    saveDrafts(updated);
    toast({ type: 'success', title: '草稿已保存' });
  }, [caseFacts, docType, extraInstructions, selectedCaseId, selectedReportIds, drafts, toast]);

  const handleLoadDraft = useCallback((draft: Draft) => {
    setDocType(draft.docType);
    setCaseFacts(draft.caseFacts);
    setExtraInstructions(draft.extraInstructions);
    setSelectedCaseId(draft.selectedCaseId);
    setSelectedReportIds(draft.selectedReportIds);
    setShowDrafts(false);
  }, []);

  const handleDeleteDraft = useCallback((id: string) => {
    setDrafts(prev => {
      const updated = prev.filter(d => d.id !== id);
      saveDrafts(updated);
      return updated;
    });
  }, []);

  // Bundle generation
  const handleBundleGenerate = useCallback(async () => {
    if (!caseFacts.trim() || bundleDocTypes.length === 0) return;

    setBundleGenerating(true);
    setBundleResults([]);
    setBundleProgress({ current: 0, total: bundleDocTypes.length, currentLabel: '' });

    const results: Document[] = [];

    for (let i = 0; i < bundleDocTypes.length; i++) {
      const docType = bundleDocTypes[i];
      const docLabel = DOC_TYPES.find(d => d.value === docType)?.label || docType;
      setBundleProgress({ current: i + 1, total: bundleDocTypes.length, currentLabel: `正在生成 ${docLabel}...` });

      try {
        const doc = await documentApi.generate({
          type: docType,
          case_id: selectedCaseId ? Number(selectedCaseId) : undefined,
          case_facts: caseFacts.trim(),
          extra_instructions: extraInstructions.trim() || undefined,
          research_report_ids: selectedReportIds.length > 0 ? selectedReportIds : undefined,
        });
        results.push(doc);
      } catch (err: any) {
        toast({ type: 'error', title: `${docLabel} 生成失败`, description: err.response?.data?.detail || '请重试' });
      }
    }

    setBundleResults(results);
    setBundleGenerating(false);
    if (results.length > 0) {
      toast({ type: 'success', title: '批量生成完成', description: `成功生成 ${results.length}/${bundleDocTypes.length} 份文书` });
    }
  }, [caseFacts, bundleDocTypes, selectedCaseId, extraInstructions, selectedReportIds, toast]);

  const toggleBundleDocType = useCallback((type: string) => {
    setBundleDocTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }, []);

  const applyBundlePreset = useCallback((preset: typeof BUNDLE_PRESETS[0]) => {
    setBundleDocTypes(preset.types);
  }, []);

  const selectedDocLabel = DOC_TYPES.find((d) => d.value === docType)?.label || '';
  const selectedDocDesc = DOC_TYPES.find((d) => d.value === docType)?.desc || '';

  // Memoized template filtering for bundle mode
  const bundleTemplateOptions = useMemo(() => {
    return DOC_TYPES.filter(dt => !bundleDocTypes.includes(dt.value));
  }, [bundleDocTypes]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">文书生成</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            输入案情描述，AI 为您自动生成专业法律文书
          </p>
        </div>
        <div className="flex items-center gap-2">
          {drafts.length > 0 && (
            <button
              onClick={() => setShowDrafts(!showDrafts)}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <Save className="h-4 w-4" />
              草稿箱 ({drafts.length})
            </button>
          )}
          {generatedDoc && (
            <button
              onClick={handleReset}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              <RotateCcw className="h-4 w-4" />
              重新生成
            </button>
          )}
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setMode('single')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${mode === 'single' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <FileText className="h-4 w-4" /> 单个生成
        </button>
        <button
          onClick={() => setMode('bundle')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${mode === 'bundle' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <Layers className="h-4 w-4" /> 批量生成
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert" aria-live="polite">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
          <button onClick={() => setError('')} className="ml-auto shrink-0 hover:text-red-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Drafts Panel */}
      {showDrafts && drafts.length > 0 && (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">已保存的草稿</h3>
            <button onClick={() => setShowDrafts(false)} className="text-xs text-muted-foreground hover:text-foreground">
              关闭
            </button>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {drafts.map(d => (
              <div key={d.id} className="flex items-center gap-2 rounded-lg border p-2 hover:bg-accent">
                <button onClick={() => handleLoadDraft(d)} className="flex-1 text-left">
                  <p className="text-sm font-medium truncate">
                    {DOC_TYPES.find(t => t.value === d.docType)?.label || '未分类'} - {d.caseFacts.slice(0, 30)}...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(d.savedAt).toLocaleString()} | {countWords(d.caseFacts).chars} 字
                  </p>
                </button>
                <button onClick={() => handleDeleteDraft(d.id)} className="p-1 text-muted-foreground hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bundle Mode */}
      {mode === 'bundle' && (
        <div className="space-y-4">
          {/* Bundle presets */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold mb-3">快速模板</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {BUNDLE_PRESETS.map(preset => (
                <button
                  key={preset.key}
                  onClick={() => applyBundlePreset(preset)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-all hover:shadow-sm',
                    bundleDocTypes.length === preset.types.length && bundleDocTypes.every(t => preset.types.includes(t))
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'hover:border-primary/30'
                  )}
                >
                  <p className="font-medium text-sm">{preset.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{preset.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom multi-select */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold mb-3">自定义文书类型</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DOC_TYPES.map(dt => (
                <label key={dt.value} className={cn(
                  'flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-all text-sm',
                  bundleDocTypes.includes(dt.value)
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-primary/30'
                )}>
                  <input
                    type="checkbox"
                    checked={bundleDocTypes.includes(dt.value)}
                    onChange={() => toggleBundleDocType(dt.value)}
                    className="shrink-0"
                  />
                  <span className="truncate">{dt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Bundle Progress */}
          {bundleGenerating && (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <div>
                  <p className="font-semibold">批量生成中 ({bundleProgress.current}/{bundleProgress.total})</p>
                  <p className="text-xs text-muted-foreground">{bundleProgress.currentLabel}</p>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${(bundleProgress.current / bundleProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Bundle Results */}
          {bundleResults.length > 0 && !bundleGenerating && (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">批量生成结果 ({bundleResults.length} 份文书)</h3>
                <button onClick={() => setBundleResults([])} className="text-xs text-muted-foreground hover:text-foreground">清空</button>
              </div>
              <div className="space-y-2">
                {bundleResults.map((doc, i) => (
                  <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {DOC_TYPES.find(d => d.value === doc.type)?.label || doc.type} | {countWords(doc.content).chars} 字
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={async () => {
                          try {
                            const blob = await documentApi.exportWord(doc.id);
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = `${doc.title}.docx`;
                            document.body.appendChild(a); a.click(); a.remove();
                            window.URL.revokeObjectURL(url);
                          } catch {}
                        }}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bundle generate button */}
          <button
            onClick={handleBundleGenerate}
            disabled={bundleGenerating || !caseFacts.trim() || bundleDocTypes.length === 0}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {bundleGenerating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> 批量生成中...</>
            ) : (
              <><Layers className="h-4 w-4" /> 批量生成 ({bundleDocTypes.length} 份)</>
            )}
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Form Panel */}
        <div className={cn('lg:col-span-2', generatedDoc && 'lg:col-span-2')}>
          <form onSubmit={mode === 'single' ? handleGenerate : (e) => { e.preventDefault(); handleBundleGenerate(); }} className="space-y-5 rounded-xl border bg-card p-4 sm:p-6 shadow-sm">
            {/* Document Type - single mode only */}
            {mode === 'single' && (
              <DocumentTypeSelector
                value={docType}
                onChange={setDocType}
                disabled={loading}
                selectedLabel={selectedDocLabel}
                selectedDesc={selectedDocDesc}
              />
            )}

            {/* Case Selection */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">关联案件</label>
              <div className="flex gap-2">
                <select
                  value={selectedCaseId}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                  disabled={loading}
                  className="flex-1 appearance-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
                >
                  <option value="">不关联案件</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCase(true)}
                  disabled={loading}
                  className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  新建
                </button>
              </div>
            </div>

            {/* Case Facts */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium">
                  案情描述 <span className="text-red-500">*</span>
                </label>
                <label className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer hover:bg-accent transition-colors">
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff,.mp3,.wav,.m4a,.ogg,.flac,.aac,.wma"
                    className="hidden"
                    onChange={handleFileExtract}
                    disabled={extractingFile || loading}
                  />
                  {extractingFile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {extractingFile ? '提取中...' : '上传文件提取文字'}
                </label>
              </div>
              <textarea
                value={caseFacts}
                onChange={(e) => setCaseFacts(e.target.value)}
                required
                disabled={loading}
                placeholder="请用自然语言详细描述案件事实，包括当事人信息、纠纷经过、争议焦点等。也可以点击右上角「上传文件提取文字」按钮，从文件中自动提取。&#10;&#10;例如：原告张三于2024年1月15日借给被告李四人民币10万元，约定还款日期为2024年6月30日，月利率为0.5%。到期后李四拒绝还款..."
                rows={8}
                className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
              />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">
                  描述越详细，生成的文书越准确。
                </p>
                <span className="text-xs text-muted-foreground">
                  {wordCount.chars} 字 / {wordCount.words} 词
                </span>
              </div>
            </div>

            {/* Research Report References */}
            {researchReports.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  研究报告依据
                  <span className="ml-1 text-xs text-muted-foreground">（可选）</span>
                </label>
                <div className="rounded-lg border p-2">
                  <button
                    type="button"
                    onClick={() => setShowReportPicker(!showReportPicker)}
                    className="flex items-center gap-1 text-xs font-medium w-full"
                  >
                    {showReportPicker ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    选择研究报告 {selectedReportIds.length > 0 ? `（已选${selectedReportIds.length}篇）` : `（${researchReports.length}篇可用）`}
                  </button>
                  {showReportPicker && (
                    <div className="mt-2 space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <input
                          type="text"
                          value={reportSearch}
                          onChange={(e) => setReportSearch(e.target.value)}
                          placeholder="搜索研究报告..."
                          className="w-full rounded-md border bg-background pl-7 pr-3 py-1.5 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {filteredReports.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2 text-center">未找到匹配的报告</p>
                        ) : (
                          filteredReports.map(r => (
                            <label key={r.id} className="flex items-start gap-2 text-xs p-1 rounded hover:bg-accent cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedReportIds.includes(r.id)}
                                onChange={() => setSelectedReportIds(prev =>
                                  prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                                )}
                                className="mt-0.5"
                              />
                              <span className="truncate">{r.query.slice(0, 60)} ({new Date(r.created_at).toLocaleDateString()})</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Extra Instructions */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                补充说明
                <span className="ml-1 text-xs text-muted-foreground">（可选）</span>
              </label>
              <textarea
                value={extraInstructions}
                onChange={(e) => setExtraInstructions(e.target.value)}
                disabled={loading}
                placeholder="例如：请侧重违约金计算部分、适用简易程序、增加某项诉讼请求等..."
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
              />
            </div>

            {/* Action buttons - single mode */}
            {mode === 'single' && (
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading || !docType || !caseFacts.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> 正在生成...</>
                  ) : (
                    <><Sparkles className="h-4 w-4" /> 生成文书</>
                  )}
                </button>
                {!loading && caseFacts.trim() && (
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors hover:bg-accent"
                    title="保存为草稿"
                  >
                    <Save className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Right Panel - Loading / Result (single mode) */}
        {mode === 'single' && (
          <div className="lg:col-span-3">
            {/* Loading State */}
            {loading && (
              <div className="rounded-xl border bg-card p-6 sm:p-8 shadow-sm">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                  </div>
                  <div>
                    <p className="font-semibold">AI 正在生成文书</p>
                    <p className="text-xs text-muted-foreground">正在为您生成{selectedDocLabel}，请稍候</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {progressSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-all duration-500',
                        idx < progressStep
                          ? 'bg-green-50 text-green-700'
                          : idx === progressStep
                            ? 'bg-primary/5 text-primary font-medium'
                            : 'text-muted-foreground',
                      )}
                    >
                      {idx < progressStep ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : idx === progressStep ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border-2 border-muted" />
                      )}
                      {step}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>已用时 {elapsedSeconds} 秒 | 预计剩余 {estimatedRemaining}</span>
                </div>
              </div>
            )}

            {/* Generated Document */}
            {generatedDoc && !loading && (
              <div className="space-y-4">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
                  <div className="mr-auto flex items-center gap-2 min-w-0">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-sm font-semibold truncate">{generatedDoc.title}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground shrink-0">
                      {DOC_TYPES.find((d) => d.value === generatedDoc.type)?.label || generatedDoc.type}
                    </span>
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                    title="基于相同参数重新生成"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    重新生成
                  </button>
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      editMode
                        ? 'bg-primary text-primary-foreground'
                        : 'border hover:bg-accent',
                    )}
                  >
                    {editMode ? <Eye className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                    {editMode ? '预览模式' : '编辑模式'}
                  </button>
                  <button
                    onClick={handleReview}
                    disabled={reviewLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
                  >
                    {reviewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {reviewLoading ? '审校中...' : 'AI审校'}
                  </button>
                  <button
                    onClick={handleVerifyLaws}
                    disabled={verifyLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {verifyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                    {verifyLoading ? '核查中...' : '法条核查'}
                  </button>
                  <button
                    onClick={() => handleExport('word')}
                    disabled={exportLoading === 'word'}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    {exportLoading === 'word' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Word
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    disabled={exportLoading === 'pdf'}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    {exportLoading === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    PDF
                  </button>
                </div>

                {/* Review Result */}
                {reviewResult && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-800">
                      <Sparkles className="h-4 w-4" />
                      AI 审校结果
                    </div>
                    <div className="whitespace-pre-wrap text-sm text-violet-900 leading-relaxed">
                      {reviewResult}
                    </div>
                  </div>
                )}

                {/* Law Verification Result */}
                {verifyResult && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                      <Shield className="h-4 w-4" />
                      法条核查结果（共{verifyResult.length}条引用）
                    </div>
                    <div className="space-y-2">
                      {verifyResult.map((v: any, i: number) => (
                        <div key={i} className={`rounded-lg p-3 text-sm ${v.overall_consistent ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                          <div className="flex items-center gap-2 font-medium">
                            {v.overall_consistent ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-red-600" />
                            )}
                            《{v.law_name}》{v.article_number}
                            <span className="text-xs text-muted-foreground ml-auto">
                              置信度: {(v.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{v.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Document Version History */}
                {docVersions.length > 1 && (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                      <Clock className="h-3 w-3" />
                      文档版本历史
                    </div>
                    <div className="space-y-1">
                      {docVersions.map((v, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="font-medium">v{v.version}</span>
                          <span className="text-muted-foreground">{new Date(v.updated_at).toLocaleString()}</span>
                          <span className="text-muted-foreground truncate">{v.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Document Content */}
                <div className="rounded-xl border bg-card shadow-sm">
                  <div className="border-b px-4 sm:px-6 py-4">
                    <h2 className="text-lg font-bold">
                      {editMode ? (
                        <input
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          className="w-full rounded border border-input px-2 py-1 text-lg font-bold focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                        />
                      ) : (
                        generatedDoc.title
                      )}
                    </h2>
                  </div>

                  <div className="px-4 sm:px-6 py-5">
                    {editMode ? (
                      <textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        rows={30}
                        className="w-full resize-y rounded-lg border border-input bg-background p-4 text-sm leading-relaxed focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                    ) : (
                      <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {generatedDoc.content}
                        </div>
                      </div>
                    )}
                  </div>

                  {editMode && (
                    <div className="flex justify-end gap-3 border-t px-4 sm:px-6 py-4">
                      <button
                        onClick={() => {
                          setEditedContent(generatedDoc.content);
                          setEditedTitle(generatedDoc.title);
                          setEditMode(false);
                        }}
                        className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        保存修改
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty State */}
            {!generatedDoc && !loading && (
              <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-20 shadow-sm">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <FileText className="h-8 w-8 text-primary/60" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-muted-foreground">文书预览区</h3>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  选择文书类型并输入案情描述后，点击"生成文书"，AI 将在此处呈现生成的法律文书
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Case Modal - responsive */}
      {showNewCase && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-xl border bg-card p-4 sm:p-6 shadow-xl my-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">快速新建案件</h2>
              <button onClick={() => setShowNewCase(false)} aria-label="关闭" className="rounded p-1 hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCase} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">案件标题</label>
                <input
                  required
                  value={newCase.title}
                  onChange={(e) => setNewCase((p) => ({ ...p, title: e.target.value }))}
                  placeholder="例如：张三与李四民间借贷纠纷"
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">案件类型</label>
                <select
                  value={newCase.case_type}
                  onChange={(e) => setNewCase((p) => ({ ...p, case_type: e.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                >
                  <option value="civil">民事</option>
                  <option value="criminal">刑事</option>
                  <option value="administrative">行政</option>
                  <option value="labor">劳动</option>
                  <option value="contract">合同</option>
                  <option value="ip">知识产权</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">案件描述</label>
                <textarea
                  value={newCase.description}
                  onChange={(e) => setNewCase((p) => ({ ...p, description: e.target.value }))}
                  placeholder="简要描述案件情况..."
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCase(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creatingCase}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {creatingCase ? '创建中...' : '创建并关联'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
