const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const defaultConfig = require('./defaultConfig');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'site-config.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const META_FILE = path.join(DATA_DIR, 'meta.json');

const DEFAULT_ADMIN_PASSWORD = process.env.DA_ADMIN_PASSWORD || 'da-admin-2026';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function writeJsonAtomic(filePath, data) {
  ensureDataDir();
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function sanitizeString(val, maxLen = 500, fallback = '') {
  if (typeof val !== 'string') return fallback;
  return val.trim().slice(0, maxLen);
}

function sanitizeImageUrl(url, fallback = '/uploads/hero-jamuan.jpg') {
  const s = sanitizeString(url, 600, '');
  if (!s) return fallback;
  if (s.startsWith('/uploads/') || s.startsWith('/assets/')) return s;
  try {
    const parsed = new URL(s);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return s;
    }
  } catch {
    // invalid URL
  }
  return fallback;
}

function sanitizeHex(val, fallback) {
  const s = sanitizeString(val, 10, '');
  return HEX_COLOR_RE.test(s) ? s.toUpperCase() : fallback;
}

function normalizeConfig(input) {
  const src = input && typeof input === 'object' ? input : {};
  const d = defaultConfig;

  const brandIn = src.brand && typeof src.brand === 'object' ? src.brand : {};
  const themeIn = src.theme && typeof src.theme === 'object' ? src.theme : {};
  const sectionsIn = src.sections && typeof src.sections === 'object' ? src.sections : {};
  const heroIn = src.hero && typeof src.hero === 'object' ? src.hero : {};
  const archiveSecIn = src.archiveSection && typeof src.archiveSection === 'object' ? src.archiveSection : {};
  const servicesSecIn = src.servicesSection && typeof src.servicesSection === 'object' ? src.servicesSection : {};
  const processSecIn = src.processSection && typeof src.processSection === 'object' ? src.processSection : {};
  const bookingSecIn = src.bookingSection && typeof src.bookingSection === 'object' ? src.bookingSection : {};

  const radiusNum = Number(themeIn.radius);
  const clampedRadius = Number.isFinite(radiusNum)
    ? Math.max(0, Math.min(24, Math.round(radiusNum)))
    : d.theme.radius;

  const categories = Array.isArray(archiveSecIn.categories)
    ? archiveSecIn.categories.map((c) => sanitizeString(c, 40)).filter(Boolean).slice(0, 12)
    : [...d.archiveSection.categories];

  const archives = Array.isArray(src.archives)
    ? src.archives.slice(0, 100).map((item, idx) => ({
        uid: sanitizeString(item?.uid, 64, `arc-${idx + 1}`),
        id: sanitizeString(item?.id, 20, String(idx + 1).padStart(4, '0')),
        category: sanitizeString(item?.category, 40, categories[0] || 'Wisuda'),
        title: sanitizeString(item?.title, 120, 'Tanpa Judul'),
        location: sanitizeString(item?.location, 120, ''),
        light: sanitizeString(item?.light, 120, ''),
        excerpt: sanitizeString(item?.excerpt, 400, ''),
        notes: sanitizeString(item?.notes, 1200, ''),
        image: sanitizeImageUrl(item?.image, '/uploads/hero-jamuan.jpg'),
        visible: item?.visible !== false
      }))
    : structuredClone(d.archives);

  const services = Array.isArray(src.services)
    ? src.services.slice(0, 20).map((s, idx) => ({
        uid: sanitizeString(s?.uid, 64, `srv-${idx + 1}`),
        formCode: sanitizeString(s?.formCode, 40, 'FORM D/A'),
        badge: sanitizeString(s?.badge, 40, 'PAKET'),
        name: sanitizeString(s?.name, 80, `Paket ${idx + 1}`),
        description: sanitizeString(s?.description, 400, ''),
        features: Array.isArray(s?.features)
          ? s.features.map((f) => sanitizeString(f, 200)).filter(Boolean).slice(0, 15)
          : [],
        price: sanitizeString(s?.price, 80, 'Hubungi Kami'),
        featured: Boolean(s?.featured),
        ctaLabel: sanitizeString(s?.ctaLabel, 60, `Pilih ${sanitizeString(s?.name, 40, 'Paket')}`)
      }))
    : structuredClone(d.services);

  const steps = Array.isArray(processSecIn.steps) && processSecIn.steps.length
    ? processSecIn.steps.slice(0, 8).map((st, idx) => ({
        code: sanitizeString(st?.code, 60, `Tahap 0${idx + 1}`),
        title: sanitizeString(st?.title, 100, ''),
        description: sanitizeString(st?.description, 500, '')
      }))
    : structuredClone(d.processSection.steps);

  const addons = Array.isArray(bookingSecIn.addons)
    ? bookingSecIn.addons.map((a) => sanitizeString(a, 100)).filter(Boolean).slice(0, 20)
    : [...d.bookingSection.addons];

  return {
    brand: {
      name: sanitizeString(brandIn.name, 100, d.brand.name) || d.brand.name,
      shortName: sanitizeString(brandIn.shortName, 60, d.brand.shortName) || d.brand.shortName,
      monogramLeft: sanitizeString(brandIn.monogramLeft, 3, d.brand.monogramLeft) || d.brand.monogramLeft,
      monogramRight: sanitizeString(brandIn.monogramRight, 3, d.brand.monogramRight) || d.brand.monogramRight,
      formCode: sanitizeString(brandIn.formCode, 40, d.brand.formCode),
      subtitle: sanitizeString(brandIn.subtitle, 80, d.brand.subtitle),
      city: sanitizeString(brandIn.city, 80, d.brand.city),
      serviceArea: sanitizeString(brandIn.serviceArea, 120, d.brand.serviceArea),
      instagram: sanitizeString(brandIn.instagram, 60, d.brand.instagram).replace(/^@/, ''),
      whatsapp: sanitizeString(brandIn.whatsapp, 40, d.brand.whatsapp),
      whatsappNumber: sanitizeString(brandIn.whatsappNumber, 24, d.brand.whatsappNumber).replace(/[^0-9]/g, ''),
      email: sanitizeString(brandIn.email, 120, d.brand.email),
      hours: sanitizeString(brandIn.hours, 80, d.brand.hours),
      metaDescription: sanitizeString(brandIn.metaDescription, 300, d.brand.metaDescription)
    },
    theme: {
      cream: sanitizeHex(themeIn.cream, d.theme.cream),
      creamDeep: sanitizeHex(themeIn.creamDeep, d.theme.creamDeep),
      paper: sanitizeHex(themeIn.paper, d.theme.paper),
      ink: sanitizeHex(themeIn.ink, d.theme.ink),
      inkMuted: sanitizeHex(themeIn.inkMuted, d.theme.inkMuted),
      orange: sanitizeHex(themeIn.orange, d.theme.orange),
      orangeDark: sanitizeHex(themeIn.orangeDark, d.theme.orangeDark),
      blue: sanitizeHex(themeIn.blue, d.theme.blue),
      yellow: sanitizeHex(themeIn.yellow, d.theme.yellow),
      radius: clampedRadius
    },
    sections: {
      hero: sectionsIn.hero !== false,
      archives: sectionsIn.archives !== false,
      services: sectionsIn.services !== false,
      process: sectionsIn.process !== false,
      booking: sectionsIn.booking !== false
    },
    hero: {
      kicker: sanitizeString(heroIn.kicker, 100, d.hero.kicker),
      headline: sanitizeString(heroIn.headline, 180, d.hero.headline),
      description: sanitizeString(heroIn.description, 600, d.hero.description),
      primaryCta: sanitizeString(heroIn.primaryCta, 60, d.hero.primaryCta),
      secondaryCta: sanitizeString(heroIn.secondaryCta, 60, d.hero.secondaryCta),
      image: sanitizeImageUrl(heroIn.image, d.hero.image),
      imageAlt: sanitizeString(heroIn.imageAlt, 200, d.hero.imageAlt),
      watermark: sanitizeString(heroIn.watermark, 60, d.hero.watermark),
      captionLeft: sanitizeString(heroIn.captionLeft, 160, d.hero.captionLeft),
      captionRight: sanitizeString(heroIn.captionRight, 160, d.hero.captionRight)
    },
    archiveSection: {
      kicker: sanitizeString(archiveSecIn.kicker, 60, d.archiveSection.kicker),
      title: sanitizeString(archiveSecIn.title, 120, d.archiveSection.title),
      description: sanitizeString(archiveSecIn.description, 500, d.archiveSection.description),
      categories: categories.length ? categories : [...d.archiveSection.categories]
    },
    archives,
    servicesSection: {
      kicker: sanitizeString(servicesSecIn.kicker, 60, d.servicesSection.kicker),
      title: sanitizeString(servicesSecIn.title, 120, d.servicesSection.title),
      description: sanitizeString(servicesSecIn.description, 500, d.servicesSection.description)
    },
    services,
    processSection: {
      kicker: sanitizeString(processSecIn.kicker, 60, d.processSection.kicker),
      title: sanitizeString(processSecIn.title, 120, d.processSection.title),
      description: sanitizeString(processSecIn.description, 500, d.processSection.description),
      steps,
      quote: sanitizeString(processSecIn.quote, 400, d.processSection.quote),
      stamp: sanitizeString(processSecIn.stamp, 60, d.processSection.stamp)
    },
    bookingSection: {
      kicker: sanitizeString(bookingSecIn.kicker, 60, d.bookingSection.kicker),
      title: sanitizeString(bookingSecIn.title, 120, d.bookingSection.title),
      description: sanitizeString(bookingSecIn.description, 500, d.bookingSection.description),
      infoTitle: sanitizeString(bookingSecIn.infoTitle, 100, d.bookingSection.infoTitle),
      infoDescription: sanitizeString(bookingSecIn.infoDescription, 500, d.bookingSection.infoDescription),
      formCode: sanitizeString(bookingSecIn.formCode, 80, d.bookingSection.formCode),
      formBadge: sanitizeString(bookingSecIn.formBadge, 40, d.bookingSection.formBadge),
      submitLabel: sanitizeString(bookingSecIn.submitLabel, 60, d.bookingSection.submitLabel),
      helperText: sanitizeString(bookingSecIn.helperText, 120, d.bookingSection.helperText),
      addons
    }
  };
}

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return { salt: s, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function loadSessions() {
  const raw = readJsonSafe(SESSIONS_FILE, {});
  const now = Date.now();
  const pruned = {};
  let changed = false;
  for (const [tok, sess] of Object.entries(raw)) {
    if (sess && typeof sess.expiresAt === 'number' && sess.expiresAt > now) {
      pruned[tok] = sess;
    } else {
      changed = true;
    }
  }
  if (changed && fs.existsSync(SESSIONS_FILE)) {
    writeJsonAtomic(SESSIONS_FILE, pruned);
  }
  return pruned;
}

function saveSessions(sessionsObj) {
  writeJsonAtomic(SESSIONS_FILE, sessionsObj);
}

function initStore() {
  ensureDataDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    writeJsonAtomic(CONFIG_FILE, normalizeConfig(defaultConfig));
  }

  if (!fs.existsSync(BOOKINGS_FILE)) {
    const sampleBookings = [
      {
        id: 'bkg-sample-1',
        receiptCode: 'D/A-2026-0045',
        clientName: 'Nadia & Raka',
        clientPhone: '0812-2345-6789',
        serviceCategory: 'Wedding',
        eventDate: '2026-12-19',
        eventLocation: 'Bandung · Rumah Heritage Dago',
        addons: ['Cetak Contact Sheet', 'Rol Film 35mm Analog'],
        notes: 'Akad pagi pukul 08.00 dilanjutkan jamuan makan siang intim ~80 tamu.',
        status: 'DIKONFIRMASI',
        adminNotes: 'DP 30% diterima. Tim 2 fotografer siap.',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString()
      },
      {
        id: 'bkg-sample-2',
        receiptCode: 'D/A-2026-0046',
        clientName: 'Damar Pratama',
        clientPhone: '0857-9876-5432',
        serviceCategory: 'Wisuda',
        eventDate: '2026-12-05',
        eventLocation: 'Kampus ITB Ganesha',
        addons: ['Ekstra Jam Liputan'],
        notes: 'Wisuda pagi bersama keluarga inti dan 6 teman studio.',
        status: 'BARU',
        adminNotes: '',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString()
      }
    ];
    writeJsonAtomic(BOOKINGS_FILE, sampleBookings);
  }

  if (!fs.existsSync(META_FILE)) {
    const existing = readJsonSafe(BOOKINGS_FILE, []);
    let maxSerial = 46;
    for (const b of existing) {
      const m = String(b.receiptCode || '').match(/(\d+)$/);
      if (m) maxSerial = Math.max(maxSerial, parseInt(m[1], 10));
    }
    writeJsonAtomic(META_FILE, { lastBookingSerial: maxSerial });
  }

  if (!fs.existsSync(AUTH_FILE)) {
    const { salt, hash } = hashPassword(DEFAULT_ADMIN_PASSWORD);
    writeJsonAtomic(AUTH_FILE, {
      salt,
      hash,
      isDefaultPassword: true,
      updatedAt: new Date().toISOString()
    });
  }
}

