// ==== PRICE CACHE (shared tiny helpers) ====
const PRICE_LS_KEY = 'price_cache_v1';

function priceCacheLoad(){
  try { return JSON.parse(localStorage.getItem(PRICE_LS_KEY) || '{}') || {}; }
  catch(_) { return {}; }
}

function priceCacheSave(cacheObj){
  try {
    localStorage.setItem(PRICE_LS_KEY, JSON.stringify(cacheObj || {}));
  } catch(_){}
  // expose ke window agar cepat diakses tanpa JSON.parse
  window.PRICE_CACHE = cacheObj || {};
  // Broadcast untuk semua listener
  const detail = window.PRICE_CACHE;
  window.dispatchEvent(new CustomEvent('pricecache:updated',        { detail }));
  window.dispatchEvent(new CustomEvent('msrie-price-cache-updated', { detail }));
}

// Normalisasi boolean untuk nilai is_default
function isTrue(v){
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  return ['true','1','yes','ya','y','aktif','active','true'].includes(s);
}

// Build cache dari rows Menu (pilih yang is_default)
function priceCacheRebuildFromMenuRows(rows){
  const cache = {};
  (rows || []).forEach(r=>{
    if (isTrue(r.is_default)) {
      const jenis = String(r.jenis || '').trim();
      if (jenis) cache[jenis] = Number(r.harga_per_porsi) || 0;
    }
  });
  priceCacheSave(cache);
}





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

  // 1) Live PRICE_CACHE (dari master.js)
  const cache = window.PRICE_CACHE || priceCacheLoad();
  if (cache && cache[jenis] != null) return Number(cache[jenis]) || 0;

  // 2) MASTER.menu (default item yang is_default)
  if (window.MASTER && Array.isArray(MASTER.menu)){
    const def = MASTER.menu.find(m => String(m.jenis)===String(jenis) && isTrue(m.is_default));
    if (def) return Number(def.harga || def.harga_per_porsi) || 0;
  }

  // 3) MASTER.defaultPrice (fallback)
  if (window.MASTER && MASTER.defaultPrice && MASTER.defaultPrice[jenis] != null){
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

  const cache = window.PRICE_CACHE || priceCacheLoad();
  const price =
    Number(
      (cache && cache[jenis] != null ? cache[jenis]
        : (window.MASTER && MASTER.defaultPrice && MASTER.defaultPrice[jenis] != null
            ? MASTER.defaultPrice[jenis] : 0))
    ) || 0;

  const total = price * porsi;
  lbl.textContent = 'Rp' + (typeof rupiah === 'function'
    ? rupiah(total)
    : total.toLocaleString('id-ID'));
}



// ---- Realtime estimation bindings (order.js) ----
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('inpJenis')?.addEventListener('change', updateEstimasi);
  document.getElementById('inpPorsi')?.addEventListener('input',  updateEstimasi);

  // Saat harga di Setting berubah & cache diperbarui
  window.addEventListener('pricecache:updated', updateEstimasi);
  window.addEventListener('msrie-price-cache-updated', updateEstimasi);

  // Hitung sekali saat halaman siap
  updateEstimasi();
});




async function initAfterLogin(){
  try{
    const sess = getSession();
    const md = await apiPost('getMasterData', { token: sess.token });
    window.MASTER = md || {}; // ← 1) MASTER siap

    // 2) Isi dropdown kegiatan & mess
    inpKegiatan.innerHTML = '';
    (md.activities||[]).forEach(a=>{
      const opt = document.createElement('option');
      opt.value = a.nama; opt.textContent = a.nama;
      inpKegiatan.appendChild(opt);
    });

    inpMess.innerHTML = '<option value="">Tentukan oleh Admin</option>';
    (md.messList||[]).forEach(m=>{
      const opt = document.createElement('option');
      opt.value = m.nama; opt.textContent = m.nama;
      inpMess.appendChild(opt);
    });

    // 3) Seed / load cache harga → WAJIB sebelum updateEstimasi()
    const cur = priceCacheLoad();
if (!cur || Object.keys(cur).length === 0){
  const rows = Array.isArray(md.menu) ? md.menu.map(m => ({
    jenis: m.jenis,
    harga_per_porsi: (m.harga ?? m.harga_per_porsi),
    is_default: m.is_default
  })) : [];
  priceCacheRebuildFromMenuRows(rows);
} else {
  window.PRICE_CACHE = cur; // expose supaya cepat
}

    // 4) Hitung label estimasi pertama kali
    updateEstimasi();

    // 5) Baru load daftar order
    await refreshOrders();
  } catch(err){
    toastError(err.message || err);
  }
}


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
  const btnPick   = document.getElementById('btnPickWaktu');
  const inpWaktu  = document.getElementById('inpWaktu');
  const modalEl   = document.getElementById('modalWaktu');
  const formWaktu = document.getElementById('formWaktu');
  const mwTanggal = document.getElementById('mwTanggal');
  const mwWaktu   = document.getElementById('mwWaktu');

  // Kalau salah satu tidak ada, lewati (tidak error)
  if (!btnPick || !inpWaktu || !modalEl || !formWaktu || !mwTanggal || !mwWaktu) return;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

  function toInputDate(d){ const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  function toInputTime(d){ const z=n=>String(n).padStart(2,'0'); return `${z(d.getHours())}:${z(d.getMinutes())}`; }

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
});

