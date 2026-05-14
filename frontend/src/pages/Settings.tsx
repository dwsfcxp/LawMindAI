import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Plus, Trash2, CheckCircle, XCircle, Loader2, Zap, Globe, Building2, Lock, Database, Link2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Server } from 'lucide-react';
import { llmSettingsApi, externalApiConfigApi, appConfigApi, apiClient, type LLMSetting, type ExternalApiConfig, type ExternalApiPreset, type AppConfigItem } from '@/lib/api';

interface Preset {
  key: string;
  name: string;
  category: string;
  base_url: string;
  model_name: string;
  max_tokens: number;
  locked: boolean;
}

// ── 外部API表单状态 ──────────────────────────────────────
const emptyApiForm = {
  name: '', description: '', base_url: '', auth_type: 'none',
  auth_token: '', auth_header_name: 'Authorization',
  auth_username: '', auth_password: '', custom_headers: '{}',
  search_law_path: '', search_law_method: 'GET',
  search_case_path: '', search_case_method: 'GET',
  get_provision_path: '', get_provision_method: 'GET',
  health_check_path: '', response_mapping: '{}', request_template: '{}',
  is_enabled: true, category: 'custom',
};

export default function Settings() {
  // LLM配置
  const [configs, setConfigs] = useState<LLMSetting[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);
  const [quickTesting, setQuickTesting] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', base_url: '', api_key: '', model_name: '', max_tokens: 4096, is_default: false,
  });

  // 外部API配置
  const [apiConfigs, setApiConfigs] = useState<ExternalApiConfig[]>([]);
  const [apiPresets, setApiPresets] = useState<ExternalApiPreset[]>([]);
  const [showApiModal, setShowApiModal] = useState(false);
  const [editingApiId, setEditingApiId] = useState<number | null>(null);
  const [apiForm, setApiForm] = useState({ ...emptyApiForm });
  const [testingApi, setTestingApi] = useState<number | null>(null);
  const [apiTestResult, setApiTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);
  const [showApiAdvanced, setShowApiAdvanced] = useState(false);

  // 向量DB配置
  const [vectorConfigs, setVectorConfigs] = useState<AppConfigItem[]>([]);
  const [vectorLoading, setVectorLoading] = useState(false);

  // 当前激活的Tab
  const [activeTab, setActiveTab] = useState<'llm' | 'external' | 'vector'>('llm');

  useEffect(() => { loadConfigs(); loadPresets(); loadApiConfigs(); loadApiPresets(); loadVectorConfigs(); }, []);

  // ── LLM配置逻辑 ────────────────────────────────────────
  const loadConfigs = async () => {
    try { setLoading(true); const data = await llmSettingsApi.list(); setConfigs(data); }
    catch (e) { console.error('加载配置失败', e); }
    finally { setLoading(false); }
  };

  const loadPresets = async () => {
    try { const res = await apiClient.get('/llm-settings/presets'); setPresets(res.data); }
    catch (e) { console.error('加载预设失败', e); }
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        const updateData: Record<string, any> = { ...form };
        if (!updateData.api_key) delete updateData.api_key;
        await llmSettingsApi.update(editingId, updateData);
      }
      else { await llmSettingsApi.create(form); }
      setShowModal(false); setEditingId(null); resetForm(); loadConfigs();
    } catch (e) { console.error('保存失败', e); alert('保存失败，请检查输入'); }
  };

  const handleQuickAdd = (preset: Preset) => {
    setForm({ name: preset.name, base_url: preset.base_url, api_key: '', model_name: preset.model_name, max_tokens: preset.max_tokens, is_default: false });
    setEditingId(null); setShowModal(true);
  };

  const handleEdit = (c: LLMSetting) => {
    setForm({ name: c.name, base_url: c.base_url, api_key: '', model_name: c.model_name, max_tokens: c.max_tokens, is_default: c.is_default });
    setEditingId(c.id); setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此配置？')) return;
    try { await llmSettingsApi.delete(id); loadConfigs(); }
    catch (e: any) { alert(e.response?.data?.detail || '删除失败'); }
  };

  const handleTest = async (c: LLMSetting) => {
    setTesting(c.id); setTestResult(null);
    try {
      const result = await llmSettingsApi.testConnectivity({ base_url: c.base_url, api_key: '', model_name: c.model_name, setting_id: c.id });
      setTestResult({ id: c.id, success: result.success, message: result.message });
    } catch (e: any) { setTestResult({ id: c.id, success: false, message: e.message || '测试失败' }); }
    finally { setTesting(null); }
  };

  const handleQuickTest = async (preset: Preset) => {
    setQuickTesting(preset.key); setTestResult(null);
    try {
      const result = await llmSettingsApi.testConnectivity({ base_url: preset.base_url, api_key: '', model_name: preset.model_name });
      setTestResult({ id: -1, success: result.success, message: `${preset.name}: ${result.message}` });
    } catch (e: any) { setTestResult({ id: -1, success: false, message: `${preset.name}: 测试失败` }); }
    finally { setQuickTesting(null); }
  };

  const resetForm = () => setForm({ name: '', base_url: '', api_key: '', model_name: '', max_tokens: 4096, is_default: false });

  // ── 外部API配置逻辑 ────────────────────────────────────────
  const loadApiConfigs = async () => {
    try { const data = await externalApiConfigApi.list(); setApiConfigs(data); }
    catch (e) { console.error('加载外部API配置失败', e); }
  };

  const loadApiPresets = async () => {
    try { const data = await externalApiConfigApi.presets(); setApiPresets(data); }
    catch (e) { console.error('加载外部API预设失败', e); }
  };

  const handleApiSave = async () => {
    try {
      if (editingApiId) {
        const updateData: Record<string, any> = { ...apiForm };
        if (!updateData.auth_token) delete updateData.auth_token;
        if (!updateData.auth_password) delete updateData.auth_password;
        await externalApiConfigApi.update(editingApiId, updateData);
      }
      else { await externalApiConfigApi.create(apiForm); }
      setShowApiModal(false); setEditingApiId(null); setApiForm({ ...emptyApiForm }); setShowApiAdvanced(false); loadApiConfigs();
    } catch (e) { console.error('保存失败', e); alert('保存失败，请检查输入'); }
  };

  const handleApiEdit = (c: ExternalApiConfig) => {
    setApiForm({
      name: c.name, description: c.description, base_url: c.base_url,
      auth_type: c.auth_type, auth_token: '', auth_header_name: c.auth_header_name,
      auth_username: c.auth_username, auth_password: '', custom_headers: c.custom_headers,
      search_law_path: c.search_law_path, search_law_method: c.search_law_method,
      search_case_path: c.search_case_path, search_case_method: c.search_case_method,
      get_provision_path: c.get_provision_path, get_provision_method: c.get_provision_method,
      health_check_path: c.health_check_path, response_mapping: c.response_mapping,
      request_template: c.request_template, is_enabled: c.is_enabled, category: c.category,
    });
    setEditingApiId(c.id); setShowApiModal(true);
  };

  const handleApiDelete = async (id: number) => {
    if (!confirm('确定删除此外部API配置？')) return;
    try { await externalApiConfigApi.delete(id); loadApiConfigs(); }
    catch (e: any) { alert(e.response?.data?.detail || '删除失败'); }
  };

  const handleApiToggle = async (id: number) => {
    try { await externalApiConfigApi.toggle(id); loadApiConfigs(); }
    catch (e: any) { alert(e.response?.data?.detail || '切换失败'); }
  };

  const handleApiTest = async (id: number) => {
    setTestingApi(id); setApiTestResult(null);
    try {
      const result = await externalApiConfigApi.test(id);
      setApiTestResult({ id, success: result.success, message: result.message });
    } catch (e: any) { setApiTestResult({ id, success: false, message: e.message || '测试失败' }); }
    finally { setTestingApi(null); }
  };

  const handleApiPresetAdd = (preset: ExternalApiPreset) => {
    setApiForm({
      ...emptyApiForm,
      name: preset.name, description: preset.description, base_url: preset.base_url,
      auth_type: preset.auth_type, search_law_path: preset.search_law_path,
      search_law_method: preset.search_law_method, search_case_path: preset.search_case_path,
      search_case_method: preset.search_case_method, get_provision_path: preset.get_provision_path,
      get_provision_method: preset.get_provision_method, health_check_path: preset.health_check_path,
      response_mapping: preset.response_mapping, request_template: preset.request_template,
      category: preset.category,
    });
    setEditingApiId(null); setShowApiModal(true);
  };

  // ── 向量DB配置逻辑 ────────────────────────────────────────
  const loadVectorConfigs = async () => {
    try { setVectorLoading(true); const data = await appConfigApi.list('vector_db'); setVectorConfigs(data); }
    catch (e) { console.error('加载向量配置失败', e); }
    finally { setVectorLoading(false); }
  };

  const handleVectorSave = async (id: number, value: string) => {
    try { await appConfigApi.update(id, { config_value: value }); loadVectorConfigs(); }
    catch (e) { console.error('保存失败', e); alert('保存失败'); }
  };

  const handleVectorReset = async () => {
    try { await appConfigApi.resetVectorConnection(); alert('向量数据库连接已重置'); }
    catch (e) { console.error('重置失败', e); }
  };

  // ── 渲染辅助 ────────────────────────────────────────
  const domesticPresets = presets.filter(p => p.category === '国内');
  const internationalPresets = presets.filter(p => p.category === '国际');
  const configuredKeys = new Set(configs.map(c => c.name));

  const AUTH_TYPE_LABELS: Record<string, string> = {
    none: '无认证', bearer: 'Bearer Token', api_key: 'API Key', basic: 'Basic Auth', custom: '自定义',
  };

  const CATEGORY_COLORS: Record<string, string> = {
    '法律数据库': 'bg-blue-100 text-blue-700',
    '搜索引擎': 'bg-green-100 text-green-700',
    '通用': 'bg-gray-100 text-gray-700',
    'custom': 'bg-purple-100 text-purple-700',
  };

  const renderPresetCard = (preset: Preset) => {
    const configured = configuredKeys.has(preset.name);
    return (
      <div key={preset.key} className={`rounded-lg border p-3 space-y-2 ${configured ? 'bg-muted/30' : 'bg-card hover:shadow-sm transition-shadow'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{preset.name}</span>
            {preset.locked && <Lock className="h-3 w-3 text-amber-500" />}
            {configured && <span className="text-xs text-green-600">已配置</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => handleQuickTest(preset)} disabled={quickTesting === preset.key}
              className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50">
              {quickTesting === preset.key ? <Loader2 className="h-3 w-3 animate-spin" /> : '测试'}
            </button>
            {!preset.locked && !configured && (
              <button onClick={() => handleQuickAdd(preset)} className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90">
                <Plus className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground truncate">{preset.model_name}</div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">系统设置</h1>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b">
        {[
          { key: 'llm' as const, label: 'LLM 配置', icon: Zap },
          { key: 'external' as const, label: '外部接口', icon: Link2 },
          { key: 'vector' as const, label: '向量数据库', icon: Database },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ LLM 配置 ═══ */}
      {activeTab === 'llm' && (<>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Zap className="h-4 w-4" /> 已启用的模型
          </h2>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : configs.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无配置</p>
          ) : (
            <div className="space-y-3">
              {configs.map((c) => (
                <div key={c.id} className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{c.name}</h3>
                        {c.is_default && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">默认</span>}
                        {c.name === '智谱 GLM' && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">内置</span>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{c.base_url || '默认端点'} &middot; {c.model_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleTest(c)} disabled={testing === c.id}
                        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
                        {testing === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '测试连接'}
                      </button>
                      <button onClick={() => handleEdit(c)} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">编辑</button>
                      {c.name !== '智谱 GLM' && (
                        <button onClick={() => handleDelete(c.id)} className="rounded-md border px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">API Key: {c.api_key_masked} &middot; Max Tokens: {c.max_tokens}</div>
                  {testResult && testResult.id === c.id && (
                    <div className={`flex items-center gap-2 rounded-md p-2 text-sm ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {testResult.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4" /> 国内大模型
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{domesticPresets.map(renderPresetCard)}</div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Globe className="h-4 w-4" /> 国际大模型
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{internationalPresets.map(renderPresetCard)}</div>
        </div>

        {testResult && testResult.id === -1 && (
          <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {testResult.message}
            <button onClick={() => setTestResult(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">关闭</button>
          </div>
        )}

        <button onClick={() => { resetForm(); setEditingId(null); setShowModal(true); }}
          className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full justify-center">
          <Plus className="h-4 w-4" /> 自定义添加其他模型
        </button>

        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setShowModal(false); setEditingId(null); resetForm(); }}>
            <div className="w-full max-w-lg rounded-lg bg-background p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold mb-4">{editingId ? '编辑配置' : '添加配置'}</h2>
              <div className="space-y-4">
                <div><label className="text-sm font-medium">配置名称</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：智谱GLM-4" /></div>
                <div><label className="text-sm font-medium">Base URL</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://open.bigmodel.cn/api/anthropic" /></div>
                <div><label className="text-sm font-medium">API Key</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder={editingId ? '留空则不修改' : '输入API Key'} /></div>
                <div><label className="text-sm font-medium">模型名称</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} placeholder="glm-5.1" /></div>
                <div><label className="text-sm font-medium">Max Tokens</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" type="number" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) || 4096 })} /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />设为默认配置</label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => { setShowModal(false); setEditingId(null); resetForm(); }} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">取消</button>
                <button onClick={handleSave} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">保存</button>
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ═══ 外部接口配置 ═══ */}
      {activeTab === 'external' && (<>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Link2 className="h-4 w-4" /> 已配置的外部接口
          </h2>
          {apiConfigs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">暂无外部接口配置，点击下方预设模板快速添加，或自定义添加。</p>
          ) : (
            <div className="space-y-3">
              {apiConfigs.map((c) => (
                <div key={c.id} className="rounded-lg border bg-card p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{c.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.is_enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.is_enabled ? '已启用' : '已禁用'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${CATEGORY_COLORS[c.category] || CATEGORY_COLORS['custom']}`}>
                        {c.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleApiToggle(c.id)} className="rounded-md border px-2 py-1 text-xs hover:bg-accent" title={c.is_enabled ? '禁用' : '启用'}>
                        {c.is_enabled ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                      </button>
                      <button onClick={() => handleApiTest(c.id)} disabled={testingApi === c.id}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50">
                        {testingApi === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : '测试'}
                      </button>
                      <button onClick={() => handleApiEdit(c)} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">编辑</button>
                      <button onClick={() => handleApiDelete(c.id)} className="rounded-md border px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{c.description || c.base_url}</p>
                  <div className="text-xs text-muted-foreground">
                    认证: {AUTH_TYPE_LABELS[c.auth_type] || c.auth_type}
                    {c.search_law_path && <span className="ml-2">| 法规端点: {c.search_law_path}</span>}
                    {c.search_case_path && <span className="ml-2">| 案例端点: {c.search_case_path}</span>}
                  </div>
                  {apiTestResult && apiTestResult.id === c.id && (
                    <div className={`flex items-center gap-2 rounded-md p-2 text-sm ${apiTestResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {apiTestResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {apiTestResult.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 预设模板 */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Server className="h-4 w-4" /> 快速添加预设接口
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {apiPresets.map((preset) => (
              <div key={preset.key} className="rounded-lg border bg-card p-3 space-y-2 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{preset.name}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-xs ${CATEGORY_COLORS[preset.category] || ''}`}>{preset.category}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                  </div>
                </div>
                <button onClick={() => handleApiPresetAdd(preset)}
                  className="w-full rounded-md bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
                  <Plus className="h-3 w-3 inline mr-1" />添加配置
                </button>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => { setApiForm({ ...emptyApiForm }); setEditingApiId(null); setShowApiModal(true); }}
          className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full justify-center">
          <Plus className="h-4 w-4" /> 自定义添加任意REST API接口
        </button>

        {/* 外部API编辑弹窗 */}
        {showApiModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setShowApiModal(false); setEditingApiId(null); setApiForm({ ...emptyApiForm }); setShowApiAdvanced(false); }}>
            <div className="w-full max-w-2xl rounded-lg bg-background p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold mb-4">{editingApiId ? '编辑外部接口' : '添加外部接口'}</h2>
              <div className="space-y-4">
                {/* 基本信息 */}
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-sm font-medium">接口名称 *</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={apiForm.name} onChange={(e) => setApiForm({ ...apiForm, name: e.target.value })} placeholder="如：元典法律检索" /></div>
                  <div><label className="text-sm font-medium">分类</label>
                    <select className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={apiForm.category} onChange={(e) => setApiForm({ ...apiForm, category: e.target.value })}>
                      <option value="法律数据库">法律数据库</option>
                      <option value="搜索引擎">搜索引擎</option>
                      <option value="通用">通用</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>
                </div>
                <div><label className="text-sm font-medium">描述</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={apiForm.description} onChange={(e) => setApiForm({ ...apiForm, description: e.target.value })} placeholder="接口用途说明" /></div>
                <div><label className="text-sm font-medium">Base URL *</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={apiForm.base_url} onChange={(e) => setApiForm({ ...apiForm, base_url: e.target.value })} placeholder="https://api.example.com" /></div>

                {/* 认证配置 */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Lock className="h-4 w-4" /> 认证配置
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-medium">认证方式</label>
                      <select className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={apiForm.auth_type} onChange={(e) => setApiForm({ ...apiForm, auth_type: e.target.value })}>
                        <option value="none">无认证</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="api_key">API Key (Header)</option>
                        <option value="basic">Basic Auth</option>
                      </select>
                    </div>
                    <div>
                      {apiForm.auth_type === 'bearer' && (<><label className="text-xs font-medium">Token</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" type="password" value={apiForm.auth_token} onChange={(e) => setApiForm({ ...apiForm, auth_token: e.target.value })} placeholder="Bearer Token" /></>)}
                      {apiForm.auth_type === 'api_key' && (<>
                        <div><label className="text-xs font-medium">Header 名称</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={apiForm.auth_header_name} onChange={(e) => setApiForm({ ...apiForm, auth_header_name: e.target.value })} placeholder="X-API-Key" /></div>
                        <div className="mt-2"><label className="text-xs font-medium">API Key</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" type="password" value={apiForm.auth_token} onChange={(e) => setApiForm({ ...apiForm, auth_token: e.target.value })} placeholder="API Key" /></div>
                      </>)}
                      {apiForm.auth_type === 'basic' && (<>
                        <div><label className="text-xs font-medium">用户名</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={apiForm.auth_username} onChange={(e) => setApiForm({ ...apiForm, auth_username: e.target.value })} /></div>
                        <div className="mt-2"><label className="text-xs font-medium">密码</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" type="password" value={apiForm.auth_password} onChange={(e) => setApiForm({ ...apiForm, auth_password: e.target.value })} /></div>
                      </>)}
                    </div>
                  </div>
                </div>

                {/* 端点配置 */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold">端点配置</h3>
                  {[
                    { label: '法规搜索', pathKey: 'search_law_path', methodKey: 'search_law_method' },
                    { label: '案例搜索', pathKey: 'search_case_path', methodKey: 'search_case_method' },
                    { label: '条文查询', pathKey: 'get_provision_path', methodKey: 'get_provision_method' },
                  ].map(ep => (
                    <div key={ep.pathKey} className="grid grid-cols-[1fr_100px] gap-2 items-end">
                      <div>
                        <label className="text-xs font-medium">{ep.label} 路径</label>
                        <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={(apiForm as any)[ep.pathKey]}
                          onChange={(e) => setApiForm({ ...apiForm, [ep.pathKey]: e.target.value })} placeholder="/api/search/law" />
                      </div>
                      <div>
                        <label className="text-xs font-medium">方法</label>
                        <select className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={(apiForm as any)[ep.methodKey]}
                          onChange={(e) => setApiForm({ ...apiForm, [ep.methodKey]: e.target.value })}>
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                        </select>
                      </div>
                    </div>
                  ))}
                  <div><label className="text-xs font-medium">健康检查路径</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={apiForm.health_check_path} onChange={(e) => setApiForm({ ...apiForm, health_check_path: e.target.value })} placeholder="/health" /></div>
                </div>

                {/* 高级配置 */}
                <div className="border rounded-lg p-4 space-y-3">
                  <button className="flex items-center gap-2 text-sm font-semibold w-full" onClick={() => setShowApiAdvanced(!showApiAdvanced)}>
                    {showApiAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} 高级配置
                  </button>
                  {showApiAdvanced && (<>
                    <div><label className="text-xs font-medium">自定义请求头 (JSON)</label><textarea className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono" rows={3} value={apiForm.custom_headers} onChange={(e) => setApiForm({ ...apiForm, custom_headers: e.target.value })} placeholder='{"X-Custom-Header": "value"}' /></div>
                    <div><label className="text-xs font-medium">请求参数模板 (JSON)</label><textarea className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono" rows={3} value={apiForm.request_template} onChange={(e) => setApiForm({ ...apiForm, request_template: e.target.value })} placeholder='{"search_depth": "basic"}' /></div>
                    <div><label className="text-xs font-medium">响应字段映射 (JSON)</label><textarea className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono" rows={5} value={apiForm.response_mapping} onChange={(e) => setApiForm({ ...apiForm, response_mapping: e.target.value })} placeholder={'{"law": {"id": "id", "title": "title", "content": "content"}, "case": {"id": "id", "title": "title", "content": "summary"}'} /></div>
                  </>)}
                </div>

                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={apiForm.is_enabled} onChange={(e) => setApiForm({ ...apiForm, is_enabled: e.target.checked })} />立即启用</label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => { setShowApiModal(false); setEditingApiId(null); setApiForm({ ...emptyApiForm }); setShowApiAdvanced(false); }} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">取消</button>
                <button onClick={handleApiSave} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">保存</button>
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ═══ 向量数据库配置 ═══ */}
      {activeTab === 'vector' && (<>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Database className="h-4 w-4" /> 向量数据库连接配置
          </h2>
          {vectorLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-3">
              {vectorConfigs.map((c) => (
                <VectorConfigRow key={c.id} item={c} onSave={handleVectorSave} />
              ))}
            </div>
          )}
        </div>

        <button onClick={handleVectorReset}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-accent">
          <Database className="h-4 w-4" /> 重置向量数据库连接
        </button>
      </>)}
    </div>
  );
}

// ── 向量配置行组件 ──────────────────────────────────────
function VectorConfigRow({ item, onSave }: { item: AppConfigItem; onSave: (id: number, value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.config_value);

  useEffect(() => { setValue(item.config_value); }, [item.config_value]);

  const handleSave = () => {
    onSave(item.id, value);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className="flex-1">
        <div className="text-sm font-medium">{item.description || item.config_key}</div>
        <div className="text-xs text-muted-foreground">{item.config_key}</div>
      </div>
      {editing ? (
        <div className="flex items-center gap-2 flex-1">
          <input className="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm" value={value}
            onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
          <button onClick={handleSave} className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90">保存</button>
          <button onClick={() => { setEditing(false); setValue(item.config_value); }} className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">取消</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground max-w-xs truncate">{item.config_value || '(默认)'}</span>
          <button onClick={() => setEditing(true)} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">编辑</button>
        </div>
      )}
    </div>
  );
}
