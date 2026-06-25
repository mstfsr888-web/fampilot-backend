// End-to-end smoke test. Run the API first, then: node scripts/smoke.mjs
import { FamPilotAPI } from '../client/api-client.js';

const base = process.env.API_BASE || 'http://localhost:3000/api/v1';
const api = new FamPilotAPI(base);
const rnd = Math.random().toString(36).slice(2, 7);

const run = async () => {
  console.log('→ signup');
  const s = await api.signup({ familyName: 'Smoke ' + rnd, name: 'Tester', email: `t_${rnd}@x.com`, password: 'secret1', timezone: 'Europe/Istanbul' });
  console.log('  family:', s.family.name, '| user:', s.user.name);

  console.log('→ add child');
  const child = await api.addChild({ name: 'Deniz' });
  console.log('  child:', child.name, child.id);

  console.log('→ create event');
  const t = new Date(); t.setDate(t.getDate() + 2); t.setHours(15, 0, 0, 0);
  const ev = await api.createEvent({ title: 'Dentist', start: t.toISOString(), type: 'health', childId: child.id });
  console.log('  event:', ev.title, '| owner suggested:', ev.ownerId, ev.suggestedReason || '');

  console.log('→ create task');
  const task = await api.createTask({ title: 'Buy costume', due: t.toISOString() });
  console.log('  task:', task.title, '| assignee:', task.assigneeId, task.suggestedReason || '');

  console.log('→ list events');
  const list = await api.listEvents();
  console.log('  events count:', list.length);

  console.log('→ ai capture');
  const draft = await api.aiCapture('Deniz has a costume day Thursday');
  console.log('  draft:', draft.title || draft.is_event, '|', draft.start_iso || '');

  console.log('→ create invite');
  const inv = await api.createInvite({ email: `mert_${rnd}@x.com`, role: 'parent' });
  console.log('  invite url:', inv.url);

  console.log('\\n✓ smoke test passed');
};
run().catch((e) => { console.error('✗ FAILED:', e.message); process.exit(1); });
