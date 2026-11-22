(function () {
  let siteConfig = null;
  let activeFilter = 'Semua';
  let activeModalItem = null;
  let lastReceiptText = '';
  let toastTimer = null;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeImageUrl(url, fallback = '/uploads/hero-jamuan.jpg') {
    const s = String(url || '').trim();
    if (!s) return fallback;
    if (s.startsWith('/uploads/') || s.startsWith('/assets/')) return s;
    if (/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
    try {
      const parsed = new URL(s);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return s;
    } catch {
      // invalid URL
    }
    return fallback;
  }

  function showToast(msg) {
    const toastEl = $('toast');
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  function hexToRgba(hex, alpha) {
    const clean = String(hex || '').replace('#', '');
    if (clean.length !== 6) return `rgba(36, 20, 12, ${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function applyTheme(theme) {
    if (!theme) return;
    const root = document.documentElement;
    root.style.setProperty('--cream', theme.cream || '#F3E9D2');
    root.style.setProperty('--cream-deep', theme.creamDeep || '#E8DBBE');
    root.style.setProperty('--paper', theme.paper || '#FAF4E6');
    root.style.setProperty('--ink', theme.ink || '#24140C');
    root.style.setProperty('--ink-muted', theme.inkMuted || '#523C2F');
    root.style.setProperty('--ink-line', hexToRgba(theme.ink || '#24140C', 0.22));
    root.style.setProperty('--ink-hairline', hexToRgba(theme.ink || '#24140C', 0.12));
    root.style.setProperty('--orange', theme.orange || '#E0561B');
    root.style.setProperty('--orange-dark', theme.orangeDark || '#C24612');
    root.style.setProperty('--blue', theme.blue || '#1D4E9E');
    root.style.setProperty('--yellow', theme.yellow || '#E8B53A');
    root.style.setProperty('--radius', (Number(theme.radius ?? 4)) + 'px');
  }

  function renderSite(cfg) {
    siteConfig = cfg;
    applyTheme(cfg.theme);

    const b = cfg.brand || {};
    const mLeft = b.monogramLeft || 'D';
    const mRight = b.monogramRight || 'A';
    const monogramStr = `${mLeft}/${mRight}`;

    document.title = `${b.name || 'Department of Artifacts'} (${monogramStr}) — Fotografi Dokumenter`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && b.metaDescription) {
      metaDesc.setAttribute('content', b.metaDescription);
    }

    // Navbar
    $('navMonogram').innerHTML = `${escapeHtml(mLeft)}<span style="color:var(--orange);">/</span>${escapeHtml(mRight)}`;
    $('navShortName').textContent = b.shortName || b.name || 'Dept. of Artifacts';

    // Section visibility
    const secs = cfg.sections || {};
    $('sec-hero').classList.toggle('hidden', secs.hero === false);
    $('arsip').classList.toggle('hidden', secs.archives === false);
    $('layanan').classList.toggle('hidden', secs.services === false);
    $('proses').classList.toggle('hidden', secs.process === false);
    $('booking').classList.toggle('hidden', secs.booking === false);
    $('navCta').classList.toggle('hidden', secs.booking === false);

    document.querySelectorAll('[data-nav-sec]').forEach((el) => {
      const key = el.getAttribute('data-nav-sec');
      el.classList.toggle('hidden', secs[key] === false);
    });

    // Hero
    const h = cfg.hero || {};
    $('stripFormCode').textContent = b.formCode || 'FORM D/A-WEB';
    $('stripSubtitle').textContent = b.subtitle || 'STUDIO FOTOGRAFI DOKUMENTER';
    const cats = (cfg.archiveSection && cfg.archiveSection.categories) || ['Wisuda', 'Wedding', 'Event'];
    $('stripRight').textContent = `${cats.join(' · ').toUpperCase()} · ${(b.city || 'INDONESIA').toUpperCase()}`;

    $('heroKicker').textContent = h.kicker || '';
    const headlineText = (h.headline || '').replace(/\.$/, '');
    $('heroHeadline').innerHTML = `${escapeHtml(headlineText)}<span class="dot">.</span>`;
    $('heroDesc').textContent = h.description || '';
    $('heroPrimaryCta').textContent = h.primaryCta || 'Ajukan Berkas Sesi';
    $('heroSecondaryCta').textContent = h.secondaryCta || 'Lihat Arsip';
    $('heroImage').src = sanitizeImageUrl(h.image, '/uploads/hero-jamuan.jpg');
    $('heroImage').alt = h.imageAlt || b.name || 'Hero';
    $('heroWatermark').textContent = h.watermark || `${monogramStr} · 0001`;
    $('heroCaptionLeft').textContent = h.captionLeft || '';
    $('heroCaptionRight').textContent = h.captionRight || '';

    // Archive Section
    const as = cfg.archiveSection || {};
    $('archiveKicker').textContent = as.kicker || '01 / Katalog Arsip';
    $('archiveTitle').textContent = as.title || 'Rekam Jejak Pilihan';
    $('archiveDesc').textContent = as.description || '';
    renderFilters(as.categories || ['Wisuda', 'Wedding', 'Event']);
    renderArchives();

    // Services Section
    const ss = cfg.servicesSection || {};
    $('servicesKicker').textContent = ss.kicker || '02 / Layanan';
    $('servicesTitle').textContent = ss.title || 'Klasifikasi Sesi & Paket';
    $('servicesDesc').textContent = ss.description || '';
    renderServices(cfg.services || []);

    // Process Section
    const ps = cfg.processSection || {};
    $('processKicker').textContent = ps.kicker || '03 / Prosedur';
    $('processTitle').textContent = ps.title || 'Alur Kerja Pengarsipan';
    $('processDesc').textContent = ps.description || '';
    renderProcess(ps.steps || []);
    $('processQuote').textContent = ps.quote || '';
    $('processStamp').textContent = ps.stamp || 'BERKAS TERVERIFIKASI';

    // Booking Section
    const bs = cfg.bookingSection || {};
    $('bookingKicker').textContent = bs.kicker || '04 / Pengajuan';
    $('bookingTitle').textContent = bs.title || 'Formulir Jadwal Sesi';
    $('bookingDesc').textContent = bs.description || '';
    $('bookingInfoTitle').textContent = bs.infoTitle || 'Meja Administrasi';
    $('bookingInfoDesc').textContent = bs.infoDescription || '';
    $('bookingFormCode').textContent = bs.formCode || 'FORM D/A-BKG · PENGAJUAN JADWAL';
    $('bookingFormBadge').textContent = bs.formBadge || 'RESI OTOMATIS';
    $('bookingSubmitBtn').textContent = bs.submitLabel || 'Terbitkan Resi Pengajuan';
    $('bookingHelperText').textContent = bs.helperText || '';

    const igHandle = b.instagram ? '@' + b.instagram.replace(/^@/, '') : '@dept.of.artifacts';
    $('contactList').innerHTML = `
      <div class="contact-row"><span>Instagram</span><strong>${escapeHtml(igHandle)}</strong></div>
      <div class="contact-row"><span>WhatsApp</span><strong>${escapeHtml(b.whatsapp || '-')}</strong></div>
      ${b.email ? `<div class="contact-row"><span>Email</span><strong>${escapeHtml(b.email)}</strong></div>` : ''}
      <div class="contact-row"><span>Basis Operasi</span><strong>${escapeHtml(b.serviceArea || b.city || '-')}</strong></div>
      <div class="contact-row"><span>Jam Balasan</span><strong>${escapeHtml(b.hours || '09.00 – 20.00 WIB')}</strong></div>
    `;

    // Populate booking category select from services
    const serviceSelect = $('serviceCategory');
    const prevVal = serviceSelect.value;
    const servicesList = cfg.services || [];
    serviceSelect.innerHTML = servicesList
      .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} (${escapeHtml(s.formCode || 'FORM')})</option>`)
      .join('');
    if (prevVal && servicesList.some((s) => s.name === prevVal)) {
      serviceSelect.value = prevVal;
    } else if (servicesList.length) {
      const featured = servicesList.find((s) => s.featured);
      serviceSelect.value = featured ? featured.name : servicesList[0].name;
    }

    // Addons
    const addons = bs.addons || [];
    $('addonGroup').innerHTML = addons.length
      ? addons
          .map(
            (a) => `
            <label class="addon-item">
              <input type="checkbox" name="addon" value="${escapeHtml(a)}">
              <span>${escapeHtml(a)}</span>
            </label>`
          )
          .join('')
      : '<span style="font-size:12px;color:var(--ink-muted);">Tidak ada tambahan opsional.</span>';

    // Footer wordmark & meta
    $('fwLeft').textContent = mLeft;
    $('fwRight').textContent = mRight;
    const words = (b.name || 'DEPARTMENT OF ARTIFACTS').toUpperCase().split(/\s+/);
    $('fwLine1').textContent = words[0] || 'DEPARTMENT';
    $('fwLine2').textContent = words.slice(1).join(' ') || 'OF ARTIFACTS';

    $('footerMeta').innerHTML = `
      <span>${escapeHtml(igHandle)}</span>
      <span>${escapeHtml(b.whatsapp || '')}</span>
      <span>${escapeHtml(b.city || '')}</span>
      <a href="/admin" class="footer-admin-link">Panel Admin</a>
      <a href="#top" style="color: var(--orange); font-weight: 600;">↑ Kembali ke Atas</a>
    `;
  }

  function renderFilters(categories) {
    const filterGroup = $('filterGroup');
    const allCats = ['Semua', ...categories];
    if (!allCats.includes(activeFilter)) activeFilter = 'Semua';

    filterGroup.innerHTML = allCats
      .map(
        (cat) => `
        <button type="button" class="filter-btn ${cat === activeFilter ? 'active' : ''}" data-filter="${escapeHtml(cat)}">
          ${escapeHtml(cat)}
        </button>`
      )
      .join('');

    filterGroup.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFilter = btn.getAttribute('data-filter');
        filterGroup.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        renderArchives();
      });
    });
  }

  function renderArchives() {
    if (!siteConfig) return;
    const visibleArchives = (siteConfig.archives || []).filter((item) => item.visible !== false);
    const filtered =
      activeFilter === 'Semua'
        ? visibleArchives
        : visibleArchives.filter((item) => item.category === activeFilter);

    $('archiveCount').textContent = `Menampilkan ${filtered.length} dari ${visibleArchives.length} berkas`;
    const grid = $('archiveGrid');
    grid.innerHTML = '';

    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-box">Belum ada berkas arsip pada kategori ini.</div>';
      return;
    }

    const monogram = `${siteConfig.brand?.monogramLeft || 'D'}/${siteConfig.brand?.monogramRight || 'A'}`;

    filtered.forEach((item) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'archive-card';
      card.setAttribute('aria-label', 'Buka detail arsip ' + item.title);
      card.innerHTML = `
        <div class="archive-thumb">
          <img src="${escapeHtml(sanitizeImageUrl(item.image))}" alt="${escapeHtml(item.title)}" loading="lazy">
          <span class="archive-tag">${escapeHtml(item.category)}</span>
          <div class="photo-wm">${escapeHtml(monogram)} · ${escapeHtml(item.id)}</div>
        </div>
        <div class="archive-body">
          <div class="archive-meta"><span>ARSIP #${escapeHtml(item.id)}</span><span>${escapeHtml(item.location)}</span></div>
          <h3 class="archive-title">${escapeHtml(item.title)}</h3>
          <p class="archive-excerpt">${escapeHtml(item.excerpt)}</p>
        </div>
      `;
      card.addEventListener('click', () => openModal(item));
      grid.appendChild(card);
    });
  }

  function renderServices(services) {
    const grid = $('servicesGrid');
    if (!services.length) {
      grid.innerHTML = '<div class="empty-box">Belum ada paket layanan tersedia.</div>';
      return;
    }

    grid.innerHTML = services
      .map(
        (s) => `
        <article class="service-card">
          <div class="service-top ${s.featured ? 'featured' : ''}">
            <span>${escapeHtml(s.formCode || 'FORM D/A')}</span>
            <span>${escapeHtml(s.badge || 'PAKET')}</span>
          </div>
          <div class="service-content">
            <h3 class="service-name">${escapeHtml(s.name)}</h3>
            <p class="service-desc">${escapeHtml(s.description)}</p>
            <ul class="service-list">
              ${(s.features || []).map((f) => `<li>${escapeHtml(f)}</li>`).join('')}
            </ul>
            <div class="service-rate">
              <span>Estimasi Tarif</span>
              <strong>${escapeHtml(s.price || 'Hubungi Kami')}</strong>
            </div>
            <button type="button" class="btn ${s.featured ? 'btn-primary' : 'btn-secondary'} select-service-btn" data-service="${escapeHtml(s.name)}" style="width:100%;">
              ${escapeHtml(s.ctaLabel || 'Pilih ' + s.name)}
            </button>
          </div>
        </article>`
      )
      .join('');

    grid.querySelectorAll('.select-service-btn').forEach((btn) => {
      btn.addEventListener('click', () => jumpToBookingWithService(btn.getAttribute('data-service')));
    });
  }

  function renderProcess(steps) {
    $('processGrid').innerHTML = steps
      .map(
        (st) => `
        <div class="process-step">
          <p class="step-code">${escapeHtml(st.code)}</p>
          <h3>${escapeHtml(st.title)}</h3>
          <p>${escapeHtml(st.description)}</p>
        </div>`
      )
      .join('');
  }

  function openModal(item) {
    activeModalItem = item;
    const monogram = `${siteConfig?.brand?.monogramLeft || 'D'}/${siteConfig?.brand?.monogramRight || 'A'}`;
    $('modalCode').textContent = `ARSIP #${item.id} · ${String(item.category || '').toUpperCase()}`;
    $('modalWm').textContent = `${monogram} · ${item.id}`;
    $('modalImage').src = sanitizeImageUrl(item.image);
    $('modalImage').alt = item.title;
    $('modalTitle').textContent = item.title;
    $('modalNotes').textContent = item.notes || item.excerpt || '';
    $('modalSpecs').innerHTML = `
      <span><strong>Kategori:</strong> ${escapeHtml(item.category)}</span>
      <span><strong>Lokasi:</strong> ${escapeHtml(item.location)}</span>
      <span><strong>Catatan Teknis:</strong> ${escapeHtml(item.light)}</span>
    `;
    $('archiveModal').classList.add('open');
  }

  function closeModal() {
    $('archiveModal').classList.remove('open');
    activeModalItem = null;
  }

  function jumpToBookingWithService(category) {
    const select = $('serviceCategory');
    if (Array.from(select.options).some((o) => o.value === category)) {
      select.value = category;
    }
    $('receiptBox').classList.remove('visible');
    $('bookingForm').style.display = 'block';
    const target = $('booking');
    if (target) target.scrollIntoView({ behavior: 'smooth' });
    showToast(`Kategori "${category}" dipilih pada formulir.`);
  }

  // Modal events
  $('closeModalBtn').addEventListener('click', closeModal);
  $('modalCloseSecondary').addEventListener('click', closeModal);
  $('archiveModal').addEventListener('click', (e) => {
    if (e.target === $('archiveModal')) closeModal();
  });
  $('modalBookBtn').addEventListener('click', () => {
    if (activeModalItem) {
      const cat = activeModalItem.category;
      closeModal();
      jumpToBookingWithService(cat);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('archiveModal').classList.contains('open')) {
      closeModal();
    }
  });

  // Mobile menu
  const menuToggle = $('menuToggle');
  const mobileMenu = $('mobileMenu');
  menuToggle.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
  mobileMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });

  // Booking form submit -> real API
  $('bookingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formError = $('formError');
    formError.classList.remove('visible');

    const clientName = $('clientName').value.trim();
    const clientPhone = $('clientPhone').value.trim();
    const serviceCategory = $('serviceCategory').value;
    const eventDate = $('eventDate').value;
    const eventLocation = $('eventLocation').value.trim();
    const notes = $('eventNotes').value.trim();
    const addons = Array.from($('bookingForm').querySelectorAll('input[name="addon"]:checked')).map(
      (el) => el.value
    );

    if (!clientName || !clientPhone || !eventDate || !eventLocation) {
      formError.textContent = 'Mohon lengkapi Nama Lengkap, Nomor WhatsApp, Rencana Tanggal, dan Lokasi/Kota terlebih dahulu.';
      formError.classList.add('visible');
      return;
    }

    const submitBtn = $('bookingSubmitBtn');
    const origText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Mencatat Berkas...';

    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientName, clientPhone, serviceCategory, eventDate, eventLocation, addons, notes })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengirim pengajuan.');
      }

      const addonText = data.addons && data.addons.length ? data.addons.join(', ') : 'Standar (tanpa tambahan)';
      $('receiptCode').textContent = data.receiptCode;
      $('receiptRows').innerHTML = `
        <div class="receipt-row"><span>Nama Klien</span><strong>${escapeHtml(data.clientName)}</strong></div>
        <div class="receipt-row"><span>WhatsApp</span><strong>${escapeHtml(data.clientPhone || '-')}</strong></div>
        <div class="receipt-row"><span>Kategori Sesi</span><strong>${escapeHtml(data.serviceCategory)}</strong></div>
        <div class="receipt-row"><span>Rencana Tanggal</span><strong>${escapeHtml(data.eventDate)}</strong></div>
        <div class="receipt-row"><span>Lokasi / Kota</span><strong>${escapeHtml(data.eventLocation)}</strong></div>
        <div class="receipt-row"><span>Tambahan</span><strong>${escapeHtml(addonText)}</strong></div>
        <div class="receipt-row"><span>Catatan</span><strong>${escapeHtml(data.notes)}</strong></div>
      `;

      const brandName = siteConfig?.brand?.name || 'Department of Artifacts';
      lastReceiptText =
        `Halo ${brandName}, saya ingin mengajukan jadwal sesi:\n` +
        `No. Resi: ${data.receiptCode}\n` +
        `Nama: ${data.clientName}\n` +
        `WhatsApp: ${data.clientPhone || '-'}\n` +
        `Kategori: ${data.serviceCategory}\n` +
        `Tanggal: ${data.eventDate}\n` +
        `Lokasi: ${data.eventLocation}\n` +
        `Tambahan: ${addonText}\n` +
        `Catatan: ${data.notes}`;

      const waNum = String(siteConfig?.brand?.whatsappNumber || '').replace(/[^0-9]/g, '');
      const waBtn = $('sendWaBtn');
      if (waNum) {
        waBtn.href = `https://wa.me/${waNum}?text=${encodeURIComponent(lastReceiptText)}`;
        waBtn.classList.remove('hidden');
      } else {
        waBtn.classList.add('hidden');
      }

      $('bookingForm').style.display = 'none';
      $('receiptBox').classList.add('visible');
      showToast(`Resi ${data.receiptCode} berhasil diterbitkan.`);
    } catch (err) {
      formError.textContent = err.message || 'Terjadi kesalahan jaringan.';
      formError.classList.add('visible');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  });

  $('copyReceiptBtn').addEventListener('click', () => {
    if (!lastReceiptText) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(lastReceiptText)
        .then(() => showToast('Ringkasan resi disalin. Siap ditempel ke WhatsApp.'))
        .catch(() => fallbackCopy(lastReceiptText));
    } else {
      fallbackCopy(lastReceiptText);
    }
  });

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Ringkasan resi disalin. Siap ditempel ke WhatsApp.');
    } catch {
      showToast('Gagal menyalin otomatis.');
    }
    document.body.removeChild(ta);
  }

  $('resetBookingBtn').addEventListener('click', () => {
    $('bookingForm').reset();
    setDefaultDate();
    $('receiptBox').classList.remove('visible');
    $('bookingForm').style.display = 'block';
  });

  function setDefaultDate() {
    const dateInput = $('eventDate');
    if (dateInput) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      dateInput.value = d.toISOString().split('T')[0];
    }
  }

  // Live preview listener from Admin Panel
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data && event.data.type === 'DA_PREVIEW_CONFIG' && event.data.config) {
      renderSite(event.data.config);
    }
  });

  // Initial load
  async function init() {
    setDefaultDate();
    try {
      const res = await fetch('/api/public/site');
      if (!res.ok) throw new Error('Gagal memuat konfigurasi situs.');
      const cfg = await res.json();
      renderSite(cfg);
    } catch (err) {
      console.error(err);
      showToast('Gagal memuat data situs.');
    }
  }

  init();
})();
