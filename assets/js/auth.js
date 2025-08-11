// ==== AUTH ====
const cardLogin = document.getElementById('cardLogin');
const appWrap   = document.getElementById('appWrap');
const navUser   = document.getElementById('navUser');
const btnLogin  = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');

function getSession(){ try { return JSON.parse(localStorage.getItem('sess')||'null'); } catch(_){ return null; } }
function setSession(s){ localStorage.setItem('sess', JSON.stringify(s)); }
function clearSession(){ localStorage.removeItem('sess'); }

// Fallback activateTab (tanpa Bootstrap)
if (typeof window.activateTab !== 'function'){
  window.activateTab = function(idOrHash){
    const hash = idOrHash.startsWith('#') ? idOrHash : ('#'+idOrHash);
    const trigger = document.querySelector(`#menuTabs a[href="${hash}"]`);
    const pane    = document.querySelector(hash);
    if (!trigger || !pane) return;
    document.querySelectorAll('#menuTabs .nav-link.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-pane.show.active').forEach(el => el.classList.remove('show','active'));
    trigger.classList.add('active');
    pane.classList.add('show','active');
  };
}

// ==== UI TABS CONFIG (fresh-first) ====
const DEFAULT_UI_TABS = {
  User: ['Order','MyOrders'],
  Mess: ['Mess','Report']
};
window.UI_TABS_CACHE = window.UI_TABS_CACHE || { User:null, Mess:null };

async function loadUiTabsConfig(){
  // 1) Coba ambil dari server (Config) -> sumber kebenaran
  try{
    const sess = getSession();
    const res  = await apiPost('mdList', { token: sess.token, entity: 'Config' });
    const rows = Array.isArray(res.rows) ? res.rows : [];
    const map  = Object.fromEntries(rows.map(r => [r.key, r.value]));

    const u = (map.UI_TABS_USER || DEFAULT_UI_TABS.User.join(','))
      .split(',').map(s=>s.trim()).filter(Boolean);
    const m = (map.UI_TABS_MESS || DEFAULT_UI_TABS.Mess.join(','))
      .split(',').map(s=>s.trim()).filter(Boolean);

    window.UI_TABS_CACHE = { User: u, Mess: m };
    localStorage.setItem('uiTabsConfig', JSON.stringify(window.UI_TABS_CACHE));
    localStorage.setItem('uiTabsConfig_ts', String(Date.now()));
    return window.UI_TABS_CACHE;
  }catch(e){
    console.warn('[loadUiTabsConfig] server fail, using cache/default:', e);
    // 2) Fallback: pakai cache lokal kalau ada, kalau tidak pakai default
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('uiTabsConfig') || 'null'); } catch(_){}
    window.UI_TABS_CACHE = cached && cached.User && cached.Mess ? cached : { ...DEFAULT_UI_TABS };
    return window.UI_TABS_CACHE;
  }
}


// ===== APPLY ROLE UI =====
function applyRoleUI(role){
  const TAB_MAP = (window.__TAB_MAP__) || {
    Order:'#tabOrder', MyOrders:'#tabMyOrders', Admin:'#tabAdmin', Mess:'#tabMess', Master:'#tabMaster', Report:'#tabReport', Access:'#tabAccess'
  };

  // Sembunyikan semua dulu
  const allNavItems = document.querySelectorAll('#menuTabs .nav-item');
  allNavItems.forEach(li => li.classList.add('d-none'));

  // Role -> daftar tab yang boleh
  let allowedKeys = [];
  if (role === 'Admin'){
    // Admin: semua tab
    allowedKeys = Object.keys(TAB_MAP);
  } else if (role === 'Mess'){
    allowedKeys = window.UI_TABS_CACHE.Mess || DEFAULT_UI_TABS.Mess;
  } else {
    allowedKeys = window.UI_TABS_CACHE.User || DEFAULT_UI_TABS.User;
  }

  // Tampilkan tab sesuai allowedKeys
  allowedKeys.forEach(k=>{
    const hash = TAB_MAP[k];
    if (!hash) return;
    document.querySelector(`#menuTabs a[href="${hash}"]`)?.closest('.nav-item')?.classList.remove('d-none');
  });

  // Toggle konten khusus (elemen di dalam tab)
  document.querySelectorAll('.role-admin').forEach(el => el.classList.toggle('d-none', role!=='Admin'));
  document.querySelectorAll('.role-mess').forEach(el => el.classList.toggle('d-none', role!=='Mess'));

  // Default active tab = pertama di allowedKeys yang ada elementnya
  let firstHash = '#tabOrder';
  for (const k of allowedKeys){
    const h = TAB_MAP[k];
    if (document.querySelector(`#menuTabs a[href="${h}"]`)) { firstHash = h; break; }
  }
  activateTab(firstHash);
}

