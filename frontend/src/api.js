const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const BASE_URL = `${API_BASE}/api`;
let currentViewerId = null;

export function setViewerId(id) {
  currentViewerId = id;
}

export function getViewerId() {
  if (currentViewerId) return currentViewerId;
  try {
    const stored = localStorage.getItem('kpi_user');
    if (stored) {
      const user = JSON.parse(stored);
      if (user && user.id) {
        currentViewerId = user.id;
        return user.id;
      }
    }
  } catch (e) {}
  return null;
}

export function getAuthHeaders() {
  const headers = {};
  const viewerId = getViewerId();
  if (viewerId) {
    headers['x-viewer-id'] = viewerId;
    headers['x-user-id'] = viewerId;
  }
  return headers;
}

export async function fetchApi(endpoint, options = {}) {
  const headers = { ...getAuthHeaders(), ...(options.headers || {}) };

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
  getDepartments: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/departments${query ? `?${query}` : ''}`);
  },
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
  getDirectory: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/directory${query ? `?${query}` : ''}`);
  },
  getDirectoryExportUrl: (params = {}) => {
    const vId = getViewerId();
    const queryObj = { ...params };
    if (vId) queryObj.viewer_id = vId;
    const query = new URLSearchParams(queryObj).toString();
    return `${BASE_URL}/directory/export${query ? `?${query}` : ''}`;
  },
  getAxes: () => fetchApi('/axes'),
  getDashboardStats: (periodId) => fetchApi(`/stats/dashboard?period_id=${periodId}`),

  // Standard Tasks
  getStandardTasks: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/standard-tasks?${query}`);
  },
  getStandardTasksTemplateUrl: () => `${BASE_URL}/standard-tasks/template`,
  importStandardTasks: async (formData) => {
    const headers = { ...getAuthHeaders() };
    const viewerId = getViewerId();
    const queryParam = viewerId ? `?viewer_id=${encodeURIComponent(viewerId)}` : '';
    const url = `${BASE_URL}/standard-tasks/import${queryParam}`;

    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || `Lỗi nhập danh mục công việc từ Excel (${res.status})`);
        }
        return data;
      } catch (err) {
        lastError = err;
        const isNetworkErr = err.message === 'Failed to fetch' || err.name === 'TypeError';
        if (attempt < 2 && isNetworkErr) {
          // Chờ 2.5 giây rồi tự động thử lại lần 2 (đề phòng Render vừa khởi động hoặc đang wake-up)
          await new Promise(r => setTimeout(r, 2500));
          continue;
        }
        break;
      }
    }

    if (lastError && (lastError.message === 'Failed to fetch' || lastError.name === 'TypeError')) {
      throw new Error('Không thể kết nối tới máy chủ (Failed to fetch). Máy chủ Render đang trong quá trình build hoặc khởi động lại; vui lòng đợi khoảng 30-60 giây rồi bấm "Thử lại ngay".');
    }
    throw lastError;
  },
  importStandardTasksData: (payload) => {
    return fetchApi('/standard-tasks/import-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
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
  bulkDeleteStandardTasks: (ids) => {
    return fetchApi('/standard-tasks/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  },
  proposeStandardTask: (data) => {
    return fetchApi('/standard-tasks/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  approveStandardTaskProposal: (id) => {
    return fetchApi(`/standard-tasks/${id}/approve-proposal`, {
      method: 'PUT',
    });
  },
  rejectStandardTaskProposal: (id, reason) => {
    return fetchApi(`/standard-tasks/${id}/reject-proposal`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejection_reason: reason }),
    });
  },

  // Assigned Tasks
  getAssignedTasks: (params = {}, maybeUserId) => {
    let queryObj = {};
    if (typeof params === 'string') {
      queryObj.period_id = params;
      if (maybeUserId) queryObj.user_id = maybeUserId;
    } else {
      queryObj = params || {};
    }
    const query = new URLSearchParams(queryObj).toString();
    return fetchApi(`/assigned-tasks?${query}`);
  },
  getAssignedTaskById: (id) => {
    return fetchApi(`/assigned-tasks/${id}`);
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
    const headers = { ...getAuthHeaders() };
    const viewerId = getViewerId();
    const queryParam = viewerId ? `?viewer_id=${encodeURIComponent(viewerId)}` : '';
    return fetch(`${BASE_URL}/assigned-tasks/${id}/evidence${queryParam}`, {
      method: 'POST',
      headers,
      body: formData,
    }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Lỗi tải lên minh chứng');
      }
      return data;
    });
  },
  submitTaskForEval: (id) => {
    return fetchApi(`/assigned-tasks/${id}/submit-for-eval`, {
      method: 'POST',
    });
  },
  delegateTaskEvaluator: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/delegate-evaluator`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  bulkDelegateTaskEvaluators: (data) => {
    return fetchApi('/assigned-tasks/bulk-delegate-evaluator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  revokeTaskDelegation: (id) => {
    return fetchApi(`/assigned-tasks/${id}/revoke-delegation`, {
      method: 'POST',
    });
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
  returnTaskToAssigner: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/return-to-assigner`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  deleteAssignedTask: (id) => {
    return fetchApi(`/assigned-tasks/${id}`, {
      method: 'DELETE',
    });
  },
  bulkDeleteAssignedTasks: (ids) => {
    return fetchApi('/assigned-tasks/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  },
  proposeStandardTask: (data) => {
    return fetchApi('/standard-tasks/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  approveStandardTaskProposal: (id, data = {}) => {
    return fetchApi(`/standard-tasks/${id}/approve-proposal`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  rejectStandardTaskProposal: (id, data = {}) => {
    return fetchApi(`/standard-tasks/${id}/reject-proposal`, {
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

  // Task Extension & Deadlines
  requestTaskExtension: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/request-extension`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  reviewTaskExtension: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/review-extension`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  extendTaskDeadline: (id, data) => {
    return fetchApi(`/assigned-tasks/${id}/extend-deadline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Notifications
  getNotifications: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/notifications${query ? `?${query}` : ''}`);
  },
  markNotificationAsRead: (id) => {
    return fetchApi(`/notifications/${id}/read`, {
      method: 'PUT',
    });
  },
  markAllNotificationsAsRead: (data = {}) => {
    return fetchApi('/notifications/read-all', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },
  clearNotifications: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/notifications/clear${query ? `?${query}` : ''}`, {
      method: 'DELETE',
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
  getAdminUsers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/users${query ? `?${query}` : ''}`);
  },
  getUserTemplateUrl: () => {
    const viewerId = getViewerId();
    return `${BASE_URL}/admin/users/template${viewerId ? `?viewer_id=${encodeURIComponent(viewerId)}` : ''}`;
  },
  getUsersExportUrl: (params = {}) => {
    const viewerId = getViewerId();
    const queryObj = { ...params };
    if (viewerId) queryObj.viewer_id = viewerId;
    const query = new URLSearchParams(queryObj).toString();
    return `${BASE_URL}/admin/users/export${query ? `?${query}` : ''}`;
  },
  importAdminUsers: async (formData) => {
    const headers = { ...getAuthHeaders() };
    const viewerId = getViewerId();
    const queryParam = viewerId ? `?viewer_id=${encodeURIComponent(viewerId)}` : '';
    const url = `${BASE_URL}/admin/users/import${queryParam}`;

    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || `Lỗi nhập dữ liệu từ Excel (${res.status})`);
        }
        return data;
      } catch (err) {
        lastError = err;
        const isNetworkErr = err.message === 'Failed to fetch' || err.name === 'TypeError';
        if (attempt < 2 && isNetworkErr) {
          await new Promise(r => setTimeout(r, 2500));
          continue;
        }
        break;
      }
    }

    if (lastError && (lastError.message === 'Failed to fetch' || lastError.name === 'TypeError')) {
      throw new Error('Không thể kết nối tới máy chủ (Failed to fetch). Máy chủ đang xử lý dữ liệu lớn hoặc khởi động lại; vui lòng đợi một chút rồi thử lại.');
    }
    throw lastError || new Error('Lỗi không xác định khi nhập file');
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
  deleteAdminUser: (id, permanent = false) => {
    return fetchApi(`/admin/users/${id}${permanent ? '?permanent=true' : ''}`, {
      method: 'DELETE',
    });
  },
  toggleAdminUserStatus: (id, is_active) => {
    return fetchApi(`/admin/users/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    });
  },
  resetAdminUserPassword: (id, data = {}) => {
    return fetchApi(`/admin/users/${id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // User Positions (Đa chức vụ / Kiêm nhiệm)
  getUserPositions: (userId) => fetchApi(`/users/${userId}/positions`),
  addUserPosition: (userId, data) => fetchApi(`/users/${userId}/positions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  updateUserPosition: (userId, posId, data) => fetchApi(`/users/${userId}/positions/${posId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  deleteUserPosition: (userId, posId) => fetchApi(`/users/${userId}/positions/${posId}`, {
    method: 'DELETE',
  }),

  // Skip-level Authorizations (Quản lý vượt cấp)
  getSkipLevelAuthorizations: () => fetchApi('/admin/skip-level-authorizations'),
  createSkipLevelAuthorization: (data) => fetchApi('/admin/skip-level-authorizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  deleteSkipLevelAuthorization: (id) => fetchApi(`/admin/skip-level-authorizations/${id}`, {
    method: 'DELETE',
  }),

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
    const headers = { ...getAuthHeaders() };
    const viewerId = getViewerId();
    const queryParam = viewerId ? `?viewer_id=${encodeURIComponent(viewerId)}` : '';
    return fetch(`${BASE_URL}/documents${queryParam}`, {
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
    const headers = { ...getAuthHeaders() };
    const viewerId = getViewerId();
    const queryParam = viewerId ? `?viewer_id=${encodeURIComponent(viewerId)}` : '';
    return fetch(`${BASE_URL}/documents/${id}${queryParam}`, {
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
  submitDocumentToLeader: (id, data) => fetchApi(`/documents/${id}/submit-to-leader`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  completeDocumentDispatch: (dispatchId, data) => fetchApi(`/documents/dispatches/${dispatchId}/complete`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  completeDocument: (id, data = {}) => fetchApi(`/documents/${id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  updateDocumentStatus: (id, status, completion_note = '') => fetchApi(`/documents/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, completion_note }),
  }),

  // User Groups (Nhóm người dùng tự tạo)
  getUserGroups: () => fetchApi('/user-groups'),
  getUserGroup: (id) => fetchApi(`/user-groups/${id}`),
  createUserGroup: (data) => fetchApi('/user-groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  updateUserGroup: (id, data) => fetchApi(`/user-groups/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  deleteUserGroup: (id) => fetchApi(`/user-groups/${id}`, {
    method: 'DELETE',
  }),

  // Database Backup & Restore
  getBackupDownloadUrl: () => `${BASE_URL}/system/backup/download`,
  getBackupList: () => fetchApi('/system/backup/list'),
  createBackup: () => fetchApi('/system/backup/create', { method: 'POST' }),
  restoreBackup: (formData) => {
    const headers = { ...getAuthHeaders() };
    return fetch(`${BASE_URL}/system/backup/restore`, {
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

  // Supabase Cloud Sync
  getSupabaseStatus: () => fetchApi('/system/supabase/status'),
  pushToSupabase: () => fetchApi('/system/supabase/push', { method: 'POST' }),
  pullFromSupabase: () => fetchApi('/system/supabase/pull', { method: 'POST' }),

  // Batch Import Departments from Excel
  importDepartmentsExcel: (items) => fetchApi('/admin/departments/import-excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  }),

  // Two-tier evaluation & NQ98 report
  reviewEvaluationTwoTier: (data) => fetchApi('/evaluations/two-tier-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  getNq98ReportSummary: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/reports/nq98-summary${query ? `?${query}` : ''}`);
  },

  // Realtime System Logs
  getSystemLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/system-logs${query ? `?${query}` : ''}`);
  },
  clearSystemLogs: (data = {}) => fetchApi('/system-logs/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
};
