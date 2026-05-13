import { useEffect, useState } from 'react';
import { Plus, Filter, Briefcase } from 'lucide-react';
import { caseApi } from '@/lib/api';
import type { Case, CaseCreate } from '@/lib/api';

const CASE_TYPES = [
  { value: '', label: '全部类型' },
  { value: 'civil', label: '民事' },
  { value: 'criminal', label: '刑事' },
  { value: 'administrative', label: '行政' },
  { value: 'labor', label: '劳动' },
  { value: 'contract', label: '合同' },
  { value: 'ip', label: '知识产权' },
  { value: 'other', label: '其他' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'active', label: '进行中' },
  { value: 'closed', label: '已结案' },
  { value: 'archived', label: '已归档' },
];

const statusLabel: Record<string, string> = {
  draft: '草稿',
  active: '进行中',
  closed: '已结案',
  archived: '已归档',
};

const caseTypeLabel: Record<string, string> = {
  civil: '民事',
  criminal: '刑事',
  administrative: '行政',
  labor: '劳动',
  contract: '合同',
  ip: '知识产权',
  other: '其他',
};

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-blue-100 text-blue-700',
  closed: 'bg-green-100 text-green-700',
  archived: 'bg-yellow-100 text-yellow-700',
};

export default function Cases() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CaseCreate>({
    title: '',
    case_type: 'civil',
    description: '',
  });
  const [creating, setCreating] = useState(false);

  const fetchCases = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await caseApi.list({
        status: statusFilter || undefined,
        case_type: typeFilter || undefined,
        limit: 50,
      });
      setCases(data);
    } catch {
      setError('获取案件列表失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, [statusFilter, typeFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await caseApi.create(createForm);
      setShowCreate(false);
      setCreateForm({ title: '', case_type: 'civil', description: '' });
      fetchCases();
    } catch {
      setError('创建案件失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">案件管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">共 {cases.length} 个案件</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          新建案件
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{error}</p>
          <button onClick={() => setError('')} className="ml-auto shrink-0 hover:text-red-900">&times;</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
        >
          {CASE_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Case List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <svg className="h-6 w-6 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : cases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
          <Briefcase className="mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">暂无案件，点击"新建案件"开始</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => (
            <div
              key={c.id}
              className="group rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between">
                <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{c.title}</h3>
                <span
                  className={`ml-2 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[c.status] || 'bg-gray-100 text-gray-700'}`}
                >
                  {statusLabel[c.status] || c.status}
                </span>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  类型：
                  <span className="font-medium text-foreground">
                    {caseTypeLabel[c.case_type] || c.case_type}
                  </span>
                </p>
                <p>创建：{formatDate(c.created_at)}</p>
                {c.description && (
                  <p className="line-clamp-2 pt-1">{c.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">新建案件</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">案件标题</label>
                <input
                  required
                  value={createForm.title}
                  onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="例如：张三与李四民间借贷纠纷"
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">案件类型</label>
                <select
                  value={createForm.case_type}
                  onChange={(e) => setCreateForm((p) => ({ ...p, case_type: e.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                >
                  {CASE_TYPES.filter((o) => o.value).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">案件描述</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="简要描述案件情况..."
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? '创建中...' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
