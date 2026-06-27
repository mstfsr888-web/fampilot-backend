# FamPilot — Backend (API skeleton)

> NestJS + PostgreSQL (Prisma) + Redis (BullMQ). Bu, FamPilot uygulamasının arka uç iskeletidir:
> kimlik doğrulama, aile/üyeler, **gerçek davet akışı**, etkinlikler, görevler (tekrar dahil),
> hatırlatmalar (worker + push) ve AI yakalama/asistan + sorumlu  önerisi.

> **Yayına almak (deploy) için:** ayrıntılı adım adım rehber `DEPLOY.md` dosyasında (Railway / Render).

## Hızlı başlangıç (Quick start)

```bash
cp .env.example .env          # değerleri doldurun
docker compose up -d          # postgres + redis
npm install
npm run prisma:generate
npm run prisma:migrate        # tabloları oluşturur (init migration)
npm run seed                  # (opsiyonel) demo aile: ayse@example.com / password

# 1. terminal — API
npm run start:dev             # http://localhost:3000/api/v1

# 2. terminal — hatırlatma worker'ı
npm run worker
```

> **AI** ve **push** opsiyoneldir. `ANTHROPIC_API_KEY` boşsa `/ai/capture` ve `/assistant/chat`
> dahili bir ayrıştırıcıya düşer; `FCM_SERVER_KEY` boşsa hatırlatmalar konsola yazılır. Yani anahtar olmadan da çalışır.

## Mimari

```
Clients (web / React Native)
        │ HTTPS + JWT
        ▼
NestJS API  ──>  PostgreSQL (Prisma)
   │   │
   │   └─> Redis (BullMQ) ──> Worker (src/worker.ts) ──> FCM push
   └─> Anthropic API (capture + assistant)
ScheduleModule (DigestsService) ──> günlük sabah özeti
```

## Uç noktalar (Endpoints) — taban: `/api/v1`

| Yöntem | Yol | Açıklama |
|---|---|---|
| POST | `/auth/signup` | Aile + ilk ebeveyn oluşturur, token döner |
| POST | `/auth/login` | Giriş, access+refresh token |
| POST | `/auth/refresh` | Token yeniler |
| GET  | `/families/me` | Aile + üyeler + çocuklar |
| POST | `/families/me/children` | Çocuk ekle |
| PATCH| `/children/:id` | Çocuk güncelle |
| PATCH| `/members/:id` | Üye güncelle (pushToken, renk, rol) |
| POST | `/families/me/invites` | **Davet oluştur** → token + link |
| GET  | `/families/me/invites` | Bekleyen davetler |
| POST | `/invites/accept` | **Daveti kabul et** → yeni üye + token |
| GET  | `/events?from=&to=&childId=&ownerId=` | Etkinlikleri listele |
| POST | `/events` | Etkinlik oluştur (otomatik sorumlu + hatırlatma) |
| GET/PATCH/DELETE | `/events/:id` | Tekil etkinlik |
| GET  | `/tasks?status=&assigneeId=` | Görevleri listele |
| POST | `/tasks` | Görev oluştur (otomatik sorumlu önerisi) |
| PATCH| `/tasks/:id` | Görev güncelle (durum, atama) |
| POST | `/ai/capture` | Metin → yapılandırılmış taslak etkinlik |
| POST | `/ai/suggest-assignee` | Sorumlu önerisi (deterministik) |
| POST | `/assistant/chat` | Asistan; create aksiyonlarını sunucuda uygular |

### Örnek akış

```bash
# 1) Kayıt
curl -s localhost:3000/api/v1/auth/signup -H 'content-type: application/json' \
  -d '{"familyName":"Yılmaz ailesi","name":"Ayşe","email":"a@x.com","password":"secret1","timezone":"Europe/Istanbul"}'

# 2) Eş davet et (access token ile)
curl -s localhost:3000/api/v1/families/me/invites -H "authorization: Bearer $ACCESS" \
  -H 'content-type: application/json' -d '{"email":"mert@x.com","role":"parent"}'

# 3) Eş daveti kabul eder (token ile) → kendi tokenını alır
curl -s localhost:3000/api/v1/invites/accept -H 'content-type: application/json' \
  -d '{"token":"<INVITE_TOKEN>","name":"Mert","email":"mert@x.com","password":"secret1"}'
```

## Sonraki adımlar (TODO)
- Google sign-in (`/auth/google`), e-posta doğrulama.
- Tekrarların (daily/weekly) takvimde gerçekten genişletilmesi + her örneğe hatırlatma.
- Çok-bölgeli özet: saatlik cron + aileye-yerel 07:00 filtresi.
- Gmail (OAuth) ve WhatsApp Business API bağlayıcıları → otomatik yakalama.
- WebSocket/push ile **canlı iki yönlü senkron**.
- Testler, rate-limit, audit log.

## Dosya yapısı
```
src/
  main.ts            API girişi (global prefix /api/v1, CORS, validation)
  worker.ts          BullMQ hatırlatma worker'ı
  queue.ts, push.ts  Redis kuyruğu + FCM gönderici (stub)
  common/            jwt guard, ids (ULID), token imzalama, assignment (sorumlu önerisi)
  prisma/            PrismaService + global modül
  auth/ families/ invites/ events/ tasks/ reminders/ ai/
prisma/schema.prisma DB modeli (Family, User, Child, Event, Task, Reminder, Invite)
```

