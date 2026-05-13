import { useEffect, useState } from 'react';
import { Plus, Edit3, Trash2, FileCode, X, Loader2 } from 'lucide-react';
import { templateApi } from '@/lib/api';
import type { Template } from '@/lib/api';
import { cn } from '@/lib/utils';

const DOC_TYPES = [
  { value: 'complaint', label: '民事起诉状' },
  { value: 'defense', label: '答辩状' },
  { value: 'representation', label: '代理词' },
  { value: 'appeal', label: '上诉状' },
  { value: 'opinion', label: '法律意见书' },
  { value: 'application', label: '申请书' },
  { value: 'contract', label: '合同/协议' },
  { value: 'other', label: '其他' },
];

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    type: 'complaint',
    structure: '',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await templateApi.list();
      setTemplates(data);
    } catch {
      setError('获取模板列表失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', type: 'complaint', structure: '', description: '' });
    setShowDialog(true);
  };

  const openEdit = (t: Template) => {
    setEditId(t.id);
    setForm({
      name: t.name,
      type: t.type,
      structure: typeof t.structure === 'string' ? t.structure : JSON.stringify(t.structure ?? '', null, 2),
      description: t.description || '',
    });
    setShowDialog(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        type: form.type,
        description: form.description,
        structure: form.structure,
      };
      if (editId) {
        await templateApi.update(editId, payload);
      } else {
        await templateApi.create(payload);
      }
      setShowDialog(false);
      fetchTemplates();
    } catch {
      setError('保存模板失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setError('');
    try {
      await templateApi.delete(id);
      setDeleteId(null);
      fetchTemplates();
    } catch {
      setError('删除模板失败，请重试');
    }
  };

  const docTypeLabel = (v: string) => DOC_TYPES.find((d) => d.value === v)?.label || v;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">模板管理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            共 {templates.length} 个文书模板
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          新建模板
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{error}</p>
          <button onClick={() => setError('')} className="ml-auto shrink-0 hover:text-red-900">&times;</button>
        </div>
      )}

      {/* Templates Grid */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-16">
          <FileCode className="mb-3 h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">暂无模板，点击"新建模板"开始</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="group rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold">{t.name}</h3>
                  <span className="mt-1 inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {docTypeLabel(t.type)}
                  </span>
                </div>
                <div className="ml-2 flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(t)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="编辑"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteId(t.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {t.description && (
                <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
              )}
              <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground/80">
                {typeof t.structure === 'string' ? t.structure : JSON.stringify(t.structure ?? '')}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editId ? '编辑模板' : '新建模板'}</h2>
              <button onClick={() => setShowDialog(false)} className="rounded p-1 hover:bg-accent">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">模板名称</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="例如：标准民间借贷起诉状模板"
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">文书类型</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                >
                  {DOC_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">描述</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="简要说明模板用途"
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">模板内容</label>
                <textarea
                  required
                  value={form.structure}
                  onChange={(e) => setForm((p) => ({ ...p, structure: e.target.value }))}
                  placeholder="输入模板内容，可使用 {{变量名}} 标记占位符..."
                  rows={8}
                  className="w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDialog(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">确认删除</h3>
            <p className="mb-5 text-sm text-muted-foreground">确定要删除这个模板吗？此操作不可撤销。</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
