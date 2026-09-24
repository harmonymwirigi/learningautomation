const BASE = '/api';
const TOKEN_KEY = 'studyflow.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // private browsing — the session simply won't survive a reload
  }
}

// AuthProvider registers here so an expired token anywhere in the app drops
// straight back to the sign-in screen instead of showing a wall of errors.
let onUnauthenticated = () => {};
export function setUnauthenticatedHandler(fn) {
  onUnauthenticated = fn || (() => {});
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: authHeaders(options.headers),
  });

  const data = await res.json().catch(() => ({}));

  // 401 = no/expired token. 403 with code "suspended" = valid token, but the
  // account was disabled mid-session; both mean "back to the sign-in screen".
  if (res.status === 401 || data.code === 'suspended') {
    setToken(null);
    onUnauthenticated(data.error);
    throw new Error(data.error || 'Your session has expired. Please sign in again.');
  }

  if (!res.ok) {
    // A bare "Request failed" is untraceable. When the body is not the usual
    // JSON error — a proxy timeout, a crashed server, an HTML error page — say
    // so and include the status, so the message points somewhere.
    const err = new Error(
      data.error
      || (res.status >= 500
        ? `Server error (${res.status}). Check the backend terminal for details.`
        : `Request failed (${res.status})`),
    );
    err.status = res.status;
    err.field = data.field;
    throw err;
  }
  return data;
}

