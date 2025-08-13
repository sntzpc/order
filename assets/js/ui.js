// assets/js/ui.js
function show(el){ el.classList.remove('d-none'); }
function hide(el){ el.classList.add('d-none'); }
function toastSuccess(text){ Swal.fire({ icon:'success', title:'Berhasil', text, timer:1500, showConfirmButton:false }); }
function toastError(text){ Swal.fire({ icon:'error', title:'Gagal', text }); }
function rupiah(n){ n=+n||0; return n.toLocaleString('id-ID'); }
function badgeStatus(s){
  const map = {
    'Pending':'secondary','Dialokasikan':'primary','Diterima':'info',
    'Disiapkan':'warning','Siap':'success','Selesai':'dark','Rejected':'danger'
  };
  const cls = map[s] || 'secondary';
  return `<span class="badge bg-${cls} badge-status">${s}</span>`;
}

// === Busy overlay untuk seluruh API call ===
const appBusyEl = document.getElementById('appBusy');
function showBusy(){ appBusyEl && appBusyEl.classList.remove('d-none'); }
function hideBusy(){ appBusyEl && appBusyEl.classList.add('d-none'); }

// === Busy untuk tombol individual ===
async function withBtnBusy(btn, fn){
  if (!btn) return fn();
  const origHTML = btn.innerHTML;
  const origDis  = btn.disabled;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Memproses…';
  try { return await fn(); }
  finally { btn.innerHTML = origHTML; btn.disabled = origDis; }
}

// === Aktifkan Tab secara programatik ===
function activateTab(selector){ // selector: '#tabOrder'
  const link = document.querySelector(`a.nav-link[data-bs-toggle="tab"][href="${selector}"]`);
  if (link){
    const tab = new bootstrap.Tab(link);
    tab.show();
  }
}

// === Auto-collapse navbar setelah klik menu (di HP) ===
(function(){
  const nav = document.getElementById('mainNav');
  if (!nav) return;
  nav.addEventListener('click', (e)=>{
    const a = e.target.closest('a.nav-link[data-bs-toggle="tab"]');
    if (!a) return;
    // tutup collapse jika sedang terbuka
    const collapse = bootstrap.Collapse.getOrCreateInstance(nav, {toggle:false});
    collapse.hide();
  });
})();

document.getElementById('menuTabs')?.classList.add('nav');

// ==== Date/Time & helpers (global) ====
window.formatDateTimeID = function formatDateTimeID(value) {
  if (!value) return '';
  let d;
  if (value instanceof Date) d = value;
  else if (typeof value === 'string') {
    // dukung "yyyy-MM-dd HH:mm:ss" dari GAS
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) d = new Date(+m[1], +m[2]-1, +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
    else {
      const t = Date.parse(value);
      d = isNaN(t) ? null : new Date(t);
    }
  } else if (typeof value === 'number') {
    d = new Date(value);
  }
  if (!d || isNaN(d.getTime())) return '';
  const z = n => String(n).padStart(2,'0');
  return `${z(d.getDate())}/${z(d.getMonth()+1)}/${d.getFullYear()} - ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
};

window.rpCurrency = function rpCurrency(n) {
  const v = Number(n||0);
  return v.toLocaleString('id-ID');
};

window.escHTML = function escHTML(s) {
  return String(s==null?'':s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
};

// === Dynamic Jenis Options ===
// Sumber: getMasterData (menu aktif). Opsi dipakai di: #inpJenis, #fltJenis, #repJenis

(function(){
  function uniqueSortedJenis(menuRows){
    const set = new Set();
    (Array.isArray(menuRows) ? menuRows : []).forEach(r => {
      const j = String(r?.jenis || '').trim();
      if (j) set.add(j);
    });
    const arr = Array.from(set);
    // sort case-insensitive
    arr.sort((a,b)=>a.localeCompare(b, undefined, { sensitivity:'base' }));
    // fallback kalau kosong
    return arr.length ? arr : ['Snack','Nasi Kotak'];
  }

  function setSelectOptions(sel, items, opts={}){
    if (!sel) return;
    const prev = sel.value;
    const html = [
      opts.firstOption ? `<option value="${opts.firstOption.value}">${opts.firstOption.label}</option>` : ''
    ].concat(items.map(j => `<option value="${j}">${j}</option>`)).join('');
    sel.innerHTML = html;
    // pilih kembali jika masih ada
    if (prev && items.includes(prev)) sel.value = prev;
  }

  function updateJenisSelectsFromList(list){
    const inpJenis = document.getElementById('inpJenis');   // form Order
    const fltJenis = document.getElementById('fltJenis');   // filter List Order (user)
    const repJenis = document.getElementById('repJenis');   // filter Report (admin)

    setSelectOptions(inpJenis, list, { firstOption:{ value:'', label:'- pilih -' } });
    setSelectOptions(fltJenis, list, { firstOption:{ value:'', label:'Semua' } });
    setSelectOptions(repJenis, list, { firstOption:{ value:'', label:'Semua' } });
  }

  async function refreshJenisOptionsFromMaster(attempt=0){
    try{
      if (typeof getSession !== 'function') return;
      const sess = getSession();
      if (!sess || !sess.token){
        // coba lagi nanti (mis. sebelum login selesai)
        if (attempt < 6) setTimeout(()=>refreshJenisOptionsFromMaster(attempt+1), 500);
        return;
      }
      const res = await apiPost('getMasterData', { token: sess.token });
      const menu = Array.isArray(res?.menu) ? res.menu : [];
      const jenisList = uniqueSortedJenis(menu);
      updateJenisSelectsFromList(jenisList);
      // share ke modul lain bila perlu
      window.AppJenisList = jenisList;
    }catch(e){
      // diamkan saja agar tidak mengganggu alur; tetap bisa pakai fallback default
    }
  }

  // Dengarkan event dari Setting (master.js) saat Menu berubah
  window.addEventListener('menu:updated', (ev)=>{
    const rows = ev?.detail || [];
    const jenisList = uniqueSortedJenis(rows);
    updateJenisSelectsFromList(jenisList);
    window.AppJenisList = jenisList;
  });

  // Ekspor util ke global agar bisa dipanggil modul lain
  window.refreshJenisOptionsFromMaster = refreshJenisOptionsFromMaster;
})();