function getConfig() {
  initStore();
  const raw = readJsonSafe(CONFIG_FILE, null);
  return normalizeConfig(raw || defaultConfig);
}

function saveConfig(newConfig) {
  initStore();
  const normalized = normalizeConfig(newConfig);
  writeJsonAtomic(CONFIG_FILE, normalized);
  return normalized;
}

function resetConfig() {
  initStore();
  const fresh = normalizeConfig(defaultConfig);
  writeJsonAtomic(CONFIG_FILE, fresh);
  return fresh;
}

function getBookings() {
  initStore();
  const list = readJsonSafe(BOOKINGS_FILE, []);
  return Array.isArray(list) ? list : [];
}

function validateBookingInput(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const clientName = sanitizeString(p.clientName, 120);
  const clientPhone = sanitizeString(p.clientPhone, 32);
  const serviceCategory = sanitizeString(p.serviceCategory, 80, 'Wedding');
  const eventDate = sanitizeString(p.eventDate, 20);
  const eventLocation = sanitizeString(p.eventLocation, 160);
  const notes = sanitizeString(p.notes, 1000) || '—';
  const addons = Array.isArray(p.addons)
    ? p.addons.map((a) => sanitizeString(a, 100)).filter(Boolean).slice(0, 20)
    : [];

  if (!clientName || !eventDate || !eventLocation) {
    return {
      ok: false,
      error: 'Mohon lengkapi Nama Lengkap, Rencana Tanggal, dan Lokasi/Kota terlebih dahulu.'
    };
  }

  if (!DATE_RE.test(eventDate)) {
    return { ok: false, error: 'Format Rencana Tanggal tidak valid (gunakan YYYY-MM-DD).' };
  }

  if (clientPhone && clientPhone.replace(/[^0-9+]/g, '').length < 8) {
    return { ok: false, error: 'Nomor WhatsApp minimal 8 digit angka.' };
  }

  return {
    ok: true,
    data: { clientName, clientPhone, serviceCategory, eventDate, eventLocation, addons, notes }
  };
}

