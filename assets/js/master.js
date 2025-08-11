// ==== MASTER DATA (Admin) — namespace-safe (md*) ====
// Prasyarat: apiPost(), getSession(), Swal, toastSuccess/toastError.

if (typeof window.withBtnBusy !== 'function') {
  window.withBtnBusy = async function(btn, fn){
    if (!btn) return fn();
    const h = btn.innerHTML, d = btn.disabled;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Memproses…';
    try { return await fn(); } finally { btn.disabled = d; btn.innerHTML = h; }
  };
}

const mdEntity     = document.getElementById('mdEntity');
const btnMdRefresh = document.getElementById('btnMdRefresh');
const btnMdAdd     = document.getElementById('btnMdAdd');
const mdHead       = document.getElementById('mdHead');   // <tr id="mdHead">
const mdBody       = document.getElementById('mdBody');   // <tbody id="mdBody">

const MD_SPEC = {
  Users: {
    key: 'username',
    fields: ['username','display_name','role','mess_name','telegram_chat_id','active','password_plain'],
    bools: ['active'],
    select: { role: ['Admin','User','Mess'] },
    hints: { password_plain: '(opsional, isi untuk ganti)' }
  },
  Menu:       { key:'id', fields:['id','jenis','nama','harga_per_porsi','is_default','active'], bools:['is_default','active'] },
  Mess:       { key:'id', fields:['id','nama_mess','telegram_chat_id','active'],                 bools:['active'] },
  Activities: { key:'id', fields:['id','nama_kegiatan','active'],                                bools:['active'] },
  Config:     { key:'key',fields:['key','value'],                                               bools:[] }
};

window.masterInit = async function masterInit(){
  if (!mdEntity || !btnMdRefresh || !mdHead || !mdBody) {
    console.warn('[masterInit] Panel Setting tidak lengkap/hidden untuk role ini.');
    return;
  }

  btnMdRefresh.addEventListener('click', ()=> withBtnBusy(btnMdRefresh, ()=> mdLoadEntity(mdEntity.value)));
  if (btnMdAdd) btnMdAdd.addEventListener('click', mdAddBlankRow);
  mdEntity.addEventListener('change', ()=> mdLoadEntity(mdEntity.value));

  // Delegasi click tombol Save/Hapus (agar baris baru juga ter-handle)
  mdBody.addEventListener('click', async (e)=>{
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const tr = btn.closest('tr'); if (!tr) return;
    const entity = tr.dataset.entity;
    const spec = MD_SPEC[entity];

    if (btn.dataset.act === 'save'){
      await withBtnBusy(btn, async ()=>{
        const rec = mdReadRowRecord(tr);
        if ('password_plain' in rec && !rec.password_plain) delete rec.password_plain;
        const keyField = spec.key;
        if (!rec[keyField] && !['Menu','Mess','Activities'].includes(entity)){
          return toastError(`Field key "${keyField}" wajib diisi.`);
        }
        const sess = getSession();
        await apiPost('mdUpsert', { token: sess.token, entity, record: rec });
        toastSuccess('Tersimpan.');
        await mdLoadEntity(mdEntity.value);
      });
    }

    if (btn.dataset.act === 'del'){
      const keyField = spec.key; const keyVal = mdValueOf(tr, keyField);
      if (!keyVal) return toastError(`Tidak bisa hapus: "${keyField}" kosong.`);
      if (!(await mdConfirm(`Hapus data "${keyVal}"?`))) return;
      await withBtnBusy(btn, async ()=>{
        const sess = getSession();
        await apiPost('mdDelete', { token: sess.token, entity, key: keyField, value: keyVal });
        toastSuccess('Dihapus.');
        await mdLoadEntity(mdEntity.value);
      });
    }
  });

  await mdLoadEntity(mdEntity.value || 'Users');
};