const json = (body) => ({
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Downloads can't go through a plain <a href> any more: the file endpoints need
// an Authorization header, so fetch the bytes and hand the browser a blob.
async function downloadFile(path, fallbackName) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (res.status === 401) {
    setToken(null);
    onUnauthenticated();
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed');
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const name = match ? decodeURIComponent(match[1]) : fallbackName || 'download';

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  auth: {
    status: () => request('/auth/status'),
    register: (body) => request('/auth/register', { method: 'POST', ...json(body) }),
    login: (body) => request('/auth/login', { method: 'POST', ...json(body) }),
    me: () => request('/auth/me'),
    updateProfile: (body) => request('/auth/me', { method: 'PUT', ...json(body) }),
    changePassword: (body) => request('/auth/me/password', { method: 'PUT', ...json(body) }),
  },
  // Public: the sign-up form needs these before anyone has an account.
  schools: () => request('/schools'),
  admin: {
    stats: () => request('/admin/stats'),
    users: {
      list: (params = {}) => {
        const q = new URLSearchParams(
          Object.entries(params).filter(([, v]) => v),
        ).toString();
        return request(`/admin/users${q ? `?${q}` : ''}`);
      },
      update: (id, body) => request(`/admin/users/${id}`, { method: 'PUT', ...json(body) }),
      setRole: (id, role) => request(`/admin/users/${id}/role`, { method: 'PATCH', ...json({ role }) }),
      setActive: (id, isActive) => request(`/admin/users/${id}/status`, { method: 'PATCH', ...json({ is_active: isActive }) }),
      resetPassword: (id, password) => request(`/admin/users/${id}/password`, { method: 'PUT', ...json({ password }) }),
      remove: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
    },
    schools: {
      list: () => request('/admin/schools'),
      create: (name) => request('/admin/schools', { method: 'POST', ...json({ name }) }),
      rename: (id, name) => request(`/admin/schools/${id}`, { method: 'PUT', ...json({ name }) }),
      remove: (id) => request(`/admin/schools/${id}`, { method: 'DELETE' }),
    },
    courses: {
      list: (schoolId) => request(`/admin/courses${schoolId ? `?school_id=${schoolId}` : ''}`),
      create: (schoolId, name) => request('/admin/courses', { method: 'POST', ...json({ school_id: schoolId, name }) }),
      rename: (id, name) => request(`/admin/courses/${id}`, { method: 'PUT', ...json({ name }) }),
      remove: (id) => request(`/admin/courses/${id}`, { method: 'DELETE' }),
    },
  },
  dashboard: () => request('/dashboard'),
  chat: {
    history: () => request('/chat'),
    send: (message) => request('/chat', { method: 'POST', ...json({ message }) }),
    clear: () => request('/chat', { method: 'DELETE' }),
  },
  progress: (termId) => request(`/progress${termId ? `?term_id=${termId}` : ''}`),
  terms: {
    list: () => request('/terms'),
    create: (body) => request('/terms', { method: 'POST', ...json(body) }),
    startNext: () => request('/terms/next', { method: 'POST' }),
    activate: (id) => request(`/terms/${id}/activate`, { method: 'PATCH' }),
    update: (id, body) => request(`/terms/${id}`, { method: 'PUT', ...json(body) }),
    remove: (id) => request(`/terms/${id}`, { method: 'DELETE' }),
  },
  units: {
    list: (termId) => request(`/units${termId ? `?term_id=${termId}` : ''}`),
    get: (id) => request(`/units/${id}`),
    create: (body) => request('/units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    update: (id, body) => request(`/units/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    delete: (id) => request(`/units/${id}`, { method: 'DELETE' }),
  },
  notes: {
    list: (unitId) => request(`/notes${unitId ? `?unit_id=${unitId}` : ''}`),
    upload: (formData) => request('/notes', { method: 'POST', body: formData }),
    delete: (id) => request(`/notes/${id}`, { method: 'DELETE' }),
    download: (id, name) => downloadFile(`/notes/${id}/download`, name),
    summarize: (id) => request(`/notes/${id}/summarize`, { method: 'POST' }),
    getSummary: (id) => request(`/notes/${id}/summary`),
    getQuizzes: (id) => request(`/notes/${id}/quizzes`),
    getPages: (id, from, to) => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const q = params.toString();
      return request(`/notes/${id}/pages${q ? `?${q}` : ''}`);
    },
  },
  pastPapers: {
    list: (unitId) => request(`/past-papers${unitId ? `?unit_id=${unitId}` : ''}`),
    upload: (formData) => request('/past-papers', { method: 'POST', body: formData }),
    delete: (id) => request(`/past-papers/${id}`, { method: 'DELETE' }),
    download: (id, name) => downloadFile(`/past-papers/${id}/download`, name),
    analyze: (id, body) => request(`/past-papers/${id}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    getQuestions: (id) => request(`/past-papers/${id}/questions`),
    createQuiz: (id) => request(`/past-papers/${id}/create-quiz`, { method: 'POST' }),
  },
  assignments: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/assignments${q ? `?${q}` : ''}`);
    },
    upcoming: () => request('/assignments/upcoming'),
    create: (body) => request('/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    update: (id, body) => request(`/assignments/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    delete: (id) => request(`/assignments/${id}`, { method: 'DELETE' }),
  },
  notifications: {
    list: () => request('/notifications'),
    unreadCount: () => request('/notifications/unread-count'),
    markRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => request('/notifications/read-all', { method: 'PATCH' }),
  },
  studySessions: {
    list: (days) => request(`/study-sessions?days=${days || 30}`),
    stats: () => request('/study-sessions/stats'),
    create: (body) => request('/study-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    delete: (id) => request(`/study-sessions/${id}`, { method: 'DELETE' }),
  },
  calendar: {
    get: (month) => request(`/calendar${month ? `?month=${month}` : ''}`),
  },
  topics: {
    list: (unitId) => request(`/topics?unit_id=${unitId}`),
    create: (body) => request('/topics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    bulk: (body) => request('/topics/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    toggleCover: (id, isCovered) => request(`/topics/${id}/cover`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_covered: isCovered }) }),
    delete: (id) => request(`/topics/${id}`, { method: 'DELETE' }),
  },
  timetable: {
    list: () => request('/timetable'),
    today: () => request('/timetable/today'),
    create: (body) => request('/timetable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    update: (id, body) => request(`/timetable/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    delete: (id) => request(`/timetable/${id}`, { method: 'DELETE' }),
  },
  examPrep: {
    get: (unitId) => request(`/exam-prep/${unitId}`),
    analyze: (body) => request('/exam-prep/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  },
  quizzes: {
    list: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/quizzes${q ? `?${q}` : ''}`);
    },
    get: (id) => request(`/quizzes/${id}`),
    generate: (noteId) => request('/quizzes/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note_id: noteId }) }),
    generateFromPaper: (paperId) => request('/quizzes/generate-from-paper', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paper_id: paperId }) }),
    submit: (id, answers) => request(`/quizzes/${id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) }),
    weakTopics: (unitId) => request(`/quizzes/weak-topics${unitId ? `?unit_id=${unitId}` : ''}`),
    attempts: (id) => request(`/quizzes/${id}/attempts`),
  },
  automation: {
    weakTopics: () => request('/automation/weak-topics'),
    quizProgress: () => request('/automation/quiz-progress'),
  },
  whatsapp: {
    status: () => request('/whatsapp/status'),
    test: () => request('/whatsapp/test', { method: 'POST' }),
    sendDigest: () => request('/whatsapp/digest', { method: 'POST' }),
    previewDigest: () => request('/whatsapp/digest/preview'),
    syncAlerts: () => request('/whatsapp/sync-alerts', { method: 'POST' }),
  },
  ai: {
    status: () => request('/ai/status'),
    test: () => request('/ai/test', { method: 'POST' }),
  },
};
