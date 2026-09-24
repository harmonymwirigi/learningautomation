require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const storage = require('./services/storage');

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

app.use(cors());
app.use(express.json());

async function start() {
  await db.init();
  console.log(`Database engine: ${db.getEngine()}`);
  if (storage.isCloud()) {
    const rawUrl = process.env.SUPABASE_URL?.trim() || '';
    const normalizedUrl = storage.getSupabaseUrl();
    console.log(`Supabase Storage: ${normalizedUrl}`);
    if (rawUrl !== normalizedUrl) {
      console.warn('SUPABASE_URL was normalized — use the base project URL without /rest/v1 or /storage/v1');
    }
  } else {
    console.log('Supabase Storage: local uploads folder');
  }

  const { requireAuth, requireAdmin } = require('./middleware/auth');

  // Public: registering, signing in, the school/course lists the sign-up form
  // needs before anyone has an account, and the liveness probes.
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/schools', require('./routes/catalog'));
  app.use('/api/health', require('./routes/health'));

  // Everything below reads and writes one account's data, so it all sits
  // behind requireAuth — no route gets to opt out by forgetting to add it.
  app.use('/api', requireAuth);

  app.use('/api/terms', require('./routes/terms'));
  app.use('/api/units', require('./routes/units'));
  app.use('/api/notes', require('./routes/notes'));
  app.use('/api/past-papers', require('./routes/pastPapers'));
  app.use('/api/assignments', require('./routes/assignments'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/study-sessions', require('./routes/studySessions'));
  app.use('/api/calendar', require('./routes/calendar'));
  app.use('/api/topics', require('./routes/topics'));
  app.use('/api/timetable', require('./routes/timetable'));
  app.use('/api/exam-prep', require('./routes/examPrep'));
  app.use('/api/quizzes', require('./routes/quizzes'));
  app.use('/api/automation', require('./routes/automation'));
  app.use('/api/whatsapp', require('./routes/whatsapp'));
  app.use('/api/ai', require('./routes/ai'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/progress', require('./routes/progress'));
  app.use('/api/chat', require('./routes/chat'));
  app.use('/api/admin', requireAdmin, require('./routes/admin'));

  app.use((err, req, res, _next) => {
    // sql.js throws plain strings rather than Errors, so err.message can be
    // undefined — without this the real cause is swallowed.
    const detail = typeof err === 'string' ? err : err?.message;
    console.error(`${req.method} ${req.originalUrl} failed:`, err);
    res.status(err?.status || 500).json({ error: detail || 'Internal server error' });
  });

  const hasFrontend = fs.existsSync(path.join(FRONTEND_DIST, 'index.html'));
  if (hasFrontend) {
    app.use(express.static(FRONTEND_DIST));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.status(503).send(
        'Frontend not built. Run: cd frontend && npm run build\nThen restart the server.',
      );
    });
  }

  const promoted = await require('./services/users').syncAdminsFromEnv();
  if (promoted.length) console.log(`Promoted to admin via ADMIN_EMAILS: ${promoted.join(', ')}`);

  app.listen(PORT, () => {
    if (hasFrontend) {
      console.log(`StudyFlow running at http://localhost:${PORT}`);
    } else {
      console.log(`API running at http://localhost:${PORT} (frontend not built — see above)`);
    }
    logAIStatus();
    startWhatsAppScheduler();
  });
}

function logAIStatus() {
  const { isAIConfigured, getAIConfig } = require('./services/openai');
  if (isAIConfigured()) {
    const { model, provider } = getAIConfig();
    console.log(`AI enabled (${provider} / ${model})`);
  } else {
    console.log('AI not configured — add OPENAI_API_KEY to backend/.env for smart summaries & quizzes');
  }
}

function startWhatsAppScheduler() {
  const { isAnyConfigured } = require('./services/messaging');
  const { sendDailyDigestToAll } = require('./services/studyDigest');
  const { processWhatsAppAlerts } = require('./services/notifications');

  if (!isAnyConfigured()) return;

  console.log('Messaging notifications enabled (Telegram/WhatsApp)');

  // Deadline alerts are per account, so the scheduler walks every account
  // rather than querying the whole table as it did before accounts existed.
  async function alertsForEveryAccount() {
    const accounts = await db.prepare('SELECT id FROM users ORDER BY id').all();
    for (const { id } of accounts) {
      await processWhatsAppAlerts(id).catch((err) => console.warn(`Alerts for user ${id}:`, err.message));
    }
  }

  // Check alerts every 30 minutes
  setInterval(() => {
    alertsForEveryAccount().catch((err) => console.warn('WhatsApp alerts:', err.message));
  }, 30 * 60 * 1000);

  // Daily digest at configured hour
  const digestHour = Number(process.env.WHATSAPP_DIGEST_HOUR || 8);
  if (process.env.WHATSAPP_DAILY_DIGEST !== 'false') {
    setInterval(() => {
      const now = new Date();
      if (now.getHours() === digestHour && now.getMinutes() < 5) {
        sendDailyDigestToAll().catch((err) => console.warn('WhatsApp digest:', err.message));
      }
    }, 5 * 60 * 1000);
  }

  // Run once on startup (after 10s)
  setTimeout(() => {
    alertsForEveryAccount().catch(() => {});
  }, 10000);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
