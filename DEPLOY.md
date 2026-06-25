# FamPilot — Deploy rehberi

Hedef: backend'i herkese açık bir URL'e koymak, sonra `FamPilot.html`'i ona bağlamak.
İki kolay yol var — **Railway** (en hızlı) veya **Render** (blueprint ile tek tık).

İhtiyacın olan parçalar: **API** (web), **worker** (hatırlatmalar), **PostgreSQL**, **Redis**.

---

## Seçenek A — Railway (önerilen, en hızlı)

1. https://railway.app → GitHub ile giriş → **New Project**.
2. Bu repoyu GitHub'a push'la, sonra **Deploy from GitHub repo** → repoyu seç.
   Railway `Dockerfile`'ı otomatik kullanır.
3. Projeye iki eklenti ekle: **+ New → Database → PostgreSQL**, sonra tekrar **+ New → Database → Redis**.
   Bunlar otomatik olarak `DATABASE_URL` ve `REDIS_URL` değişkenlerini sağlar.
4. **API servisi** (repo servisi) → **Variables** sekmesi:
   - `DATABASE_URL` → Postgres'ten referansla: `${{Postgres.DATABASE_URL}}`
   - `REDIS_URL` → Redis'ten referansla: `${{Redis.REDIS_URL}}`
   - `JWT_SECRET` → uzun rastgele bir değer
   - `WEB_ORIGIN` → `*` (sonra uygulama adresinle daralt)
   - (opsiyonel) `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL=claude-sonnet-4-6`
   - (opsiyonel) `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `FCM_SERVER_KEY`
   - Start command zaten Dockerfile'da: şema push + API başlatma.
5. **Worker için ikinci servis:** **+ New → Empty Service → Deploy from same repo** (veya repo servisini kopyala).
   Bu servisin **Start Command**'ını `node dist/worker.js` yap; aynı `DATABASE_URL` ve `REDIS_URL` değişkenlerini ekle.
6. API servisinde **Settings → Networking → Generate Domain** ile herkese açık URL al
   (örn. `https://fampilot-api-production.up.railway.app`).
7. Doğrula: tarayıcıda `https://<API-URL>/api/v1/health` → `{"ok":true,...}` görmelisin.

---

## Seçenek B — Render (blueprint ile)

1. Repoyu GitHub'a push'la (içinde `render.yaml` var).
2. https://render.com → **New → Blueprint** → repoyu seç → **Apply**.
   Bu, dört şeyi birden kurar: Postgres, Redis (Key Value), API (web), worker.
3. Dashboard'da API servisinin **Environment** kısmına opsiyonel anahtarları gir
   (`ANTHROPIC_API_KEY`, `GOOGLE_*`, `FCM_SERVER_KEY`).
4. Doğrula: `https://<api>.onrender.com/api/v1/health`.

> Not (ücretsiz katman): Render free web servisi hareketsizken uyur (ilk istek yavaş açılır),
> free Postgres'in süre sınırı olabilir. Railway kullanım-bazlı kredi verir. Üretim için ücretli katman önerilir.

---

## Deploy sonrası doğrulama (smoke test)

Bilgisayarından, deploy edilmiş URL'e karşı:
```bash
API_BASE="https://<API-URL>/api/v1" node scripts/smoke.mjs
```
`✓ smoke test passed` görürsen API + DB + (capture) çalışıyor demektir.

---


### Deploy etmeden doğrulama harness'ini denemek (offline)
İki terminalde:
```bash
node scripts/mock-api.mjs                              # sahte API (port 4599)
API_BASE="http://localhost:4599/api/v1" node scripts/verify.mjs
```
`✓ ALL PASSED (11 ok, 0 failed)` görmelisin. Bu, istemci + kontrol listesinin doğru olduğunu kanıtlar;
gerçek dağıtımda yalnızca `API_BASE`'i kendi URL'inle değiştir.

---

