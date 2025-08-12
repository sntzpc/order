// ==== NUMERIC HELPERS (baru) ====
// Konversi string "12.000", "12,5", "Rp 12.000" -> number 12000 / 12.5
function toNumberStrict(v){
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim();
  // buang simbol non-angka kecuali . , - 
  s = s.replace(/[^\d,.-]/g,'');
  // anggap format Indonesia: titik = thousand, koma = decimal
  // ubah ribuan titik -> kosong, koma -> titik
  s = s.replace(/\./g,'').replace(/,/g,'.');
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function num0(v){ const n = toNumberStrict(v); return n==null || isNaN(n) ? 0 : n; }
// hitung total biaya dgn fallback
function calcTotalBiaya(row){
  const pr = num0(row.price_per_porsi);
  const po = num0(row.porsi);
  const tb = toNumberStrict(row.total_biaya);
  // jika total_biaya valid & >0, pakai itu; jika tidak, fallback ke pr*po
  const fallback = pr * po;
  return (tb!=null && !isNaN(tb) && tb>0) ? tb : (isFinite(fallback) ? fallback : 0);
}


// ==== REPORT & EXPORT (Admin + Mess) ====
// Menggunakan getOrders (role-aware) + Chart.js + SheetJS
// Fitur tambahan: multi-sheet export (per Status & Jenis), Pivot Harian & Bulanan, Print-friendly


let rp = { els:{}, charts:{ status:null, jenis:null }, data:[] };

const STATUS_LIST = ['Pending','Dialokasikan','Diterima','Disiapkan','Siap','Selesai','Rejected'];
const JENIS_LIST  = ['Snack','Nasi Kotak'];

function $(id){ return document.getElementById(id); }

async function reportInit(){
  // Query elemen panel
  rp.els.from      = $('repFrom');
  rp.els.to        = $('repTo');
  rp.els.status    = $('repStatus');
  rp.els.jenis     = $('repJenis');
  rp.els.btnApply  = $('btnRepApply');
  rp.els.btnReset  = $('btnRepReset');
  rp.els.btnExport = $('btnRepExport');
  rp.els.btnPrint  = $('btnRepPrint');
  rp.els.kpiTotal  = $('kpiTotal');
  rp.els.kpiPorsi  = $('kpiPorsi');
  rp.els.kpiBiaya  = $('kpiBiaya');
  rp.els.kpiDone   = $('kpiDone');

  // Kalau panel belum ada, skip (misal role User)
  if (!rp.els.btnApply) return;

  // Range default: bulan berjalan
  const today = new Date(); const y = today.getFullYear(), m = today.getMonth();
  rp.els.from.value = toInputDate(new Date(y, m, 1));
  rp.els.to.value   = toInputDate(new Date(y, m+1, 0));

  // Events
  rp.els.btnApply.addEventListener('click', ()=> withBtnBusy(rp.els.btnApply, loadReport));
  rp.els.btnReset.addEventListener('click', resetFilters);
  if (rp.els.btnExport) rp.els.btnExport.addEventListener('click', ()=> withBtnBusy(rp.els.btnExport, async ()=> exportXlsx()));
  if (rp.els.btnPrint)  rp.els.btnPrint.addEventListener('click',  ()=> withBtnBusy(rp.els.btnPrint,  async ()=> printReport()));

  await loadReport();
}

function toInputDate(d){ const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }

function parseToDateOnly(str){
  if (!str) return '';
  // coba ambil YYYY-MM-DD di depan
  const m = String(str).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(str);
  if (!isNaN(d.getTime())) return toInputDate(d);
  return '';
}
function monthKey(yyyy_mm_dd){
  if (!yyyy_mm_dd) return '';
  const m = yyyy_mm_dd.match(/^(\d{4})-(\d{2})-/);
  if (m) return `${m[1]}-${m[2]}`;
  const d = new Date(yyyy_mm_dd);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  return '';
}

async function loadReport(){
  const sess = getSession();
  const params = {
    token: sess.token,
    date_from: (rp.els.from.value||'').trim(),
    date_to:   (rp.els.to.value||'').trim(),
    status:    (rp.els.status.value||'').trim(),
    jenis:     (rp.els.jenis.value||'').trim()
  };
  try{
    const res = await apiPost('getOrders', params);

    // Simpan apa adanya, tapi koersi tipe angka ke number/null.
    rp.data = (Array.isArray(res.orders) ? res.orders : []).map(r=>{
      const porsi = num0(r.porsi);
      const price = toNumberStrict(r.price_per_porsi);
      const total = toNumberStrict(r.total_biaya);
      return Object.assign({}, r, {
        porsi: porsi,
        price_per_porsi: (price!=null ? price : null),
        total_biaya:     (total!=null ? total : null),
        // siapkan kolom turunan agar konsisten dipakai tabel/export
        _total_calc: calcTotalBiaya({ price_per_porsi: price, porsi, total_biaya: total })
      });
    });

    renderKpis(rp.data);
    renderCharts(rp.data);
    toastSuccess('Laporan diperbarui.');
  }catch(e){ toastError(e.message || e); }
}


function resetFilters(){ rp.els.status.value=''; rp.els.jenis.value=''; }

// === CCTV (opsional) ===
const DEBUG_CCTV = false;
if (DEBUG_CCTV) {
  console.group('[CCTV] Sampel perhitungan total_biaya');
  (rp.data || []).slice(0, 10).forEach((r,i)=>{
    const pr = num0(r.price_per_porsi), po = num0(r.porsi);
    const tbRaw = toNumberStrict(r.total_biaya);
    const tt = calcTotalBiaya(r);
    console.log(`#${i+1}`, { id:r.id, pr, po, tbRaw, total_calc: tt, status:r.status, jenis:r.jenis });
  });
  console.groupEnd();
}

function renderKpis(list){
  let total = 0, porsi = 0, biaya = 0, done = 0;
  (list || []).forEach(r=>{
    total++;
    porsi += num0(r.porsi);
    biaya += calcTotalBiaya(r);
    if (r.status === 'Selesai') done++;
  });
  rp.els.kpiTotal.textContent = total.toLocaleString('id-ID');
  rp.els.kpiPorsi.textContent = porsi.toLocaleString('id-ID');
  rp.els.kpiBiaya.textContent = biaya.toLocaleString('id-ID');
  rp.els.kpiDone.textContent  = done.toLocaleString('id-ID');
}
function renderCharts(list){
  // Destroy chart lama agar tidak dobel
  if (rp.charts.status){ rp.charts.status.destroy(); rp.charts.status = null; }
  if (rp.charts.jenis){ rp.charts.jenis.destroy(); rp.charts.jenis = null; }

  // Data per status
  const statusCount = Object.fromEntries(STATUS_LIST.map(s => [s, 0]));
  list.forEach(r => { if (statusCount[r.status] != null) statusCount[r.status]++; });

  const ctxS = $('chStatus')?.getContext('2d');
  if (ctxS){
    rp.charts.status = new Chart(ctxS, {
      type: 'bar',
      data: { labels: STATUS_LIST, datasets: [{ label: 'Jumlah', data: STATUS_LIST.map(s=>statusCount[s]) }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }

  // Data per jenis
  const jenisCount = Object.fromEntries(JENIS_LIST.map(j => [j, 0]));
  list.forEach(r => { if (jenisCount[r.jenis] != null) jenisCount[r.jenis]++; });

  const ctxJ = $('chJenis')?.getContext('2d');
  if (ctxJ){
    rp.charts.jenis = new Chart(ctxJ, {
      type: 'doughnut',
      data: { labels: JENIS_LIST, datasets: [{ data: JENIS_LIST.map(j=>jenisCount[j]) }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, cutout: '60%' }
    });
  }
}

// ===== Helpers: export/pivot/group =====
function buildOrdersRows(data){
  const cols = ['id','created_at','username','display_name','jenis','waktu_pakai','porsi','kegiatan','allocated_mess','status','price_per_porsi','total_biaya','catatan'];
  const rows = (data || []).map(r => {
    const pr = num0(r.price_per_porsi);
    const po = num0(r.porsi);
    const tt = calcTotalBiaya(r);
    return {
      id: r.id ?? '',
      created_at: r.created_at ?? '',
      username: r.username ?? '',
      display_name: r.display_name ?? '',
      jenis: r.jenis ?? '',
      waktu_pakai: r.waktu_pakai ?? '',
      porsi: po,
      kegiatan: r.kegiatan ?? '',
      allocated_mess: r.allocated_mess ?? '',
      status: r.status ?? '',
      price_per_porsi: pr,
      total_biaya: tt,
      catatan: r.catatan ?? ''
    };
  });
  return { cols, rows };
}
function groupBy(data, keyFn){
  const m = new Map();
  data.forEach(item => {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  });
  return m;
}
function pivotDaily(data){
  const days = new Map(); // key: yyyy-mm-dd
  data.forEach(r=>{
    const d = parseToDateOnly(r.waktu_pakai || r.created_at) || '';
    if (!d) return;
    if (!days.has(d)) days.set(d, newAccumulator());
    accumulate(days.get(d), r);
  });
  const header = pivotHeader();
  const body = [...days.keys()].sort().map(d => pivotRowOut(d, days.get(d)));
  return { header, body };
}
function pivotMonthly(data){
  const months = new Map(); // key: yyyy-mm
  data.forEach(r=>{
    const d = parseToDateOnly(r.waktu_pakai || r.created_at) || '';
    const mk = monthKey(d);
    if (!mk) return;
    if (!months.has(mk)) months.set(mk, newAccumulator());
    accumulate(months.get(mk), r);
  });
  const header = pivotHeader('Bulan');
  const body = [...months.keys()].sort().map(k => pivotRowOut(k, months.get(k)));
  return { header, body };
}
function newAccumulator(){
  return {
    totalOrders: 0, totalPorsi: 0, totalBiaya: 0,
    status: Object.fromEntries(STATUS_LIST.map(s=>[s,0])),
    jenis:  Object.fromEntries(JENIS_LIST.map(j=>[j,0]))
  };
}
function accumulate(acc, r){
  acc.totalOrders++;
  acc.totalPorsi += num0(r.porsi);
  acc.totalBiaya += calcTotalBiaya(r);
  if (acc.status[r.status] != null) acc.status[r.status]++;
  if (acc.jenis[r.jenis]   != null) acc.jenis[r.jenis]++;
}
function pivotHeader(firstColName='Tanggal'){
  return [
    firstColName,'Total Pesanan','Total Porsi','Total Biaya (Rp)',
    ...STATUS_LIST.map(s=>'# '+s),
    ...JENIS_LIST.map(j=>'# '+j)
  ];
}
function pivotRowOut(key, acc){
  return [
    key,
    acc.totalOrders,
    acc.totalPorsi,
    acc.totalBiaya,
    ...STATUS_LIST.map(s=>acc.status[s]),
    ...JENIS_LIST.map(j=>acc.jenis[j])
  ];
}
function autoFitColumns(ws, rows, columns){
  const colsArr = Array.isArray(columns)
    ? columns
    : (rows && rows.length ? Object.keys(rows[0]) : []);
  const lens = colsArr.map(c => Math.max(String(c).length, ...rows.map(r => String(r[c] ?? '').length)));
  ws['!cols'] = lens.map(w => ({ wch: Math.min(Math.max(w + 2, 10), 50) }));
}

function autoFitAOA(ws, aoa){
  const cols = new Array(Math.max(...aoa.map(r=>r.length))).fill(0);
  aoa.forEach(r => r.forEach((v,i) => { cols[i] = Math.max(cols[i], String(v ?? '').length); }));
  ws['!cols'] = cols.map(w => ({ wch: Math.min(Math.max(w + 2, 8), 50) }));
}
function safeSheetName(name){
  return String(name).replace(/[\\/?*\[\]:]/g,'_').slice(0,31) || 'Sheet';
}

function safeReplaceAll(str, find, repl){
  if (str && typeof str.replaceAll === 'function') return str.replaceAll(find, repl);
  return String(str || '').split(find).join(repl);
}

// ===== Export XLSX (multi-sheet) =====
function exportXlsx(){
  try {
    if (!Array.isArray(rp.data) || rp.data.length === 0){
      return toastError('Tidak ada data untuk diexport.');
    }

    const wb = XLSX.utils.book_new();

    // Orders
    const { cols, rows } = buildOrdersRows(rp.data);
    const wsOrders = XLSX.utils.json_to_sheet(rows, { header: cols });
    autoFitColumns(wsOrders, rows, cols);
    XLSX.utils.book_append_sheet(wb, wsOrders, 'Orders');

    // Summary
    const summary = buildSummary(rp.data);
    const wsSummary = XLSX.utils.aoa_to_sheet(summary);
    autoFitAOA(wsSummary, summary);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Per STATUS
    const byStatus = groupBy(rp.data, r => r.status || 'Unknown');
    for (const [st, items] of byStatus.entries()){
      const { cols: c, rows: rr } = buildOrdersRows(items);
      const ws = XLSX.utils.json_to_sheet(rr, { header: c });
      autoFitColumns(ws, rr, c);
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName('Status_'+st));
    }

    // Per JENIS
    const byJenis = groupBy(rp.data, r => r.jenis || 'Unknown');
    for (const [jns, items] of byJenis.entries()){
      const { cols: c, rows: rr } = buildOrdersRows(items);
      const ws = XLSX.utils.json_to_sheet(rr, { header: c });
      autoFitColumns(ws, rr, c);
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName('Jenis_'+jns));
    }

    // PIVOT Harian
    const pvD = pivotDaily(rp.data);
    const aoaD = [pvD.header, ...pvD.body];
    const wsPvD = XLSX.utils.aoa_to_sheet(aoaD);
    autoFitAOA(wsPvD, aoaD);
    XLSX.utils.book_append_sheet(wb, wsPvD, 'Pivot_Daily');

    // PIVOT Bulanan
    const pvM = pivotMonthly(rp.data);
    const aoaM = [pvM.header, ...pvM.body];
    const wsPvM = XLSX.utils.aoa_to_sheet(aoaM);
    autoFitAOA(wsPvM, aoaM);
    XLSX.utils.book_append_sheet(wb, wsPvM, 'Pivot_Monthly');

    // Nama file (fallback if replaceAll not available)
    const from = safeReplaceAll(rp.els.from.value||'', '-', '');
    const to   = safeReplaceAll(rp.els.to.value||'', '-', '');
    const name = `Laporan_MessSRIE_${from||'ALL'}_${to||'ALL'}.xlsx`;

    XLSX.writeFile(wb, name);
  } catch (e) {
    console.error('[exportXlsx] error:', e);
    toastError(e && e.message ? e.message : 'Gagal export.');
  }
}


function buildSummary(list){
  const countByStatus = Object.fromEntries(STATUS_LIST.map(s=>[s,0]));
  const countByJenis  = Object.fromEntries(JENIS_LIST.map(j=>[j,0]));
  let totalPorsi = 0, totalBiaya = 0;

  list.forEach(r=>{
    if (countByStatus[r.status]!=null) countByStatus[r.status]++;
    if (countByJenis[r.jenis]!=null)  countByJenis[r.jenis]++;
    totalPorsi += num0(r.porsi);
    totalBiaya += calcTotalBiaya(r);
  });

  const s = [['Ringkasan','',''],['Total Pesanan', list.length, '']];
  STATUS_LIST.forEach(k => s.push([`Status: ${k}`, countByStatus[k], '']));
  s.push(['','', '']);
  s.push(['Total Porsi', totalPorsi, '']);
  s.push(['Total Biaya (Rp)', totalBiaya, '']);
  s.push(['','', '']);
  JENIS_LIST.forEach(j => s.push([`Jenis: ${j}`, countByJenis[j], '']));

  return s;
}

// ===== Print-friendly =====
function printReport(){
  if (!Array.isArray(rp.data) || rp.data.length === 0){
    return toastError('Tidak ada data untuk dicetak.');
  }

  const now = new Date();
  const fmt = (n)=> String(n).padStart(2,'0');
  const nowStr = `${now.getFullYear()}-${fmt(now.getMonth()+1)}-${fmt(now.getDate())} ${fmt(now.getHours())}:${fmt(now.getMinutes())}`;

  // KPI
  const total = rp.els.kpiTotal.textContent;
  const porsi = rp.els.kpiPorsi.textContent;
  const biaya = rp.els.kpiBiaya.textContent;
  const done  = rp.els.kpiDone.textContent;

  // Tabel ringkas Status & Jenis
  const statusCount = Object.fromEntries(STATUS_LIST.map(s => [s, 0]));
  const jenisCount  = Object.fromEntries(JENIS_LIST.map(j => [j, 0]));
  rp.data.forEach(r=>{
    if (statusCount[r.status]!=null) statusCount[r.status]++;
    if (jenisCount[r.jenis]!=null)   jenisCount[r.jenis]++;
  });

  // Pivot
  const pvD = pivotDaily(rp.data);
  const pvM = pivotMonthly(rp.data);

  // Chart image (opsional, jika chart ada)
  const imgStatus = tryCanvasImage('chStatus');
  const imgJenis  = tryCanvasImage('chJenis');

  // Orders (ringkas, batasi 200 baris biar ramah print)
  const { cols, rows } = buildOrdersRows(rp.data.slice(0, 200));

  const css = `
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, 'Helvetica Neue', Arial; font-size: 12px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      h2 { font-size: 14px; margin: 16px 0 6px; }
      .muted { color: #666; }
      .grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px; }
      .card { border: 1px solid #ddd; padding: 8px 10px; border-radius: 6px; }
      .kpi { font-size: 20px; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 4px 6px; vertical-align: top; }
      th { background: #f6f6f6; }
      .mb16 { margin-bottom: 16px; }
      .mb8  { margin-bottom: 8px; }
      .imgbox { text-align:center; border:1px solid #eee; padding:6px; }
      @page { size: A4; margin: 12mm; }
    </style>
  `;

  const html = `
    <!doctype html><html><head><meta charset="utf-8"><title>Laporan Mess SRIE</title>${css}</head>
    <body>
      <h1>Laporan Mess SRIE</h1>
      <div class="muted mb8">Dicetak: ${nowStr}</div>
      <div class="muted mb16">Periode: ${rp.els.from.value || '-'} s/d ${rp.els.to.value || '-'}</div>

      <div class="grid mb16">
        <div class="card"><div class="muted">Total Pesanan</div><div class="kpi">${total}</div></div>
        <div class="card"><div class="muted">Total Porsi</div><div class="kpi">${porsi}</div></div>
        <div class="card"><div class="muted">Total Biaya (Rp)</div><div class="kpi">${biaya}</div></div>
        <div class="card"><div class="muted">Selesai</div><div class="kpi">${done}</div></div>
      </div>

      <h2>Distribusi Status</h2>
      <table class="mb16">
        <thead><tr>${STATUS_LIST.map(s=>`<th>${esc(s)}</th>`).join('')}</tr></thead>
        <tbody><tr>${STATUS_LIST.map(s=>`<td>${statusCount[s]}</td>`).join('')}</tr></tbody>
      </table>
      ${imgStatus ? `<div class="imgbox mb16"><img src="${imgStatus}" alt="Chart Status" style="max-width:100%;height:auto"></div>`:''}

      <h2>Komposisi Jenis</h2>
      <table class="mb16">
        <thead><tr>${JENIS_LIST.map(j=>`<th>${esc(j)}</th>`).join('')}</tr></thead>
        <tbody><tr>${JENIS_LIST.map(j=>`<td>${jenisCount[j]}</td>`).join('')}</tr></tbody>
      </table>
      ${imgJenis ? `<div class="imgbox mb16"><img src="${imgJenis}" alt="Chart Jenis" style="max-width:100%;height:auto"></div>`:''}

      <h2>Pivot Harian</h2>
      ${renderAOATable([pvD.header, ...pvD.body].slice(0, 100))}

      <h2>Pivot Bulanan</h2>
      ${renderAOATable([pvM.header, ...pvM.body])}

      <h2>Orders (preview)</h2>
      ${renderTable(cols, rows)}
      <div class="muted">* Ditampilkan maksimal 200 baris untuk cetak. Unduh XLSX untuk data lengkap.</div>

      <script>window.onload = () => setTimeout(()=>window.print(), 100);</script>
    </body></html>
  `;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

function tryCanvasImage(canvasId){
  const c = document.getElementById(canvasId);
  if (!c || !c.toDataURL) return '';
  try { return c.toDataURL('image/png'); } catch(_){ return ''; }
}

function renderTable(cols, rows){
  const colsArr = Array.isArray(cols)
    ? cols
    : (rows && rows.length ? Object.keys(rows[0]) : []);
  const thead = '<tr>' + colsArr.map(c=>`<th>${esc(c)}</th>`).join('') + '</tr>';
  const tbody = rows.map(r => '<tr>' + colsArr.map(c=>`<td>${esc(r[c] ?? '')}</td>`).join('') + '</tr>').join('');
  return `<table class="mb16"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function renderAOATable(aoa){
  const [head, ...body] = aoa;
  const thead = '<tr>' + head.map(c=>`<th>${esc(c)}</th>`).join('') + '</tr>';
  const tbody = body.map(r => '<tr>' + r.map(v=>`<td>${esc(v)}</td>`).join('') + '</tr>').join('');
  return `<table class="mb16"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}
function esc(s){ return String(s).replace(/[&<>"']/g, m=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