---

## Frontend'i API'ye bağlama (Connecting the app)

`client/api-client.js` tüm uç noktaları sarmalayan, çerçeveden bağımsız bir istemcidir.
Aynı dosya hem `FamPilot.html` web uygulamasında hem de ileride React Native'de kullanılır.

### A) Bağlı web demo (en hızlı doğrulama)
1. Backend'i çalıştırın (`npm run start:dev`).
2. `web-demo/index.html` dosyasını bir statik sunucuyla açın (ESM import için `file://` çalışmaz):
   ```bash
   npx serve .        # veya: python3 -m http.server 8080
   # tarayıcı: http://localhost:8080/web-demo/
   ```
3. Signup → "AI capture" → "Etkinlikleri yükle" → "Gmail bağla" akışını test edin.

### B) Uçtan uca smoke testi
```bash
node scripts/smoke.mjs     # signup → child → event → task → capture → invite
```

### C) Ana FamPilot.html'i bağlama (offline-first → API)
Uygulama bugün `window.storage` ile çevrimdışı çalışıyor. API moduna geçmek için
**veri katmanını** istemciyle değiştirin (kalıbı):

```js
import { FamPilotAPI } from './client/api-client.js';
const USE_API = true;
const api = new FamPilotAPI('https://api.fampilot.app/api/v1');

// load(): storage yerine API
async function load(){
  if(!USE_API) return loadFromStorage();
  const fam = await api.me();
  S.family = { name: fam.name, timezone: fam.timezone, members: fam.users, children: fam.children, lang: LANG };
  S.events = await api.listEvents();
  S.tasks  = await api.listTasks();
}

// mutasyonlar: önce API, sonra yerel state
async function confirmDraft(d, ov){
  const ev = await api.createEvent({ title:d.title, start:d.start_iso, allDay:d.all_day,
    type:d.event_type, childId:d.child_id, ownerId: ov.ownerId, reminderOffsetMin:d.reminder_offset_min });
  S.events.push(ev); render();
}
async function assignEvent(id,u){ await api.updateEvent(id,{ ownerId:u }); /* update S */ }
async function addTask(title,due){ const x = await api.createTask({ title, due }); S.tasks.push(x); render(); }
```

> Öneri: önce **offline-first** kalın; çevrimiçi olunca API'ye yazıp arada senkronlayın.
> Böylece uygulama internet olmadan da çalışmaya devam eder (mevcut davranış korunur).

---

## Gmail bağlayıcı (otomatik yakalama)

E-postaları otomatik okuyup **taslak etkinliklere** dönüştürür (kullanıcı uygulamada onaylar).

### Kurulum (Google Cloud)
1. Google Cloud Console → yeni proje → **Gmail API**'yi etkinleştir.
2. **OAuth consent screen** oluştur (External; test kullanıcısı olarak kendini ekle).
3. **OAuth client (Web application)** oluştur; Authorized redirect URI:
   `http://localhost:3000/api/v1/connectors/gmail/callback`
4. Client ID/secret'i `.env` içine yaz (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`).

### Akış
| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/connectors/gmail/auth-url` | Google izin URL'i döner (uygulama yeni sekmede açar) |
| GET | `/connectors/gmail/callback` | Google buraya yönlendirir; token saklanır |
| POST| `/connectors/gmail/sync` | Son 3 günün postasını tarar → taslak etkinlik üretir |
| GET | `/connectors` | Bağlı kaynakları listeler |
| DELETE | `/connectors/gmail` | Bağlantıyı kaldırır |

- Her **15 dakikada** bir otomatik senkron çalışır (`GmailService.autoSync`, cron).
- Taslaklar `status: "draft"` ile gelir; uygulamada onaylanınca gerçek etkinlik + hatırlatma olur.
- Aynı e-postanın iki kez işlenmesini `ProcessedEmail` tablosu engeller.

> WhatsApp için aynı desen geçerli: `ConnectorType.whatsapp` + WhatsApp Business API webhook'u
> → `ai.capture` → taslak etkinlik. (Kişisel WhatsApp üçüncü taraflarca okunamaz; yalnız Business API.)

### Güvenlik notları
- OAuth token'ları DB'de saklanır — üretimde **şifreleyin** (KMS/at-rest encryption).
- `gmail.readonly` en dar kapsamdır; daha fazlasını istemeyin.
- Google "unverified app" uyarısı: yayına geçerken OAuth doğrulamasından geçin.

## Görüntü (vision) yakalama
`POST /ai/capture` artık metin **veya** ekran görüntüsü kabul eder:
```json
{ "text": "opsiyonel not", "image": { "data": "<base64>", "mediaType": "image/jpeg" } }
```
Dönüş: `{ is_event, kind: "event"|"task", title, start_iso, all_day, event_type, child_id, reminder_offset_min, confidence, suggested_owner_id }`.
- `kind` modele göre etkinlik/görev olur; uygulama taslakta bunu değiştirebilir.
- Görüntü için `ANTHROPIC_API_KEY` gerekir (yerel OCR yok); anahtar yoksa `{ is_event:false, reason:"vision_unavailable" }` döner.

**Gmail bağlayıcı** artık e-postadaki **resim eklerini** de okur: ek varsa onu vision capture'a verir,
yoksa metni kullanır; `kind`'a göre taslak **etkinlik** veya **görev** oluşturur (≤5MB, ilk görsel).
