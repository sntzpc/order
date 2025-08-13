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

function renderAdminPending(list, messOptions = []) {
  const tb = document.getElementById('tblAdminPending');
  if (!tb) return;
  if (!Array.isArray(list) || list.length === 0) {
    tb.innerHTML = '<tr><td colspan="7" class="text-muted">Tidak ada pesanan.</td></tr>';
    return;
  }

  // options mess tujuan
  const messOpts = ['<option value="">- pilih mess -</option>']
    .concat(messOptions.map(n => `<option>${escHTML(n)}</option>`))
    .join('');

  tb.innerHTML = list.map(o => `
    <tr data-id="${escHTML(o.id)}">
      <td>${formatDateTimeID(o.waktu_pakai)}</td>
      <td>${escHTML(o.jenis)}</td>
      <td class="text-end">${Number(o.porsi||0)}</td>
      <td>${escHTML(o.kegiatan||'')}</td>
      <td>${escHTML(o.display_name||o.username||'')}</td>
      <td>
        <select class="form-select form-select-sm sel-mess">
          ${messOpts.replace(`>${escHTML(o.allocated_mess||'')}<`, ` selected>${escHTML(o.allocated_mess||'')}<`)}
        </select>
      </td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-primary btn-alloc">Alokasikan</button>
        <button class="btn btn-sm btn-outline-danger btn-reject">Tolak</button>
      </td>
    </tr>
  `).join('');

  // wiring aksi
  tb.querySelectorAll('.btn-alloc').forEach(btn=>{
    btn.addEventListener('click', async e=>{
      const tr = e.target.closest('tr');
      const id = tr.dataset.id;
      const messName = tr.querySelector('.sel-mess').value.trim();
      if (!messName) return Swal.fire('Info', 'Pilih Mess terlebih dahulu.', 'info');
      await withBtnBusy(btn, async ()=>{
        const sess = getSession();
        await apiPost('adminAllocate', { token: sess.token, id, allocated_mess: messName });
        toastSuccess('Dialokasikan.');
      });
    });
  });
  tb.querySelectorAll('.btn-reject').forEach(btn=>{
    btn.addEventListener('click', async e=>{
      const tr = e.target.closest('tr');
      const id = tr.dataset.id;
      const { value: reason } = await Swal.fire({input:'text', title:'Alasan penolakan', inputPlaceholder:'Opsional', showCancelButton:true});
      if (reason === undefined) return;
      await withBtnBusy(btn, async ()=>{
        const sess = getSession();
        await apiPost('adminReject', { token: sess.token, id, reason: reason||'' });
        toastSuccess('Ditolak.');
      });
    });
  });
}


function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m])); }

// optional: auto-run if panel already visible
if (document.getElementById('tabAdmin')) {
  // dipanggil juga dari auth.js setelah login sebagai Admin
}
