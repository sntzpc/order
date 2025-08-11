// ==== ACCESS / ROLE-BASED TABS (Admin) ====
// Simpan konfigurasi di Sheet Config: UI_TABS_USER & UI_TABS_MESS (comma separated)

(function(){
  const TAB_MAP = {
    Order   : '#tabOrder',
    MyOrders: '#tabMyOrders',
    Admin   : '#tabAdmin',
    Mess    : '#tabMess',
    Master  : '#tabMaster',
    Report  : '#tabReport',
    Access  : '#tabAccess'
  };
  const TAB_LABEL = {
    Order   : 'Order',
    MyOrders: 'List Order',
    Admin   : 'Admin',
    Mess    : 'Mess',
    Master  : 'Setting',
    Report  : 'Report',
    Access  : 'Akses'
  };

  // Tab yang boleh DI-PILIH admin untuk role User & Mess (admin tidak diatur di sini)
  const PICKABLE_FOR_USER = ['Order','MyOrders'];                 // default
  const PICKABLE_FOR_MESS = ['Mess','Report','MyOrders'];         // default

  // Cache di window + localStorage
  window.UI_TABS_CACHE = window.UI_TABS_CACHE || { User: null, Mess: null };

  function toCsv(arr){ return (arr||[]).join(','); }
  function fromCsv(s){ return String(s||'').split(',').map(v=>v.trim()).filter(Boolean); }

  async function loadConfigRows(){
    const sess = getSession();
    const res  = await apiPost('mdList', { token: sess.token, entity: 'Config' });
    return Array.isArray(res.rows) ? res.rows : [];
  }
  async function saveConfig(key, value){
    const sess = getSession();
    await apiPost('mdUpsert', { token: sess.token, entity:'Config', record: { key, value } });
  }

  function renderCheckboxes(container, keys){
    const box = document.getElementById(container);
    if (!box) return;
    box.innerHTML = '';
    keys.forEach(k=>{
      const id = `${container}_${k}`;
      const html = `
        <div class="col">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="${id}" data-tabkey="${k}">
            <label class="form-check-label" for="${id}">${TAB_LABEL[k] || k}</label>
          </div>
        </div>
      `;
      box.insertAdjacentHTML('beforeend', html);
    });
  }

  function setChecks(container, checkedKeys){
    const sel = document.querySelectorAll(`#${container} input[type="checkbox"][data-tabkey]`);
    const set = new Set(checkedKeys || []);
    sel.forEach(cb => { cb.checked = set.has(cb.dataset.tabkey); });
  }
  function readChecks(container){
    const sel = document.querySelectorAll(`#${container} input[type="checkbox"][data-tabkey]`);
    const out = [];
    sel.forEach(cb => { if (cb.checked) out.push(cb.dataset.tabkey); });
    return out;
  }

  async function accessInit(){
    // Panel mungkin tak ada (role non-admin)
    const boxUser = document.getElementById('accUserBoxes');
    const boxMess = document.getElementById('accMessBoxes');
    if (!boxUser || !boxMess) return;

    // Render daftar checkbox
    renderCheckboxes('accUserBoxes', PICKABLE_FOR_USER);
    renderCheckboxes('accMessBoxes', PICKABLE_FOR_MESS);

    // Muat konfigurasi dari Config
    try{
      const rows = await loadConfigRows();
      const map  = Object.fromEntries(rows.map(r=>[r.key, r.value]));
      const uCSV = map['UI_TABS_USER'] || toCsv(PICKABLE_FOR_USER);
      const mCSV = map['UI_TABS_MESS'] || toCsv(PICKABLE_FOR_MESS);

      const userTabs = fromCsv(uCSV).filter(k => PICKABLE_FOR_USER.includes(k));
      const messTabs = fromCsv(mCSV).filter(k => PICKABLE_FOR_MESS.includes(k));

      // Set UI
      setChecks('accUserBoxes', userTabs);
      setChecks('accMessBoxes', messTabs);

      // Update cache + localStorage
      window.UI_TABS_CACHE.User = userTabs;
      window.UI_TABS_CACHE.Mess = messTabs;
      localStorage.setItem('uiTabsConfig', JSON.stringify(window.UI_TABS_CACHE));
    }catch(e){
      console.error('[accessInit] load config error:', e);
      toastError(e && e.message ? e.message : 'Gagal memuat konfigurasi akses.');
    }

    // SAVE: User
    document.getElementById('btnAccSaveUser')?.addEventListener('click', async ()=>{
      const arr = readChecks('accUserBoxes');
      try{
        await saveConfig('UI_TABS_USER', toCsv(arr));
        window.UI_TABS_CACHE.User = arr;
        localStorage.setItem('uiTabsConfig', JSON.stringify(window.UI_TABS_CACHE));
        toastSuccess('Akses untuk User disimpan.');
        if (typeof window.refreshUiTabsForCurrentRole === 'function') window.refreshUiTabsForCurrentRole();
      }catch(e){ toastError(e.message || e); }
    });

    // SAVE: Mess
    document.getElementById('btnAccSaveMess')?.addEventListener('click', async ()=>{
      const arr = readChecks('accMessBoxes');
      try{
        await saveConfig('UI_TABS_MESS', toCsv(arr));
        window.UI_TABS_CACHE.Mess = arr;
        localStorage.setItem('uiTabsConfig', JSON.stringify(window.UI_TABS_CACHE));
        toastSuccess('Akses untuk Mess disimpan.');
        if (typeof window.refreshUiTabsForCurrentRole === 'function') window.refreshUiTabsForCurrentRole();
      }catch(e){ toastError(e.message || e); }
    });
  }

  // Expose
  window.accessInit = accessInit;
  window.__TAB_MAP__ = TAB_MAP;          // dipakai auth.js
  window.__TAB_LABEL__ = TAB_LABEL;      // optional

})();
