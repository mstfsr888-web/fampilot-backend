import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { suggestOwner } from '../common/assignment';
import { newId } from '../common/ids';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email';

@Injectable()
export class GmailService {
  private readonly log = new Logger('Gmail');
  constructor(private prisma: PrismaService, private ai: AiService) {}

  private cfg() {
    const id = process.env.GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    const redirect = process.env.GOOGLE_REDIRECT_URI;
    if (!id || !secret || !redirect) {
      throw new BadRequestException('Google OAuth not configured (set GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI).');
    }
    return { id, secret, redirect };
  }

  // Step 1: build the consent URL. State is a short-lived signed token (stateless + safe).
  authUrl(familyId: string, userId: string) {
    const { id, redirect } = this.cfg();
    const state = jwt.sign({ fid: familyId, uid: userId }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '10m' });
    const params = new URLSearchParams({
      client_id: id,
      redirect_uri: redirect,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    });
    return { url: `${AUTH_URL}?${params.toString()}` };
  }

  // Step 2: Google redirects here. Exchange code -> tokens, store connector.
  async handleCallback(code: string, state: string) {
    const { id, secret, redirect } = this.cfg();
    let payload: any;
    try { payload = jwt.verify(state, process.env.JWT_SECRET || 'dev-secret'); }
    catch { throw new BadRequestException('Invalid state'); }

    const tok = await this.exchange({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' });
    const email = await this.userinfoEmail(tok.access_token);

    const existing = await this.prisma.connector.findFirst({ where: { familyId: payload.fid, provider: 'gmail', email } });
    const data = {
      familyId: payload.fid,
      userId: payload.uid,
      provider: 'gmail',
      email,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token || existing?.refreshToken,
      tokenExpiry: new Date(Date.now() + (tok.expires_in || 3600) * 1000),
    };
    if (existing) await this.prisma.connector.update({ where: { id: existing.id }, data });
    else await this.prisma.connector.create({ data: { id: newId('con'), ...data } });

    return { email };
  }

  list(familyId: string) {
    return this.prisma.connector.findMany({
      where: { familyId },
      select: { id: true, provider: true, email: true, createdAt: true },
    });
  }

  async disconnect(familyId: string, id: string) {
    await this.prisma.connector.deleteMany({ where: { id, familyId } });
    return { ok: true };
  }

  // Step 3: poll recent emails -> AI capture -> create DRAFT events to confirm.
  async sync(familyId: string) {
    const connectors = await this.prisma.connector.findMany({ where: { familyId, provider: 'gmail' } });
    const drafts: any[] = [];
    for (const c of connectors) {
      const access = await this.ensureToken(c);
      const ids = await this.listMessageIds(access);
      for (const mid of ids.slice(0, 10)) {
        const externalId = `gmail:${mid}`;
        const seen = await this.prisma.event.findFirst({ where: { familyId, externalId } });
        if (seen) continue;
        const msg = await this.getMessage(access, mid);
        const text = `${msg.subject}\n${msg.snippet}`.trim();
        if (!text) continue;
        const draft: any = await this.ai.capture(familyId, text);
        if (draft.is_event === false) continue;
        const own = await suggestOwner(this.prisma, familyId, { type: draft.event_type, childId: draft.child_id, start: new Date(draft.start_iso) });
        const event = await this.prisma.event.create({
          data: {
            id: newId('evt'),
            familyId,
            title: draft.title,
            startTime: new Date(draft.start_iso),
            allDay: !!draft.all_day,
            type: draft.event_type || 'other',
            childId: draft.child_id || null,
            ownerId: own.ownerId,
            status: 'draft',
            source: 'ai_capture',
            reminderOffsetMin: draft.reminder_offset_min || 120,
            externalId,
          },
        });
        drafts.push(event);
      }
    }
    this.log.log(`Gmail sync for ${familyId}: ${drafts.length} draft(s)`);
    return { drafts };
  }

  // ---- Google REST helpers (no SDK; uses global fetch) ----
  private async exchange(form: Record<string, string>) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });
    if (!res.ok) throw new BadRequestException('Token exchange failed: ' + (await res.text()));
    return res.json() as any;
  }

  private async ensureToken(c: any): Promise<string> {
    if (c.tokenExpiry && new Date(c.tokenExpiry).getTime() > Date.now() + 60000) return c.accessToken;
    const { id, secret } = this.cfg();
    const tok = await this.exchange({ refresh_token: c.refreshToken, client_id: id, client_secret: secret, grant_type: 'refresh_token' });
    await this.prisma.connector.update({
      where: { id: c.id },
      data: { accessToken: tok.access_token, tokenExpiry: new Date(Date.now() + (tok.expires_in || 3600) * 1000) },
    });
    return tok.access_token;
  }

  private async userinfoEmail(access: string): Promise<string> {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${access}` } });
    const j: any = await res.json();
    return j.email;
  }

  private async listMessageIds(access: string): Promise<string[]> {
    const q = encodeURIComponent('newer_than:14d category:primary');
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${q}`, {
      headers: { Authorization: `Bearer ${access}` },
    });
    const j: any = await res.json();
    return (j.messages || []).map((m: any) => m.id);
  }

  private async getMessage(access: string, id: string): Promise<{ subject: string; snippet: string }> {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject`,
      { headers: { Authorization: `Bearer ${access}` } },
    );
    const j: any = await res.json();
    const subject = (j.payload?.headers || []).find((h: any) => h.name === 'Subject')?.value || '';
    return { subject, snippet: j.snippet || '' };
  }
}