function nextBookingSerial() {
  initStore();
  const meta = readJsonSafe(META_FILE, { lastBookingSerial: 46 });
  const bookings = getBookings();
  let maxSerial = Number(meta.lastBookingSerial) || 46;
  for (const b of bookings) {
    const m = String(b.receiptCode || '').match(/(\d+)$/);
    if (m) maxSerial = Math.max(maxSerial, parseInt(m[1], 10));
  }
  const next = maxSerial + 1;
  writeJsonAtomic(META_FILE, { lastBookingSerial: next });
  return next;
}

function createBooking(payload) {
  const validated = validateBookingInput(payload);
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  const bookings = getBookings();
  const year = new Date().getFullYear();
  const serial = String(nextBookingSerial()).padStart(4, '0');
  const receiptCode = `D/A-${year}-${serial}`;

  const booking = {
    id: 'bkg-' + crypto.randomBytes(6).toString('hex'),
    receiptCode,
    ...validated.data,
    status: 'BARU',
    adminNotes: '',
    createdAt: new Date().toISOString()
  };

  bookings.unshift(booking);
  writeJsonAtomic(BOOKINGS_FILE, bookings);
  return booking;
}

function updateBooking(id, patch) {
  const bookings = getBookings();
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx === -1) return null;

  const allowedStatuses = ['BARU', 'DIKONFIRMASI', 'SELESAI', 'DIBATALKAN'];
  if (patch.status && allowedStatuses.includes(patch.status)) {
    bookings[idx].status = patch.status;
  }
  if (typeof patch.adminNotes === 'string') {
    bookings[idx].adminNotes = sanitizeString(patch.adminNotes, 1000);
  }
  bookings[idx].updatedAt = new Date().toISOString();

  writeJsonAtomic(BOOKINGS_FILE, bookings);
  return bookings[idx];
}

