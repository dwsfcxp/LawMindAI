import axios, { type AxiosRequestConfig, type AxiosResponse, type CancelTokenSource } from 'axios';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 180000,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
  },
});

// ── Timeout presets ────────────────────────────────────────────────────
export const TIMEOUT = {
  short: 15_000,    // GET endpoints (fast reads)
  medium: 60_000,  // Standard mutations
  long: 120_000,   // File uploads / exports
  ai: 300_000,     // AI generation / review tasks
} as const;

// ── Request interceptor: attach JWT token ──────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

let isRedirecting = false;

// ── Response interceptor: handle 401 + retry on network error ─────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 — redirect to login
    if (error.response?.status === 401 && !isRedirecting) {
      isRedirecting = true;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Retry once on network errors (no response) if not already retried
    if (!error.response && !originalRequest._retried) {
      originalRequest._retried = true;
      try {
        return await apiClient(originalRequest);
      } catch {
        // second attempt failed, fall through to reject
      }
    }

    return Promise.reject(error);
  },
);

// ── Cancellation helpers ───────────────────────────────────────────────
const cancelTokenSources = new Map<string, CancelTokenSource>();

export function createCancelToken(key: string): CancelTokenSource {
  // Cancel any previous request with the same key
  const existing = cancelTokenSources.get(key);
  if (existing) {
    existing.cancel(`Cancelled by newer request: ${key}`);
  }
  const source = axios.CancelToken.source();
  cancelTokenSources.set(key, source);
  return source;
}

export function cancelRequest(key: string) {
  const source = cancelTokenSources.get(key);
  if (source) {
    source.cancel(`Manually cancelled: ${key}`);
    cancelTokenSources.delete(key);
  }
}

// ── Request deduplication ──────────────────────────────────────────────
const pendingRequests = new Map<string, Promise<any>>();

/**
 * Deduplicate concurrent GET requests with the same URL+params.
 * If an identical request is already in-flight, returns the same Promise.
 * Otherwise, makes the request and caches it until completion.
 */
export function dedupedGet<T>(url: string, params?: Record<string, any>, config?: AxiosRequestConfig): Promise<T> {
  const cacheKey = `GET:${url}:${JSON.stringify(params || {})}`;
  const existing = pendingRequests.get(cacheKey);
  if (existing) return existing;

  const promise = apiClient.get(url, { params, ...config })
    .then(res => res.data as T)
    .finally(() => { pendingRequests.delete(cacheKey); });

  pendingRequests.set(cacheKey, promise);
  return promise;
}

// ── Response type validation ───────────────────────────────────────────
export function validateResponse<T>(
  data: unknown,
  requiredKeys: (keyof T)[],
): data is T {
  if (typeof data !== 'object' || data === null) return false;
  return requiredKeys.every((key) => key in data);
}

export function ensureTypedResponse<T>(
  res: AxiosResponse,
  requiredKeys: (keyof T)[],
): T {
  if (!validateResponse<T>(res.data, requiredKeys)) {
    throw new Error('Unexpected response shape from server');
  }
  return res.data;
}

// ── Blob download helper ───────────────────────────────────────────────
export async function downloadBlob(
  fetchBlob: () => Promise<Blob>,
  filename: string,
): Promise<void> {
  const blob = await fetchBlob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ── Types ──────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface Case {
  id: number;
  title: string;
  case_type: string;
  status: string;
  description?: string;
  plaintiff?: string;
  defendant?: string;
  court?: string;
  case_number?: string;
  created_at: string;
  updated_at: string;
  document_count?: number;
}

export interface CaseCreate {
  title: string;
  case_type: string;
  plaintiff?: string;
  defendant?: string;
  description?: string;
  court?: string;
}

export interface Document {
  id: number;
  type: string;
  title: string;
  content: string;
  status: string;
  version: number;
  case_id?: number;
  template_id?: number;
  ai_metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: number;
  name: string;
  type: string;
  description?: string;
  structure?: any;
  ai_prompt?: string;
  format_rules?: any;
  variables?: any[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface SearchResults {
  query: string;
  laws: any[];
  cases: any[];
  total: number;
  sources_used: string[];
}

// ── Auth API ───────────────────────────────────────────────────────────

export const authApi = {
  login: async (email: string, password: string): Promise<{ access_token: string; user: any }> => {
    const res = await apiClient.post('/auth/login', { email, password }, { timeout: TIMEOUT.medium });
    const token = res.data.access_token;
    const userRes = await apiClient.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: TIMEOUT.short,
    });
    return { access_token: token, user: userRes.data };
  },

  register: async (data: {
    email: string;
    password: string;
    name: string;
  }): Promise<{ access_token: string; user: any }> => {
    await apiClient.post('/auth/register', data, { timeout: TIMEOUT.medium });
    const loginRes = await apiClient.post('/auth/login', {
      email: data.email,
      password: data.password,
    }, { timeout: TIMEOUT.medium });
    const token = loginRes.data.access_token;
    const userRes = await apiClient.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: TIMEOUT.short,
    });
    return { access_token: token, user: userRes.data };
  },

  getMe: async (): Promise<User> => {
    const res = await apiClient.get('/auth/me', { timeout: TIMEOUT.short });
    return res.data;
  },
};

