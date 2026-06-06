# Monitoring & Alerting Kurulum

Şu an: sunucu down olunca haber yok. Hedef: Sentry (hata) + UptimeRobot (downtime) + Slack/Telegram (alert).

## 1. Sentry (frontend + backend error tracking)

### Kurulum
```bash
npm install --save @sentry/node @sentry/browser
```

### Backend (server/app.js'in en üstüne)
```js
const Sentry = require("@sentry/node");
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL ? "production" : "local",
    tracesSampleRate: 0.1, // %10 sample rate
    release: process.env.VERCEL_GIT_COMMIT_SHA || "local",
  });
}

// Express middleware (createApp() içinde, app oluştuktan sonra)
app.use(Sentry.Handlers.requestHandler());
// ... routes ...
app.use(Sentry.Handlers.errorHandler());
```

### Frontend (public/app.js'in başında)
```js
if (window.location.hostname !== "localhost") {
  const script = document.createElement("script");
  script.src = "https://browser.sentry-cdn.com/8.0.0/bundle.tracing.min.js";
  script.crossOrigin = "anonymous";
  script.onload = () => {
    Sentry.init({
      dsn: "https://YOUR_PUBLIC_DSN@sentry.io/PROJECT_ID",
      tracesSampleRate: 0.1,
      release: document.querySelector('meta[name="app-version"]')?.content,
    });
  };
  document.head.appendChild(script);
}
```

### Vercel env var ekle
```bash
vercel env add SENTRY_DSN production
# Yapıştır: https://xxx@xxx.ingest.sentry.io/xxx
```

### Sentry hesabı
- https://sentry.io → ücretsiz (5K event/ay)
- Proje oluştur: "hamburg-depo" (Node.js)
- Diğer proje: "hamburg-depo-frontend" (Browser JavaScript)
- DSN'leri al

## 2. UptimeRobot (downtime monitoring)

### Setup
- https://uptimerobot.com — ücretsiz (50 monitor, 5 dakika interval)
- Yeni monitör:
  - **Type**: HTTPS
  - **URL**: `https://drckaltetechnik.vercel.app/api/health`
  - **Interval**: 5 dakika
  - **Alert contacts**: email/SMS/Slack/Telegram
  - **Keyword monitoring** (opsiyonel): `"ok":true` aranır, yoksa down sayar

### Önerilen monitörler
| URL | Açıklama |
|---|---|
| `https://drckaltetechnik.vercel.app/api/health` | Vercel canlı |
| `https://drckaltetechnik.vercel.app/` | Login sayfası |
| `https://depo.drckaltetechnik.de/api/health` | Lokal sunucu (named tunnel sonrası) |
| `https://jzdwwepybhxctasmkhmz.supabase.co/rest/v1/` | Supabase canlı (anon key header'la) |

### Status page (opsiyonel)
UptimeRobot bedava plana 1 public status page veriyor → `https://status.drckaltetechnik.de`

## 3. Slack/Telegram alert bot

### Telegram bot
1. **@BotFather**'a `/newbot` → bot adı + username → token al
2. Senin kişisel chat ID'ni öğren: https://api.telegram.org/bot<TOKEN>/getUpdates
3. UptimeRobot → Settings → Add Alert Contact → Telegram → token + chat_id

### Slack webhook
- Slack workspace → "Hamburg Depo Alerts" kanalı
- Apps → "Incoming Webhooks" → workspace seç → kanal seç → webhook URL al
- UptimeRobot → Alert Contacts → "Web Hook" → URL yapıştır

## 4. Health check endpoint güçlendirme

Şu anki `/api/health` sadece DB bağlı mı kontrol ediyor. Daha detaylı check:

```js
app.get("/api/health-detailed", async (req, res) => {
  const checks = {};
  try {
    // DB
    const dbT = Date.now();
    await query("SELECT 1");
    checks.db = { ok: true, latency: Date.now() - dbT };
  } catch (e) {
    checks.db = { ok: false, error: e.message };
  }
  try {
    // Storage
    const stT = Date.now();
    const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket/item-images`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
    });
    checks.storage = { ok: r.ok, latency: Date.now() - stT };
  } catch (e) {
    checks.storage = { ok: false, error: e.message };
  }
  checks.memory = {
    rss: Math.round(process.memoryUsage().rss / 1048576),
    heapUsed: Math.round(process.memoryUsage().heapUsed / 1048576),
  };
  checks.uptime = Math.round(process.uptime());
  const overall = checks.db.ok && (!checks.storage || checks.storage.ok);
  res.status(overall ? 200 : 503).json({ ok: overall, checks });
});
```

## 5. Cost özet

| Servis | Plan | Maliyet |
|---|---|---|
| Sentry | Developer (5K events/ay) | Ücretsiz |
| Sentry | Team (50K events/ay) | $26/ay |
| UptimeRobot | Free (50 monitor, 5dk) | Ücretsiz |
| UptimeRobot | Pro (1 dk interval, SMS) | $7/ay |
| Telegram bot | — | Ücretsiz |
| Slack webhook | — | Ücretsiz (workspace varsa) |

Önerilen başlangıç: Sentry Free + UptimeRobot Free + Telegram bot = **€0/ay**.
