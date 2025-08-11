// ==== ORDER (User) ====
const inpJenis = document.getElementById('inpJenis');
const inpWaktu = document.getElementById('inpWaktu');
const inpPorsi = document.getElementById('inpPorsi');
const inpKegiatan = document.getElementById('inpKegiatan');
const inpKegiatanManual = document.getElementById('inpKegiatanManual');
const btnAddKegiatan = document.getElementById('btnAddKegiatan');
const inpMess  = document.getElementById('inpMess');
const inpCatatan = document.getElementById('inpCatatan');
const btnSubmit = document.getElementById('btnSubmit');
const lblEstimasi = document.getElementById('lblEstimasi');

const fltStatus = document.getElementById('fltStatus');
const fltJenis  = document.getElementById('fltJenis');
const fltFrom   = document.getElementById('fltFrom');
const fltTo     = document.getElementById('fltTo');
const btnRefreshOrders = document.getElementById('btnRefreshOrders');
const tblOrders = document.getElementById('tblOrders');

let MASTER = { activities:[], messList:[], defaultPrice: { Snack:0, 'Nasi Kotak':0 } };

btnAddKegiatan.addEventListener('click', ()=>{
  inpKegiatanManual.classList.toggle('d-none');
  if (!inpKegiatanManual.classList.contains('d-none')){
    inpKegiatanManual.focus();
  }
});

[inpJenis, inpPorsi].forEach(el => el.addEventListener('input', updateEstimasi));

function kegiatanValue(){
  const manual = !inpKegiatanManual.classList.contains('d-none') ? inpKegiatanManual.value.trim() : '';
  return manual || inpKegiatan.value || '';
}

// Ambil harga default utk 1 jenis dari beberapa sumber (prioritas berurutan)
function getCurrentPriceForJenis(jenis){
  if (!jenis) return 0;

  // 1) cache lokal
  if (window.PriceCache) {
    const p = PriceCache.getPrice(jenis);
    if (!isNaN(p) && p > 0) return p;
  }

  // 2) MASTER.menu (default)
  if (window.MASTER && Array.isArray(MASTER.menu)) {
    const def = MASTER.menu.find(m =>
      m.jenis === jenis && (m.is_default === true || String(m.is_default).toLowerCase() === 'true' || m.is_default === 'TRUE')
    );
    if (def) return Number(def.harga ?? def.harga_per_porsi) || 0;
  }

  // 3) fallback MASTER.defaultPrice
  if (window.MASTER?.defaultPrice && MASTER.defaultPrice[jenis] != null) {
    return Number(MASTER.defaultPrice[jenis]) || 0;
  }
  return 0;
}


// Perbarui label estimasi
function updateEstimasi(){
  const jenisEl = document.getElementById('inpJenis');
  const porsiEl = document.getElementById('inpPorsi');
  const lbl     = document.getElementById('lblEstimasi');
  if (!jenisEl || !porsiEl || !lbl) return;

  const jenis = (jenisEl.value || '').trim();
  const porsi = parseInt(porsiEl.value || '0', 10) || 0;

  const price = getCurrentPriceForJenis(jenis);
  const total = price * porsi;

  lbl.textContent = 'Rp' + (typeof rupiah === 'function'
    ? rupiah(total)
    : total.toLocaleString('id-ID'));
}


async function initAfterLogin(){
  const sess = getSession();
  const md = await apiPost('getMasterData', { token: sess.token });
  window.MASTER = md || {};

  // isi dropdown
  inpKegiatan.innerHTML = '';
  (md.activities||[]).forEach(a=>{
    const o = document.createElement('option');
    o.value = a.nama; o.textContent = a.nama;
    inpKegiatan.appendChild(o);
  });
  inpMess.innerHTML = '<option value="">Tentukan oleh Admin</option>';
  (md.messList||[]).forEach(m=>{
    const o = document.createElement('option');
    o.value = m.nama; o.textContent = m.nama;
    inpMess.appendChild(o);
  });

  // seed cache (aman dipanggil berulang)
  if (window.PriceCache && Array.isArray(md.menu)) {
    PriceCache.setFromGetMasterData(md.menu);
  }

  // hitung pertama kali
  updateEstimasi();

  // lalu load daftar order
  await refreshOrders();
}

// Realtime bindings (cukup sekali)
(function bindRealtime(){
  if (window.__order_rt_bound) return; window.__order_rt_bound = true;

  document.getElementById('inpJenis')?.addEventListener('change', updateEstimasi);
  document.getElementById('inpJenis')?.addEventListener('input',  updateEstimasi);
  document.getElementById('inpPorsi')?.addEventListener('input',  updateEstimasi);
  document.getElementById('inpPorsi')?.addEventListener('change', updateEstimasi);

  // Ketika Setting → Menu diubah (via master.js), cache akan broadcast event ini
  window.addEventListener('pricecache:updated', updateEstimasi);
window.addEventListener('msrie-price-cache-updated', updateEstimasi);

  // Hitung sekali di awal (kalau DOM sudah ada)
  try { updateEstimasi(); } catch(_){}
})();


btnSubmit.addEventListener('click', async ()=>{
  const jenis = inpJenis.value.trim();
  const waktu = inpWaktu.value.trim();
  const porsi = parseInt(inpPorsi.value||'0',10);
  const kegiatan = kegiatanValue();
  const mess_tujuan = inpMess.value.trim();
  const catatan = inpCatatan.value.trim();

  if (!jenis || !waktu || !porsi || !kegiatan){
    return toastError('Lengkapi semua field wajib.');
  }
  btnSubmit.disabled = true;
  try {
    const sess = getSession();
    const data = await apiPost('createOrder', {
      token: sess.token, jenis, waktu_pakai: waktu, porsi, kegiatan, mess_tujuan, catatan
    });
    toastSuccess('Pesanan terkirim.');
    // reset
    inpCatatan.value='';
    await refreshOrders();
  } catch(err){
    toastError(err.message);
  } finally {
    btnSubmit.disabled = false;
  }
});