async function mdLoadEntity(entity){
  try{
    // state awal
    if (typeof mdSetHeader === 'function') mdSetHeader([]);
    if (typeof mdBody !== 'undefined') {
      mdBody.innerHTML = '<tr><td colspan="99" class="text-muted">Memuat…</td></tr>';
    }

    const sess = getSession();
    const data = await apiPost('mdList', { token: sess.token, entity });
    const rows = Array.isArray(data?.rows) ? data.rows : [];

    // Tentukan kolom header yang dipakai
    const cols = (Array.isArray(data?.headers) && data.headers.length)
      ? data.headers
      : (typeof SPEC !== 'undefined' && SPEC[entity]?.fields
          ? SPEC[entity].fields
          : Object.keys(rows[0] || {}));

    // Set header (fallback kalau mdSetHeader tidak ada)
    if (typeof mdSetHeader === 'function') {
      mdSetHeader(cols);
    } else if (typeof mdHead !== 'undefined') {
      mdHead.innerHTML = cols.map(c=>`<th>${mdEsc ? mdEsc(c) : String(c)}</th>`).join('') + '<th style="width:1%;">Aksi</th>';
    }

    // Render body (boleh abaikan arg ke-3 kalau fungsi lama hanya 2 argumen)
    if (typeof mdRenderTable === 'function') {
      mdRenderTable(entity, rows, cols);
    } else if (typeof mdBody !== 'undefined') {
      // fallback sangat sederhana
      mdBody.innerHTML = rows.map(r => `
        <tr>
          ${cols.map(c=>`<td>${mdEsc ? mdEsc(r[c] ?? '') : String(r[c] ?? '')}</td>`).join('')}
          <td class="text-nowrap">
            <button class="btn btn-sm btn-primary me-1" data-act="save">Simpan</button>
            <button class="btn btn-sm btn-outline-danger" data-act="del">Hapus</button>
          </td>
        </tr>
      `).join('');
    }

    // >>> Tambahan penting: update cache harga jika yang dimuat adalah Menu
    if (entity === 'Menu' && window.PriceCache) {
  try { PriceCache.setFromMenuRows(rows); }
  catch(e){ console.warn('[master] price cache refresh fail:', e); }
}


  } catch(err){
    console.error('[master] mdLoadEntity error:', err);
    if (typeof mdBody !== 'undefined') {
      mdBody.innerHTML = `<tr><td class="text-danger">${mdEsc ? mdEsc(err?.message || String(err)) : (err?.message || String(err))}</td></tr>`;
    }
  }
}


function mdRenderTable(entity, rows){
  const spec = MD_SPEC[entity];
  if (!spec) return;
  const cols = spec.fields.slice();

  // Header
  mdSetHeader(cols);

  // Body
  const html = rows.map(r=>{
    const o = {};
    cols.forEach(c => o[c] = (c==='password_plain') ? '' : (r[c] ?? ''));
    return mdRowHtml(entity, cols, o);
  }).join('');
  mdBody.innerHTML = html || '<tr><td colspan="99" class="text-muted">Belum ada data.</td></tr>';
}

function mdSetHeader(cols){
  if (!mdHead) return;
  mdHead.innerHTML = (cols||[]).map(c=>`<th>${mdEsc(c)}</th>`).join('') + ((cols && cols.length) ? '<th style="width:1%;">Aksi</th>' : '');
}

function mdRowHtml(entity, cols, rowObj){
  return `
    <tr data-entity="${entity}">
      ${cols.map(c => `<td>${mdCellEditor(entity, c, rowObj[c] ?? '')}</td>`).join('')}
      <td class="text-nowrap">
        <button class="btn btn-sm btn-primary me-1" data-act="save">Simpan</button>
        <button class="btn btn-sm btn-outline-danger" data-act="del">Hapus</button>
      </td>
    </tr>`;
}

function mdCellEditor(entity, field, value){
  const s = MD_SPEC[entity];
  if (s.select && s.select[field]){
    const opts = s.select[field].map(v=>`<option${v==value?' selected':''}>${v}</option>`).join('');
    return `<select class="form-select form-select-sm" data-f="${field}">${opts}</select>`;
  }
  if (s.bools.includes(field)){
    const checked = ['true','1','yes','ya','active','aktif','TRUE'].includes(String(value).toLowerCase()) ? 'checked' : '';
    return `<input type="checkbox" class="form-check-input" data-f="${field}" ${checked}>`;
  }
  const ph = (s.hints && s.hints[field]) ? ` placeholder="${s.hints[field]}"` : '';
  return `<input type="text" class="form-control form-control-sm" data-f="${field}" value="${mdEsc(String(value))}"${ph}>`;
}

function mdAddBlankRow(){
  const entity = mdEntity.value;
  const spec = MD_SPEC[entity];
  if (!spec) return;
  const blank = {}; spec.fields.forEach(f => blank[f] = '');
  if (['Menu','Mess','Activities'].includes(entity)) blank[spec.key] = '';
  mdBody.insertAdjacentHTML('afterbegin', mdRowHtml(entity, spec.fields, blank));
}

function mdReadRowRecord(tr){
  const rec = {};
  tr.querySelectorAll('[data-f]').forEach(inp=>{
    const f = inp.getAttribute('data-f');
    rec[f] = (inp.type === 'checkbox') ? inp.checked : inp.value;
  });
  return rec;
}
function mdValueOf(tr, field){
  const el = tr.querySelector(`[data-f="${CSS.escape(field)}"]`);
  if (!el) return '';
  return el.type === 'checkbox' ? el.checked : el.value;
}
function mdConfirm(text){
  return Swal.fire({ icon:'question', title:'Konfirmasi', text, showCancelButton:true, confirmButtonText:'Ya' })
    .then(r=> !!r.isConfirmed);
}
function mdEsc(s){ return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
