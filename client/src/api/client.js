// The only way screens should call the server. It adds the login token and turns errors
// into exceptions with the server's message.
//   import api from '../../api/client';
//   const data = await api.get('/assets?search=laptop');
//   await api.post('/requests', { asset_id: 3, purpose: 'Demo', start_date: '2026-11-01', duration_days: 2 });
const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

async function request(method, path, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && token) {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.blob();
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  put: (path, body = {}) => request('PUT', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};

export default api;
