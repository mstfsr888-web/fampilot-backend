import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { suggestOwner } from '../common/assignment';
import { connection as redis } from '../queue';

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const DEFAULT_OFFSET: Record<string, number> = { school: 1440, health: 1440, activity: 120, social: 120, other: 120 };

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService) {}

  private freeLimit() { return Number(process.env.AI_FREE_LIMIT || 10); }

  // Per-family monthly counter in Redis. FAIL OPEN if Redis is down so AI never
  // breaks because of the counter itself.
  private async checkQuota(familyId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
    const limit = this.freeLimit();
    try {
      const key = `ai:used:${familyId}:${new Date().toISOString().slice(0, 7)}`;
      const used = await redis.incr(key);
      if (used === 1) await redis.expire(key, 60 * 60 * 24 * 40);
      if (used > limit) { await redis.decr(key); return { allowed: false, used: limit, limit }; }
      return { allowed: true, used, limit };
    } catch {
      return { allowed: true, used: 0, limit };
    }
  }

  private async callAnthropic(system: string, messages: any[]): Promise<string> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('no-key');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL(), max_tokens: 1024, system, messages }),
    });
    if (!res.ok) throw new Error('anthropic ' + res.status);
    const data: any = await res.json();
    return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  }

  // ---- Capture: messy text OR a screenshot -> structured draft (event|task), not persisted ----
  // image (optional): { data: base64, mediaType: 'image/jpeg'|'image/png' }
  async capture(familyId: string, text?: string, image?: { data: string; mediaType?: string }, lang?: string) {
    const quota = await this.checkQuota(familyId);
    if (!quota.allowed) return { is_event: false, reason: 'quota', used: quota.used, limit: quota.limit };
    const fam = await this.prisma.family.findUnique({ where: { id: familyId }, include: { children: true, users: true } });
    const today = new Date();
    const kids = fam.children.map((c) => `${c.name}=${c.id}`).join(', ') || 'none';
    const parents = fam.users.map((u) => `${u.name}=${u.id}`).join(', ');
    const system = `Read a family message (text or a screenshot of an email/WhatsApp/note, any language) and extract ONE actionable item.
Today is ${today.toDateString()}. Timezone ${fam.timezone}. Children: ${kids}. Parents: ${parents}.
Decide kind: "event" if there is a specific date/time or it is an appointment/activity; "task" if it is a to-do/errand with no fixed time.
Resolve relative dates to ISO using today. For an event set start_iso, all_day and event_type (school|health|activity|social|other). For a task set due_iso (may be null).
Match a child name to its id else null. confidence high|medium|low. If nothing actionable, is_event=false.
If the item repeats (e.g. "every day", "every morning", "her gün", "cada dia", "every Monday") set recur to "daily" or "weekly", else "none".
Write "title" in ${lang || 'English'} - translate it if the source is in another language; keep proper names as-is.
Return ONLY minified JSON: is_event,kind,title,start_iso,due_iso,all_day,event_type,child_id,reminder_offset_min,recur,confidence`;

    let draft: any;
    try {
      let content: any;
      if (image && image.data) {
        content = [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType || 'image/jpeg', data: image.data } },
          { type: 'text', text: text ? 'Extra note from user: ' + text : 'Extract the item from this screenshot.' },
        ];
      } else {
        content = text || '';
      }
      const raw = await this.callAnthropic(system, [{ role: 'user', content }]);
      draft = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
    } catch {
      // No local OCR: if it was an image and the model is unavailable, say so.
      if (image) return { is_event: false, reason: 'vision_unavailable' };
      draft = this.localCapture(text || '', fam);
      draft._local = true;
    }

    if (draft.is_event === false) return { is_event: false };
    draft.kind = draft.kind || (draft.start_iso ? 'event' : 'task');
    const dateIso = draft.kind === 'task' ? (draft.due_iso || draft.start_iso) : draft.start_iso;
    draft.start_iso = dateIso && !isNaN(new Date(dateIso).getTime()) ? new Date(dateIso).toISOString() : null;
    if (draft.kind === 'event' && !draft.start_iso) {
      const d = new Date(); d.setHours(9, 0, 0, 0);
      draft.start_iso = d.toISOString(); draft.all_day = true;
    }
    if (!draft.reminder_offset_min) draft.reminder_offset_min = DEFAULT_OFFSET[draft.event_type] || 120;
    const s = await suggestOwner(this.prisma, familyId, { type: draft.event_type, childId: draft.child_id, start: draft.start_iso ? new Date(draft.start_iso) : null });
    draft.suggested_owner_id = s.ownerId;
    draft.suggested_owner_reason = s.reason;
    draft._usage = { used: quota.used, limit: quota.limit };
    return draft;
  }

  // ---- Assistant chat: returns { reply, actions[] } ----
  async assistant(familyId: string, messages: { role: string; content: string }[], lang?: string) {
    const quota = await this.checkQuota(familyId);
    if (!quota.allowed) return { reply: null, reason: 'quota', used: quota.used, limit: quota.limit, actions: [] };
    const fam = await this.prisma.family.findUnique({ where: { id: familyId }, include: { children: true, users: true } });
    const today = new Date();
    const horizon = new Date(today.getTime() + 60 * 864e5);
    const evs = await this.prisma.event.findMany({
      where: { familyId, OR: [{ startTime: { gte: today, lt: horizon } }, { NOT: { recur: 'none' } }] },
      orderBy: { startTime: 'asc' }, take: 40, include: { owner: true },
    });
    const tks = await this.prisma.task.findMany({ where: { familyId, NOT: { status: 'done' } }, take: 20, include: { assignee: true } });
    const shop = await this.prisma.listItem.findMany({ where: { familyId, list: 'shopping' }, orderBy: { createdAt: 'asc' }, take: 60 });
    const weekEnd = new Date(today.getTime() + 8 * 864e5);
    const meals = await this.prisma.meal.findMany({ where: { familyId, date: { gte: new Date(today.getTime() - 864e5), lt: weekEnd } }, orderBy: { date: 'asc' } });
    const fmt = (d: Date) => d.toLocaleString('en-GB', { timeZone: fam.timezone, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    const evStr = evs.map((e) => `${e.title}|${fmt(e.startTime)}${e.allDay ? '|allday' : ''}${e.recur !== 'none' ? '|' + e.recur : ''}${e.owner ? '|' + e.owner.name : ''}`).join('; ') || 'none';
    const tkStr = tks.map((x) => x.title + (x.dueDate ? '|due ' + x.dueDate.toISOString().slice(0, 10) : '') + (x.assignee ? '|' + x.assignee.name : '')).join('; ') || 'none';
    const shopStr = shop.map((x) => x.title + (x.done ? '|done' : '')).join('; ') || 'empty';
    const dayName = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: fam.timezone, weekday: 'short', day: '2-digit', month: 'short' });
    const mealStr = meals.map((m) => `${dayName(m.date)}:${m.title}`).join('; ') || 'none';
    const parents = fam.users.map((u) => `${u.name}=${u.id}`).join(', ');
    const kids = fam.children.map((c) => `${c.name}=${c.id}`).join(', ') || 'none';
    const todayStr = today.toLocaleDateString('en-GB', { timeZone: fam.timezone, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const system = `You are FamPilot. Reply in ${lang || "the user's language"}. Today is ${todayStr} in ${fam.timezone}; all calendar times below are already local.
Parents: ${parents}. Children: ${kids}.
Calendar (next 60 days): ${evStr}
Open tasks: ${tkStr}
Shopping list: ${shopStr}
Meal plan (this week): ${mealStr}
Answer schedule questions ONLY from that data. Items marked daily/weekly repeat - project them onto the asked period. If nothing matches the asked period, say nothing is scheduled for it.
Answer the SPECIFIC question: "when is X" -> give X's weekday, date and time (24h), nothing else. "what time do we pick up" -> find the pickup item and give its time. Only list the full schedule when the user asks for an overview. Use the exact item titles.
Return ONLY minified JSON {"reply":"...","actions":[...]}.
Actions: {"type":"create_event","title","start_iso","all_day":bool,"event_type","child_id":null}
 | {"type":"create_task","title","due_iso":null}
 | {"type":"add_shop_item","title"} (one action per item; "add milk and bread" -> two actions)
 | {"type":"check_shop_item","title"} (mark bought) | {"type":"remove_shop_item","title"}
 | {"type":"set_meal","date_iso","title"} (dinner for that day; empty title clears it)
 | {"type":"suggest","label":"short tappable button text with an emoji","actions":[nested concrete actions]} - a PROPOSAL: it is NOT executed until the user taps it. Never also perform the same items directly when proposing them.
 | {"type":"navigate","target":"calendar|tasks|home"}.
Shopping requests ("add X to the list", "we bought X", "listeye X ekle", "X aldık") -> use shop actions. Meal requests ("Tuesday dinner is pasta", "salı akşamı makarna") -> set_meal with that day's date. When asked "what should I buy" or "what's for dinner", answer from the data above.
PROACTIVE FAMILY ASSISTANT: you are an attentive family assistant, not a command runner. After the core answer, when it GENUINELY helps (max 2 per reply, and not on every message), add suggest actions:
- A meal was just planned or discussed -> propose one fitting seasonal ingredient or side dish for the current month (e.g. in July: courgette, tomatoes, cherries; in December: pumpkin, leek). One suggest chip that bundles add_shop_item for the ingredient(s), and set_meal only if it changes the dish name.
- A planned dish's obvious core ingredients are missing from the shopping list -> one suggest chip "add ingredients for X" bundling 3-6 add_shop_item actions.
- The calendar shows two events the same evening, a parent double-booked, or a very tight gap -> WARN briefly in the reply.
- A trip or dinner-out was created -> the meal-conflict rule below.
Keep the reply text short; the chip itself is the question, so don't also ask "shall I?" in words.
MEAL CONFLICTS (be proactive): when you create an event that replaces cooking dinner at home - dinner out, restaurant, birthday dinner, or a trip/vacation spanning one or more days - ALSO emit set_meal for each affected day, setting a short label in the user's language such as "Eating out"/"Dışarıda" or "Trip"/"Tatil ✈️" (or the restaurant name). If the meal plan above already had something for that day, briefly mention in the reply that you replaced it (e.g. "Perşembe planındaki Makarna'yı 'Dışarıda' olarak güncelledim"). For a multi-day trip, one set_meal per day covered. Reply under 80 words.`;
    try {
      const raw = await this.callAnthropic(system, messages);
      return JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
    } catch {
      return { reply: 'I could not reach the assistant right now. Try the capture endpoint to add events.', actions: [] };
    }
  }

  async suggest(familyId: string, item: { type?: string; childId?: string }) {
    const s = await suggestOwner(this.prisma, familyId, item);
    return { recommendedId: s.ownerId, reason: s.reason };
  }

  // Minimal offline fallback so the endpoint works without an API key.
  private localCapture(text: string, fam: any) {
    const m = text.toLowerCase();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    let date: Date | null = null;
    if (/today/.test(m)) date = new Date(today);
    else if (/tomorrow/.test(m)) { date = new Date(today); date.setDate(date.getDate() + 1); }
    else { const i = days.findIndex((d) => m.includes(d)); if (i >= 0) { date = new Date(today); date.setDate(date.getDate() + ((i - date.getDay() + 7) % 7)); } }
    let allDay = true; let hour = 9; let min = 0;
    const tm = m.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    if (tm) { hour = +tm[1] % 12 + (tm[3] === 'pm' ? 12 : 0); min = tm[2] ? +tm[2] : 0; allDay = false; }
    if (!date) date = new Date(today);
    date.setHours(allDay ? 9 : hour, min, 0, 0);
    const child = fam.children.find((c: any) => m.includes(c.name.toLowerCase()));
    let recur: string = 'none';
    if (/every week|weekly|her hafta|cada semana|chaque semaine|toda semana/.test(m)) recur = 'weekly';
    else if (/every (day|morning|night|evening)|each (day|morning)|daily|her (g\u00fcn|sabah|ak\u015fam)|cada d\u00eda|todos os dias|chaque jour/.test(m)) recur = 'daily';
    else if (/\bevery\b|\bher\b|cada|chaque/.test(m) && days.some((d) => m.includes(d))) recur = 'weekly';
    return {
      is_event: true,
      kind: 'event',
      recur,
      title: text.split(/[\n.!?]/)[0].slice(0, 60),
      start_iso: date.toISOString(),
      all_day: allDay,
      event_type: 'other',
      child_id: child?.id || null,
      reminder_offset_min: 120,
      confidence: 'medium',
    };
  }
}
