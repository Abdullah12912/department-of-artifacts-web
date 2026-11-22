(function () {
  const TOKEN_KEY = 'da_admin_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';
  let config = null;
  let bookings = [];
  let isDirty = false;
  let toastTimer = null;

  const $ = (id) => document.getElementById(id);

  const THEME_PRESETS = [
    {
      name: 'D/A Klasik (Standar)',
      theme: {
        cream: '#F3E9D2',
        creamDeep: '#E8DBBE',
        paper: '#FAF4E6',
        ink: '#24140C',
        inkMuted: '#523C2F',
        orange: '#E0561B',
        orangeDark: '#C24612',
        blue: '#1D4E9E',
        yellow: '#E8B53A',
        radius: 4
      }
    },
    {
      name: 'Biro Biru Kosmik',
      theme: {
        cream: '#EFF1ED',
        creamDeep: '#E1E5DD',
        paper: '#F9FAF8',
        ink: '#162133',
        inkMuted: '#425166',
        orange: '#1D4E9E',
        orangeDark: '#143875',
        blue: '#E0561B',
        yellow: '#E8B53A',
        radius: 2
      }
    },
    {
      name: 'Kertas Sepia 60s',
      theme: {
        cream: '#EFE3CC',
        creamDeep: '#E2D0B1',
        paper: '#F7EFE0',
        ink: '#2E1E12',
        inkMuted: '#634832',
        orange: '#B84A27',
        orangeDark: '#94381B',
        blue: '#2E5A6B',
        yellow: '#D9A438',
        radius: 6
      }
    },
    {
      name: 'Arsip Monokrom',
      theme: {
        cream: '#F2F0EB',
        creamDeep: '#E5E2DA',
        paper: '#FAFAF7',
        ink: '#181816',
        inkMuted: '#52524C',
        orange: '#C94A1E',
        orangeDark: '#A33914',
        blue: '#2C4A7A',
        yellow: '#D9A72E',
        radius: 0
      }
    }
  ];

  const TAB_TITLES = {
    overview: '00 · Ringkasan',
    brand: '01 · Identitas & Kontak',
    theme: '02 · Tampilan & Warna',
    hero: '03 · Hero & Alur Kerja',
    archives: '04 · Katalog Arsip',
    services: '05 · Layanan & Paket',
    bookings: '06 · Pengajuan Masuk',
    settings: '07 · Pengaturan'
  };

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

  function normalizeWaNumber(phone) {
    const digits = String(phone || '').replace(/[^0-9]/g, '');
    if (!digits) return '';
    if (digits.startsWith('0')) return '62' + digits.slice(1);
    return digits;
  }

  function showToast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function markDirty(state = true) {
    isDirty = state;
    $('dirtyBadge').classList.toggle('hidden', !state);
    syncPreviewIfOpen();
  }

  function getByPath(obj, path) {
    return path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
  }

  function setByPath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  async function api(url, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (!(options.body instanceof FormData) && options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, Object.assign({}, options, { headers }));
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      logoutLocal();
      throw new Error(data.error || 'Sesi berakhir. Silakan masuk kembali.');
    }
    if (!res.ok) {
      throw new Error(data.error || 'Permintaan gagal.');
    }
    return data;
  }

  function logoutLocal() {
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    $('adminShell').classList.add('hidden');
    $('loginScreen').classList.remove('hidden');
  }

  async function uploadImageFile(file) {
    const fd = new FormData();
    fd.append('image', file);
    const res = await api('/api/admin/upload', { method: 'POST', body: fd });
    return res.url;
  }

  // =====================
  // AUTH
  // =====================
  async function checkAuth() {
    try {
      const info = await fetch('/api/admin/auth-info').then((r) => r.json());
      if (info.isDefaultPassword) {
        $('defaultPassHint').classList.remove('hidden');
      }
    } catch {
      // ignore
    }

    if (!token) {
      $('loginScreen').classList.remove('hidden');
      $('adminShell').classList.add('hidden');
      return;
    }

    try {
      await api('/api/admin/me');
      await enterAdmin();
    } catch {
      logoutLocal();
    }
  }

  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('loginError');
    errEl.classList.add('hidden');
    const password = $('loginPassword').value;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) {
        errEl.textContent = data.error || 'Gagal masuk.';
        errEl.classList.remove('hidden');
        return;
      }
      token = data.token;
      localStorage.setItem(TOKEN_KEY, token);
      $('loginPassword').value = '';
      await enterAdmin();
    } catch {
      errEl.textContent = 'Tidak dapat terhubung ke server.';
      errEl.classList.remove('hidden');
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    logoutLocal();
    showToast('Sesi admin ditutup.');
  });

  async function enterAdmin() {
    $('loginScreen').classList.add('hidden');
    $('adminShell').classList.remove('hidden');
    await loadAllData();
  }

  async function loadAllData() {
    try {
      const [cfg, bkgs] = await Promise.all([
        api('/api/admin/site'),
        api('/api/admin/bookings')
      ]);
      config = cfg;
      bookings = bkgs;
      markDirty(false);
      populateAllUI();
    } catch (err) {
      showToast(err.message);
    }
  }

  // =====================
  // NAVIGATION
  // =====================
  function switchTab(tabName) {
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    const target = $('tab-' + tabName);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });

    $('topbarTitle').textContent = TAB_TITLES[tabName] || 'Panel Admin';
    $('sidebar').classList.remove('open');
  }

  $('sidebarNav').querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  document.querySelectorAll('[data-goto-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-goto-tab')));
  });

  $('mobileSidebarBtn').addEventListener('click', () => {
    $('sidebar').classList.toggle('open');
  });

  // =====================
  // POPULATE UI
  // =====================
  function populateAllUI() {
    if (!config) return;

    // Bind standard inputs
    document.querySelectorAll('[data-bind]').forEach((el) => {
      const val = getByPath(config, el.getAttribute('data-bind'));
      el.value = val ?? '';
    });

    // Bind color pickers
    document.querySelectorAll('[data-color]').forEach((el) => {
      const val = getByPath(config, el.getAttribute('data-color'));
      if (val && /^#[0-9a-fA-F]{6}$/.test(val)) {
        el.value = val;
      }
    });

    // Bind toggles
    document.querySelectorAll('[data-toggle]').forEach((el) => {
      const val = getByPath(config, el.getAttribute('data-toggle'));
      el.checked = val !== false;
    });

    // Radius
    const rad = Number(config.theme?.radius ?? 4);
    $('radiusRange').value = rad;
    $('radiusVal').textContent = rad;

    // Hero preview
    $('heroPreviewImg').src = sanitizeImageUrl(config.hero?.image, '/uploads/hero-jamuan.jpg');

    // Archive categories
    $('archiveCategoriesInput').value = (config.archiveSection?.categories || []).join(', ');
    updateCategorySuggestions();

    // Booking addons
    $('bookingAddonsInput').value = (config.bookingSection?.addons || []).join('\n');

    renderThemePresets();
    renderProcessEditor();
    renderAdminArchives();
    renderAdminServices();
    renderBookings();
    renderOverview();
  }

  function updateCategorySuggestions() {
    const cats = config.archiveSection?.categories || ['Wisuda', 'Wedding', 'Event'];
    $('categorySuggestions').innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}">`).join('');
  }

  // Generic input listeners
  document.querySelectorAll('[data-bind]').forEach((el) => {
    el.addEventListener('input', () => {
      if (!config) return;
      const path = el.getAttribute('data-bind');
      setByPath(config, path, el.value);

      // Sync matching color picker if hex
      const picker = document.querySelector(`[data-color="${path}"]`);
      if (picker && /^#[0-9a-fA-F]{6}$/.test(el.value)) {
        picker.value = el.value;
      }
      if (path === 'hero.image') {
        $('heroPreviewImg').src = el.value;
      }
      markDirty(true);
    });
  });

  document.querySelectorAll('[data-color]').forEach((el) => {
    el.addEventListener('input', () => {
      if (!config) return;
      const path = el.getAttribute('data-color');
      setByPath(config, path, el.value.toUpperCase());
      const textInput = document.querySelector(`[data-bind="${path}"]`);
      if (textInput) textInput.value = el.value.toUpperCase();
      markDirty(true);
    });
  });

  document.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('change', () => {
      if (!config) return;
      setByPath(config, el.getAttribute('data-toggle'), el.checked);
      markDirty(true);
    });
  });

  $('radiusRange').addEventListener('input', (e) => {
    if (!config) return;
    const val = Number(e.target.value);
    $('radiusVal').textContent = val;
    setByPath(config, 'theme.radius', val);
    markDirty(true);
  });

  $('archiveCategoriesInput').addEventListener('input', (e) => {
    if (!config) return;
    const arr = e.target.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setByPath(config, 'archiveSection.categories', arr);
    updateCategorySuggestions();
    markDirty(true);
  });

  $('bookingAddonsInput').addEventListener('input', (e) => {
    if (!config) return;
    const arr = e.target.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    setByPath(config, 'bookingSection.addons', arr);
    markDirty(true);
  });

  // Hero file upload
  $('heroImageFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      showToast('Mengunggah foto hero...');
      const url = await uploadImageFile(file);
      config.hero.image = url;
      document.querySelector('[data-bind="hero.image"]').value = url;
      $('heroPreviewImg').src = url;
      markDirty(true);
      showToast('Foto hero berhasil diunggah. Klik Simpan Perubahan.');
    } catch (err) {
      showToast(err.message);
    } finally {
      e.target.value = '';
    }
  });

  // =====================
  // THEME PRESETS
  // =====================
  function renderThemePresets() {
    $('themePresets').innerHTML = THEME_PRESETS.map(
      (p, idx) => `
      <button type="button" class="preset-btn" data-preset-idx="${idx}">
        <div class="preset-swatches">
          <span style="background:${p.theme.cream}"></span>
          <span style="background:${p.theme.ink}"></span>
          <span style="background:${p.theme.orange}"></span>
          <span style="background:${p.theme.blue}"></span>
          <span style="background:${p.theme.yellow}"></span>
        </div>
        <span class="preset-name">${escapeHtml(p.name)}</span>
      </button>`
    ).join('');

    $('themePresets').querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = THEME_PRESETS[Number(btn.getAttribute('data-preset-idx'))];
        config.theme = Object.assign({}, preset.theme);
        populateAllUI();
        markDirty(true);
        showToast(`Preset "${preset.name}" diterapkan.`);
      });
    });
  }

  $('resetThemeBtn').addEventListener('click', () => {
    config.theme = Object.assign({}, THEME_PRESETS[0].theme);
    populateAllUI();
    markDirty(true);
    showToast('Palet dikembalikan ke standar D/A.');
  });

  // =====================
  // PROCESS STEPS EDITOR
  // =====================
  function renderProcessEditor() {
    const steps = config.processSection?.steps || [];
    $('processStepsEditor').innerHTML = steps
      .map(
        (st, idx) => `
        <div style="border-top:1px solid var(--ink-line); padding-top:16px; margin-top:16px;">
          <div style="font-size:11.5px; font-weight:600; color:var(--orange); margin-bottom:10px; text-transform:uppercase;">
            Langkah #${idx + 1}
          </div>
          <div class="form-grid">
            <div class="field">
              <label>Kode Tahap</label>
              <input type="text" value="${escapeHtml(st.code)}" data-step-idx="${idx}" data-step-key="code">
            </div>
            <div class="field">
              <label>Judul Tahap</label>
              <input type="text" value="${escapeHtml(st.title)}" data-step-idx="${idx}" data-step-key="title">
            </div>
            <div class="field full">
              <label>Deskripsi</label>
              <textarea rows="2" data-step-idx="${idx}" data-step-key="description">${escapeHtml(st.description)}</textarea>
            </div>
          </div>
        </div>`
      )
      .join('');

    $('processStepsEditor').querySelectorAll('[data-step-idx]').forEach((el) => {
      el.addEventListener('input', () => {
        const idx = Number(el.getAttribute('data-step-idx'));
        const key = el.getAttribute('data-step-key');
        config.processSection.steps[idx][key] = el.value;
        markDirty(true);
      });
    });
  }

  // =====================
  // ARCHIVES CRUD
  // =====================
  function renderAdminArchives() {
    const list = config.archives || [];
    $('archivesTotalLabel').textContent = list.length;
    const grid = $('adminArchivesGrid');

    if (!list.length) {
      grid.innerHTML = '<div style="grid-column:1/-1; padding:24px; text-align:center; color:var(--ink-muted);">Belum ada berkas arsip. Klik "+ Tambah Arsip".</div>';
      return;
    }

    grid.innerHTML = list
      .map(
        (item, idx) => `
        <div class="item-card" style="${item.visible === false ? 'opacity:0.55;' : ''}">
          <div class="item-card-img">
            <img src="${escapeHtml(sanitizeImageUrl(item.image))}" alt="${escapeHtml(item.title)}">
            <span class="item-card-badge">#${escapeHtml(item.id)} · ${escapeHtml(item.category)}</span>
          </div>
          <div class="item-card-body">
            <div style="font-size:11px; color:var(--ink-muted); text-transform:uppercase;">${escapeHtml(item.location)}</div>
            <h3>${escapeHtml(item.title)}</h3>
            <p style="margin:0; font-size:12px; color:var(--ink-muted);">${escapeHtml(item.excerpt)}</p>
          </div>
          <div class="item-card-actions">
            <div style="display:flex; gap:4px;">
              <button type="button" class="btn btn-sm" data-arc-move="${idx}" data-dir="-1" ${idx === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="btn btn-sm" data-arc-move="${idx}" data-dir="1" ${idx === list.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn btn-sm" data-arc-edit="${idx}">Edit</button>
              <button type="button" class="btn btn-danger btn-sm" data-arc-del="${idx}">Hapus</button>
            </div>
          </div>
        </div>`
      )
      .join('');

    grid.querySelectorAll('[data-arc-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openArchiveModal(Number(btn.getAttribute('data-arc-edit'))));
    });

    grid.querySelectorAll('[data-arc-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-arc-del'));
        if (!confirm(`Hapus arsip "${config.archives[idx].title}"?`)) return;
        config.archives.splice(idx, 1);
        renderAdminArchives();
        renderOverview();
        markDirty(true);
      });
    });

    grid.querySelectorAll('[data-arc-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-arc-move'));
        const dir = Number(btn.getAttribute('data-dir'));
        const target = idx + dir;
        if (target < 0 || target >= config.archives.length) return;
        const [moved] = config.archives.splice(idx, 1);
        config.archives.splice(target, 0, moved);
        renderAdminArchives();
        markDirty(true);
      });
    });
  }

  function openArchiveModal(idx) {
    const isNew = idx === -1;
    $('archiveModalHeading').textContent = isNew ? 'Tambah Berkas Arsip Baru' : 'Edit Berkas Arsip';
    $('arcIndex').value = idx;

    if (isNew) {
      const nextNum = String(45 + (config.archives?.length || 0)).padStart(4, '0');
      $('arcId').value = nextNum;
      $('arcCategory').value = (config.archiveSection?.categories || ['Wisuda'])[0];
      $('arcTitle').value = '';
      $('arcLocation').value = '';
      $('arcLight').value = 'Cahaya Alami · 35mm Warm';
      $('arcExcerpt').value = '';
      $('arcNotes').value = '';
      $('arcImage').value = '/uploads/hero-jamuan.jpg';
      $('arcPreviewImg').src = '/uploads/hero-jamuan.jpg';
      $('arcVisible').checked = true;
    } else {
      const item = config.archives[idx];
      $('arcId').value = item.id || '';
      $('arcCategory').value = item.category || '';
      $('arcTitle').value = item.title || '';
      $('arcLocation').value = item.location || '';
      $('arcLight').value = item.light || '';
      $('arcExcerpt').value = item.excerpt || '';
      $('arcNotes').value = item.notes || '';
      $('arcImage').value = item.image || '';
      $('arcPreviewImg').src = item.image || '';
      $('arcVisible').checked = item.visible !== false;
    }

    $('archiveEditorModal').classList.add('open');
  }

  function closeArchiveModal() {
    $('archiveEditorModal').classList.remove('open');
  }

  $('addArchiveBtn').addEventListener('click', () => openArchiveModal(-1));
  $('closeArchiveModalBtn').addEventListener('click', closeArchiveModal);
  $('cancelArchiveModalBtn').addEventListener('click', closeArchiveModal);

  $('arcImage').addEventListener('input', (e) => {
    $('arcPreviewImg').src = e.target.value;
  });

  $('arcImageFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      showToast('Mengunggah foto arsip...');
      const url = await uploadImageFile(file);
      $('arcImage').value = url;
      $('arcPreviewImg').src = url;
      showToast('Foto berhasil diunggah.');
    } catch (err) {
      showToast(err.message);
    } finally {
      e.target.value = '';
    }
  });

  $('archiveEditorForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const idx = Number($('arcIndex').value);
    const entry = {
      uid: idx === -1 ? 'arc-' + Date.now() : config.archives[idx].uid || 'arc-' + Date.now(),
      id: $('arcId').value.trim(),
      category: $('arcCategory').value.trim(),
      title: $('arcTitle').value.trim(),
      location: $('arcLocation').value.trim(),
      light: $('arcLight').value.trim(),
      excerpt: $('arcExcerpt').value.trim(),
      notes: $('arcNotes').value.trim(),
      image: $('arcImage').value.trim(),
      visible: $('arcVisible').checked
    };

    if (idx === -1) {
      config.archives.unshift(entry);
    } else {
      config.archives[idx] = entry;
    }

    closeArchiveModal();
    renderAdminArchives();
    renderOverview();
    markDirty(true);
    showToast('Daftar arsip diperbarui. Jangan lupa klik Simpan Perubahan.');
  });

  // =====================
  // SERVICES CRUD
  // =====================
  function renderAdminServices() {
    const list = config.services || [];
    const grid = $('adminServicesGrid');

    if (!list.length) {
      grid.innerHTML = '<div style="grid-column:1/-1; padding:24px; text-align:center; color:var(--ink-muted);">Belum ada paket layanan.</div>';
      return;
    }

    grid.innerHTML = list
      .map(
        (s, idx) => `
        <div class="item-card">
          <div style="padding:10px 14px; background:${s.featured ? 'var(--orange)' : 'var(--ink)'}; color:var(--paper); font-size:11px; display:flex; justify-content:space-between; text-transform:uppercase;">
            <span>${escapeHtml(s.formCode)}</span>
            <span>${escapeHtml(s.badge)}</span>
          </div>
          <div class="item-card-body">
            <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
              <h3>${escapeHtml(s.name)}</h3>
              <strong style="color:var(--orange);">${escapeHtml(s.price)}</strong>
            </div>
            <p style="margin:0 0 10px; font-size:12px; color:var(--ink-muted);">${escapeHtml(s.description)}</p>
            <div style="font-size:11.5px; color:var(--ink-muted);">${(s.features || []).length} poin fasilitas</div>
          </div>
          <div class="item-card-actions">
            <span style="font-size:11px; color:var(--ink-muted);">${s.featured ? '★ Paket Utama' : 'Standar'}</span>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn btn-sm" data-srv-edit="${idx}">Edit</button>
              <button type="button" class="btn btn-danger btn-sm" data-srv-del="${idx}">Hapus</button>
            </div>
          </div>
        </div>`
      )
      .join('');

    grid.querySelectorAll('[data-srv-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openServiceModal(Number(btn.getAttribute('data-srv-edit'))));
    });

    grid.querySelectorAll('[data-srv-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-srv-del'));
        if (!confirm(`Hapus paket "${config.services[idx].name}"?`)) return;
        config.services.splice(idx, 1);
        renderAdminServices();
        renderOverview();
        markDirty(true);
      });
    });
  }

  function openServiceModal(idx) {
    const isNew = idx === -1;
    $('serviceModalHeading').textContent = isNew ? 'Tambah Paket Layanan Baru' : 'Edit Paket Layanan';
    $('srvIndex').value = idx;

    if (isNew) {
      $('srvFormCode').value = 'FORM D/A-NEW';
      $('srvBadge').value = 'PAKET BARU';
      $('srvName').value = '';
      $('srvPrice').value = 'Mulai Rp 1.500.000';
      $('srvDesc').value = '';
      $('srvFeatures').value = 'Liputan dokumenter candid\nOlahan warna hangat khas D/A\nGaleri digital arsip bernomor seri';
      $('srvCta').value = 'Pilih Paket Ini';
      $('srvFeatured').checked = false;
    } else {
      const s = config.services[idx];
      $('srvFormCode').value = s.formCode || '';
      $('srvBadge').value = s.badge || '';
      $('srvName').value = s.name || '';
      $('srvPrice').value = s.price || '';
      $('srvDesc').value = s.description || '';
      $('srvFeatures').value = (s.features || []).join('\n');
      $('srvCta').value = s.ctaLabel || '';
      $('srvFeatured').checked = Boolean(s.featured);
    }

    $('serviceEditorModal').classList.add('open');
  }

  function closeServiceModal() {
    $('serviceEditorModal').classList.remove('open');
  }

  $('addServiceBtn').addEventListener('click', () => openServiceModal(-1));
  $('closeServiceModalBtn').addEventListener('click', closeServiceModal);
  $('cancelServiceModalBtn').addEventListener('click', closeServiceModal);

  $('serviceEditorForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const idx = Number($('srvIndex').value);
    const entry = {
      uid: idx === -1 ? 'srv-' + Date.now() : config.services[idx].uid || 'srv-' + Date.now(),
      formCode: $('srvFormCode').value.trim(),
      badge: $('srvBadge').value.trim(),
      name: $('srvName').value.trim(),
      price: $('srvPrice').value.trim(),
      description: $('srvDesc').value.trim(),
      features: $('srvFeatures').value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      ctaLabel: $('srvCta').value.trim() || 'Pilih Sesi ' + $('srvName').value.trim(),
      featured: $('srvFeatured').checked
    };

    if (idx === -1) {
      config.services.push(entry);
    } else {
      config.services[idx] = entry;
    }

    closeServiceModal();
    renderAdminServices();
    renderOverview();
    markDirty(true);
    showToast('Daftar paket diperbarui. Jangan lupa klik Simpan Perubahan.');
  });

  // =====================
  // BOOKINGS INBOX
  // =====================
  function renderBookings() {
    const filter = $('bookingStatusFilter').value;
    const newCount = bookings.filter((b) => b.status === 'BARU').length;
    const badge = $('newBookingsBadge');
    badge.textContent = newCount;
    badge.classList.toggle('hidden', newCount === 0);

    const list = filter === 'ALL' ? bookings : bookings.filter((b) => b.status === filter);
    const wrap = $('bookingsListWrap');

    if (!list.length) {
      wrap.innerHTML = '<div style="padding:28px; text-align:center; color:var(--ink-muted);">Tidak ada berkas pengajuan pada filter ini.</div>';
      return;
    }

    wrap.innerHTML = list
      .map((b) => {
        const addonText = b.addons && b.addons.length ? b.addons.join(', ') : 'Standar';
        const dateStr = b.createdAt ? new Date(b.createdAt).toLocaleString('id-ID') : '-';
        const waDigits = normalizeWaNumber(b.clientPhone);
        const brandName = config?.brand?.name || 'Department of Artifacts (D/A)';
        const waReplyText =
          `Halo ${b.clientName}, kami dari ${brandName}.\n` +
          `Terkait berkas pengajuan ${b.receiptCode} (${b.serviceCategory}, ${b.eventDate} di ${b.eventLocation}), ` +
          `jadwal telah kami periksa. Status saat ini: ${b.status}.`;
        const waHref = waDigits
          ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waReplyText)}`
          : '';
        return `
          <div class="booking-card" data-bkg-id="${escapeHtml(b.id)}">
            <div class="booking-card-head">
              <div>
                <strong>${escapeHtml(b.receiptCode)}</strong> · ${escapeHtml(b.clientName)}
                <span style="font-size:11px; color:var(--ink-muted); margin-left:8px;">(${escapeHtml(dateStr)})</span>
              </div>
              <span class="status-badge status-${escapeHtml(b.status)}">${escapeHtml(b.status)}</span>
            </div>
            <div class="booking-card-body">
              <div>
                <div class="kv-row"><span>WhatsApp Klien</span><strong>${escapeHtml(b.clientPhone || '—')}</strong></div>
                <div class="kv-row"><span>Kategori</span><strong>${escapeHtml(b.serviceCategory)}</strong></div>
                <div class="kv-row"><span>Tanggal Acara</span><strong>${escapeHtml(b.eventDate)}</strong></div>
                <div class="kv-row"><span>Lokasi</span><strong>${escapeHtml(b.eventLocation)}</strong></div>
                <div class="kv-row"><span>Tambahan</span><strong>${escapeHtml(addonText)}</strong></div>
                <div class="kv-row"><span>Catatan Klien</span><strong>${escapeHtml(b.notes)}</strong></div>
              </div>
              <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="field">
                  <label>Status Berkas</label>
                  <select class="bkg-status-select">
                    <option value="BARU" ${b.status === 'BARU' ? 'selected' : ''}>BARU</option>
                    <option value="DIKONFIRMASI" ${b.status === 'DIKONFIRMASI' ? 'selected' : ''}>DIKONFIRMASI</option>
                    <option value="SELESAI" ${b.status === 'SELESAI' ? 'selected' : ''}>SELESAI</option>
                    <option value="DIBATALKAN" ${b.status === 'DIBATALKAN' ? 'selected' : ''}>DIBATALKAN</option>
                  </select>
                </div>
                <div class="field">
                  <label>Catatan Internal Admin</label>
                  <textarea rows="2" class="bkg-notes-input" placeholder="DP, nama fotografer, dll...">${escapeHtml(b.adminNotes || '')}</textarea>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button type="button" class="btn btn-primary btn-sm bkg-save-btn">Simpan Status</button>
                  ${waHref ? `<a href="${waHref}" target="_blank" rel="noopener noreferrer" class="btn btn-accent btn-sm">Balas WA ↗</a>` : ''}
                  <button type="button" class="btn btn-sm bkg-copy-btn">Salin</button>
                  <button type="button" class="btn btn-danger btn-sm bkg-del-btn">Hapus</button>
                </div>
              </div>
            </div>
          </div>`;
      })
      .join('');

    wrap.querySelectorAll('.booking-card').forEach((card) => {
      const id = card.getAttribute('data-bkg-id');
      const item = bookings.find((x) => x.id === id);

      card.querySelector('.bkg-copy-btn').addEventListener('click', () => {
        if (!item) return;
        const summary =
          `Resi: ${item.receiptCode}\nKlien: ${item.clientName}\nWA: ${item.clientPhone || '-'}\n` +
          `Kategori: ${item.serviceCategory}\nTanggal: ${item.eventDate}\nLokasi: ${item.eventLocation}\n` +
          `Status: ${item.status}\nCatatan: ${item.notes}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(summary).then(() => showToast('Ringkasan berkas disalin.'));
        }
      });

      card.querySelector('.bkg-save-btn').addEventListener('click', async () => {
        const status = card.querySelector('.bkg-status-select').value;
        const adminNotes = card.querySelector('.bkg-notes-input').value;
        try {
          const updated = await api('/api/admin/bookings/' + encodeURIComponent(id), {
            method: 'PATCH',
            body: JSON.stringify({ status, adminNotes })
          });
          const idx = bookings.findIndex((x) => x.id === id);
          if (idx !== -1) bookings[idx] = updated;
          renderBookings();
          renderOverview();
          showToast(`Berkas ${updated.receiptCode} diperbarui (${updated.status}).`);
        } catch (err) {
          showToast(err.message);
        }
      });

      card.querySelector('.bkg-del-btn').addEventListener('click', async () => {
        if (!confirm('Hapus data pengajuan ini secara permanen?')) return;
        try {
          await api('/api/admin/bookings/' + encodeURIComponent(id), { method: 'DELETE' });
          bookings = bookings.filter((x) => x.id !== id);
          renderBookings();
          renderOverview();
          showToast('Data pengajuan dihapus.');
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  }

  $('bookingStatusFilter').addEventListener('change', renderBookings);
  $('refreshBookingsBtn').addEventListener('click', async () => {
    try {
      bookings = await api('/api/admin/bookings');
      renderBookings();
      renderOverview();
      showToast('Daftar pengajuan dimuat ulang.');
    } catch (err) {
      showToast(err.message);
    }
  });

  // =====================
  // OVERVIEW
  // =====================
  function renderOverview() {
    if (!config) return;
    const totalArchives = (config.archives || []).length;
    const visibleArchives = (config.archives || []).filter((a) => a.visible !== false).length;
    const totalServices = (config.services || []).length;
    const newBookings = bookings.filter((b) => b.status === 'BARU').length;
    const confirmedBookings = bookings.filter((b) => b.status === 'DIKONFIRMASI').length;

    $('statsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Pengajuan Baru</div>
        <div class="stat-val">${newBookings}</div>
        <div class="stat-sub">Total ${bookings.length} berkas masuk</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Terkonfirmasi</div>
        <div class="stat-val">${confirmedBookings}</div>
        <div class="stat-sub">Siap liputan lapangan</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Katalog Arsip</div>
        <div class="stat-val">${visibleArchives}</div>
        <div class="stat-sub">Dari ${totalArchives} total arsip</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Paket Layanan</div>
        <div class="stat-val">${totalServices}</div>
        <div class="stat-sub">Basis: ${escapeHtml(config.brand?.city || '-')}</div>
      </div>
    `;

    const recent = bookings.slice(0, 3);
    $('recentBookingsBox').innerHTML = recent.length
      ? recent
          .map(
            (b) => `
            <div class="kv-row" style="padding:10px 0; align-items:center;">
              <div>
                <strong>${escapeHtml(b.receiptCode)}</strong> · ${escapeHtml(b.clientName)}
                <span style="color:var(--ink-muted);">(${escapeHtml(b.serviceCategory)} · ${escapeHtml(b.eventDate)})</span>
              </div>
              <span class="status-badge status-${escapeHtml(b.status)}">${escapeHtml(b.status)}</span>
            </div>`
          )
          .join('')
      : '<div style="color:var(--ink-muted);">Belum ada pengajuan masuk.</div>';
  }

  // =====================
  // SAVE ALL CONFIG
  // =====================
  async function saveAllConfig() {
    if (!config) return;
    const btn = $('saveAllBtn');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    try {
      const saved = await api('/api/admin/site', {
        method: 'PUT',
        body: JSON.stringify(config)
      });
      config = saved;
      markDirty(false);
      showToast('Semua perubahan disimpan dan langsung aktif di web live.');
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  $('saveAllBtn').addEventListener('click', saveAllConfig);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      if (!$('adminShell').classList.contains('hidden')) {
        e.preventDefault();
        saveAllConfig();
      }
    }
    if (e.key === 'Escape') {
      $('archiveEditorModal').classList.remove('open');
      $('serviceEditorModal').classList.remove('open');
      $('previewModal').classList.remove('open');
    }
  });

  // Close admin modals on backdrop click
  ['archiveEditorModal', 'serviceEditorModal', 'previewModal'].forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) el.classList.remove('open');
      });
    }
  });

  // Warn before leaving page with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // =====================
  // LIVE PREVIEW MODAL
  // =====================
  function syncPreviewIfOpen() {
    const modal = $('previewModal');
    if (!modal.classList.contains('open')) return;
    const iframe = $('previewIframe');
    if (iframe && iframe.contentWindow && config) {
      iframe.contentWindow.postMessage({ type: 'DA_PREVIEW_CONFIG', config }, window.location.origin);
    }
  }

  $('openPreviewBtn').addEventListener('click', () => {
    const modal = $('previewModal');
    const iframe = $('previewIframe');
    iframe.style.maxWidth = '100%';
    modal.classList.add('open');
    iframe.onload = () => syncPreviewIfOpen();
    iframe.src = '/?preview=' + Date.now();
  });

  $('previewDesktopBtn').addEventListener('click', () => {
    $('previewIframe').style.maxWidth = '100%';
  });

  $('previewMobileBtn').addEventListener('click', () => {
    $('previewIframe').style.maxWidth = '412px';
  });

  $('closePreviewBtn').addEventListener('click', () => {
    $('previewModal').classList.remove('open');
  });

  // =====================
  // SETTINGS & BACKUP
  // =====================
  $('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = $('currentPassword').value;
    const newPassword = $('newPassword').value;
    try {
      const res = await api('/api/admin/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      $('passwordForm').reset();
      showToast(res.message || 'Kata sandi diperbarui.');
    } catch (err) {
      showToast(err.message);
    }
  });

  $('exportConfigBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `da-site-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('File JSON konfigurasi diunduh.');
  });

  $('importConfigFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.brand || !parsed.theme) {
        throw new Error('File JSON tidak sesuai struktur konfigurasi D/A.');
      }
      config = parsed;
      populateAllUI();
      markDirty(true);
      showToast('JSON diimpor. Klik Simpan Perubahan untuk mengaktifkan.');
    } catch (err) {
      showToast(err.message || 'Gagal membaca file JSON.');
    } finally {
      e.target.value = '';
    }
  });

  $('resetAllConfigBtn').addEventListener('click', async () => {
    if (!confirm('Reset seluruh konfigurasi situs kembali ke bawaan Department of Artifacts (D/A)?')) return;
    try {
      config = await api('/api/admin/site/reset', { method: 'POST' });
      populateAllUI();
      markDirty(false);
      showToast('Konfigurasi situs dikembalikan ke bawaan D/A.');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Boot
  checkAuth();
})();
