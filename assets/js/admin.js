// ==== ADMIN (Approve & Allocate) ====
// Prasyarat global: withBtnBusy(), apiPost(), getSession(), toastSuccess/toastError.
// Opsional: window.formatDateTimeID(v) dan window.esc(s). Kita sediakan fallback ringan.

(function(){
  // ===== Utilities (fallback) =====
  function esc(s){
    try { if (typeof window.esc === 'function') return window.esc(s); } catch(_){}
    return String(s ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'
    }[m]));
  }
  const fmtID = (v)=>{
    if (typeof window.formatDateTimeID === 'function') return window.formatDateTimeID(v);
    // fallback: tampilkan apa adanya
    return esc(v ?? '');
  };

  // ===== State =====
  let $tb, $btnRefresh;

  // ===== Init (dipanggil dari auth.js via lazy init) =====
  async function adminInit(){
    $tb         = document.getElementById('tblAdminPending');
    $btnRefresh = document.getElementById('btnAdminRefresh');

    if (!$tb || !$btnRefresh){
      console.warn('[adminInit] Admin panel not found. Skipping.');
      return;
    }

    // Refresh with spinner on button
    $btnRefresh.addEventListener('click', () => withBtnBusy($btnRefresh, adminRefresh));

    // Delegated click untuk Approve / Reject
    $tb.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const id  = btn.dataset.id;
      if (!id) return;

      await withBtnBusy(btn, async ()=>{
        const sess = getSession();
        try {
          if (act === 'approve'){
            const sel = document.getElementById('selMess_' + id);
            const messName = (sel?.value || '').trim();
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
            if (reason === undefined) return; // dibatalkan
            await apiPost('adminReject', { token: sess.token, id, reason: reason || '' });
            toastSuccess('Pesanan ditolak.');
          }

          // Optimistic UI: hapus baris agar terasa instan
          const tr = btn.closest('tr');
          if (tr) tr.remove();

          // Sinkronkan dari server (ambil pending terbaru)
          await adminRefresh();

        } catch(err){
          toastError(err?.message || String(err));
        }
      });
    });

    await adminRefresh();
  }

  // ===== Refresh data =====
  async function adminRefresh(){
    const sess = getSession();
    // paralel: ambil daftar Mess aktif + pesanan Pending
    const [md, res] = await Promise.all([
      apiPost('getMasterData', { token: sess.token }),
      apiPost('getOrders',     { token: sess.token, status: 'Pending' })
    ]);
    const messList = Array.isArray(md?.messList) ? md.messList : [];
    const orders   = Array.isArray(res?.orders)   ? res.orders   : [];
    renderAdminPending(orders, messList);
  }

  // ===== Render tabel pending =====
  function renderAdminPending(list, messOptions){
    if (!$tb) return;

    const table    = $tb.closest('table');
    const firstTh  = table?.querySelector('thead th:first-child');
    const firstIsID = firstTh && String(firstTh.textContent || '').trim().toLowerCase() === 'id';
    if (firstIsID) firstTh.classList.add('d-none'); // sembunyikan kolom ID di header

    const thCount = table ? table.querySelectorAll('thead th').length : 8;

    if (!Array.isArray(list) || list.length === 0){
      $tb.innerHTML = `<tr><td colspan="${thCount}" class="text-center text-muted">Tidak ada pesanan.</td></tr>`;
      return;
    }

    const getMessName = (m) => {
      if (typeof m === 'string') return m;
      // getMasterData() -> messList: { id, nama }
      return m?.nama || m?.nama_mess || '';
    };

    // Jika messOptions kosong, siapkan placeholder & disable allocate
    const noMess = !Array.isArray(messOptions) || messOptions.length === 0;

    function buildMessSelectHTML(selectedName, rowId){
      if (noMess){
        return `<select class="form-select form-select-sm" id="selMess_${esc(rowId)}" disabled>
                  <option value="">(Tidak ada Mess aktif)</option>
                </select>`;
      }
      const opts = ['<option value="">- pilih mess -</option>']
        .concat(
          messOptions.map(m => {
            const nm  = getMessName(m);
            const sel = (String(nm) === String(selectedName)) ? ' selected' : '';
            return `<option value="${esc(nm)}"${sel}>${esc(nm)}</option>`;
          })
        ).join('');
      return `<select class="form-select form-select-sm" id="selMess_${esc(rowId)}">${opts}</select>`;
    }

    $tb.innerHTML = list.map(o => {
      const idCell = firstIsID ? `<td class="d-none">${esc(o.id || '')}</td>` : '';
      const disableApprove = noMess ? ' disabled' : '';
      return `
        <tr data-id="${esc(o.id)}">
          ${idCell}
          <td>${fmtID(o.waktu_pakai)}</td>
          <td>${esc(o.jenis)}</td>
          <td class="text-end">${Number(o.porsi || 0)}</td>
          <td>${esc(o.kegiatan || '')}</td>
          <td>${esc(o.display_name || o.username || '')}</td>
          <td>${buildMessSelectHTML(o.allocated_mess || '', o.id)}</td>
          <td class="text-nowrap">
            <button class="btn btn-sm btn-primary" data-act="approve" data-id="${esc(o.id)}"${disableApprove}>Alokasikan</button>
            <button class="btn btn-sm btn-outline-danger" data-act="reject"  data-id="${esc(o.id)}">Tolak</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ===== expose =====
  window.adminInit   = adminInit;
  window.adminRefresh = adminRefresh; // opsional, kalau mau panggil dari tempat lain

})();
