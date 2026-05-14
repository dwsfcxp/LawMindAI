import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings as SettingsIcon, Plus, Trash2, CheckCircle, XCircle, Loader2, Zap, Globe, Building2, Lock, Database, Link2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Server, AlertCircle, Download, Upload, Save, RotateCcw, Activity, RefreshCw, TestTube, BarChart3, ShieldCheck, Clock } from 'lucide-react';
import { llmSettingsApi, externalApiConfigApi, appConfigApi, apiClient, type LLMSetting, type ExternalApiConfig, type ExternalApiPreset, type AppConfigItem } from '@/lib/api';
import { useToast } from '@/lib/toast';

interface Preset {
  key: string;
  name: string;
  category: string;
  base_url: string;
  model_name: string;
  max_tokens: number;
  locked: boolean;
}

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

/** Connection status indicator with visual feedback */
function StatusIndicator({ status }: { status: 'connected' | 'disconnected' | 'checking' | 'unknown' }) {
  switch (status) {
    case 'connected':
      return (
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-600 font-medium">已连接</span>
        </div>
      );
    case 'disconnected':
      return (
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="text-xs text-red-600 font-medium">未连接</span>
        </div>
      );
    case 'checking':
      return (
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
          <span className="text-xs text-blue-600">检测中</span>
        </div>
      );
    default:
      return <span className="text-xs text-muted-foreground">未检测</span>;
  }
}