// 3) Tombol Submit: tampilkan loading + tetap hormati handler lama
document.addEventListener('DOMContentLoaded', ()=>{
  const btnSubmit = document.getElementById('btnSubmit');
  if (!btnSubmit) return;

  // Simpan handler klik default (jika ada yang sudah di-assign via onclick)
  const oldOnClick = btnSubmit.onclick;

  // Realtime: saat user ngetik/ganti nilai
['input','change'].forEach(ev => {
  inpJenis.addEventListener(ev, updateEstimasi);
  inpPorsi.addEventListener(ev, updateEstimasi);
});

// Jika cache harga berubah (akibat Setting → Menu disimpan), refresh label
window.addEventListener('msrie-price-cache-updated', () => {
  // optional: sinkronkan MASTER.defaultPrice agar bagian lain yg pakai MASTER tetap konsisten
  if (window.MASTER) MASTER.defaultPrice = PriceCache.getAll();
  updateEstimasi();
});

  // Hapus listener klik ganda lain yang mungkin sudah dipasang — tidak kita sentuh.
  // Kita hanya menambahkan 1 listener di bawah yang akan menjalankan alur lama:
  btnSubmit.addEventListener('click', async (ev)=>{
    // Jika ada handler lama yang *butuh* event default, kita panggil preventDefault di dalam wrapper
    ev.preventDefault();

    await withBtnBusy(btnSubmit, async ()=>{
      // 1) Jika proyek punya fungsi submitOrder() eksplisit, pakai itu
      if (typeof window.submitOrder === 'function') {
        return await window.submitOrder(ev);
      }
      // 2) Jika ada handler onclick lama, jalankan
      if (typeof oldOnClick === 'function') {
        return await oldOnClick.call(btnSubmit, ev);
      }
      // 3) Fallback: kalau sebelumnya mengandalkan submit form, coba submit form terdekat
      const form = btnSubmit.closest('form');
      if (form) {
        form.requestSubmit ? form.requestSubmit() : form.submit();
      }
      // tidak ada apa-apa? ya sudah: selesai tanpa error
    });
  }, { passive: false });
});


// --- REBINDER: estimasi realtime (anti dobel + anti timing) ---
(function(){
  if (window.__msrieOrderBound) return;
  window.__msrieOrderBound = true;

  // Sinkronkan nama event: dengarkan KEDUANYA
  const onPriceCacheUpdated = ()=> { try { updateEstimasi(); } catch(e){} };
  window.addEventListener('msrie-price-cache-updated', onPriceCacheUpdated);
  window.addEventListener('pricecache:updated',        onPriceCacheUpdated);

  function bindInputs(){
    const jenis = document.getElementById('inpJenis');
    const porsi = document.getElementById('inpPorsi');
    if (jenis && !jenis.__boundEstimasi){
      jenis.addEventListener('change', updateEstimasi);
      jenis.addEventListener('input',  updateEstimasi);
      jenis.__boundEstimasi = true;
    }
    if (porsi && !porsi.__boundEstimasi){
      porsi.addEventListener('input',  updateEstimasi);
      porsi.addEventListener('change', updateEstimasi);
      porsi.__boundEstimasi = true;
    }
    // hitung sekali
    try { updateEstimasi(); } catch(e){}
  }

  // Bind saat DOM siap
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bindInputs);
  } else { bindInputs(); }

  // Bind ulang saat tab Order diaktifkan (kalau kamu pakai lazy tab)
  document.querySelectorAll('#menuTabs a[data-bs-toggle="tab"]').forEach(a=>{
    a.addEventListener('shown.bs.tab', (ev)=>{
      if (ev.target.getAttribute('href') === '#tabOrder') bindInputs();
    });
  });
})();
