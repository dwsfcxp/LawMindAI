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

export default apiClient;