/** Visual status dashboard for all services */
function StatusDashboard({ llmConfigs, apiConfigs, connectionStatuses, vectorStatus, onTestAll, testing }: {
  llmConfigs: LLMSetting[];
  apiConfigs: ExternalApiConfig[];
  connectionStatuses: Record<string, 'connected' | 'disconnected' | 'checking'>;
  vectorStatus: 'connected' | 'disconnected' | 'unknown';
  onTestAll: () => void;
  testing: boolean;
}) {
  const totalServices = llmConfigs.length + apiConfigs.filter(a => a.is_enabled).length + 1; // +1 for vector DB
  const connectedCount = Object.values(connectionStatuses).filter(s => s === 'connected').length + (vectorStatus === 'connected' ? 1 : 0);
  const healthPercent = totalServices > 0 ? Math.round((connectedCount / totalServices) * 100) : 0;

  let healthColor = 'text-green-600';
  let healthBg = 'bg-green-50 border-green-200';
  if (healthPercent < 50) { healthColor = 'text-red-600'; healthBg = 'bg-red-50 border-red-200'; }
  else if (healthPercent < 80) { healthColor = 'text-amber-600'; healthBg = 'bg-amber-50 border-amber-200'; }

  return (
    <div className={`rounded-lg border p-4 ${healthBg}`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          {/* Health circle */}
          <div className="relative h-14 w-14">
            <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="24" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
              <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="4"
                strokeDasharray={`${(healthPercent / 100) * 150.8} 150.8`} strokeLinecap="round"
                className={healthPercent >= 80 ? 'text-green-500' : healthPercent >= 50 ? 'text-amber-500' : 'text-red-500'} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-sm font-bold ${healthColor}`}>{healthPercent}%</span>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold">系统健康状态</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {connectedCount}/{totalServices} 服务正常运行
            </p>
          </div>
        </div>
        <button onClick={onTestAll} disabled={testing}
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
          测试全部连接
        </button>
      </div>
      {/* Service list */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* LLM services */}
        {llmConfigs.map(c => (
          <div key={`llm_${c.id}`} className="flex items-center justify-between rounded-md bg-white/60 px-3 py-1.5">
            <span className="text-xs font-medium truncate">{c.name}</span>
            <StatusIndicator status={connectionStatuses[`llm_${c.id}`] || 'unknown'} />
          </div>
        ))}
        {/* API services */}
        {apiConfigs.filter(a => a.is_enabled).map(c => (
          <div key={`api_${c.id}`} className="flex items-center justify-between rounded-md bg-white/60 px-3 py-1.5">
            <span className="text-xs font-medium truncate">{c.name}</span>
            <StatusIndicator status={connectionStatuses[`api_${c.id}`] || 'unknown'} />
          </div>
        ))}
        {/* Vector DB */}
        <div className="flex items-center justify-between rounded-md bg-white/60 px-3 py-1.5">
          <span className="text-xs font-medium">向量数据库</span>
          <StatusIndicator status={vectorStatus === 'unknown' ? 'unknown' : vectorStatus} />
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();

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
  const [apiLoading, setApiLoading] = useState(true);
  const [showApiModal, setShowApiModal] = useState(false);
  const [editingApiId, setEditingApiId] = useState<number | null>(null);
  const [apiForm, setApiForm] = useState({ ...emptyApiForm });
  const [apiFormError, setApiFormError] = useState('');
  const [testingApi, setTestingApi] = useState<number | null>(null);
  const [apiTestResult, setApiTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);
  const [showApiAdvanced, setShowApiAdvanced] = useState(false);

  // 向量DB配置
  const [vectorConfigs, setVectorConfigs] = useState<AppConfigItem[]>([]);
  const [vectorLoading, setVectorLoading] = useState(true);
  const [vectorTestStatus, setVectorTestStatus] = useState<'connected' | 'disconnected' | 'unknown'>('unknown');
  const [testingVector, setTestingVector] = useState(false);

  // 页面级错误
  const [pageError, setPageError] = useState('');
  const [llmFormError, setLlmFormError] = useState('');

  // 当前激活的Tab
  const [activeTab, setActiveTab] = useState<'llm' | 'external' | 'vector' | 'general'>('llm');

  // General config state
  const [generalConfig, setGeneralConfig] = useState({
    max_upload_size: '50',
    default_temperature: '0.7',
    default_document_format: 'docx',
  });
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, 'connected' | 'disconnected' | 'checking'>>({});
  const [testingAll, setTestingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // API usage stats (simulated from localStorage)
  const [apiUsageStats, setApiUsageStats] = useState<Record<string, { calls: number; lastUsed: string | null }>>({});

  // Form validation state
  const [formValidation, setFormValidation] = useState<Record<string, string>>({});

  useEffect(() => { loadConfigs(); loadPresets(); loadApiConfigs(); loadApiPresets(); loadVectorConfigs(); loadApiUsageStats(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showModal) { setShowModal(false); setEditingId(null); resetForm(); setLlmFormError(''); }
        if (showApiModal) { setShowApiModal(false); setEditingApiId(null); setApiForm({ ...emptyApiForm }); setShowApiAdvanced(false); setApiFormError(''); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showModal, showApiModal]);

  // Load API usage stats from localStorage
  const loadApiUsageStats = () => {
    try {
      const saved = localStorage.getItem('lawmind_api_usage');
      if (saved) setApiUsageStats(JSON.parse(saved));
    } catch {}
  };

  // Save API usage stat
  const trackApiCall = (serviceName: string) => {
    const updated = { ...apiUsageStats };
    if (!updated[serviceName]) updated[serviceName] = { calls: 0, lastUsed: null };
    updated[serviceName].calls += 1;
    updated[serviceName].lastUsed = new Date().toISOString();
    setApiUsageStats(updated);
    try { localStorage.setItem('lawmind_api_usage', JSON.stringify(updated)); } catch {}
  };

  // LLM配置逻辑
  const loadConfigs = async () => {
    try { setLoading(true); const data = await llmSettingsApi.list(); setConfigs(data); }
    catch { setPageError('加载LLM配置失败'); }
    finally { setLoading(false); }
  };

  const loadPresets = async () => {
    try { const res = await apiClient.get('/llm-settings/presets'); setPresets(res.data); }
    catch { /* presets load failed */ }
  };

  /** Validate LLM form before save */
  const validateLlmForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = '配置名称不能为空';
    if (!form.model_name.trim()) errors.model_name = '模型名称不能为空';
    if (!editingId && !form.api_key.trim()) errors.api_key = 'API Key 不能为空';
    if (form.base_url && !/^https?:\/\//.test(form.base_url.trim())) errors.base_url = 'Base URL 必须以 http:// 或 https:// 开头';
    if (form.max_tokens < 1 || form.max_tokens > 128000) errors.max_tokens = 'Max Tokens 应在 1-128000 之间';
    setFormValidation(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateLlmForm()) return;
    setLlmFormError('');
    try {
      if (editingId) {
        const updateData: Record<string, any> = { ...form };
        if (!updateData.api_key) delete updateData.api_key;
        await llmSettingsApi.update(editingId, updateData);
        toast({ type: 'success', title: '配置已更新' });
      }
      else { await llmSettingsApi.create(form); toast({ type: 'success', title: '配置已创建' }); }
      setShowModal(false); setEditingId(null); resetForm(); setFormValidation({}); loadConfigs();
    } catch { toast({ type: 'error', title: '保存失败', description: '请检查输入' }); }
  };

  const handleQuickAdd = (preset: Preset) => {
    setForm({ name: preset.name, base_url: preset.base_url, api_key: '', model_name: preset.model_name, max_tokens: preset.max_tokens, is_default: false });
    setEditingId(null); setShowModal(true); setFormValidation({});
  };

  const handleEdit = (c: LLMSetting) => {
    setForm({ name: c.name, base_url: c.base_url, api_key: '', model_name: c.model_name, max_tokens: c.max_tokens, is_default: c.is_default });
    setEditingId(c.id); setShowModal(true); setFormValidation({});
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此配置？')) return;
    try { await llmSettingsApi.delete(id); toast({ type: 'success', title: '配置已删除' }); loadConfigs(); }
    catch (e: any) { toast({ type: 'error', title: '删除失败', description: e.response?.data?.detail || '未知错误' }); }
  };

  const handleTest = async (c: LLMSetting) => {
    setTesting(c.id); setTestResult(null);
    trackApiCall(c.name);
    try {
      const result = await llmSettingsApi.testConnectivity({ base_url: c.base_url, api_key: '', model_name: c.model_name, setting_id: c.id });
      setTestResult({ id: c.id, success: result.success, message: result.message });
      setConnectionStatuses(prev => ({ ...prev, [`llm_${c.id}`]: result.success ? 'connected' : 'disconnected' }));
      if (result.success) toast({ type: 'success', title: '连接测试成功', description: result.message });
      else toast({ type: 'warning', title: '连接测试失败', description: result.message });
    } catch (e: any) { setTestResult({ id: c.id, success: false, message: e.message || '测试失败' }); toast({ type: 'error', title: '测试失败' }); }
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

  // 外部API配置逻辑
  const loadApiConfigs = async () => {
    try { setApiLoading(true); const data = await externalApiConfigApi.list(); setApiConfigs(data); }
    catch { setPageError('加载外部API配置失败'); }
    finally { setApiLoading(false); }
  };

  const loadApiPresets = async () => {
    try { const data = await externalApiConfigApi.presets(); setApiPresets(data); }
    catch { /* API presets load failed */ }
  };

  const handleApiSave = async () => {
    if (apiForm.base_url && !/^https?:\/\//.test(apiForm.base_url.trim())) {
      setApiFormError('Base URL 必须以 http:// 或 https:// 开头');
      return;
    }
    const jsonFields: { key: keyof typeof apiForm; label: string }[] = [
      { key: 'response_mapping', label: '响应字段映射' },
      { key: 'request_template', label: '请求参数模板' },
      { key: 'custom_headers', label: '自定义请求头' },
    ];
    for (const field of jsonFields) {
      const val = (apiForm as any)[field.key];
      if (val && val.trim()) {
        try { JSON.parse(val.trim()); }
        catch { setApiFormError(`${field.label} 不是有效的 JSON 格式`); return; }
      }
    }
    setApiFormError('');
    try {
      if (editingApiId) {
        const updateData: Record<string, any> = { ...apiForm };
        if (!updateData.auth_token) delete updateData.auth_token;
        if (!updateData.auth_password) delete updateData.auth_password;
        await externalApiConfigApi.update(editingApiId, updateData);
        toast({ type: 'success', title: '外部接口已更新' });
      }
      else { await externalApiConfigApi.create(apiForm); toast({ type: 'success', title: '外部接口已创建' }); }
      setShowApiModal(false); setEditingApiId(null); setApiForm({ ...emptyApiForm }); setShowApiAdvanced(false); setApiFormError(''); loadApiConfigs();
    } catch { toast({ type: 'error', title: '保存失败', description: '请检查输入' }); }
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
    try { await externalApiConfigApi.delete(id); toast({ type: 'success', title: '外部接口已删除' }); loadApiConfigs(); }
    catch (e: any) { toast({ type: 'error', title: '删除失败', description: e.response?.data?.detail || '未知错误' }); }
  };

  const handleApiToggle = async (id: number) => {
    try { await externalApiConfigApi.toggle(id); loadApiConfigs(); }
    catch (e: any) { toast({ type: 'error', title: '切换失败', description: e.response?.data?.detail || '未知错误' }); }
  };

  const handleApiTest = async (id: number) => {
    setTestingApi(id); setApiTestResult(null);
    const config = apiConfigs.find(c => c.id === id);
    if (config) trackApiCall(config.name);
    try {
      const result = await externalApiConfigApi.test(id);
      setApiTestResult({ id, success: result.success, message: result.message });
      setConnectionStatuses(prev => ({ ...prev, [`api_${id}`]: result.success ? 'connected' : 'disconnected' }));
      if (result.success) toast({ type: 'success', title: '接口测试成功', description: `延迟 ${result.latency_ms}ms` });
      else toast({ type: 'warning', title: '接口测试失败', description: result.message });
    } catch (e: any) { setApiTestResult({ id, success: false, message: e.message || '测试失败' }); toast({ type: 'error', title: '测试失败' }); }
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
    setEditingApiId(null); setApiFormError(''); setShowApiModal(true);
  };

  // 向量DB配置逻辑
  const loadVectorConfigs = async () => {
    try { setVectorLoading(true); const data = await appConfigApi.list('vector_db'); setVectorConfigs(data); }
    catch { setPageError('加载向量配置失败'); }
    finally { setVectorLoading(false); }
  };

  const handleVectorSave = async (id: number, value: string) => {
    try { await appConfigApi.update(id, { config_value: value }); toast({ type: 'success', title: '向量配置已保存' }); loadVectorConfigs(); }
    catch { toast({ type: 'error', title: '保存失败' }); }
  };

  const handleVectorReset = async () => {
    try { await appConfigApi.resetVectorConnection(); toast({ type: 'success', title: '向量数据库连接已重置' }); setVectorTestStatus('unknown'); }
    catch { toast({ type: 'error', title: '重置失败' }); }
  };

  /** Test vector DB connection */
  const handleTestVectorConnection = async () => {
    setTestingVector(true);
    try {
      const res = await apiClient.get('/vector/stats', { timeout: 15000 });
      const data = res.data;
      setVectorTestStatus(data.connected ? 'connected' : 'disconnected');
      if (data.connected) {
        toast({ type: 'success', title: '向量数据库连接成功', description: `Cases: ${data.cases_count}, Statutes: ${data.statutes_count}` });
      } else {
        toast({ type: 'warning', title: '向量数据库未连接' });
      }
    } catch {
      setVectorTestStatus('disconnected');
      toast({ type: 'error', title: '向量数据库连接失败' });
    } finally { setTestingVector(false); }
  };

  /** Test all connections at once */
  const handleTestAllConnections = async () => {
    setTestingAll(true);
    const statuses: Record<string, 'connected' | 'disconnected' | 'checking'> = {};

    // Mark all as checking
    for (const c of configs) statuses[`llm_${c.id}`] = 'checking';
    for (const c of apiConfigs) if (c.is_enabled) statuses[`api_${c.id}`] = 'checking';
    setConnectionStatuses({ ...statuses });

    // Test LLM configs
    for (const c of configs) {
      try {
        const result = await llmSettingsApi.testConnectivity({ base_url: c.base_url, api_key: '', model_name: c.model_name, setting_id: c.id });
        statuses[`llm_${c.id}`] = result.success ? 'connected' : 'disconnected';
      } catch { statuses[`llm_${c.id}`] = 'disconnected'; }
      setConnectionStatuses({ ...statuses });
    }

    // Test API configs
    for (const c of apiConfigs) {
      if (c.is_enabled) {
        try {
          const result = await externalApiConfigApi.test(c.id);
          statuses[`api_${c.id}`] = result.success ? 'connected' : 'disconnected';
        } catch { statuses[`api_${c.id}`] = 'disconnected'; }
      } else {
        statuses[`api_${c.id}`] = 'disconnected';
      }
      setConnectionStatuses({ ...statuses });
    }

    // Test vector DB
    try {
      const res = await apiClient.get('/vector/stats', { timeout: 15000 });
      setVectorTestStatus(res.data.connected ? 'connected' : 'disconnected');
    } catch { setVectorTestStatus('disconnected'); }

    setTestingAll(false);
    toast({ type: 'info', title: '全部连接检测完成' });
  };

  // General config handlers
  const handleGeneralSave = () => {
    // Validation
    const maxSize = parseInt(generalConfig.max_upload_size);
    const temp = parseFloat(generalConfig.default_temperature);
    if (isNaN(maxSize) || maxSize < 1 || maxSize > 500) {
      toast({ type: 'error', title: '保存失败', description: '最大上传大小应在 1-500 MB 之间' });
      return;
    }
    if (isNaN(temp) || temp < 0 || temp > 2) {
      toast({ type: 'error', title: '保存失败', description: 'Temperature 应在 0-2 之间' });
      return;
    }
    try {
      const configStr = JSON.stringify(generalConfig, null, 2);
      localStorage.setItem('lawmind_general_config', configStr);
      toast({ type: 'success', title: '通用配置已保存' });
    } catch { toast({ type: 'error', title: '保存失败' }); }
  };

  /** Reset all general config to defaults */
  const handleResetDefaults = () => {
    if (!confirm('确定恢复默认配置？这将重置所有通用设置为默认值。')) return;
    setGeneralConfig({
      max_upload_size: '50',
      default_temperature: '0.7',
      default_document_format: 'docx',
    });
    localStorage.removeItem('lawmind_general_config');
    toast({ type: 'success', title: '已恢复默认配置' });
  };

  const handleExportConfig = () => {
    try {
      const exportData = {
        general: generalConfig,
        llm_configs: configs.map(c => ({ name: c.name, base_url: c.base_url, model_name: c.model_name, max_tokens: c.max_tokens, is_default: c.is_default })),
        external_apis: apiConfigs.map(a => ({ name: a.name, base_url: a.base_url, auth_type: a.auth_type, is_enabled: a.is_enabled, category: a.category })),
        exported_at: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `lawmind_config_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast({ type: 'success', title: '配置已导出' });
    } catch { toast({ type: 'error', title: '导出失败' }); }
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.general) setGeneralConfig(data.general);
        toast({ type: 'success', title: '配置已导入', description: '请检查并保存各项设置' });
      } catch { toast({ type: 'error', title: '导入失败', description: '无效的配置文件格式' }); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Load general config from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lawmind_general_config');
      if (saved) setGeneralConfig(JSON.parse(saved));
    } catch {}
  }, []);

  // Render helpers
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
    <div className="max-w-5xl mx-auto space-y-6 px-4 sm:px-0">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">系统设置</h1>
      </div>

      {pageError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{pageError}</span>
          <button onClick={() => setPageError('')} className="ml-auto text-xs opacity-60 hover:opacity-100">关闭</button>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {[
          { key: 'llm' as const, label: 'LLM 配置', icon: Zap },
          { key: 'external' as const, label: '外部接口', icon: Link2 },
          { key: 'vector' as const, label: '向量数据库', icon: Database },
          { key: 'general' as const, label: '通用配置', icon: SettingsIcon },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <tab.icon className="h-4 w-4" /> <span className="hidden sm:inline">{tab.label}</span><span className="sm:hidden">{tab.label.slice(0, 4)}</span>
          </button>
        ))}
      </div>

      {/* ===== LLM 配置 ===== */}
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
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{c.name}</h3>
                        {c.is_default && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">默认</span>}
                        {c.name === '智谱 GLM' && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">内置</span>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 break-all">{c.base_url || '默认端点'} &middot; {c.model_name}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
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
                  {/* API usage stats */}
                  {apiUsageStats[c.name] && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <BarChart3 className="h-3 w-3" />
                      <span>调用次数: {apiUsageStats[c.name].calls}</span>
                      {apiUsageStats[c.name].lastUsed && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          最近调用: {new Date(apiUsageStats[c.name].lastUsed!).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">{domesticPresets.map(renderPresetCard)}</div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Globe className="h-4 w-4" /> 国际大模型
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">{internationalPresets.map(renderPresetCard)}</div>
        </div>

        {testResult && testResult.id === -1 && (
          <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${testResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {testResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {testResult.message}
            <button onClick={() => setTestResult(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">关闭</button>
          </div>
        )}

        <button onClick={() => { resetForm(); setEditingId(null); setLlmFormError(''); setFormValidation({}); setShowModal(true); }}
          className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full justify-center">
          <Plus className="h-4 w-4" /> 自定义添加其他模型
        </button>

        {/* LLM Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setShowModal(false); setEditingId(null); resetForm(); setLlmFormError(''); setFormValidation({}); }} role="dialog" aria-modal="true" aria-label="LLM配置">
            <div className="w-full max-w-lg rounded-lg bg-background p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold mb-4">{editingId ? '编辑配置' : '添加配置'}</h2>
              {llmFormError && (
                <div className="flex items-center gap-2 rounded-md p-2 text-sm bg-red-50 text-red-700 border border-red-200 mb-4">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {llmFormError}
                  <button onClick={() => setLlmFormError('')} className="ml-auto text-xs opacity-60 hover:opacity-100">关闭</button>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">配置名称</label>
                  <input className={`mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm ${formValidation.name ? 'border-red-300' : ''}`}
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：智谱GLM-4" />
                  {formValidation.name && <p className="text-xs text-red-600 mt-1">{formValidation.name}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium">Base URL</label>
                  <input className={`mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm ${formValidation.base_url ? 'border-red-300' : ''}`}
                    value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://open.bigmodel.cn/api/anthropic" />
                  {formValidation.base_url && <p className="text-xs text-red-600 mt-1">{formValidation.base_url}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium">API Key</label>
                  <input className={`mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm ${formValidation.api_key ? 'border-red-300' : ''}`}
                    type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder={editingId ? '留空则不修改' : '输入API Key'} />
                  {formValidation.api_key && <p className="text-xs text-red-600 mt-1">{formValidation.api_key}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium">模型名称</label>
                  <input className={`mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm ${formValidation.model_name ? 'border-red-300' : ''}`}
                    value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} placeholder="glm-5.1" />
                  {formValidation.model_name && <p className="text-xs text-red-600 mt-1">{formValidation.model_name}</p>}
                </div>
                <div>
                  <label className="text-sm font-medium">Max Tokens</label>
                  <input className={`mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm ${formValidation.max_tokens ? 'border-red-300' : ''}`}
                    type="number" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) || 4096 })} onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
                  {formValidation.max_tokens && <p className="text-xs text-red-600 mt-1">{formValidation.max_tokens}</p>}
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />设为默认配置</label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => { setShowModal(false); setEditingId(null); resetForm(); setLlmFormError(''); setFormValidation({}); }} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">取消</button>
                <button onClick={handleSave} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">保存</button>
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ===== 外部接口配置 ===== */}
      {activeTab === 'external' && (<>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Link2 className="h-4 w-4" /> 已配置的外部接口
          </h2>
          {apiLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : apiConfigs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">暂无外部接口配置。</p>
          ) : (
            <div className="space-y-3">
              {apiConfigs.map((c) => (
                <div key={c.id} className="rounded-lg border bg-card p-4 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{c.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.is_enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.is_enabled ? '已启用' : '已禁用'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${CATEGORY_COLORS[c.category] || CATEGORY_COLORS['custom']}`}>
                        {c.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
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
                  <p className="text-sm text-muted-foreground break-all">{c.description || c.base_url}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>认证: {AUTH_TYPE_LABELS[c.auth_type] || c.auth_type}</span>
                    {c.search_law_path && <span>法规端点: {c.search_law_path}</span>}
                    {c.search_case_path && <span>案例端点: {c.search_case_path}</span>}
                    {/* Usage stats */}
                    {apiUsageStats[c.name] && (
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        调用 {apiUsageStats[c.name].calls} 次
                      </span>
                    )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {apiPresets.map((preset) => (
              <div key={preset.key} className="rounded-lg border bg-card p-3 space-y-2 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{preset.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${CATEGORY_COLORS[preset.category] || ''}`}>{preset.category}</span>
                </div>
                <p className="text-xs text-muted-foreground">{preset.description}</p>
                <button onClick={() => handleApiPresetAdd(preset)}
                  className="w-full rounded-md bg-primary/10 px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/20">
                  <Plus className="h-3 w-3 inline mr-1" />添加配置
                </button>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => { setApiForm({ ...emptyApiForm }); setEditingApiId(null); setApiFormError(''); setShowApiModal(true); }}
          className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-full justify-center">
          <Plus className="h-4 w-4" /> 自定义添加任意REST API接口
        </button>

        {/* 外部API编辑弹窗 */}
        {showApiModal && (
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-2 sm:p-4 overflow-y-auto" onClick={() => { setShowApiModal(false); setEditingApiId(null); setApiForm({ ...emptyApiForm }); setShowApiAdvanced(false); setApiFormError(''); }} role="dialog" aria-modal="true" aria-label="外部接口配置">
            <div className="w-full max-w-2xl rounded-lg bg-background p-4 sm:p-6 shadow-xl max-h-[95vh] overflow-y-auto my-2 sm:my-0" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold mb-4">{editingApiId ? '编辑外部接口' : '添加外部接口'}</h2>
              {apiFormError && (
                <div className="flex items-center gap-2 rounded-md p-2 text-sm bg-red-50 text-red-700 border border-red-200 mb-4">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {apiFormError}
                  <button onClick={() => setApiFormError('')} className="ml-auto text-xs opacity-60 hover:opacity-100">关闭</button>
                </div>
              )}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Lock className="h-4 w-4" /> 认证配置</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className="text-xs font-medium">认证方式</label>
                      <select className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={apiForm.auth_type} onChange={(e) => setApiForm({ ...apiForm, auth_type: e.target.value })}>
                        <option value="none">无认证</option><option value="bearer">Bearer Token</option><option value="api_key">API Key (Header)</option><option value="basic">Basic Auth</option>
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

                <div className="border rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold">端点配置</h3>
                  {[
                    { label: '法规搜索', pathKey: 'search_law_path', methodKey: 'search_law_method' },
                    { label: '案例搜索', pathKey: 'search_case_path', methodKey: 'search_case_method' },
                    { label: '条文查询', pathKey: 'get_provision_path', methodKey: 'get_provision_method' },
                  ].map(ep => (
                    <div key={ep.pathKey} className="grid grid-cols-1 sm:grid-cols-[1fr_100px] gap-2 items-end">
                      <div>
                        <label className="text-xs font-medium">{ep.label} 路径</label>
                        <input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={(apiForm as any)[ep.pathKey]}
                          onChange={(e) => setApiForm({ ...apiForm, [ep.pathKey]: e.target.value })} placeholder="/api/search/law" />
                      </div>
                      <div>
                        <label className="text-xs font-medium">方法</label>
                        <select className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={(apiForm as any)[ep.methodKey]}
                          onChange={(e) => setApiForm({ ...apiForm, [ep.methodKey]: e.target.value })}>
                          <option value="GET">GET</option><option value="POST">POST</option>
                        </select>
                      </div>
                    </div>
                  ))}
                  <div><label className="text-xs font-medium">健康检查路径</label><input className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={apiForm.health_check_path} onChange={(e) => setApiForm({ ...apiForm, health_check_path: e.target.value })} placeholder="/health" /></div>
                </div>

                <div className="border rounded-lg p-4 space-y-3">
                  <button className="flex items-center gap-2 text-sm font-semibold w-full" onClick={() => setShowApiAdvanced(!showApiAdvanced)}>
                    {showApiAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} 高级配置
                  </button>
                  {showApiAdvanced && (<>
                    <div><label className="text-xs font-medium">自定义请求头 (JSON)</label><textarea className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono" rows={3} value={apiForm.custom_headers} onChange={(e) => setApiForm({ ...apiForm, custom_headers: e.target.value })} placeholder='{"X-Custom-Header": "value"}' /></div>
                    <div><label className="text-xs font-medium">请求参数模板 (JSON)</label><textarea className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono" rows={3} value={apiForm.request_template} onChange={(e) => setApiForm({ ...apiForm, request_template: e.target.value })} placeholder='{"search_depth": "basic"}' /></div>
                    <div><label className="text-xs font-medium">响应字段映射 (JSON)</label><textarea className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono" rows={5} value={apiForm.response_mapping} onChange={(e) => setApiForm({ ...apiForm, response_mapping: e.target.value })} placeholder='{"law": {"id": "id", "title": "title", "content": "content"}}' /></div>
                  </>)}
                </div>

                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={apiForm.is_enabled} onChange={(e) => setApiForm({ ...apiForm, is_enabled: e.target.checked })} />立即启用</label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => { setShowApiModal(false); setEditingApiId(null); setApiForm({ ...emptyApiForm }); setShowApiAdvanced(false); setApiFormError(''); }} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">取消</button>
                <button onClick={handleApiSave} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">保存</button>
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* ===== 向量数据库配置 ===== */}
      {activeTab === 'vector' && (<>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Database className="h-4 w-4" /> 向量数据库连接配置
            </h2>
            <button onClick={handleTestVectorConnection} disabled={testingVector}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
              {testingVector ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
              测试连接
            </button>
          </div>

          {/* Vector connection status */}
          {vectorTestStatus !== 'unknown' && (
            <div className={`flex items-center gap-2 rounded-md p-3 text-sm ${
              vectorTestStatus === 'connected' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {vectorTestStatus === 'connected' ? <ShieldCheck className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {vectorTestStatus === 'connected' ? '向量数据库连接正常' : '向量数据库连接失败，请检查配置'}
            </div>
          )}

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

        <div className="flex gap-3">
          <button onClick={handleVectorReset}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-accent">
            <Database className="h-4 w-4" /> 重置向量数据库连接
          </button>
        </div>
      </>)}

      {/* ===== 通用配置 ===== */}
      {activeTab === 'general' && (<>
        <div className="space-y-6">
          {/* Status Dashboard */}
          <StatusDashboard
            llmConfigs={configs}
            apiConfigs={apiConfigs}
            connectionStatuses={connectionStatuses}
            vectorStatus={vectorTestStatus}
            onTestAll={handleTestAllConnections}
            testing={testingAll}
          />

          {/* General Settings */}
          <div className="space-y-4 rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <SettingsIcon className="h-4 w-4" /> 通用设置
              </h2>
              <button onClick={handleResetDefaults}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">
                <RotateCcw className="h-3 w-3" /> 恢复默认
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">最大上传大小 (MB)</label>
                <input type="number" min="1" max="500"
                  className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={generalConfig.max_upload_size}
                  onChange={(e) => setGeneralConfig({ ...generalConfig, max_upload_size: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">设置文件上传的最大大小限制（1-500 MB）</p>
              </div>
              <div>
                <label className="text-sm font-medium">默认 LLM Temperature</label>
                <input type="number" min="0" max="2" step="0.1"
                  className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={generalConfig.default_temperature}
                  onChange={(e) => setGeneralConfig({ ...generalConfig, default_temperature: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">控制AI生成的随机性，0=确定性输出，2=高度随机（0-2）</p>
              </div>
              <div>
                <label className="text-sm font-medium">默认文书导出格式</label>
                <select className="mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  value={generalConfig.default_document_format}
                  onChange={(e) => setGeneralConfig({ ...generalConfig, default_document_format: e.target.value })}>
                  <option value="docx">Word (.docx)</option>
                  <option value="pdf">PDF (.pdf)</option>
                  <option value="markdown">Markdown (.md)</option>
                  <option value="html">HTML (.html)</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={handleGeneralSave} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Save className="h-4 w-4 inline mr-1" />保存通用设置
              </button>
            </div>
          </div>

          {/* API Usage Statistics */}
          {Object.keys(apiUsageStats).length > 0 && (
            <div className="space-y-3 rounded-xl border bg-card p-6">
              <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> API 调用统计
              </h2>
              <div className="space-y-2">
                {Object.entries(apiUsageStats).map(([name, stats]) => (
                  <div key={name} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <span className="text-sm font-medium">{name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{stats.calls} 次调用</span>
                    </div>
                    {stats.lastUsed && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(stats.lastUsed).toLocaleString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export / Import */}
          <div className="space-y-3 rounded-xl border bg-card p-6">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <RotateCcw className="h-4 w-4" /> 配置导入/导出
            </h2>
            <p className="text-xs text-muted-foreground">将当前配置导出为 JSON 文件备份，或从备份文件恢复配置。</p>
            <div className="flex gap-3">
              <button onClick={handleExportConfig}
                className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent">
                <Download className="h-4 w-4" /> 导出配置
              </button>
              <label className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent cursor-pointer">
                <Upload className="h-4 w-4" /> 导入配置
                <input type="file" accept=".json" className="hidden" onChange={handleImportConfig} />
              </label>
            </div>
          </div>
        </div>
      </>)}
    </div>
  );
}

// Vector config row component
function VectorConfigRow({ item, onSave }: { item: AppConfigItem; onSave: (id: number, value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.config_value);

  useEffect(() => { setValue(item.config_value); }, [item.config_value]);

  const handleSave = () => {
    onSave(item.id, value);
    setEditing(false);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-lg border bg-card p-3">
      <div className="flex-1">
        <div className="text-sm font-medium">{item.description || item.config_key}</div>
        <div className="text-xs text-muted-foreground">{item.config_key}</div>
      </div>
      {editing ? (
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input className="w-full sm:flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm" value={value}
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
