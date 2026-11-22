const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const store = require('./src/store');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_VERCEL = Boolean(process.env.VERCEL);

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

if (!IS_VERCEL) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
store.initStore();

app.disable('x-powered-by');

// Security headers (SAMEORIGIN allows Admin Live Preview iframe)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '6mb' }));
app.use(express.static(PUBLIC_DIR));

// Simple sliding-window in-memory rate limiter
function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (hits.get(key) || []).filter((t) => t > cutoff);
    if (timestamps.length >= max) {
      return res.status(429).json({ error: message });
    }
    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.'
});

const bookingLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Terlalu banyak pengajuan dari perangkat ini. Silakan tunggu beberapa menit.'
});

// Strict MIME-to-extension mapping for uploads
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const storage = IS_VERCEL
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
      filename: (_req, file, cb) => {
        const ext = MIME_TO_EXT[file.mimetype] || '.jpg';
        const rawBase = path.basename(file.originalname || 'foto', path.extname(file.originalname || ''));
        const safeBase = rawBase
          .toLowerCase()
          .replace(/[^a-z0-9-_]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 32);
        cb(null, `${safeBase || 'foto'}-${Date.now()}${ext}`);
      }
    });

const upload = multer({
  storage,
  limits: { fileSize: IS_VERCEL ? 4 * 1024 * 1024 : 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (MIME_TO_EXT[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Format file harus JPG, PNG, atau WEBP.'));
    }
  }
});

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

function requireAdmin(req, res, next) {
  const token = getBearerToken(req);
  if (!store.validateSession(token)) {
    return res.status(401).json({ error: 'Sesi admin tidak valid atau telah berakhir.' });
  }
  req.adminToken = token;
  next();
}

// =====================
// PUBLIC API
// =====================
app.get('/api/public/site', (_req, res) => {
  res.json(store.getConfig());
});

app.post('/api/public/bookings', bookingLimiter, (req, res) => {
  const check = store.validateBookingInput(req.body);
  if (!check.ok) {
    return res.status(400).json({ error: check.error });
  }

  const booking = store.createBooking(check.data);
  res.status(201).json(booking);
});

// =====================
// ADMIN AUTH API
// =====================
app.get('/api/admin/auth-info', (_req, res) => {
  const auth = store.getAuthRecord();
  res.json({ isDefaultPassword: Boolean(auth && auth.isDefaultPassword) });
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  const result = store.loginAdmin(password);
  if (!result) {
    return res.status(401).json({ error: 'Kata sandi salah. Silakan coba lagi.' });
  }
  res.json(result);
});

app.post('/api/admin/logout', (req, res) => {
  const token = getBearerToken(req);
  store.logoutSession(token);
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (_req, res) => {
  const auth = store.getAuthRecord();
  res.json({ authenticated: true, isDefaultPassword: Boolean(auth && auth.isDefaultPassword) });
});

app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const result = store.changePassword(currentPassword, newPassword, req.adminToken);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ ok: true, message: 'Kata sandi admin berhasil diperbarui. Sesi lain telah ditutup.' });
});

// =====================
// ADMIN SITE CONFIG API
// =====================
app.get('/api/admin/site', requireAdmin, (_req, res) => {
  res.json(store.getConfig());
});

app.put('/api/admin/site', requireAdmin, (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object' || !payload.brand || !payload.theme) {
    return res.status(400).json({ error: 'Format konfigurasi situs tidak valid.' });
  }
  const saved = store.saveConfig(payload);
  res.json(saved);
});

app.post('/api/admin/site/reset', requireAdmin, (_req, res) => {
  const fresh = store.resetConfig();
  res.json(fresh);
});

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Gagal mengunggah gambar.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada file gambar yang dikirim.' });
    }
    if (IS_VERCEL && req.file.buffer) {
      const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      return res.status(201).json({
        url: dataUrl,
        filename: req.file.originalname || 'upload',
        size: req.file.size
      });
    }
    res.status(201).json({
      url: '/uploads/' + req.file.filename,
      filename: req.file.filename,
      size: req.file.size
    });
  });
});

// =====================
// ADMIN BOOKINGS API
// =====================
app.get('/api/admin/bookings', requireAdmin, (_req, res) => {
  res.json(store.getBookings());
});

app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const updated = store.updateBooking(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ error: 'Data pengajuan tidak ditemukan.' });
  }
  res.json(updated);
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const ok = store.deleteBooking(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: 'Data pengajuan tidak ditemukan.' });
  }
  res.json({ ok: true });
});

// =====================
// PAGE ROUTES
// =====================
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Global JSON error fallback
app.use((err, _req, res, _next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Ukuran data terlalu besar.' });
  }
  res.status(500).json({ error: 'Terjadi kesalahan internal server.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Department of Artifacts (D/A) — Web MVP`);
    console.log(`  Public Web  : http://localhost:${PORT}`);
    console.log(`  Admin Panel : http://localhost:${PORT}/admin`);
    console.log(`  Default Pass: ${store.DEFAULT_ADMIN_PASSWORD}\n`);
  });
}

module.exports = app;
