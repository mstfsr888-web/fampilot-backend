// Dependency-free mock of the FamPilot API — just enough for scripts/verify.mjs.
import http from 'http';
const PORT = 4599;
const db = { children: [], events: [], tasks: [],
  parents: [{ id: 'usr_a', name: 'Ayse', role: 'parent', color: '#E8765A' },
            { id: 'usr_b', name: 'Mehmet', role: 'parent', color: '#4C82D8' }] };
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(d ? JSON.parse(d) : {}); } catch { r({}); } }); });

http.createServer(async (req, res) => {
  const u = req.url.split('?')[0]; const m = req.method; const b = await body(req);
  const tokens = { accessToken: 'mock.access', refreshToken: 'mock.refresh' };
  if (u === '/api/v1/health') return json(res, 200, { ok: true, service: 'fampilot-api', ts: new Date().toISOString() });
  if (u === '/api/v1/auth/signup') return json(res, 201, { ...tokens, user: { id: 'usr_a' }, family: { id: 'fam_1', name: b.familyName, timezone: b.timezone } });
  if (u === '/api/v1/families/me') return json(res, 200, { id: 'fam_1', name: 'Verify', timezone: 'Europe/Istanbul', users: db.parents, children: db.children });
  if (u === '/api/v1/families/me/children' && m === 'POST') { const c = { id: 'chl_' + (db.children.length + 1), name: b.name }; db.children.push(c); return json(res, 201, c); }
  if (u === '/api/v1/events' && m === 'POST') { const e = { id: 'evt_' + (db.events.length + 1), ...b, ownerId: db.parents[0].id, status: 'confirmed' }; db.events.push(e); return json(res, 201, e); }
  if (u === '/api/v1/events' && m === 'GET') return json(res, 200, db.events);
  if (u === '/api/v1/tasks' && m === 'POST') { const t = { id: 'tsk_' + (db.tasks.length + 1), ...b, assigneeId: db.parents[1].id, suggested: true, suggestedReason: 'lighter load' }; db.tasks.push(t); return json(res, 201, t); }
  if (u === '/api/v1/tasks' && m === 'GET') return json(res, 200, db.tasks);
  if (u === '/api/v1/ai/capture' && m === 'POST') return json(res, 200, { is_event: true, kind: 'event', title: 'Costume day', start_iso: new Date().toISOString(), all_day: true, event_type: 'school', confidence: 'medium', suggested_owner_id: db.parents[0].id });
  if (u === '/api/v1/families/me/invites' && m === 'POST') return json(res, 201, { id: 'inv_1', url: 'https://app.fampilot/invite/abc123', role: b.role });
  if (u === '/api/v1/connectors') return json(res, 200, []);
  json(res, 404, { message: 'not found: ' + m + ' ' + u });
}).listen(PORT, () => console.log('mock api on ' + PORT));
