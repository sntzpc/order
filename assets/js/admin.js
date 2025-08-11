// ==== ADMIN (Approve & Allocate) ====
// Prasyarat: withBtnBusy(), apiPost(), getSession(), toastSuccess/toastError tersedia.

let _tblAdminPending, _btnAdminRefresh;

async function adminInit(){
  _tblAdminPending = document.getElementById('tblAdminPending');
  _btnAdminRefresh = document.getElementById('btnAdminRefresh');

  if (!_tblAdminPending || !_btnAdminRefresh) {
    console.warn('[adminInit] Admin panel not found. Skipping.');
    return;
  }

  // Refresh dengan loading di tombol
  _btnAdminRefresh.addEventListener('click', () => withBtnBusy(_btnAdminRefresh, adminRefresh));

  // Delegasi klik untuk Approve/Reject + loading pada tombol yang ditekan
  _tblAdminPending.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    await withBtnBusy(btn, async ()=>{
      const act = btn.dataset.act;
      const id  = btn.dataset.id;
      const sess = getSession();
      try {
        if (act === 'approve'){
          const sel = document.getElementById('selMess_'+id);
          const messName = sel ? sel.value.trim() : '';
          if (!messName) return toastError('Pilih mess tujuan terlebih dahulu.');
          await apiPost('adminAllocate', { token: sess.token, id, allocated_mess: messName });
          toastSuccess('Pesanan dialokasikan.');
        } else if (act === 'reject'){
          const { value: reason } = await Swal.fire({
            title: 'Alasan Reject',
            input: 'text',
            inputPlaceholder: 'Opsional',
            showCancelButton: true,
            confirmButtonText: 'Reject'
          });
          await apiPost('adminReject', { token: sess.token, id, reason: reason || '' });
          toastSuccess('Pesanan ditolak.');
        }
        await adminRefresh();
      } catch(err){ toastError(err.message || err); }
    });
  });

  await adminRefresh();
}

async function adminRefresh(){
  const sess = getSession();
  const md   = await apiPost('getMasterData', { token: sess.token });
  const res  = await apiPost('getOrders', { token: sess.token, status: 'Pending' });
  renderAdminPending(res.orders || [], md.messList || []);
}

function renderAdminPending(list, messList){
  _tblAdminPending.innerHTML = '';
  const opts = (messList||[]).map(m=>`<option value="${esc(m.nama)}">${esc(m.nama)}</option>`).join('');
  const html = (list||[]).map(r=>{
    const selId = 'selMess_'+r.id;
    return `
      <tr>
        <td>${esc(r.id)}</td>
        <td>${esc(r.waktu_pakai)}</td>
        <td>${esc(r.jenis)}</td>
        <td>${esc(r.porsi)}</td>
        <td>${esc(r.kegiatan)}</td>
        <td>${esc(r.display_name)}</td>
        <td>
          <select id="${selId}" class="form-select form-select-sm">
            <option value="">- pilih mess -</option>${opts}
          </select>
        </td>
        <td class="d-flex gap-1">
          <button class="btn btn-sm btn-success" data-act="approve" data-id="${esc(r.id)}">Approve</button>
          <button class="btn btn-sm btn-outline-danger" data-act="reject"  data-id="${esc(r.id)}">Reject</button>
        </td>
      </tr>`;
  }).join('');
  _tblAdminPending.innerHTML = html;
}

function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m])); }

// optional: auto-run if panel already visible
if (document.getElementById('tabAdmin')) {
  // dipanggil juga dari auth.js setelah login sebagai Admin
}
