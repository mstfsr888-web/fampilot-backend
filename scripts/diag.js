/* Runtime diagnostic entrypoint (v10). Pure Node, no shell tricks. */
function log(...a) { console.log('[diag]', ...a); }
log('node started', process.version, 'pid', process.pid, 'cwd', process.cwd());

const fs = require('fs');
for (const p of ['/app', '/app/dist', '/app/node_modules']) {
  try {
    const names = fs.readdirSync(p);
    log(p, '->', names.length, 'entries:', names.slice(0, 25).join(', '));
  } catch (e) {
    log(p, 'ERROR:', e.message);
  }
}

log('env: PORT=', process.env.PORT,
    '| REDIS_URL set:', !!process.env.REDIS_URL,
    '| DATABASE_URL set:', !!process.env.DATABASE_URL);

log('requiring /app/dist/main.js now ...');
try {
  require('/app/dist/main.js');
  log('require returned (bootstrap is async, [boot] lines should follow)');
} catch (e) {
  console.error('[diag] require FAILED:', e && e.stack ? e.stack : e);
  process.exit(1);
}
