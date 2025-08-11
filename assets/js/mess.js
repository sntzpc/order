// ==== MESS (Update status pesanan) ====
// Tampil data utk Admin (read-only) & Mess (dengan aksi).
// Prasyarat global: apiPost(), getSession(), toastSuccess(), toastError().
// Fallback disediakan utk badgeStatus() dan withBtnBusy() bila belum ada.

// Fallback badgeStatus
if (typeof window.badgeStatus !== 'function') {
  window.badgeStatus = function (s) {
    const map = { Pending:'secondary', Dialokasikan:'primary', Diterima:'info', Disiapkan:'warning', Siap:'success', Selesai:'dark', Rejected:'danger' };
    const cls = map[s] || 'secondary';
    return `<span class="badge bg-${cls} badge-status">${s}</span>`;
  };
}
// Fallback withBtnBusy
if (typeof window.withBtnBusy !== 'function') {
  window.withBtnBusy = async function (btn, fn) {
    if (!btn) return fn();
    const h = btn.innerHTML, d = btn.disabled;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Memproses…';
    try { return await fn(); }
    finally { btn.disabled = d; btn.innerHTML = h; }
  };
}

let _messInited = false;
let _tblMess, _btnMessRefresh;

function isRoleMess(){
  const s = getSession() || {};
  return s.role === 'Mess';
}

async function messInit(){
  if (_messInited) return;
  _messInited = true;

  _tblMess = document.getElementById('tblMess');
  _btnMessRefresh = document.getElementById('btnMessRefresh');

  if (!_tblMess) {
    console.warn('[messInit] #tblMess tidak ditemukan.');
    return;
  }

  // Refresh button (tetap ada utk Admin -> hanya refresh tampilan)
  if (_btnMessRefresh) {
    _btnMessRefresh.addEventListener('click', () => withBtnBusy(_btnMessRefresh, messRefresh));
  }

  // Delegasi klik tombol aksi — hanya role Mess yang boleh kirim update
  _tblMess.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (!isRoleMess()) return; // Admin: read-only
    await withBtnBusy(btn, async ()=>{
      const id = btn.dataset.id;
      const action = btn.dataset.act; // received | preparing | ready | done
      const sess = getSession();
      try {
        await apiPost('messUpdate', { token: sess.token, id, action });
        toastSuccess('Status diperbarui.');
        await messRefresh();
        // Jika modul report ada, ikut refresh halus
        if (typeof window.reportSoftRefresh === 'function') window.reportSoftRefresh();
      } catch(err){ toastError(err.message || err); }
    });
  });

  await messRefresh();
}

// Ambil list pesanan:
// - Role Mess: backend sudah filter allocated_mess = messName.
// - Role Admin: backend mengembalikan semua pesanan -> kita tampilkan yang belum selesai/rejected agar relevan.
async function messRefresh(){
  const sess = getSession();
  const res  = await apiPost('getOrders', { token: sess.token });
  let list = res.orders || [];
  // tampilkan yang aktif saja
  list = list.filter(r => !['Selesai','Rejected'].includes(String(r.status)));
  renderMessList(list);
}

function renderMessList(list){
  const isMess = isRoleMess();
  const rowsHtml = (list||[]).map(r => `
    <tr>
      <td>${esc(r.id)}</td>
      <td>${esc(r.waktu_pakai)}</td>
      <td>${esc(r.jenis)}</td>
      <td>${esc(r.porsi)}</td>
      <td>${esc(r.kegiatan)}</td>
      <td>${badgeStatus(r.status || '')}</td>
      <td class="d-flex flex-wrap gap-1">${renderActions(r, isMess)}</td>
    </tr>
  `).join('');
  _tblMess.innerHTML = rowsHtml || `<tr><td colspan="7" class="text-center text-muted">Tidak ada data.</td></tr>`;
}

// Tampilkan hanya 1 tombol sesuai progres — dan hanya untuk role Mess.
// Admin: tampilkan strip (—) agar kolom tetap rapi.
function renderActions(r, isMess){
  if (!isMess) return '<span class="text-muted">—</span>';
  const id = r.id;
  const s  = r.status;
  const B  = (act, text, cls='btn-primary') => `<button class="btn btn-sm ${cls}" data-id="${esc(id)}" data-act="${act}">${text}</button>`;
  if (s === 'Dialokasikan') return B('received','Terima','btn-success');
  if (s === 'Diterima')     return B('preparing','Siapkan','btn-warning');
  if (s === 'Disiapkan')    return B('ready','Siap','btn-info');
  if (s === 'Siap')         return B('done','Selesai','btn-dark');
  return '<span class="text-muted">—</span>';
}

function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m])); }

// Lazy init saat tab Mess dibuka (agar Admin pun ter-inisialisasi)
document.addEventListener('DOMContentLoaded', ()=>{
  const link = document.querySelector('a.nav-link[data-bs-toggle="tab"][href="#tabMess"]');
  link?.addEventListener('shown.bs.tab', ()=> { messInit(); });
  // Jika tab Mess sudah aktif saat load (jarang), init langsung
  const pane = document.getElementById('tabMess');
  if (pane && pane.classList.contains('active')) messInit();
});

// Optional: expose
window.messInit = messInit;
