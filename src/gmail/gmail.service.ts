import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { EventsService } from '../events/events.service';
import { TasksService } from '../tasks/tasks.service';
import { newId } from '../common/ids';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

@Injectable()
export class GmailService {
  private log = new Logger('Gmail');
  constructor(private prisma: PrismaService, private ai: AiService, private events: EventsService, private tasks: TasksService) {}

  private client() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  authUrl(familyId: string) {
    const url = this.client().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state: familyId, // ties the consent back to this family
    });
    return { url };
  }

  // Google redirects the browser here with ?code=&state=familyId
  async handleCallback(code: string, state: string) {
    const oauth = this.client();
    const { tokens } = await oauth.getToken(code);
    oauth.setCredentials(tokens);
    let email: string | undefined;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth });
      const me = await oauth2.userinfo.get();
      email = me.data.email || undefined;
    } catch {}
    const existing = await this.prisma.connector.findFirst({ where: { familyId: state, type: 'gmail' } });
    const data = {
      email,
      accessToken: tokens.access_token || null,
      refreshToken: tokens.refresh_token || existing?.refreshToken || null,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    };
    if (existing) await this.prisma.connector.update({ where: { id: existing.id }, data });
    else await this.prisma.connector.create({ data: { id: newId('con'), familyId: state, type: 'gmail', ...data } });
    return { ok: true, email };
  }

  async list(familyId: string) {
    const cons = await this.prisma.connector.findMany({ where: { familyId } });
    return cons.map((c) => ({ id: c.id, type: c.type, email: c.email, lastSyncedAt: c.lastSyncedAt }));
  }

  async disconnect(familyId: string) {
    await this.prisma.connector.deleteMany({ where: { familyId, type: 'gmail' } });
    return { ok: true };
  }

  // Fetch recent mail -> AI capture (text or screenshot attachment) -> create DRAFT items.
  async sync(familyId: string) {
    const con = await this.prisma.connector.findFirst({ where: { familyId, type: 'gmail' } });
    if (!con || !con.refreshToken) throw new NotFoundException('Gmail not connected');
    const oauth = this.client();
    oauth.setCredentials({ refresh_token: con.refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth });

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'newer_than:3d -in:chats category:primary',
      maxResults: 10,
    });
    const msgs = listRes.data.messages || [];
    const drafts: any[] = [];
    for (const m of msgs) {
      const seen = await this.prisma.processedEmail.findFirst({ where: { familyId, messageId: m.id } });
      if (seen) continue;
      await this.prisma.processedEmail.create({ data: { id: newId('pem'), familyId, messageId: m.id } });
      const full = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' });
      const text = this.extractText(full.data);
      const images = this.collectImageParts(full.data.payload).slice(0, 1);

      let draft: any;
      if (images.length) {
        // Screenshot / image attachment -> vision capture
        const b64url = await this.fetchAttachment(gmail, m.id, images[0].attachmentId);
        if (!b64url) continue;
        const data = Buffer.from(b64url, 'base64url').toString('base64');
        draft = await this.ai.capture(familyId, this.subject(full.data), { data, mediaType: images[0].mimeType });
      } else {
        if (!text || text.length < 8) continue;
        draft = await this.ai.capture(familyId, text.slice(0, 4000));
      }
      if (!draft || draft.is_event === false) continue;

      if (draft.kind === 'task') {
        const tk = await this.tasks.create(familyId, {
          title: draft.title,
          due: draft.start_iso || draft.due_iso || null,
          assigneeId: draft.suggested_owner_id ?? undefined,
        });
        drafts.push({ kind: 'task', ...tk });
      } else {
        const ev = await this.events.create(familyId, 'gmail', {
          title: draft.title, start: draft.start_iso, allDay: draft.all_day, type: draft.event_type,
          childId: draft.child_id, ownerId: draft.suggested_owner_id ?? null, reminderOffsetMin: draft.reminder_offset_min,
          source: 'ai_capture', status: 'draft', autoAssign: false,
        });
        drafts.push({ kind: 'event', ...ev });
      }
    }
    await this.prisma.connector.update({ where: { id: con.id }, data: { lastSyncedAt: new Date() } });
    return { scanned: msgs.length, draftsCreated: drafts.length, drafts };
  }

  private async fetchAttachment(gmail: any, messageId: string, attachmentId: string): Promise<string | null> {
    try {
      const r = await gmail.users.messages.attachments.get({ userId: 'me', messageId, id: attachmentId });
      return r.data.data || null; // base64url
    } catch { return null; }
  }
  private collectImageParts(payload: any, out: any[] = []): any[] {
    const walk = (part: any) => {
      if (!part) return;
      if (part.mimeType && part.mimeType.startsWith('image/') && part.body && part.body.attachmentId && (part.body.size || 0) < 5_000_000) {
        out.push({ attachmentId: part.body.attachmentId, mimeType: part.mimeType });
      }
      if (part.parts) part.parts.forEach(walk);
    };
    walk(payload);
    return out;
  }
  private subject(msg: any): string {
    const headers = msg.payload?.headers || [];
    return headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '';
  }

  @Cron('0 */15 * * * *') // every 15 minutes
  async autoSync() {
    const cons = await this.prisma.connector.findMany({ where: { type: 'gmail' } });
    for (const c of cons) {
      try { await this.sync(c.familyId); }
      catch (e) { this.log.warn(`auto-sync failed for ${c.familyId}: ${e}`); }
    }
  }

  private extractText(msg: any): string {
    const headers = msg.payload?.headers || [];
    const subject = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '';
    return `${subject}\n${this.walk(msg.payload)}`.trim();
  }
  private walk(part: any): string {
    if (!part) return '';
    if (part.mimeType === 'text/plain' && part.body?.data) return this.decode(part.body.data);
    if (part.parts) return part.parts.map((p: any) => this.walk(p)).join('\n');
    if (part.body?.data && part.mimeType !== 'text/html') return this.decode(part.body.data);
    return '';
  }
  private decode(d: string) {
    return Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  }
}
