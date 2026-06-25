// Sends a push via Firebase Cloud Messaging (legacy HTTP) when FCM_SERVER_KEY is set;
// otherwise logs to the console so the worker runs without credentials.
export async function sendPush(token: string | null, title: string, body: string) {
  const key = process.env.FCM_SERVER_KEY;
  if (!token || !key) {
    // eslint-disable-next-line no-console
    console.log(`[push:stub] ${title} — ${body} (token=${token ? 'set' : 'none'})`);
    return;
  }
  try {
    await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: { Authorization: `key=${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: token, notification: { title, body } }),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[push] failed', e);
  }
}
