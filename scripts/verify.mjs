// Post-deploy verifier. Usage:  API_BASE="https://<your-api>/api/v1" node scripts/verify.mjs
// Walks the critical paths and prints a pass/fail checklist.
import { FamPilotAPI } from '../client/api-client.js';

const base = process.env.API_BASE || 'http://localhost:3000/api/v1';
const api = new FamPilotAPI(base);
const rnd = Math.random().toString(36).slice(2, 7);
let pass = 0, fail = 0;

const ok = (label, extra = '') => { console.log(`  \x1b[32m✓\x1b[0m ${label}${extra ? ' — ' + extra : ''}`); pass++; };
const no = (label, err) => { console.log(`  \x1b[31m✗\x1b[0m ${label} — ${err?.message || err}`); fail++; };
const step = async (label, fn) => { try { ok(label, await fn()); } catch (e) { no(label, e); } };

console.log(`\nFamPilot verify → ${base}\n`);

// 1) health (raw fetch, no auth)
await step('GET /health', async () => {
  const r = await fetch(base.replace(/\/$/, '') + '/health');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (!j.ok) throw new Error('ok=false');
  return 'service up';
});

// 2) auth
let child;
await step('POST /auth/signup', async () => {
  const s = await api.signup({ familyName: 'Verify ' + rnd, name: 'Tester', email: `v_${rnd}@x.com`, password: 'secret1', timezone: 'Europe/Istanbul' });
  return `family ${s.family.name}`;
});
await step('GET /families/me', async () => { const f = await api.me(); return `${f.users.length} member(s)`; });
await step('POST /families/me/children', async () => { child = await api.addChild({ name: 'Deniz' }); return child.name; });

// 3) events + tasks (+ deterministic owner suggestion)
const when = new Date(); when.setDate(when.getDate() + 2); when.setHours(15, 0, 0, 0);
await step('POST /events (auto-assign)', async () => { const e = await api.createEvent({ title: 'Dentist', start: when.toISOString(), type: 'health', childId: child?.id }); return e.ownerId ? 'owner ' + e.ownerId : 'unassigned'; });
await step('POST /tasks (suggest)', async () => { const tk = await api.createTask({ title: 'Buy costume', due: when.toISOString() }); return tk.suggestedReason || 'created'; });
await step('GET /events', async () => { const l = await api.listEvents(); return l.length + ' event(s)'; });
await step('GET /tasks', async () => { const l = await api.listTasks(); return l.length + ' task(s)'; });

// 4) AI capture (text). Works even without ANTHROPIC_API_KEY via local fallback.
await step('POST /ai/capture (text)', async () => { const d = await api.aiCapture('Deniz has a costume day Thursday'); return d.is_event === false ? 'no-event' : (d.kind || 'event') + ': ' + (d.title || ''); });

// 5) invite flow
await step('POST /families/me/invites', async () => { const inv = await api.createInvite({ email: `partner_${rnd}@x.com`, role: 'parent' }); return inv.url ? 'invite url ok' : 'created'; });

// 6) connectors list (Gmail shows once OAuth is configured)
await step('GET /connectors', async () => { const c = await api.connectors(); return c.length + ' connector(s)'; });

console.log(`\n${fail === 0 ? '\x1b[32m✓ ALL PASSED' : '\x1b[31m✗ ' + fail + ' FAILED'}\x1b[0m  (${pass} ok, ${fail} failed)\n`);
process.exit(fail === 0 ? 0 : 1);
