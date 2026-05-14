import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Plus, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { llmSettingsApi, type LLMSetting } from '@/lib/api';

export default function Settings() {
  const [configs, setConfigs] = useState<LLMSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);

  const [form, setForm] = useState({
    name: '',
    base_url: '',
    api_key: '',
    model_name: 'glm-5.1',
    max_tokens: 4096,
    is_default: false,
  });

  useEffect(() => { loadConfigs(); }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const data = await llmSettingsApi.list();
      setConfigs(data);
    } catch (e) {
      console.error('加载配置失败', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await llmSettingsApi.update(editingId, form);
      } else {
        await llmSettingsApi.create(form);
      }
      setShowModal(false);
      setEditingId(null);
      resetForm();
      loadConfigs();
    } catch (e) {
      console.error('保存失败', e);
      alert('保存失败，请检查输入');
    }
  };

  const handleEdit = (c: LLMSetting) => {
    setForm({ name: c.name, base_url: c.base_url, api_key: '', model_name: c.model_name, max_tokens: c.max_tokens, is_default: c.is_default });
    setEditingId(c.id);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此配置？')) return;
    try {
      await llmSettingsApi.delete(id);
      loadConfigs();
    } catch (e) {
      console.error('删除失败', e);
    }
  };

  const handleTest = async (c: LLMSetting) => {
    setTesting(c.id);
    setTestResult(null);
    try {
      const result = await llmSettingsApi.testConnectivity({
        base_url: c.base_url,
        api_key: '', // 服务端需要原始key，这里用空串让用户重新输入
        model_name: c.model_name,
      });
      setTestResult({ id: c.id, success: result.success, message: result.message });
    } catch (e: any) {
      setTestResult({ id: c.id, success: false, message: e.message || '测试失败' });
    } finally {
      setTesting(null);
    }
  };

  const resetForm = () => {
    setForm({ name: '', base_url: '', api_key: '', model_name: 'glm-5.1', max_tokens: 4096, is_default: false });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">LLM 配置管理</h1>
        </div>
        <button
          onClick={() => { resetForm(); setEditingId(null); setShowModal(true); }}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          添加配置
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : configs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">暂无LLM配置，请点击"添加配置"按钮创建</p>
        </div>
      ) : (
        <div className="space-y-4">
          {configs.map((c) => (
            <div key={c.id} className="rounded-lg border bg-card p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{c.name}</h3>
                    {c.is_default && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">默认</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {c.base_url || '默认端点'} &middot; {c.model_name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTest(c)}
                    disabled={testing === c.id}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  >
                    {testing === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '测试连接'}
                  </button>
                  <button onClick={() => handleEdit(c)} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">编辑</button>
                  <button onClick={() => handleDelete(c)} className="rounded-md border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                API Key: {c.api_key_masked} &middot; Max Tokens: {c.max_tokens}
              </div>
              {testResult && testResult.id === c.id && (
                <div className={`flex items-center gap-2 rounded-md p-2 text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {testResult.message}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-lg rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editingId ? '编辑配置' : '添加配置'}</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">配置名称</label>
                <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：智谱GLM-4" />
              </div>
              <div>
                <label className="text-sm font-medium">Base URL</label>
                <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.base_url}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://open.bigmodel.cn/api/anthropic" />
              </div>
              <div>
                <label className="text-sm font-medium">API Key</label>
                <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" type="password" value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder={editingId ? '留空则不修改' : '输入API Key'} />
              </div>
              <div>
                <label className="text-sm font-medium">模型名称</label>
                <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.model_name}
                  onChange={(e) => setForm({ ...form, model_name: e.target.value })} placeholder="glm-5.1" />
              </div>
              <div>
                <label className="text-sm font-medium">Max Tokens</label>
                <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" type="number" value={form.max_tokens}
                  onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) || 4096 })} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
                设为默认配置
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">取消</button>
              <button onClick={handleSave} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
