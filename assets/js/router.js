/* ============ SHIM SESSION ============ */
(function () {
  if (!window.Session) {
    const KEY = 'sess';
    window.Session = {
      get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } },
      set(o) { localStorage.setItem(KEY, JSON.stringify(o)); },
      clear() { localStorage.removeItem(KEY); }
    };
  }
})();

/* ============ API CALL (pakai CONFIG.WEB_APP_URL) ============ */
(function () {
  if (!window.apiCall) {
    window.apiCall = async (action, payload = {}) => {
      // Cari URL di berbagai tempat, tanpa bikin ReferenceError
      const urlFromConfig =
        (typeof CONFIG !== 'undefined' && CONFIG && typeof CONFIG.WEB_APP_URL === 'string' && CONFIG.WEB_APP_URL.trim()) ||
        (typeof window !== 'undefined' && window.CONFIG && typeof window.CONFIG.WEB_APP_URL === 'string' && window.CONFIG.WEB_APP_URL.trim());

      const urlFromGlobal =
        (typeof window !== 'undefined' && typeof window.API_URL === 'string' && window.API_URL.trim()) || '';

      const URL = urlFromConfig || urlFromGlobal;

      if (!URL) {
        return { ok: false, error: 'WEB_APP_URL belum diatur. Pastikan assets/js/config.js berisi CONFIG.WEB_APP_URL.' };
      }

      const body = JSON.stringify({ action, ...payload });
      const res  = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
      const txt  = await res.text();
      try { return JSON.parse(txt); }
      catch(e){ return { ok:false, error:'Respon bukan JSON dari GAS', httpStatus:res.status, raw:txt }; }
    };
  }
})();

/* ============ NOTIF FALLBACK ============ */
function toast(msg, type) {
  if (window.UI && typeof UI.showToast === 'function') UI.showToast(msg, type);
  else alert(msg);
}

/* ============ BUSY BUTTONS (asli Anda, ringkas) ============ */
(() => {
  function showBusy(btn, label) {
    if (!btn || btn.dataset.busy === '1') return () => {};
    btn.dataset.busy = '1';
    btn.dataset.origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>' + (label || 'Memproses…');
    return function restore() {
      btn.disabled = false;
      if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
      btn.removeAttribute('data-busy');
      delete btn.dataset.origHtml;
    };
  }
  function guardIfBusy(e) {
    const btn = e.currentTarget;
    if (btn && btn.dataset.busy === '1') { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  function bindLoginBusy() {
    const btn = document.getElementById('btnLogin');
    const appWrap = document.getElementById('appWrap');
    if (!btn || !appWrap) return;
    btn.addEventListener('click', function (e) {
      if (btn.dataset.busy === '1') return guardIfBusy(e);
      const restore = showBusy(btn, 'Masuk…');
      let done = false; const finish = () => { if (done) return; done = true; restore(); };
      const mo = new MutationObserver(() => {
        if (!appWrap.classList.contains('d-none')) { mo.disconnect(); finish(); }
      });
      mo.observe(appWrap, { attributes: true, attributeFilter: ['class'] });
      setTimeout(() => { mo.disconnect(); finish(); }, 8000);
    }, true);
  }
  function bindOrderBusy() {
    const btn = document.getElementById('btnSubmit');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      if (btn.dataset.busy === '1') return guardIfBusy(e);
      const restore = showBusy(btn, 'Mengirim…');
      setTimeout(restore, 8000);
    }, true);
  }
  document.addEventListener('DOMContentLoaded', () => { bindLoginBusy(); bindOrderBusy(); });
})();

/* ============ ROUTER: khusus struktur index.html ini ============ */
function hideAllViews() {
  // Sembunyikan semua view publik (login/register) dan app
  const login = document.getElementById('cardLogin');
  const reg   = document.getElementById('view-register');
  const app   = document.getElementById('appWrap');

  if (login) { login.classList.add('d-none'); login.style.display = 'none'; }
  if (reg)   { reg.classList.add('d-none');   reg.style.display   = 'none'; }
  if (app)   { app.classList.add('d-none');   /* app dikontrol oleh auth.js */ }
}