btnRefreshOrders.addEventListener('click', refreshOrders);

async function refreshOrders(){
  const sess = getSession();
  const params = {
    token: sess.token,
    status: fltStatus.value || '',
    jenis: fltJenis.value || '',
    date_from: fltFrom.value || '',
    date_to: fltTo.value || ''
  };
  try {
    const res = await apiPost('getOrders', params);
    renderOrders(res.orders || []);
  } catch(err){
    toastError(err.message);
  }
}

function renderOrders(list){
  tblOrders.innerHTML = '';
  for (const r of list){
    const totalDisplay =
      (r.total_biaya === '' || r.total_biaya == null)
        ? ''                           // biarkan kosong untuk order lama yg belum ada total
        : rupiah(+r.total_biaya || 0); // kalau ada angkanya, tampilkan

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(r.id)}</td>
      <td>${esc(r.created_at)}</td>
      <td>${esc(r.jenis)}</td>
      <td>${esc(r.waktu_pakai)}</td>
      <td>${esc(r.porsi)}</td>
      <td>${esc(r.kegiatan)}</td>
      <td>${esc(r.mess_tujuan||'-')}</td>
      <td>${esc(r.status)}</td>
      <td class="text-end">${totalDisplay}</td>
    `;
    tblOrders.appendChild(tr);
  }
}

function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m])); }


// ===== Gunakan loading di tombol Submit Order =====
(function(){
  const btn = document.getElementById('btnSubmit');
  if (!btn) return;
  const origHandler = btn.onclick;
  btn.addEventListener('click', async (ev)=>{
    ev.preventDefault();
    await withBtnBusy(btn, async ()=>{
      // panggil handler submit yang lama (kalau ada) atau panggil fungsi submit order kamu di sini
      if (typeof submitOrder === 'function'){ await submitOrder(); }
      else if (origHandler){ await origHandler(ev); }
    });
  }, { once: true }); // kaitkan sekali; handler di atas akan memasang ulang event default di dalam submitOrder
})();

// ================= HARDENED ADD-ONS FOR ORDER.JS =================

// 1) Fallback: withBtnBusy (jika ui.js belum mendefinisikan)
if (typeof window.withBtnBusy !== 'function') {
  window.withBtnBusy = async function(btn, fn){
    if (!btn) return fn();
    const origHTML = btn.innerHTML, origDis = btn.disabled;
    try {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Memproses…';
      return await fn();
    } finally {
      btn.disabled = origDis;
      btn.innerHTML = origHTML;
    }
  };
}

// 2) Modal Pilih Waktu (aman jika elemen belum ada)
document.addEventListener('DOMContentLoaded', ()=>{
  // --- Bind modal pilih waktu (idempotent)
  if (!window.__bind_waktu_modal){
    window.__bind_waktu_modal = true;

    const btnPick   = document.getElementById('btnPickWaktu');
    const inpWaktu  = document.getElementById('inpWaktu');
    const modalEl   = document.getElementById('modalWaktu');
    const formWaktu = document.getElementById('formWaktu');
    const mwTanggal = document.getElementById('mwTanggal');
    const mwWaktu   = document.getElementById('mwWaktu');

    if (btnPick && inpWaktu && modalEl && formWaktu && mwTanggal && mwWaktu){
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      const z = n => String(n).padStart(2,'0');
      const toInputDate = d => `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
      const toInputTime = d => `${z(d.getHours())}:${z(d.getMinutes())}`;

      btnPick.addEventListener('click', ()=>{
        let d = new Date();
        if (inpWaktu.value){
          const t = new Date(inpWaktu.value);
          if (!isNaN(t.getTime())) d = t;
        }
        mwTanggal.value = toInputDate(d);
        mwWaktu.value   = toInputTime(d);
        modal.show();
      });

      formWaktu.addEventListener('submit', (e)=>{
        e.preventDefault();
        const tgl = (mwTanggal.value||'').trim();
        const jam = (mwWaktu.value||'').trim();
        if (!tgl || !jam) return;
        inpWaktu.value = `${tgl}T${jam}`;
        modal.hide();
      });
    }
  }

  // --- Bind tombol submit (idempotent)
  if (!window.__bind_submit_btn){
    window.__bind_submit_btn = true;

    const btnSubmit = document.getElementById('btnSubmit');
    if (btnSubmit){
      const oldOnClick = btnSubmit.onclick;
      btnSubmit.addEventListener('click', async (ev)=>{
        ev.preventDefault();
        await (window.withBtnBusy ? withBtnBusy(btnSubmit, async ()=>{
          if (typeof window.submitOrder === 'function') return await submitOrder(ev);
          if (typeof oldOnClick === 'function') return await oldOnClick.call(btnSubmit, ev);
          const form = btnSubmit.closest('form');
          if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
        }) : (async ()=>{
          if (typeof window.submitOrder === 'function') return await submitOrder(ev);
          if (typeof oldOnClick === 'function') return await oldOnClick.call(btnSubmit, ev);
          const form = btnSubmit.closest('form');
          if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
        })());
      }, { passive:false });
    }
  }
});


