import { useState, useEffect, useCallback } from 'react';
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
  Plus,
  X,
  RotateCcw,
  Shield,
} from 'lucide-react';
import { documentApi, caseApi } from '@/lib/api';
import type { Document, Case, CaseCreate } from '@/lib/api';
import { cn } from '@/lib/utils';

const DOC_TYPES = [
  { value: 'complaint', label: '民事起诉状' },
  { value: 'criminal_complaint', label: '刑事自诉状' },
  { value: 'defense', label: '答辩状' },
  { value: 'representation', label: '代理词' },
  { value: 'appeal', label: '上诉状' },
  { value: 'opinion', label: '法律意见书' },
  { value: 'application', label: '申请书' },
  { value: 'evidence_list', label: '证据清单' },
  { value: 'mediation', label: '调解协议' },
  { value: 'contract', label: '合同/协议' },
  { value: 'other', label: '其他文书' },
];

export default function DocumentGenerate() {
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

  // Progress steps
  const [progressStep, setProgressStep] = useState(0);
  const progressSteps = [
    '正在分析案情描述...',
    '正在检索相关法律条文...',
    '正在匹配文书模板...',
    '正在生成法律文书...',
    '正在校验文书格式...',
  ];

  useEffect(() => {
    caseApi.list({ limit: 100 }).then((data) => setCases(data)).catch(() => {});
  }, []);

  const startProgressSimulation = useCallback(() => {
    setProgressStep(0);
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < progressSteps.length) {
        setProgressStep(step);
      } else {
        clearInterval(interval);
      }
    }, 2000);
    return interval;
  }, [progressSteps.length]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docType || !caseFacts.trim()) return;

    setLoading(true);
    setError('');
    setGeneratedDoc(null);
    setReviewResult(null);
    setEditMode(false);

    const interval = startProgressSimulation();

    try {
      const doc = await documentApi.generate({
        type: docType,
        case_id: selectedCaseId ? Number(selectedCaseId) : undefined,
        case_facts: caseFacts.trim(),
        extra_instructions: extraInstructions.trim() || undefined,
      });
      setGeneratedDoc(doc);
      setEditedContent(doc.content);
      setEditedTitle(doc.title);
    } catch (err: any) {
      setError(err.response?.data?.detail || '文书生成失败，请重试');
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const handleExport = async (format: 'word' | 'markdown' | 'html' | 'pdf') => {
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
    } catch {
      setError('导出失败，请重试');
    } finally {
      setExportLoading(null);
    }
  };

  const handleReview = async () => {
    if (!generatedDoc) return;
    setReviewLoading(true);
    setReviewResult(null);
    try {
      const doc = await documentApi.review(generatedDoc.id) as Document & { review_result?: string };
      setReviewResult(doc.review_result || '审校完成，未发现问题。');
      if (doc.content !== generatedDoc.content) {
        setGeneratedDoc(doc);
        setEditedContent(doc.content);
      }
    } catch {
      setError('AI审校失败，请重试');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleVerifyLaws = async () => {
    if (!generatedDoc) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const result = await documentApi.verifyLaws(generatedDoc.id);
      setVerifyResult(result.verification_results);
    } catch {
      setError('法条核查失败，请重试');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!generatedDoc) return;
    try {
      const updated = await documentApi.update(generatedDoc.id, {
        title: editedTitle,
        content: editedContent,
      });
      setGeneratedDoc(updated);
      setEditMode(false);
    } catch {
      setError('保存失败，请重试');
    }
  };

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingCase(true);
    try {
      const created = await caseApi.create(newCase);
      setCases((prev) => [created, ...prev]);
      setSelectedCaseId(String(created.id));
      setShowNewCase(false);
      setNewCase({ title: '', case_type: 'civil', description: '' });
    } catch {
      setError('创建案件失败');
    } finally {
      setCreatingCase(false);
    }
  };

  const handleReset = () => {
    setDocType('');
    setSelectedCaseId('');
    setCaseFacts('');
    setExtraInstructions('');
    setGeneratedDoc(null);
    setReviewResult(null);
    setEditMode(false);
    setError('');
  };

  const selectedDocLabel = DOC_TYPES.find((d) => d.value === docType)?.label || '';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">文书生成</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            输入案情描述，AI 为您自动生成专业法律文书
          </p>
        </div>
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

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
          <button onClick={() => setError('')} className="ml-auto shrink-0 hover:text-red-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Form Panel */}
        <div className={cn('lg:col-span-2', generatedDoc && 'lg:col-span-2')}>
          <form onSubmit={handleGenerate} className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
            {/* Document Type */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                文书类型 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  required
                  disabled={loading}
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
            </div>

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
              <label className="mb-1.5 block text-sm font-medium">
                案情描述 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={caseFacts}
                onChange={(e) => setCaseFacts(e.target.value)}
                required
                disabled={loading}
                placeholder="请用自然语言详细描述案件事实，包括当事人信息、纠纷经过、争议焦点等。例如：&#10;&#10;原告张三于2024年1月15日借给被告李四人民币10万元，约定还款日期为2024年6月30日，月利率为0.5%。到期后李四拒绝还款..."
                rows={8}
                className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                描述越详细，生成的文书越准确。建议包含当事人、时间、地点、事件经过、争议焦点等要素。
              </p>
            </div>

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

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !docType || !caseFacts.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在生成...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  生成文书
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Panel - Loading / Result */}
        <div className="lg:col-span-3">
          {/* Loading State */}
          {loading && (
            <div className="rounded-xl border bg-card p-8 shadow-sm">
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
            </div>
          )}

          {/* Generated Document */}
          {generatedDoc && !loading && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
                <div className="mr-auto flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="text-sm font-semibold">{generatedDoc.title}</span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                    {DOC_TYPES.find((d) => d.value === generatedDoc.type)?.label || generatedDoc.type}
                  </span>
                </div>
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
                  {reviewLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {reviewLoading ? '审校中...' : 'AI审校'}
                </button>
                <button
                  onClick={handleVerifyLaws}
                  disabled={verifyLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {verifyLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Shield className="h-3.5 w-3.5" />
                  )}
                  {verifyLoading ? '核查中...' : '法条核查'}
                </button>
                <button
                  onClick={() => handleExport('word')}
                  disabled={exportLoading === 'word'}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {exportLoading === 'word' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  导出Word
                </button>
                <button
                  onClick={() => handleExport('markdown')}
                  disabled={exportLoading === 'markdown'}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {exportLoading === 'markdown' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  导出Markdown
                </button>
                <button
                  onClick={() => handleExport('html')}
                  disabled={exportLoading === 'html'}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {exportLoading === 'html' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  导出HTML
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exportLoading === 'pdf'}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {exportLoading === 'pdf' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  导出PDF
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

              {/* Document Content */}
              <div className="rounded-xl border bg-card shadow-sm">
                <div className="border-b px-6 py-4">
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

                <div className="px-6 py-5">
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
                  <div className="flex justify-end gap-3 border-t px-6 py-4">
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
      </div>

      {/* New Case Modal */}
      {showNewCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">快速新建案件</h2>
              <button onClick={() => setShowNewCase(false)} className="rounded p-1 hover:bg-accent">
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