// ===== LAZY INIT PER TAB =====
function setupLazyTabInit(role){
  const initByTab = {
    '#tabAdmin' : (typeof window.adminInit  === 'function') ? window.adminInit  : null,
    '#tabMaster': (typeof window.masterInit === 'function') ? window.masterInit : null,
    '#tabMess'  : (typeof window.messInit   === 'function') ? window.messInit   : null,
    '#tabReport': (typeof window.reportInit === 'function') ? window.reportInit : null,
    '#tabAccess': (typeof window.accessInit === 'function') ? window.accessInit : null,
  };
  const inited = new Set();

  const runInit = async (hash) => {
    const fn = initByTab[hash];
    if (!fn || inited.has(hash)) return;
    try { inited.add(hash); await fn(); }
    catch(e){ inited.delete(hash); toastError(e.message || e); }
  };

  document.querySelectorAll('#menuTabs a[data-bs-toggle="tab"]').forEach(a=>{
    a.addEventListener('shown.bs.tab', (ev)=> runInit(ev.target.getAttribute('href') || ''));
    a.addEventListener('click', ()=> runInit(a.getAttribute('href') || ''));
  });

  const active = document.querySelector('#menuTabs a.nav-link.active');
  if (active){ runInit(active.getAttribute('href')); }
}

// Ekspor helper untuk dipanggil Access -> setelah Simpan
window.refreshUiTabsForCurrentRole = function(){
  const sess = getSession();
  if (!sess) return;
  applyRoleUI(sess.role);
};

// ===== Login flow =====
async function handleLogin(){
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) return toastError('Username dan password wajib.');
  btnLogin.disabled = true;
  try {
    const data = await apiPost('login', {username, password});
    setSession(data);
    navUser.textContent = `${data.displayName} (${data.role})`;
    hide(cardLogin); show(appWrap); btnLogout.classList.remove('d-none');

    // 1) Muat konfigurasi tabs dulu
    await loadUiTabsConfig();
    // 2) Tampilkan navbar sesuai role
    applyRoleUI(data.role);
    await primePriceCacheFromServer();
    await safeLoadUiTabsConfig();
    // 3) Init umum
    await initAfterLogin();
    // 4) Daftarkan lazy init
    setupLazyTabInit(data.role);

  } catch(err){
    toastError(err.message);
  } finally {
    btnLogin.disabled = false;
  }
}

btnLogin.addEventListener('click', handleLogin);
btnLogout.addEventListener('click', async ()=>{
  try { const sess = getSession(); if (sess) await apiPost('logout', {token: sess.token}); } catch(_){}
  clearSession(); location.reload();
});

// Auto-login state on load
window.addEventListener('DOMContentLoaded', ()=>{
  const sess = getSession();
  if (!sess) return;
  navUser.textContent = `${sess.displayName} (${sess.role})`;
  hide(cardLogin); show(appWrap); btnLogout.classList.remove('d-none');

  (async ()=>{
    try {
      await loadUiTabsConfig();
      applyRoleUI(sess.role);
      await primePriceCacheFromServer();
      await safeLoadUiTabsConfig();
      await initAfterLogin();
      setupLazyTabInit(sess.role);
    } catch(e){ toastError(e.message); }
  })();
});

// ==== Tambahan di auth.js ====
// Panggil loader UI Tabs/Config hanya jika Admin, lainnya pakai cache/default
async function safeLoadUiTabsConfig(){
  const sess = getSession();
  if (!sess) return;

  // Non-admin: jangan hit endpoint mdList(Config) (pasti Forbidden)
  if (sess.role !== 'Admin'){
    if (typeof applyTabAccessFromCache === 'function') {
      try { applyTabAccessFromCache(); } catch(_) {}
    }
    return;
  }

  // Admin: boleh minta ke server
  if (typeof loadUiTabsConfig === 'function'){
    try { await loadUiTabsConfig(); }
    catch(e){
      console.warn('[safeLoadUiTabsConfig] fallback cache:', e?.message || e);
      if (typeof applyTabAccessFromCache === 'function') {
        try { applyTabAccessFromCache(); } catch(_) {}
      }
    }
  }
}

async function primePriceCacheFromServer(){
  const sess = getSession(); if (!sess) return;
  const md = await apiPost('getMasterData', { token: sess.token });

  if (Array.isArray(md?.menu) && window.PriceCache) {
    PriceCache.setFromGetMasterData(md.menu);
  } else if (md?.defaultPrice && window.PriceCache) {
    PriceCache._data.byJenis = { ...md.defaultPrice };
    PriceCache.save();
  }
}


