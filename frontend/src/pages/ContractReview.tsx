import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Trash2, Download, Loader2, ShieldCheck, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight, FileDown, PenLine } from 'lucide-react';
import { contractApi, caseApi, type ContractItem, type ContractRiskItem, type Case as CaseType } from '@/lib/api';

const RISK_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-blue-100 text-blue-700 border-blue-200',
};

const RISK_ICONS: Record<string, typeof AlertTriangle> = {
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
};

const DIMENSION_LABELS: Record<string, string> = {
  legality: '合法性',
  completeness: '完备性',
  fairness: '公平性',
  clarity: '明确性',
  enforceability: '可执行性',
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待审查', color: 'bg-gray-100 text-gray-600' },
  parsing: { label: '解析中', color: 'bg-blue-100 text-blue-600' },
  reviewing: { label: '审查中', color: 'bg-amber-100 text-amber-600' },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700' },
  failed: { label: '失败', color: 'bg-red-100 text-red-600' },
};

export default function ContractReview() {
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [cases, setCases] = useState<CaseType[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [selectedContract, setSelectedContract] = useState<ContractItem | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showClauses, setShowClauses] = useState(false);

  const [form, setForm] = useState({ title: '', case_id: '' });
  const [showDraft, setShowDraft] = useState(false);
  const [draftForm, setDraftForm] = useState({ title: '', description: '', case_id: '' });
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [drafting, setDrafting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    caseApi.list().then(setCases).catch(console.error);
    loadContracts();
  }, []);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const data = await contractApi.list();
      setContracts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !form.title.trim()) return;

    setUploading(true);
    try {
      const result = await contractApi.upload(
        file,
        form.title.trim(),
        form.case_id ? Number(form.case_id) : undefined,
      );
      setContracts((prev) => [result, ...prev]);
      setShowUpload(false);
      setForm({ title: '', case_id: '' });
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e: any) {
      alert(e.response?.data?.detail || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleReview = async (id: number) => {
    setReviewing(id);
    try {
      const result = await contractApi.review(id);
      setContracts((prev) => prev.map((c) => (c.id === id ? result : c)));
      if (selectedContract?.id === id) setSelectedContract(result);
    } catch (e: any) {
      alert(e.response?.data?.detail || '审查失败');
    } finally {
      setReviewing(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此合同？')) return;
    try {
      await contractApi.delete(id);
      setContracts((prev) => prev.filter((c) => c.id !== id));
      if (selectedContract?.id === id) setSelectedContract(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDraft = async () => {
    if (!draftForm.title.trim() || !draftForm.description.trim()) return;
    setDrafting(true);
    try {
      const result = await contractApi.draft({
        title: draftForm.title.trim(),
        description: draftForm.description.trim(),
        case_id: draftForm.case_id ? Number(draftForm.case_id) : undefined,
        file: draftFile || undefined,
      });
      setContracts((prev) => [result, ...prev]);
      setShowDraft(false);
      setDraftForm({ title: '', description: '', case_id: '' });
      setDraftFile(null);
    } catch (e: any) {
      alert(e.response?.data?.detail || '起草失败');
    } finally {
      setDrafting(false);
    }
  };

  const handleExport = async (id: number, format: string) => {
    try {
      const blob = await contractApi.exportReport(id, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `合同审查报告.${format === 'docx' ? 'docx' : 'md'}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  const selectContract = async (c: ContractItem) => {
    if (selectedContract?.id === c.id) {
      setSelectedContract(null);
      return;
    }
    try {
      const detail = await contractApi.get(c.id);
      setSelectedContract(detail);
    } catch {
      setSelectedContract(c);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-400';
    if (score < 30) return 'text-green-600';
    if (score < 60) return 'text-amber-600';
    return 'text-red-600';
  };

  const getScoreLabel = (score: number | null) => {
    if (score === null) return '未评估';
    if (score < 30) return '低风险';
    if (score < 60) return '中等风险';
    if (score < 80) return '高风险';
    return '极高风险';
  };

  const renderRiskBadge = (risk: ContractRiskItem) => {
    const Icon = RISK_ICONS[risk.level] || Info;
    return (
      <div key={`${risk.dimension}-${risk.clause}`} className={`rounded-lg border p-4 ${RISK_COLORS[risk.level] || ''}`}>
        <div className="flex items-start gap-2">
          <Icon className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{DIMENSION_LABELS[risk.dimension] || risk.dimension}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-white/60">
                {risk.level === 'high' ? '高风险' : risk.level === 'medium' ? '中风险' : '低风险'}
              </span>
            </div>
            <p className="text-sm mb-2">{risk.issue}</p>
            {risk.clause && (
              <p className="text-xs opacity-75 mb-2 italic truncate">相关条款: {risk.clause}</p>
            )}
            {risk.suggestion && (
              <div className="text-sm bg-white/50 rounded p-2 mt-1">
                <span className="font-medium">修改建议:</span> {risk.suggestion}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">合同智能审查</h1>
          <p className="text-sm text-muted-foreground mt-1">上传合同文件，AI自动识别条款、标注风险、生成修改建议</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDraft(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors"
          >
            <PenLine className="h-4 w-4" />
            起草合同
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Upload className="h-4 w-4" />
            上传合同
          </button>
        </div>
      </div>

      {/* Draft Dialog */}
      {showDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDraft(false)}>
          <div className="bg-card rounded-xl shadow-lg p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">AI 起草合同</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">合同标题 *</label>
                <input
                  type="text"
                  value={draftForm.title}
                  onChange={(e) => setDraftForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  placeholder="例: 软件开发服务合同"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">需求描述 *</label>
                <textarea
                  value={draftForm.description}
                  onChange={(e) => setDraftForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm min-h-[120px]"
                  placeholder="描述合同需求，如：甲方委托乙方开发一套ERP系统，工期6个月，总价50万元，分三期支付..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">参考文件（可选）</label>
                <input
                  ref={draftFileRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.xlsx,.xls"
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                  onChange={(e) => setDraftFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-muted-foreground mt-1">上传参考合同或相关文件，AI将参考其内容起草</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">关联案件（可选）</label>
                <select
                  value={draftForm.case_id}
                  onChange={(e) => setDraftForm((f) => ({ ...f, case_id: e.target.value }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <option value="">不关联案件</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDraft(false)}
                  className="px-4 py-2 rounded-lg border hover:bg-accent text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleDraft}
                  disabled={drafting || !draftForm.title.trim() || !draftForm.description.trim()}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm disabled:opacity-50"
                >
                  {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : '起草合同'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowUpload(false)}>
          <div className="bg-card rounded-xl shadow-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">上传合同文件</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">合同标题 *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  placeholder="例: XX公司采购合同"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">关联案件（可选）</label>
                <select
                  value={form.case_id}
                  onChange={(e) => setForm((f) => ({ ...f, case_id: e.target.value }))}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <option value="">不关联案件</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">合同文件 *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff"
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
                <p className="text-xs text-muted-foreground mt-1">支持 PDF, Word, Excel, TXT, 图片格式</p>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowUpload(false)}
                  className="px-4 py-2 rounded-lg border hover:bg-accent text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading || !form.title.trim()}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : '上传'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contract List */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">合同列表 ({contracts.length})</h2>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : contracts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>暂无合同，点击上传按钮开始</p>
            </div>
          ) : (
            <div className="space-y-2">
              {contracts.map((c) => {
                const st = STATUS_MAP[c.status] || STATUS_MAP.pending;
                const isSelected = selectedContract?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => selectContract(c)}
                    className={`rounded-lg border p-3 cursor-pointer transition-all hover:shadow-sm ${isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'hover:border-primary/30'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{c.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${st.color}`}>{st.label}</span>
                          {c.file_type && <span className="text-xs text-muted-foreground uppercase">{c.file_type}</span>}
                        </div>
                      </div>
                      {c.risk_score !== null && (
                        <div className={`text-lg font-bold ${getScoreColor(c.risk_score)}`}>
                          {c.risk_score}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(c.created_at).toLocaleDateString()}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Contract Detail */}
        <div className="lg:col-span-2">
          {!selectedContract ? (
            <div className="flex items-center justify-center h-96 text-muted-foreground">
              <div className="text-center">
                <ShieldCheck className="h-16 w-16 mx-auto mb-3 opacity-20" />
                <p>选择一份合同查看审查结果</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">{selectedContract.title}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_MAP[selectedContract.status]?.color}`}>
                      {STATUS_MAP[selectedContract.status]?.label}
                    </span>
                    {selectedContract.risk_score !== null && (
                      <span className={`font-medium ${getScoreColor(selectedContract.risk_score)}`}>
                        {getScoreLabel(selectedContract.risk_score)} ({selectedContract.risk_score}/100)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {(selectedContract.status === 'pending' || selectedContract.status === 'failed') && (selectedContract.parsed_text || selectedContract.has_file) && (
                    <button
                      onClick={() => handleReview(selectedContract.id)}
                      disabled={reviewing === selectedContract.id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
                    >
                      {reviewing === selectedContract.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {reviewing === selectedContract.id ? '审查中...' : 'AI审查'}
                    </button>
                  )}
                  {selectedContract.review_report && (
                    <>
                      <button
                        onClick={() => handleExport(selectedContract.id, 'markdown')}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg border text-sm hover:bg-accent"
                      >
                        <FileDown className="h-4 w-4" /> MD
                      </button>
                      <button
                        onClick={() => handleExport(selectedContract.id, 'docx')}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg border text-sm hover:bg-accent"
                      >
                        <Download className="h-4 w-4" /> Word
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDelete(selectedContract.id)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Risk Score Bar */}
              {selectedContract.risk_score !== null && (
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">综合风险评分</span>
                    <span className={`text-2xl font-bold ${getScoreColor(selectedContract.risk_score)}`}>{selectedContract.risk_score}</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        selectedContract.risk_score < 30 ? 'bg-green-500' : selectedContract.risk_score < 60 ? 'bg-amber-500' : selectedContract.risk_score < 80 ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${selectedContract.risk_score}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>安全</span><span>中等</span><span>高风险</span><span>极危险</span>
                  </div>
                </div>
              )}

              {/* Risk Items */}
              {selectedContract.risk_items && selectedContract.risk_items.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    风险项 ({selectedContract.risk_items.length})
                  </h3>
                  <div className="grid gap-3">
                    {[...selectedContract.risk_items]
                      .sort((a, b) => {
                        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
                        return (order[a.level] ?? 3) - (order[b.level] ?? 3);
                      })
                      .map((risk, i) => (
                        <div key={i}>{renderRiskBadge(risk)}</div>
                      ))}
                  </div>
                </div>
              )}

              {/* Clauses Toggle */}
              {selectedContract.clauses && selectedContract.clauses.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowClauses(!showClauses)}
                    className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    {showClauses ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    识别的条款 ({selectedContract.clauses.length})
                  </button>
                  {showClauses && (
                    <div className="mt-2 space-y-2">
                      {selectedContract.clauses.map((clause, i) => (
                        <div key={i} className="rounded-lg border p-3 bg-muted/30">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
                              {clause.type}
                            </span>
                            <span className="text-xs text-muted-foreground">第{clause.position}条</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{clause.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Review Report */}
              {selectedContract.review_report && (
                <div className="rounded-lg border p-5 bg-muted/20">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">审查报告</h3>
                  <div className="prose prose-sm max-w-none">
                    {selectedContract.review_report.split('\n').map((line, i) => {
                      if (line.startsWith('# '))
                        return <h2 key={i} className="text-lg font-bold mt-4 mb-2">{line.slice(2)}</h2>;
                      if (line.startsWith('## '))
                        return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{line.slice(3)}</h3>;
                      if (line.startsWith('### '))
                        return <h4 key={i} className="text-sm font-semibold mt-2 mb-1">{line.slice(4)}</h4>;
                      if (line.startsWith('> '))
                        return <blockquote key={i} className="text-sm italic opacity-75 border-l-2 pl-3 my-1">{line.slice(2)}</blockquote>;
                      if (line.startsWith('- '))
                        return <li key={i} className="text-sm ml-4">{line.slice(2)}</li>;
                      if (line.startsWith('**') && line.endsWith('**'))
                        return <p key={i} className="text-sm font-semibold">{line.slice(2, -2)}</p>;
                      if (line.startsWith('---'))
                        return <hr key={i} className="my-3 border-border" />;
                      if (!line.trim())
                        return <div key={i} className="h-2" />;
                      return <p key={i} className="text-sm my-0.5">{line}</p>;
                    })}
                  </div>
                </div>
              )}

              {/* Parsed Text (collapsible) */}
              {selectedContract.parsed_text && (
                <details className="rounded-lg border">
                  <summary className="p-3 text-sm font-medium cursor-pointer hover:bg-accent rounded-t-lg">
                    原文内容 ({selectedContract.parsed_text.length} 字)
                  </summary>
                  <div className="p-3 pt-0 max-h-96 overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap break-all text-muted-foreground">
                      {selectedContract.parsed_text}
                    </pre>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
