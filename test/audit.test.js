const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../server');
const store = require('../src/store');

let server;
let baseUrl;
let adminToken;
let createdBookingIds = [];

before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app).listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  // Cleanup any test bookings
  if (adminToken) {
    for (const id of createdBookingIds) {
      await fetch(`${baseUrl}/api/admin/bookings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      }).catch(() => {});
    }
  }
  await new Promise((resolve) => server.close(resolve));
});

describe('Security Headers & Pages', () => {
  it('sets security headers and hides x-powered-by', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });

  it('serves /admin page cleanly', async () => {
    const res = await fetch(`${baseUrl}/admin`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /FORM D\/A-AUTH/);
  });
});

describe('Sanitization & Config Normalization', () => {
  it('blocks javascript: and data: URLs in sanitizeImageUrl', () => {
    assert.equal(store.sanitizeImageUrl('javascript:alert(1)'), '/uploads/hero-jamuan.jpg');
    assert.equal(store.sanitizeImageUrl('data:text/html,<script>x</script>'), '/uploads/hero-jamuan.jpg');
    assert.equal(store.sanitizeImageUrl('/uploads/test.jpg'), '/uploads/test.jpg');
    assert.equal(store.sanitizeImageUrl('https://cdn.example.com/p.webp'), 'https://cdn.example.com/p.webp');
  });

  it('normalizes malformed theme colors, radius, and dangerous URLs', () => {
    const norm = store.normalizeConfig({
      brand: { name: 'D/A Test' },
      theme: { cream: 'not-a-hex', radius: 999 },
      hero: { image: 'javascript:evil()' }
    });
    assert.equal(norm.theme.cream, '#F3E9D2');
    assert.equal(norm.theme.radius, 24);
    assert.equal(norm.hero.image, '/uploads/hero-jamuan.jpg');
  });
});

describe('Booking Validation & Monotonic Receipt Codes', () => {
  it('rejects invalid date format and short phone number', async () => {
    const badDate = await fetch(`${baseUrl}/api/public/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Budi',
        clientPhone: '08123456789',
        eventDate: '20-12-2026',
        eventLocation: 'Bandung'
      })
    });
    assert.equal(badDate.status, 400);

    const badPhone = await fetch(`${baseUrl}/api/public/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Budi',
        clientPhone: '1234',
        eventDate: '2026-12-20',
        eventLocation: 'Bandung'
      })
    });
    assert.equal(badPhone.status, 400);
  });

  it('generates strictly monotonic receipt codes even after deleting the latest booking', async () => {
    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: store.DEFAULT_ADMIN_PASSWORD })
    });
    assert.equal(loginRes.status, 200);
    adminToken = (await loginRes.json()).token;

    const r1 = await fetch(`${baseUrl}/api/public/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Audit Klien 1',
        clientPhone: '0812-1111-2222',
        serviceCategory: 'Wisuda',
        eventDate: '2026-12-21',
        eventLocation: 'Bandung'
      })
    });
    assert.equal(r1.status, 201);
    const b1 = await r1.json();
    assert.equal(b1.clientPhone, '0812-1111-2222');

    // Delete b1 immediately
    const del1 = await fetch(`${baseUrl}/api/admin/bookings/${b1.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(del1.status, 200);

    // Create b2 — receipt code MUST be strictly greater than b1's receipt code
    const r2 = await fetch(`${baseUrl}/api/public/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Audit Klien 2',
        clientPhone: '0812-3333-4444',
        serviceCategory: 'Wedding',
        eventDate: '2026-12-22',
        eventLocation: 'Yogyakarta'
      })
    });
    assert.equal(r2.status, 201);
    const b2 = await r2.json();
    createdBookingIds.push(b2.id);

    assert.notEqual(b1.receiptCode, b2.receiptCode);
    const num1 = parseInt(b1.receiptCode.split('-').pop(), 10);
    const num2 = parseInt(b2.receiptCode.split('-').pop(), 10);
    assert.ok(num2 > num1, `Expected ${num2} > ${num1}`);
  });
});

describe('Admin Auth, Session Persistence & Upload Safety', () => {
  it('blocks unauthenticated access to admin API', async () => {
    const res = await fetch(`${baseUrl}/api/admin/site`);
    assert.equal(res.status, 401);
  });

  it('revokes other sessions when password is changed', async () => {
    const login2 = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: store.DEFAULT_ADMIN_PASSWORD })
    });
    const otherToken = (await login2.json()).token;

    // Change password using adminToken
    const ch1 = await fetch(`${baseUrl}/api/admin/password`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        currentPassword: store.DEFAULT_ADMIN_PASSWORD,
        newPassword: 'temp-audit-password-99'
      })
    });
    assert.equal(ch1.status, 200);

    // otherToken must now be rejected
    const checkOther = await fetch(`${baseUrl}/api/admin/me`, {
      headers: { Authorization: `Bearer ${otherToken}` }
    });
    assert.equal(checkOther.status, 401);

    // adminToken must still work
    const checkSelf = await fetch(`${baseUrl}/api/admin/me`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(checkSelf.status, 200);

    // Restore original password
    const restore = await fetch(`${baseUrl}/api/admin/password`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        currentPassword: 'temp-audit-password-99',
        newPassword: store.DEFAULT_ADMIN_PASSWORD
      })
    });
    assert.equal(restore.status, 200);
  });

  it('rejects non-image MIME upload attempts', async () => {
    const fd = new FormData();
    const blob = new Blob(['<html><script>alert(1)</script></html>'], { type: 'text/html' });
    fd.append('image', blob, 'evil.html');

    const res = await fetch(`${baseUrl}/api/admin/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: fd
    });
    assert.equal(res.status, 400);
  });
});
