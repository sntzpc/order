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

