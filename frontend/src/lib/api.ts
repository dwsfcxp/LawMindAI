import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 180000,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
  },
});

// Request interceptor: attach JWT token
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

// Response interceptor: handle 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isRedirecting) {
      isRedirecting = true;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

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
    const res = await apiClient.post('/auth/login', { email, password });
    const token = res.data.access_token;
    const userRes = await apiClient.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { access_token: token, user: userRes.data };
  },

  register: async (data: {
    email: string;
    password: string;
    name: string;
  }): Promise<{ access_token: string; user: any }> => {
    await apiClient.post('/auth/register', data);
    const loginRes = await apiClient.post('/auth/login', {
      email: data.email,
      password: data.password,
    });
    const token = loginRes.data.access_token;
    const userRes = await apiClient.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { access_token: token, user: userRes.data };
  },

  getMe: async (): Promise<User> => {
    const res = await apiClient.get('/auth/me');
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
    const res = await apiClient.get('/cases', { params });
    return res.data;
  },

  create: async (data: CaseCreate): Promise<Case> => {
    const res = await apiClient.post('/cases', data);
    return res.data;
  },

  get: async (id: number): Promise<Case> => {
    const res = await apiClient.get(`/cases/${id}`);
    return res.data;
  },

  update: async (id: number, data: Partial<CaseCreate & { status: string }>): Promise<Case> => {
    const res = await apiClient.put(`/cases/${id}`, data);
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
    const res = await apiClient.get('/documents', { params });
    return res.data;
  },

  generate: async (data: {
    type: string;
    case_facts: string;
    case_id?: number;
    template_id?: number;
    extra_instructions?: string;
  }): Promise<Document> => {
    const res = await apiClient.post('/documents/generate', data, {
      timeout: 300000,
    });
    return res.data;
  },

  get: async (id: number): Promise<Document> => {
    const res = await apiClient.get(`/documents/${id}`);
    return res.data;
  },

  update: async (id: number, data: { title?: string; content?: string; status?: string }): Promise<Document> => {
    const res = await apiClient.put(`/documents/${id}`, data);
    return res.data;
  },

  exportWord: async (id: number): Promise<Blob> => {
    const res = await apiClient.post(`/documents/${id}/export`, { format: 'docx' }, {
      responseType: 'blob',
    });
    return res.data;
  },

  exportMarkdown: async (id: number): Promise<Blob> => {
    const res = await apiClient.post(`/documents/${id}/export`, { format: 'markdown' }, {
      responseType: 'blob',
    });
    return res.data;
  },

  exportHtml: async (id: number): Promise<Blob> => {
    const res = await apiClient.post(`/documents/${id}/export`, { format: 'html' }, {
      responseType: 'blob',
    });
    return res.data;
  },

  exportPdf: async (id: number): Promise<Blob> => {
    const res = await apiClient.post(`/documents/${id}/export`, { format: 'pdf' }, {
      responseType: 'blob',
      timeout: 120000,
    });
    return res.data;
  },

  verifyLaws: async (id: number): Promise<{
    document_id: number;
    verification_results: any[];
    total: number;
  }> => {
    const res = await apiClient.post(`/documents/${id}/verify-laws`, null, {
      timeout: 300000,
    });
    return res.data;
  },

  review: async (id: number): Promise<Document> => {
    const res = await apiClient.post(`/documents/${id}/review`, null, {
      timeout: 300000,
    });
    return res.data;
  },
};

// ── Templates API ──────────────────────────────────────────────────────

export const templateApi = {
  list: async (params?: { type?: string }): Promise<Template[]> => {
    const res = await apiClient.get('/templates', { params });
    return res.data;
  },

  create: async (data: any): Promise<Template> => {
    const res = await apiClient.post('/templates', data);
    return res.data;
  },

  get: async (id: number): Promise<Template> => {
    const res = await apiClient.get(`/templates/${id}`);
    return res.data;
  },

  update: async (id: number, data: any): Promise<Template> => {
    const res = await apiClient.put(`/templates/${id}`, data);
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/templates/${id}`);
  },
};

// ── Search API ─────────────────────────────────────────────────────────

export const searchApi = {
  search: async (params: {
    query: string;
    result_type?: string;
    top_k?: number;
  }): Promise<SearchResults> => {
    const res = await apiClient.post('/search', params);
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
    const res = await apiClient.get('/evidence', { params: { case_id: caseId } });
    return res.data;
  },

  create: async (data: {
    case_id: number;
    type: string;
    title: string;
    tags?: string[];
  }): Promise<EvidenceItem> => {
    const res = await apiClient.post('/evidence', data);
    return res.data;
  },

  upload: async (id: number, file: File): Promise<EvidenceItem> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post(`/evidence/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
    return res.data;
  },

  get: async (id: number): Promise<EvidenceItem> => {
    const res = await apiClient.get(`/evidence/${id}`);
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/evidence/${id}`);
  },

  analyze: async (id: number): Promise<EvidenceItem> => {
    const res = await apiClient.post(`/evidence/${id}/analyze`, null, { timeout: 300000 });
    return res.data;
  },

  download: async (id: number): Promise<void> => {
    const res = await apiClient.get(`/evidence/${id}/download`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evidence_${id}`;
    a.click();
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
    const res = await apiClient.get('/llm-settings');
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
    const res = await apiClient.post('/llm-settings', data);
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
    const res = await apiClient.put(`/llm-settings/${id}`, data);
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/llm-settings/${id}`);
  },

  testConnectivity: async (data: {
    base_url: string;
    api_key: string;
    model_name: string;
  }): Promise<ConnectivityTestResult> => {
    const res = await apiClient.post('/llm-settings/test-connectivity', data);
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
  }): Promise<ResearchReport> => {
    const res = await apiClient.post('/research', data, { timeout: 300000 });
    return res.data;
  },

  list: async (skip?: number, limit?: number): Promise<ResearchReport[]> => {
    const res = await apiClient.get('/research', { params: { skip, limit } });
    return res.data;
  },

  get: async (id: number): Promise<ResearchReport> => {
    const res = await apiClient.get(`/research/${id}`);
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/research/${id}`);
  },
};

// ── Vector API ────────────────────────────────────────────────────────

export interface VectorStats {
  cases_count: number;
  statutes_count: number;
  connected: boolean;
}

export const vectorApi = {
  ingest: async (collection: string, items: any[]): Promise<any> => {
    const res = await apiClient.post('/vector/ingest', { collection, items });
    return res.data;
  },

  search: async (query: string, collection: string = 'all', top_k: number = 10): Promise<any> => {
    const res = await apiClient.post('/vector/search', { query, collection, top_k });
    return res.data;
  },

  stats: async (): Promise<VectorStats> => {
    const res = await apiClient.get('/vector/stats');
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
    const res = await apiClient.get('/contracts', { params: { case_id: caseId } });
    return res.data;
  },

  upload: async (file: File, title: string, caseId?: number): Promise<ContractItem> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    if (caseId) formData.append('case_id', String(caseId));
    const res = await apiClient.post('/contracts/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000,
    });
    return res.data;
  },

  get: async (id: number): Promise<ContractItem> => {
    const res = await apiClient.get(`/contracts/${id}`);
    return res.data;
  },

  review: async (id: number): Promise<ContractItem> => {
    const res = await apiClient.post(`/contracts/${id}/review`, null, { timeout: 300000 });
    return res.data;
  },

  exportReport: async (id: number, format: string = 'markdown'): Promise<Blob> => {
    const res = await apiClient.post(`/contracts/${id}/export`, { format }, {
      responseType: 'blob',
    });
    return res.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/contracts/${id}`);
  },
};

export default apiClient;