function deleteBooking(id) {
  const bookings = getBookings();
  const filtered = bookings.filter((b) => b.id !== id);
  if (filtered.length === bookings.length) return false;
  writeJsonAtomic(BOOKINGS_FILE, filtered);
  return true;
}

function getAuthRecord() {
  initStore();
  return readJsonSafe(AUTH_FILE, null);
}

function loginAdmin(password) {
  const auth = getAuthRecord();
  if (!auth || !verifyPassword(String(password || ''), auth.salt, auth.hash)) {
    return null;
  }
  const token = crypto.randomBytes(32).toString('hex');
  const sessions = loadSessions();
  sessions[token] = {
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  };
  saveSessions(sessions);
  return { token, isDefaultPassword: Boolean(auth.isDefaultPassword) };
}

function validateSession(token) {
  if (!token) return false;
  const sessions = loadSessions();
  const session = sessions[token];
  if (!session) return false;
  return Date.now() <= session.expiresAt;
}

function logoutSession(token) {
  if (!token) return;
  const sessions = loadSessions();
  if (sessions[token]) {
    delete sessions[token];
    saveSessions(sessions);
  }
}

function changePassword(currentPassword, newPassword, keepToken) {
  const auth = getAuthRecord();
  if (!auth || !verifyPassword(String(currentPassword || ''), auth.salt, auth.hash)) {
    return { ok: false, error: 'Kata sandi saat ini tidak sesuai.' };
  }
  if (!newPassword || String(newPassword).length < 6) {
    return { ok: false, error: 'Kata sandi baru minimal 6 karakter.' };
  }
  const { salt, hash } = hashPassword(String(newPassword));
  writeJsonAtomic(AUTH_FILE, {
    salt,
    hash,
    isDefaultPassword: false,
    updatedAt: new Date().toISOString()
  });

  // Revoke all other sessions except the active one
  const sessions = loadSessions();
  const nextSessions = {};
  if (keepToken && sessions[keepToken]) {
    nextSessions[keepToken] = sessions[keepToken];
  }
  saveSessions(nextSessions);

  return { ok: true };
}

module.exports = {
  initStore,
  sanitizeImageUrl,
  normalizeConfig,
  validateBookingInput,
  getConfig,
  saveConfig,
  resetConfig,
  getBookings,
  createBooking,
  updateBooking,
  deleteBooking,
  getAuthRecord,
  loginAdmin,
  validateSession,
  logoutSession,
  changePassword,
  DEFAULT_ADMIN_PASSWORD
};