function route(hash) {
  hideAllViews();
  const sess = (window.Session && typeof Session.get === 'function') ? Session.get() : null;

  // Belum login → hanya boleh lihat login ATAU register
  if (!sess) {
    if (hash === '#register') {
      const reg = document.getElementById('view-register');
      reg?.classList.remove('d-none');
      if (reg) reg.style.display = '';   // pastikan override inline style
      initRegisterView();
    } else {
      const login = document.getElementById('cardLogin');
      login?.classList.remove('d-none');
      if (login) login.style.display = '';
    }
    return;
  }

  // Sudah login → tampilkan appWrap (auth.js Anda yang handle tab & role)
  document.getElementById('appWrap')?.classList.remove('d-none');
  const navUser = document.getElementById('navUser');
  if (navUser) navUser.textContent = (sess.nama || sess.username) + ' (' + sess.role + ')';
  document.getElementById('btnLogout')?.classList.remove('d-none');
}

/* ============ REGISTER VIEW ============ */
function slugifyUsername(s) {
  return (s || '').toString().trim().toLowerCase()
    .replace(/[^\w.\-]+/g, '')   // a-z0-9_ . -
    .replace(/_{2,}/g, '_')      // rapikan _
    .replace(/^\.+|\.+$/g, '');  // buang titik tepi
}

function initRegisterView() {
  const f = document.getElementById('frm-register');
  if (!f) return;

  const inpFull = document.getElementById('reg-fullname');
  const inpUser = document.getElementById('reg-username');
  const inpPass = document.getElementById('reg-password');
  const inpTele = document.getElementById('reg-tele');
  const btnBack = document.getElementById('btn-reg-back');
  const btnSubm = document.getElementById('btn-reg-submit');

  // Default password ringan (boleh diubah user)
  if (inpPass && !inpPass.value) inpPass.value = 'user123';

  // Autosuggest username dari nama depan
  if (inpFull && inpUser) {
    let touched = false;
    inpUser.addEventListener('input', () => { touched = true; inpUser.value = slugifyUsername(inpUser.value); });
    inpFull.addEventListener('input', () => {
      if (touched) return;
      const first = String(inpFull.value || '').trim().split(/\s+/)[0] || '';
      inpUser.value = slugifyUsername(first);
    });
  }

  btnBack?.addEventListener('click', (e) => { e.preventDefault(); route('#login'); });

  f.onsubmit = async (e) => {
    e.preventDefault();
    const fullname = (inpFull?.value || '').trim();
    const username = slugifyUsername(inpUser?.value || '');
    const password = (inpPass?.value || '').trim();
    const telegram_id = (inpTele?.value || '').replace(/[^\d\-]/g, '').trim();

    if (!fullname) return toast('Nama lengkap wajib diisi', 'error');
    if (!username) return toast('Username wajib diisi', 'error');
    if (!password) return toast('Password wajib diisi', 'error');

    btnSubm?.setAttribute('disabled', 'disabled');
    try {
      const r = await apiCall('register', { fullname, username, password, telegram_id });
      if (!r?.ok) return toast(r?.error || 'Pendaftaran gagal', 'error');
      toast('Pendaftaran berhasil. Silakan login.');
      route('#login');
      const u = document.getElementById('loginUsername'); if (u) u.value = username;
    } catch (err) {
      toast('Gagal menghubungi server: ' + (err?.message || err), 'error');
    } finally {
      btnSubm?.removeAttribute('disabled');
    }
  };
}

/* ============ BOOTSTRAP ============ */
document.addEventListener('DOMContentLoaded', () => {
  // Tampilkan view awal sesuai hash
  route(location.hash || '#login');

  // Link "Daftar" di kartu login
  const lnkReg = document.getElementById('lnkToRegister');
  if (lnkReg) {
    lnkReg.addEventListener('click', (e) => {
      e.preventDefault();
      route('#register');
    });
  }
});

// Re-route saat hash berubah
window.addEventListener('hashchange', () => route(location.hash));