// ── Cases API ──────────────────────────────────────────────────────────

export const caseApi = {
  list: async (params?: {
    status?: string;
    case_type?: string;
    skip?: number;
    limit?: number;
  }): Promise<Case[]> => {
    const res = await apiClient.get('/cases', { params, timeout: TIMEOUT.short });
    return res.data;
  },

  create: async (data: CaseCreate): Promise<Case> => {
    const res = await apiClient.post('/cases', data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  get: async (id: number): Promise<Case> => {
    const res = await apiClient.get(`/cases/${id}`, { timeout: TIMEOUT.short });
    return res.data;
  },

  update: async (id: number, data: Partial<CaseCreate & { status: string }>): Promise<Case> => {
    const res = await apiClient.put(`/cases/${id}`, data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  analyze: async (id: number): Promise<{ case_id: number; analysis: string }> => {
    const res = await apiClient.post(`/cases/${id}/analyze`, null, { timeout: TIMEOUT.ai });
    return res.data;
  },
};

// ── Documents API ──────────────────────────────────────────────────────

export const documentApi = {
  list: async (params?: {
    case_id?: number;
    type?: string;
    skip?: number;
    limit?: number;
  }): Promise<Document[]> => {
    const res = await apiClient.get('/documents', { params, timeout: TIMEOUT.short });
    return res.data;
  },

  generate: async (data: {
    type: string;
    case_facts: string;
    case_id?: number;
    template_id?: number;
    extra_instructions?: string;
    research_report_ids?: number[];
  }, cancelKey?: string): Promise<Document> => {
    const config: AxiosRequestConfig = { timeout: TIMEOUT.ai };
    if (cancelKey) {
      config.cancelToken = createCancelToken(cancelKey).token;
    }
    const res = await apiClient.post('/documents/generate', data, config);
    return res.data;
  },

  extractText: async (file: File): Promise<{ filename: string; text: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post('/documents/extract-text', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: TIMEOUT.long,
    });
    return res.data;
  },

  get: async (id: number): Promise<Document> => {
    const res = await apiClient.get(`/documents/${id}`, { timeout: TIMEOUT.short });
    return res.data;
  },

  update: async (id: number, data: { title?: string; content?: string; status?: string }): Promise<Document> => {
    const res = await apiClient.put(`/documents/${id}`, data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  exportWord: async (id: number): Promise<Blob> => {
    const res = await apiClient.post(`/documents/${id}/export`, { format: 'docx' }, {
      responseType: 'blob',
      timeout: TIMEOUT.long,
    });
    return res.data;
  },

  exportMarkdown: async (id: number): Promise<Blob> => {
    const res = await apiClient.post(`/documents/${id}/export`, { format: 'markdown' }, {
      responseType: 'blob',
      timeout: TIMEOUT.long,
    });
    return res.data;
  },

  exportHtml: async (id: number): Promise<Blob> => {
    const res = await apiClient.post(`/documents/${id}/export`, { format: 'html' }, {
      responseType: 'blob',
      timeout: TIMEOUT.long,
    });
    return res.data;
  },

  exportPdf: async (id: number): Promise<Blob> => {
    const res = await apiClient.post(`/documents/${id}/export`, { format: 'pdf' }, {
      responseType: 'blob',
      timeout: TIMEOUT.long,
    });
    return res.data;
  },

  verifyLaws: async (id: number): Promise<{
    document_id: number;
    verification_results: any[];
    total: number;
  }> => {
    const res = await apiClient.post(`/documents/${id}/verify-laws`, null, {
      timeout: TIMEOUT.ai,
    });
    return res.data;
  },

  review: async (id: number): Promise<Document> => {
    const res = await apiClient.post(`/documents/${id}/review`, null, {
      timeout: TIMEOUT.ai,
    });
    return res.data;
  },

  generateBundle: async (data: {
    case_id?: number;
    doc_types?: string[];
    preset?: string;
    case_facts: string;
    extra_instructions?: string;
    research_report_ids?: number[];
  }): Promise<{ documents: any[]; consistency_check: any; total: number }> => {
    const res = await apiClient.post('/documents/generate-bundle', data, {
      timeout: TIMEOUT.ai,
    });
    return res.data;
  },

  qualityCheck: async (id: number): Promise<{
    document_id: number;
    quality_check: {
      passed: boolean;
      issues: any[];
      checks: any[];
      quality_score: number;
      summary: string;
    };
  }> => {
    const res = await apiClient.post(`/documents/${id}/quality-check`, null, {
      timeout: TIMEOUT.ai,
    });
    return res.data;
  },
};

// ── Templates API ──────────────────────────────────────────────────────

export const templateApi = {
  list: async (params?: { type?: string }): Promise<Template[]> => {
    const res = await apiClient.get('/templates', { params, timeout: TIMEOUT.short });
    return res.data;
  },

  create: async (data: any): Promise<Template> => {
    const res = await apiClient.post('/templates', data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  get: async (id: number): Promise<Template> => {
    const res = await apiClient.get(`/templates/${id}`, { timeout: TIMEOUT.short });
    return res.data;
  },

  update: async (id: number, data: any): Promise<Template> => {
    const res = await apiClient.put(`/templates/${id}`, data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/templates/${id}`, { timeout: TIMEOUT.medium });
  },
};

// ── Search API ─────────────────────────────────────────────────────────

export const searchApi = {
  search: async (params: {
    query: string;
    result_type?: string;
    top_k?: number;
  }): Promise<SearchResults> => {
    const res = await apiClient.post('/search', params, { timeout: TIMEOUT.medium });
    return res.data;
  },
};

// ── Evidence API ──────────────────────────────────────────────────────

export interface EvidenceItem {
  id: number;
  case_id: number;
  type: string;
  title: string;
  file_path: string | null;
  ocr_text: string | null;
  tags: string[] | null;
  sort_order: number;
  analysis: string | null;
  has_file: boolean;
  created_at: string;
}

export const evidenceApi = {
  list: async (caseId: number): Promise<EvidenceItem[]> => {
    const res = await apiClient.get('/evidence', { params: { case_id: caseId }, timeout: TIMEOUT.short });
    return res.data;
  },

  create: async (data: {
    case_id: number;
    type: string;
    title: string;
    tags?: string[];
  }): Promise<EvidenceItem> => {
    const res = await apiClient.post('/evidence', data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  upload: async (id: number, file: File): Promise<EvidenceItem> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post(`/evidence/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: TIMEOUT.long,
    });
    return res.data;
  },

  get: async (id: number): Promise<EvidenceItem> => {
    const res = await apiClient.get(`/evidence/${id}`, { timeout: TIMEOUT.short });
    return res.data;
  },

  update: async (id: number, data: {
    title?: string;
    type?: string;
    tags?: string[];
    sort_order?: number;
  }): Promise<EvidenceItem> => {
    const res = await apiClient.put(`/evidence/${id}`, data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/evidence/${id}`, { timeout: TIMEOUT.medium });
  },

  analyze: async (id: number): Promise<EvidenceItem> => {
    const res = await apiClient.post(`/evidence/${id}/analyze`, null, { timeout: TIMEOUT.ai });
    return res.data;
  },

  download: async (id: number): Promise<void> => {
    const res = await apiClient.get(`/evidence/${id}/download`, {
      responseType: 'blob',
      timeout: TIMEOUT.long,
    });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence_${id}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

// ── LLM Settings API ──────────────────────────────────────────────────

export interface LLMSetting {
  id: number;
  name: string;
  base_url: string;
  api_key_masked: string;
  model_name: string;
  max_tokens: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectivityTestResult {
  success: boolean;
  message: string;
  model: string;
  latency_ms: number;
}

export const llmSettingsApi = {
  list: async (): Promise<LLMSetting[]> => {
    const res = await apiClient.get('/llm-settings', { timeout: TIMEOUT.short });
    return res.data;
  },

  create: async (data: {
    name: string;
    base_url: string;
    api_key: string;
    model_name: string;
    max_tokens: number;
    is_default: boolean;
  }): Promise<LLMSetting> => {
    const res = await apiClient.post('/llm-settings', data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  update: async (id: number, data: {
    name?: string;
    base_url?: string;
    api_key?: string;
    model_name?: string;
    max_tokens?: number;
    is_default?: boolean;
  }): Promise<LLMSetting> => {
    const res = await apiClient.put(`/llm-settings/${id}`, data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/llm-settings/${id}`, { timeout: TIMEOUT.medium });
  },

  testConnectivity: async (data: {
    base_url: string;
    api_key: string;
    model_name: string;
    setting_id?: number;
  }): Promise<ConnectivityTestResult> => {
    const res = await apiClient.post('/llm-settings/test-connectivity', data, { timeout: TIMEOUT.long });
    return res.data;
  },

  presets: async (): Promise<any[]> => {
    const res = await apiClient.get('/llm-settings/presets', { timeout: TIMEOUT.short });
    return res.data;
  },
};

// ── Research API ──────────────────────────────────────────────────────

export interface ResearchReport {
  id: number;
  query: string;
  report: string;
  sources_used: string[];
  case_id: number | null;
  created_at: string;
}

export const researchApi = {
  create: async (data: {
    query: string;
    sources: string[];
    case_id?: number;
  }, cancelKey?: string): Promise<ResearchReport> => {
    const config: AxiosRequestConfig = { timeout: TIMEOUT.ai };
    if (cancelKey) {
      config.cancelToken = createCancelToken(cancelKey).token;
    }
    const res = await apiClient.post('/research', data, config);
    return res.data;
  },

  list: async (skip?: number, limit?: number): Promise<ResearchReport[]> => {
    const res = await apiClient.get('/research', { params: { skip, limit }, timeout: TIMEOUT.short });
    return res.data;
  },

  get: async (id: number): Promise<ResearchReport> => {
    const res = await apiClient.get(`/research/${id}`, { timeout: TIMEOUT.short });
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/research/${id}`, { timeout: TIMEOUT.medium });
  },

  exportWord: async (id: number): Promise<Blob> => {
    const res = await apiClient.post(`/research/${id}/export`, { format: 'docx' }, {
      responseType: 'blob',
      timeout: TIMEOUT.long,
    });
    return res.data;
  },

  exportMarkdown: async (id: number): Promise<Blob> => {
    const res = await apiClient.post(`/research/${id}/export`, { format: 'markdown' }, {
      responseType: 'blob',
      timeout: TIMEOUT.long,
    });
    return res.data;
  },
};

// ── Vector API ────────────────────────────────────────────────────────

export interface VectorStats {
  cases_count: number;
  statutes_count: number;
  knowledge_count: number;
  connected: boolean;
}

export const vectorApi = {
  ingest: async (collection: string, items: any[]): Promise<any> => {
    const res = await apiClient.post('/vector/ingest', { collection, items }, { timeout: TIMEOUT.long });
    return res.data;
  },

  search: async (query: string, collection: string = 'all', top_k: number = 10): Promise<any> => {
    const res = await apiClient.post('/vector/search', { query, collection, top_k }, { timeout: TIMEOUT.medium });
    return res.data;
  },

  stats: async (): Promise<VectorStats> => {
    const res = await apiClient.get('/vector/stats', { timeout: TIMEOUT.short });
    return res.data;
  },
};

// ── Contract Review API ───────────────────────────────────────────────

export interface ContractItem {
  id: number;
  case_id: number | null;
  owner_id: number;
  title: string;
  file_path: string | null;
  file_type: string | null;
  parsed_text: string | null;
  clauses: ContractClause[] | null;
  review_report: string | null;
  risk_items: ContractRiskItem[] | null;
  risk_score: number | null;
  status: string;
  has_file: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContractClause {
  type: string;
  text: string;
  position: number;
}

export interface ContractRiskItem {
  dimension: string;
  level: string;
  clause: string;
  issue: string;
  suggestion: string;
}

export const contractApi = {
  list: async (caseId?: number): Promise<ContractItem[]> => {
    const res = await apiClient.get('/contracts', { params: { case_id: caseId }, timeout: TIMEOUT.short });
    return res.data;
  },

  draft: async (data: {
    title: string;
    description: string;
    case_id?: number;
    file?: File;
  }): Promise<ContractItem> => {
    const formData = new FormData();
    formData.append('title', data.title);
    formData.append('description', data.description);
    if (data.case_id) formData.append('case_id', String(data.case_id));
    if (data.file) formData.append('file', data.file);
    const res = await apiClient.post('/contracts/draft', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: TIMEOUT.ai,
    });
    return res.data;
  },

  upload: async (file: File, title: string, caseId?: number): Promise<ContractItem> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    if (caseId) formData.append('case_id', String(caseId));
    const res = await apiClient.post('/contracts/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: TIMEOUT.long,
    });
    return res.data;
  },

  get: async (id: number): Promise<ContractItem> => {
    const res = await apiClient.get(`/contracts/${id}`, { timeout: TIMEOUT.short });
    return res.data;
  },

  review: async (id: number): Promise<ContractItem> => {
    const res = await apiClient.post(`/contracts/${id}/review`, null, { timeout: TIMEOUT.ai });
    return res.data;
  },

  exportReport: async (id: number, format: string = 'markdown'): Promise<Blob> => {
    const res = await apiClient.post(`/contracts/${id}/export`, { format }, {
      responseType: 'blob',
      timeout: TIMEOUT.long,
    });
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/contracts/${id}`, { timeout: TIMEOUT.medium });
  },
};

// ── Evidence Chain & Cross-examination API ──────────────────────────────

export interface ChainAnalysisResult {
  chain_report: string;
  completeness_score: number | null;
  chain_status: string;
  missing_evidence: { type: string; purpose: string; urgency: string }[];
}

export const evidenceChainApi = {
  analyzeChain: async (caseId: number): Promise<ChainAnalysisResult> => {
    const res = await apiClient.post(`/evidence/chain-analysis/${caseId}`, null, { timeout: TIMEOUT.ai });
    return res.data;
  },

  crossExamination: async (evidenceId: number): Promise<{ cross_examination: string }> => {
    const res = await apiClient.post(`/evidence/${evidenceId}/cross-examination`, null, { timeout: TIMEOUT.ai });
    return res.data;
  },
};

// ── Knowledge Base API ──────────────────────────────────────────────────

export interface KnowledgeItem {
  id: number;
  title: string;
  content: string;
  source: string | null;
  tags: string[] | null;
  embedding_id: string | null;
  owner_id: number | null;
  team_id: number | null;
  created_at: string;
}

export interface KnowledgeStats {
  total: number;
  tags: string[];
}

export const knowledgeApi = {
  list: async (params?: { skip?: number; limit?: number; tag?: string }): Promise<KnowledgeItem[]> => {
    const res = await apiClient.get('/knowledge', { params, timeout: TIMEOUT.short });
    return res.data;
  },

  create: async (data: {
    title: string;
    content: string;
    source?: string;
    tags?: string[];
    team_id?: number;
  }): Promise<KnowledgeItem> => {
    const res = await apiClient.post('/knowledge', data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  uploadFile: async (file: File): Promise<KnowledgeItem> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post('/knowledge/upload-file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: TIMEOUT.long,
    });
    return res.data;
  },

  get: async (id: number): Promise<KnowledgeItem> => {
    const res = await apiClient.get(`/knowledge/${id}`, { timeout: TIMEOUT.short });
    return res.data;
  },

  update: async (id: number, data: {
    title?: string;
    content?: string;
    source?: string;
    tags?: string[];
  }): Promise<KnowledgeItem> => {
    const res = await apiClient.put(`/knowledge/${id}`, data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/knowledge/${id}`, { timeout: TIMEOUT.medium });
  },

  stats: async (): Promise<KnowledgeStats> => {
    const res = await apiClient.get('/knowledge/stats', { timeout: TIMEOUT.short });
    return res.data;
  },

  search: async (q: string, skip?: number, limit?: number): Promise<KnowledgeItem[]> => {
    const res = await apiClient.get('/knowledge/search/results', {
      params: { q, skip, limit },
      timeout: TIMEOUT.short,
    });
    return res.data;
  },

  batchDelete: async (ids: number[]): Promise<{ message: string; deleted_count: number; not_found_count: number }> => {
    const res = await apiClient.post('/knowledge/batch-delete', ids, { timeout: TIMEOUT.medium });
    return res.data;
  },
};

// ── External API Config API ──────────────────────────────────────────────

export interface ExternalApiConfig {
  id: number;
  name: string;
  description: string;
  base_url: string;
  auth_type: string;
  auth_token_masked: string;
  auth_header_name: string;
  auth_username: string;
  auth_password_masked: string;
  custom_headers: string;
  search_law_path: string;
  search_law_method: string;
  search_case_path: string;
  search_case_method: string;
  get_provision_path: string;
  get_provision_method: string;
  health_check_path: string;
  response_mapping: string;
  request_template: string;
  is_enabled: boolean;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface ExternalApiPreset {
  key: string;
  name: string;
  category: string;
  description: string;
  base_url: string;
  auth_type: string;
  search_law_path: string;
  search_law_method: string;
  search_case_path: string;
  search_case_method: string;
  get_provision_path: string;
  get_provision_method: string;
  health_check_path: string;
  response_mapping: string;
  request_template: string;
}

export const externalApiConfigApi = {
  list: async (): Promise<ExternalApiConfig[]> => {
    const res = await apiClient.get('/external-apis', { timeout: TIMEOUT.short });
    return res.data;
  },

  create: async (data: any): Promise<ExternalApiConfig> => {
    const res = await apiClient.post('/external-apis', data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  update: async (id: number, data: any): Promise<ExternalApiConfig> => {
    const res = await apiClient.put(`/external-apis/${id}`, data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/external-apis/${id}`, { timeout: TIMEOUT.medium });
  },

  toggle: async (id: number): Promise<ExternalApiConfig> => {
    const res = await apiClient.post(`/external-apis/${id}/toggle`, null, { timeout: TIMEOUT.medium });
    return res.data;
  },

  test: async (id: number): Promise<{ success: boolean; message: string; latency_ms: number }> => {
    const res = await apiClient.post('/external-apis/test', { api_id: id }, { timeout: TIMEOUT.long });
    return res.data;
  },

  presets: async (): Promise<ExternalApiPreset[]> => {
    const res = await apiClient.get('/external-apis/presets', { timeout: TIMEOUT.short });
    return res.data;
  },
};

// ── App Config API ──────────────────────────────────────────────────────

export interface AppConfigItem {
  id: number;
  config_key: string;
  config_value: string;
  description: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export const appConfigApi = {
  list: async (category?: string): Promise<AppConfigItem[]> => {
    const res = await apiClient.get('/app-config', { params: { category }, timeout: TIMEOUT.short });
    return res.data;
  },

  update: async (id: number, data: { config_value?: string; description?: string }): Promise<AppConfigItem> => {
    const res = await apiClient.put(`/app-config/${id}`, data, { timeout: TIMEOUT.medium });
    return res.data;
  },

  batchUpdate: async (items: { config_key: string; config_value: string }[]): Promise<AppConfigItem[]> => {
    const res = await apiClient.post('/app-config/batch-update', items, { timeout: TIMEOUT.medium });
    return res.data;
  },

  resetVectorConnection: async (): Promise<{ message: string }> => {
    const res = await apiClient.post('/app-config/reset-vector-connection', null, { timeout: TIMEOUT.medium });
    return res.data;
  },
};

// ── Law Verification API ──────────────────────────────────────────────

export interface LawVerifyResult {
  law_name: string;
  article_number: string;
  quoted_text: string;
  actual_text: string;
  overall_consistent: boolean;
  sources: any[];
  recommendation: string;
}

export const lawVerifyApi = {
  verify: async (data: {
    law_name: string;
    article_number: string;
    quoted_text?: string;
  }): Promise<LawVerifyResult> => {
    const res = await apiClient.post('/law-verify/verify', data, { timeout: TIMEOUT.ai });
    return res.data;
  },

  verifyBatch: async (documentContent: string): Promise<{
    total_references: number;
    verified: LawVerifyResult[];
    warnings: string[];
  }> => {
    const res = await apiClient.post('/law-verify/verify-batch', {
      document_content: documentContent,
    }, { timeout: TIMEOUT.ai });
    return res.data;
  },
};

export default apiClient;
