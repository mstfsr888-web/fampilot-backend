// FamPilot API client — framework-agnostic ES module.
// Works in the browser (FamPilot.html, web demo) and in React Native / Node.
// Usage:
//   import { FamPilotAPI } from './api-client.js';
//   const api = new FamPilotAPI('http://localhost:3000/api/v1');
//   await api.login({ email, password });
//   const events = await api.listEvents({ from, to });
export class FamPilotAPI {
  constructor(base = '/api/v1') {
    this.base = base.replace(/\/$/, '');
    this.token = null;
    this.refreshToken = null;
  }
  setToken(t) { this.token = t; }
  setTokens({ accessToken, refreshToken }) { this.token = accessToken; this.refreshToken = refreshToken; }

  async req(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (auth && this.token) headers.authorization = 'Bearer ' + this.token;
    const res = await fetch(this.base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401 && auth && this.refreshToken) {
      // try one silent refresh
      const ok = await this._refresh();
      if (ok) return this.req(path, { method, body, auth });
    }
    if (!res.ok) {
      let e; try { e = await res.json(); } catch { e = { message: res.statusText }; }
      throw new Error((e.error && e.error.message) || e.message || ('HTTP ' + res.status));
    }
    return res.status === 204 ? null : res.json();
  }
  async _refresh() {
    try {
      const r = await this.req('/auth/refresh', { method: 'POST', body: { refreshToken: this.refreshToken }, auth: false });
      this.token = r.accessToken; this.refreshToken = r.refreshToken; return true;
    } catch { return false; }
  }

  // --- auth ---
  async signup(d) { const r = await this.req('/auth/signup', { method: 'POST', body: d, auth: false }); this.setTokens(r); return r; }
  async login(d) { const r = await this.req('/auth/login', { method: 'POST', body: d, auth: false }); this.setTokens(r); return r; }

  // --- family / members / invites ---
  me() { return this.req('/families/me'); }
  addChild(d) { return this.req('/families/me/children', { method: 'POST', body: d }); }
  updateMember(id, d) { return this.req('/members/' + id, { method: 'PATCH', body: d }); }
  createInvite(d) { return this.req('/families/me/invites', { method: 'POST', body: d }); }
  listInvites() { return this.req('/families/me/invites'); }
  async acceptInvite(d) { const r = await this.req('/invites/accept', { method: 'POST', body: d, auth: false }); this.setTokens(r); return r; }

  // --- events ---
  listEvents(q = {}) { const s = new URLSearchParams(q).toString(); return this.req('/events' + (s ? '?' + s : '')); }
  createEvent(d) { return this.req('/events', { method: 'POST', body: d }); }
  updateEvent(id, d) { return this.req('/events/' + id, { method: 'PATCH', body: d }); }
  deleteEvent(id) { return this.req('/events/' + id, { method: 'DELETE' }); }

  // --- tasks ---
  listTasks(q = {}) { const s = new URLSearchParams(q).toString(); return this.req('/tasks' + (s ? '?' + s : '')); }
  createTask(d) { return this.req('/tasks', { method: 'POST', body: d }); }
  updateTask(id, d) { return this.req('/tasks/' + id, { method: 'PATCH', body: d }); }

  // --- AI ---
  aiCapture(text, image) { return this.req('/ai/capture', { method: 'POST', body: image ? { text, image } : { text } }); }
  assistant(messages) { return this.req('/assistant/chat', { method: 'POST', body: { messages } }); }
  suggestAssignee(d) { return this.req('/ai/suggest-assignee', { method: 'POST', body: d }); }

  // --- connectors (Gmail) ---
  connectors() { return this.req('/connectors'); }
  gmailAuthUrl() { return this.req('/connectors/gmail/auth-url'); }
  gmailSync() { return this.req('/connectors/gmail/sync', { method: 'POST' }); }
  gmailDisconnect() { return this.req('/connectors/gmail', { method: 'DELETE' }); }
}
export default FamPilotAPI;
