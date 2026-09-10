const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const BASE_URL = `${API_BASE}/api`;
let currentViewerId = null;

export function setViewerId(id) {
  currentViewerId = id;
}

export function getViewerId() {
  return currentViewerId;
}

export async function fetchApi(endpoint, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (currentViewerId && !headers['x-viewer-id']) {
    headers['x-viewer-id'] = currentViewerId;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Lỗi yêu cầu: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (credentials) => fetchApi('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  }),
  logout: () => fetchApi('/auth/logout', { method: 'POST' }),
  getMe: () => fetchApi('/auth/me'),
  changePassword: (data) => fetchApi('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  // Periods, Users, Depts, Roles, Axes
  getPeriods: () => fetchApi('/periods'),
  getDepartments: () => fetchApi('/departments'),
  createDepartment: (data) => fetchApi('/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  updateDepartment: (id, data) => fetchApi(`/departments/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  deleteDepartment: (id) => fetchApi(`/departments/${id}`, {
    method: 'DELETE',
  }),

  // Roles
  getRoles: () => fetchApi('/roles'),
  createRole: (data) => fetchApi('/roles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  updateRole: (id, data) => fetchApi(`/roles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  deleteRole: (id) => fetchApi(`/roles/${id}`, {
    method: 'DELETE',
  }),

  getUsers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/users${query ? `?${query}` : ''}`);
  },
  getAxes: () => fetchApi('/axes'),
  getDashboardStats: (periodId) => fetchApi(`/stats/dashboard?period_id=${periodId}`),

  // Standard Tasks
  getStandardTasks: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/standard-tasks?${query}`);
  },
  getStandardTasksTemplateUrl: () => `${BASE_URL}/standard-tasks/template`,
  importStandardTasks: (formData) => {
    return fetch(`${BASE_URL}/standard-tasks/import`, {
      method: 'POST',
      body: formData,
    }).then(res => res.json());
  },
  createStandardTask: (data) => {
    return fetchApi('/standard-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  updateStandardTask: (id, data) => {
    return fetchApi(`/standard-tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  toggleStandardTaskStatus: (id, data = {}) => {
    return fetchApi(`/standard-tasks/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  deleteStandardTask: (id) => {
    return fetchApi(`/standard-tasks/${id}`, {
      method: 'DELETE',
    });
  },

  // Assigned Tasks
  getAssignedTasks: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/assigned-tasks?${query}`);
  },
  assignTask: (data) => {
    return fetchApi('/assigned-tasks/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  bulkAssignTasks: (data) => {
    return fetchApi('/assigned-tasks/bulk-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  checkDuplicateTasks: (data) => {
    return fetchApi('/assigned-tasks/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  registerSelfTask: (data) => {
    return fetchApi('/assigned-tasks/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  approveRegisteredTask: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  approveTask: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  submitEvidence: (id, formData) => {
    return fetch(`${BASE_URL}/assigned-tasks/${id}/evidence`, {
      method: 'POST',
      body: formData,
    }).then(res => res.json());
  },
  getSubordinateEvidences: (id) => {
    return fetchApi(`/assigned-tasks/${id}/subordinate-evidences`);
  },
  gradeTask: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/grade`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  acceptTask: (id) => {
    return fetchApi(`/assigned-tasks/${id}/accept`, {
      method: 'PUT',
    });
  },
  feedbackTask: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/feedback`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  reassignTask: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/reassign`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  submitEvaluationFeedback: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/evaluation-feedback`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Advisory (Bước 6: Cơ quan Tham mưu Tổng hợp & Trình biểu quyết)
  getAdvisorySummary: (periodId) => {
    return fetchApi(`/advisory-summary?period_id=${periodId}`);
  },
  saveAdvisoryProposal: (data) => {
    return fetchApi('/advisory-summary/save', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  submitAdvisoryToVoting: (data) => {
    return fetchApi('/advisory-summary/submit-voting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Evaluation
  getEvaluation: (periodId, userId) => {
    return fetchApi(`/evaluations?period_id=${periodId}&user_id=${userId}`);
  },
  savePart1Evaluation: (data) => {
    return fetchApi('/evaluations/part1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  saveSuperiorConclusion: (data) => {
    return fetchApi('/evaluations/conclude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Excel Export URL
  getExportUrl: (periodId, userId) => {
    return `${BASE_URL}/reports/export-cbql?period_id=${periodId}&user_id=${userId}`;
  },
  getExportMau02Url: (periodId) => {
    return `${BASE_URL}/reports/export-mau-02?period_id=${periodId}`;
  },

  // 6-Step Workflow Transition
  transitionStep: (data) => {
    return fetchApi('/evaluations/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Mẫu 02 Report
  getMau02Report: (periodId) => {
    return fetchApi(`/reports/mau-02?period_id=${periodId}`);
  },
  saveMau02Report: (data) => {
    return fetchApi('/reports/mau-02/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Admin User Management
  getAdminUsers: () => fetchApi('/users'),
  getUserTemplateUrl: () => `${BASE_URL}/admin/users/template`,
  importAdminUsers: (formData) => {
    return fetch(`${BASE_URL}/admin/users/import`, {
      method: 'POST',
      body: formData,
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Lỗi nhập dữ liệu từ Excel');
      }
      return data;
    });
  },
  createAdminUser: (data) => {
    return fetchApi('/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  updateAdminUser: (id, data) => {
    return fetchApi(`/admin/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  deleteAdminUser: (id) => {
    return fetchApi(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  },
  resetAdminUserPassword: (id, data = {}) => {
    return fetchApi(`/admin/users/${id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Admin System Config & Periods
  getAdminConfigs: () => fetchApi('/admin/configs'),
  updateAdminConfigs: (data) => {
    return fetchApi('/admin/configs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  createAdminPeriod: (data) => {
    return fetchApi('/admin/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  updateAdminPeriod: (id, data) => {
    return fetchApi(`/admin/periods/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  finalizePeriod: (id, data = {}) => {
    return fetchApi(`/admin/periods/${id}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  unfinalizePeriod: (id) => {
    return fetchApi(`/admin/periods/${id}/unfinalize`, {
      method: 'POST',
    });
  },

  // Self Evaluation Submit & Return Flow
  submitSelfEvaluation: (data) => {
    return fetchApi('/evaluations/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  returnEvaluation: (data) => {
    return fetchApi('/evaluations/return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  returnAssignedTask: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Voting & Charts
  getVotingList: (periodId) => fetchApi(`/voting?period_id=${periodId}`),
  getVotingProgress: (periodId) => fetchApi(`/voting/progress?period_id=${periodId}`),
  submitVote: (data) => fetchApi('/voting', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  getChartsStats: (periodId) => fetchApi(`/stats/charts?period_id=${periodId}`),

  // Documents Management & Dispatch
  getDocumentStats: () => fetchApi('/documents/stats'),
  getDocuments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/documents${query ? `?${query}` : ''}`);
  },
  getDocument: (id) => fetchApi(`/documents/${id}`),
  createDocument: (formData) => {
    const headers = {};
    if (currentViewerId) headers['x-viewer-id'] = currentViewerId;
    return fetch(`${BASE_URL}/documents`, {
      method: 'POST',
      headers,
      body: formData,
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `Lỗi: ${res.status}`);
      }
      return res.json();
    });
  },
  updateDocument: (id, formData) => {
    const headers = {};
    if (currentViewerId) headers['x-viewer-id'] = currentViewerId;
    return fetch(`${BASE_URL}/documents/${id}`, {
      method: 'PUT',
      headers,
      body: formData,
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `Lỗi: ${res.status}`);
      }
      return res.json();
    });
  },
  deleteDocument: (id) => fetchApi(`/documents/${id}`, {
    method: 'DELETE',
  }),
  dispatchDocument: (id, data) => fetchApi(`/documents/${id}/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  completeDocumentDispatch: (dispatchId, data) => fetchApi(`/documents/dispatches/${dispatchId}/complete`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
};