## Uygulamayı (FamPilot.html) bağlama

1. `client/api-client.js`'i kullan; base URL'i deploy adresin yap:
   ```js
   const api = new FamPilotAPI('https://<API-URL>/api/v1');
   ```
2. `web-demo/index.html`'i statik sunucuyla aç, base alanına aynı URL'i yaz, signup → capture → events ile test et.
3. Ana uygulamada (README "Connecting the app" bölümü) `window.storage` veri katmanını istemciyle değiştir; **offline-first** kalmaya devam et.
4. CORS: `WEB_ORIGIN`'i uygulamanın yayınlandığı adrese ayarla (örn. `https://app.fampilot.app`).
   Geliştirme sırasında `*` kalabilir.

---

## Gmail bağlayıcı (deploy sonrası ŞART olan adım)

OAuth redirect URI **deploy adresine** işaret etmeli:

1. Google Cloud Console → OAuth client → **Authorized redirect URIs**'e ekle:
   `https://<API-URL>/api/v1/connectors/gmail/callback`
2. API servisinde `GOOGLE_REDIRECT_URI`'yi aynı değere ayarla, `GOOGLE_CLIENT_ID/SECRET`'i gir.
3. Uygulamadan `/connectors/gmail/auth-url` → izin → `/sync` ile taslak etkinlikler oluşur.

---

## Üretim notları (sonraki adımlar)
- **Migration'a geç:** Şu an `prisma db push` ile şema uygulanıyor (hızlı). Üretimde
  yerelde `prisma migrate dev` ile migration dosyaları üret, commit'le, deploy'da `prisma migrate deploy` çalıştır.
- **Sırlar:** `JWT_SECRET`, OAuth ve FCM anahtarlarını sağlayıcı "secrets" olarak sakla; repoya koyma.
- **OAuth token şifreleme**, **rate-limit**, **HTTPS zorunlu**, **log/observability** ekle.
- Tek tıkla kalıcı worker yerine, ileride mesaj kuyruğunu yönetilen bir servise taşıyabilirsin.

---

## Tek komutla doğrulama (deploy sonrası)

Deploy bittiğinde, API adresini verip tüm kritik yolları otomatik test edin:
```bash
API_BASE="https://<API-URL>/api/v1" node scripts/verify.mjs
```
Beklenen çıktı: health, signup, family, event/task oluşturma (otomatik sorumlu önerisiyle),
listeleme, AI capture, davet ve connectors adımlarının tümünde `✓` ve sonda **✓ ALL PASSED**.

Bir adım `✗` ise:
- **/health ✗** → servis ayakta değil / yanlış URL. Render'da web servisinin "Live" olduğunu, Railway'de domain oluşturulduğunu kontrol edin.
- **signup ✗ (HTTP 500)** → DB bağlı değil. `DATABASE_URL` ve şema push'unu (`prisma db push`) kontrol edin.
- **capture text döner ama event yok** → normaldir; `ANTHROPIC_API_KEY` yoksa yerel ayrıştırıcı kullanılır.
- **connectors boş** → normaldir; Gmail bağlanınca dolar.

## Uygulamayı (FamPilot.html) sunucuya bağlama
1. Uygulamada **Ayarlar → "Cihazlar arası senkron"** bölümünü açın.
2. **Sunucu adresi** alanına `https://<API-URL>/api/v1` yazın, e-posta + şifre girin.
3. İlk kez için **Kayıt ol**, mevcut hesap için **Giriş yap**.
4. Bağlanınca veriler sunucudan çekilir; **yakalama (metin + ekran görüntüsü)** sunucu üzerinden çalışır
   (API anahtarı sunucuda olduğu için telefonda da çalışır). **Bağlantıyı kes** ile yerel veriniz geri yüklenir.
5. CORS: API'de `WEB_ORIGIN`'i uygulamanın yayınlandığı adrese ayarlayın (geliştirmede `*` olabilir).
