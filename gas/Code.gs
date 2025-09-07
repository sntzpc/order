/** 
 * Mess SRIE Web App Backend (GAS) — STEP 3 (FINAL)
 * - JSONP (callback) + POST JSON
 * - Lock harga/total pada saat create order
 * - PriceHistory untuk riwayat harga (via onEdit & mdUpsert_)
 */

const TZ = 'Asia/Jakarta';

/** ============ Sheet names ============ */
const SH_USERS          = 'Users';
const SH_ORDERS         = 'Orders';
const SH_MENU           = 'Menu';
const SH_ACT            = 'Activities';
const SH_MESS           = 'Mess';
const SH_CONFIG         = 'Config';
const SH_AUDIT          = 'AuditLog';
const SH_TOKENS         = 'Tokens';
const SH_PRICE_HISTORY  = 'PriceHistory';

/** ============ Headers ============ */
const HDR_USERS  = ['username','password_hash','display_name','role','mess_name','telegram_chat_id','active'];
const HDR_ORDERS = [
  'id','created_at','username','display_name','jenis','waktu_pakai','porsi','kegiatan','mess_tujuan','catatan',
  'status','allocated_mess','approved_by','approved_at','received_at','ready_at','price_per_porsi','total_biaya'
];
const HDR_MENU   = ['id','jenis','nama','harga_per_porsi','is_default','active'];
const HDR_ACT    = ['id','nama_kegiatan','active'];
const HDR_MESS   = ['id','nama_mess','telegram_chat_id','active'];
const HDR_CONFIG = ['key','value'];
const HDR_AUDIT  = ['ts','username','action','entity','entity_id','before','after','note','ip','ua'];
const HDR_TOKENS = ['token','username','role','issued_at','expires_at'];
const HDR_PRICEH = ['timestamp','jenis','harga','effective_from'];

/** ============ SCHEMA map ============ */
const SCHEMA = Object.freeze({
  [SH_USERS]:          HDR_USERS,
  [SH_ORDERS]:         HDR_ORDERS,
  [SH_MENU]:           HDR_MENU,
  [SH_ACT]:            HDR_ACT,
  [SH_MESS]:           HDR_MESS,
  [SH_CONFIG]:         HDR_CONFIG,
  [SH_AUDIT]:          HDR_AUDIT,
  [SH_TOKENS]:         HDR_TOKENS,
  [SH_PRICE_HISTORY]:  HDR_PRICEH,
});

/** ============ Status constants ============ */
const STAT = {
  PENDING:  'Pending',
  ALOK:     'Dialokasikan',
  TERIMA:   'Diterima',
  SIAPKAN:  'Disiapkan',
  SIAP:     'Siap',
  SELESAI:  'Selesai',
  REJECT:   'Rejected'
};

/** ============ Low-level helpers ============ */
function ss(){
  const props = PropertiesService.getScriptProperties();
  const sid = props.getProperty('DB_SHEET_ID');
  return sid ? SpreadsheetApp.openById(sid) : SpreadsheetApp.getActiveSpreadsheet();
}
function writeHeadersIfNeeded_(sh, headers){
  if (!Array.isArray(headers) || headers.length===0) throw new Error('headers kosong');
  const maxCols = sh.getMaxColumns();
  if (maxCols < headers.length){
    sh.insertColumnsAfter(maxCols, headers.length - maxCols);
  }
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  sh.setFrozenRows(1);
}
function ensureSheet(name, headersOpt){
  const headers = (Array.isArray(headersOpt) && headersOpt.length>0) ? headersOpt : SCHEMA[name];
  if (!Array.isArray(headers) || headers.length===0) {
    throw new Error('ensureSheet("'+name+'"): headers tidak diberikan dan tidak ada di SCHEMA.');
  }
  const book = ss();
  let sh = book.getSheetByName(name);
  if (!sh) sh = book.insertSheet(name);
  writeHeadersIfNeeded_(sh, headers);
  return sh;
}
function getSheet(name){
  const s = ss().getSheetByName(name);
  if (!s) throw new Error('Missing sheet: ' + name);
  return s;
}
function schemaExists_(){ return !!ss().getSheetByName(SH_USERS); }
function val(v){ return v==null ? '' : v; }
function nowStr(){ return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function toHashSHA256(str){
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str);
  return raw.map(b => ('0'+(b & 0xFF).toString(16)).slice(-2)).join('');
}
function rowsToObjects(sh){
  const rng = sh.getDataRange().getValues();
  if (rng.length < 2) return [];
  const heads = rng[0];
  return rng.slice(1).filter(r => r.join('')!=='').map(r=>{
    const o = {};
    heads.forEach((h,i)=> o[h] = val(r[i]));
    return o;
  });
}
function appendObject(sh, obj){
  if (sh.getLastRow() === 0) writeHeadersIfNeeded_(sh, SCHEMA[sh.getName()]);
  const heads = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const row = heads.map(h => val(obj[h]));
  sh.appendRow(row);
}
function normStr_(v){ return (v==null ? '' : String(v)).trim().toLowerCase(); }
function isActive_(v){
  if (typeof v === 'boolean') return v;
  const s = normStr_(v);
  return ['true','1','yes','ya','y','aktif','active','on'].includes(s);
}
function toJsDate_(v){
  if (v instanceof Date) return v;
  if (typeof v === 'number'){
    if (v > 1e12) return new Date(v);            // epoch ms
    const ms = (v - 25569) * 86400 * 1000;       // Google serial
    return new Date(ms);
  }
  if (typeof v === 'string'){
    const s = v.trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +(m[6]||0));
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(0);
}
function boolStr_(b){ return isActive_(b) ? 'TRUE' : 'FALSE'; }
function toNum_(v){
  if (v==null || v==='') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = String(v).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(/,/g,'.');
  const n = Number(s);
  return isFinite(n) ? n : 0;
}
function sameJenis_(a,b){ return normStr_(a) === normStr_(b); }
function startOfDay_(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function getHeaderMap_(sheet){
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const map = {}; headers.forEach((h,i)=> map[String(h).trim()] = i+1);
  return map;
}
function getConfigValue(key, def=''){
  const rows = rowsToObjects(getSheet(SH_CONFIG));
  const f = rows.find(r=>r.key===key);
  return f ? f.value : def;
}

/** ============ Response helpers ============ */
function ok(data){
  return ContentService.createTextOutput(JSON.stringify({ ok:true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}
function fail(msg){
  return ContentService.createTextOutput(JSON.stringify({ ok:false, error:String(msg) }))
    .setMimeType(ContentService.MimeType.JSON);
}
function okWrap_(textOutput){
  try { return JSON.parse(textOutput.getContent()); }
  catch(e){ return { ok:false, error:'Response bukan JSON' }; }
}
function jsonpOk_(cb, dataObj){
  const js = cb + '(' + JSON.stringify({ ok:true, data:dataObj }) + ');';
  return ContentService.createTextOutput(js).setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function jsonpFail_(cb, msg){
  const js = cb + '(' + JSON.stringify({ ok:false, error:String(msg) }) + ');';
  return ContentService.createTextOutput(js).setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function unwrap(obj){ if (obj && obj.ok) return obj.data; throw new Error(obj && obj.error ? obj.error : 'Unknown error'); }

/** ============ OPTIONS (preflight) ============ */
function doOptions(e){ return ContentService.createTextOutput(''); }

/** ============ Router ============ */
function doGet(e){
  const action   = (e && e.parameter && e.parameter.action) || '';
  const callback = (e && e.parameter && (e.parameter.callback || e.parameter.cb || e.parameter.jsonp)) || '';
  try{
    if (action !== 'ensureSchema' && !schemaExists_()){ ensureSchema_(); }

    if (callback){
      let payload = {};
      if (e.parameter && e.parameter.data){ try{ payload = JSON.parse(e.parameter.data); }catch(_){} }
      let result;
      switch(action){
        case 'ensureSchema': ensureSchema_(); result = { message:'Schema ensured' }; break;
        case 'login':        result = unwrap(okWrap_(login_(payload))); break;
        case 'logout':       result = unwrap(okWrap_(logout_(payload))); break;
        case 'getMasterData':result = unwrap(okWrap_(getMasterData_(payload))); break;
        case 'createOrder':  result = unwrap(okWrap_(createOrder_(payload))); break;
        case 'getOrders':    result = unwrap(okWrap_(getOrders_(payload))); break;
        // Admin/Mess (step 2)
        case 'adminAllocate':result = unwrap(okWrap_(adminAllocate_(payload))); break;
        case 'adminReject':  result = unwrap(okWrap_(adminReject_(payload))); break;
        case 'messUpdate':   result = unwrap(okWrap_(messUpdate_(payload))); break;
        // CRUD Master (step 3)
        case 'mdList':       result = unwrap(okWrap_(mdList_(payload))); break;
        case 'mdUpsert':     result = unwrap(okWrap_(mdUpsert_(payload))); break;
        case 'mdDelete':     result = unwrap(okWrap_(mdDelete_(payload))); break;
        case 'ping':         result = { pong:true, ts:nowStr() }; break;
        default:             return jsonpFail_(callback, 'Unknown action: '+action);
      }
      return jsonpOk_(callback, result);
    }

    if (action === 'ensureSchema'){ ensureSchema_(); return ok({message:'Schema ensured'}); }
    if (action === 'ping') return ok({ pong:true, ts:nowStr() });
    return ok({ hello:'Mess SRIE API' });

  }catch(err){
    if (callback) return jsonpFail_(callback, err && err.message ? err.message : err);
    return fail(err && err.message ? err.message : err);
  }
}

function doPost(e){
  try{
    if (!schemaExists_()){ ensureSchema_(); }
    let payload = {};
    const action = (e.parameter && e.parameter.action) || '';
    if (e.parameter && e.parameter.data){ payload = JSON.parse(e.parameter.data); }
    else if (e.postData && e.postData.contents){ try{ payload = JSON.parse(e.postData.contents); }catch(_){} }

    switch(action){
      case 'ensureSchema': return (ensureSchema_(), ok({message:'Schema ensured'}));
      case 'login':        return login_(payload);
      case 'logout':       return logout_(payload);
      case 'getMasterData':return getMasterData_(payload);
      case 'createOrder':  return createOrder_(payload);
      case 'getOrders':    return getOrders_(payload);
      // Admin/Mess
      case 'adminAllocate':return adminAllocate_(payload);
      case 'adminReject':  return adminReject_(payload);
      case 'messUpdate':   return messUpdate_(payload);
      // CRUD Master
      case 'mdList':       return mdList_(payload);
      case 'mdUpsert':     return mdUpsert_(payload);
      case 'mdDelete':     return mdDelete_(payload);
      default:             return fail('Unknown action: '+action);
    }
  }catch(err){ return fail(err.message); }
}

/** ============ Install/Setup ============ */
function ensureSchema_(){
  const u = ensureSheet(SH_USERS,   HDR_USERS);
  ensureSheet(SH_ORDERS,  HDR_ORDERS);
  ensureSheet(SH_MENU,    HDR_MENU);
  ensureSheet(SH_ACT,     HDR_ACT);
  ensureSheet(SH_MESS,    HDR_MESS);
  ensureSheet(SH_CONFIG,  HDR_CONFIG);
  ensureSheet(SH_AUDIT,   HDR_AUDIT);
  ensureSheet(SH_TOKENS,  HDR_TOKENS);
  ensureSheet(SH_PRICE_HISTORY, HDR_PRICEH);

  // Format plain text utk token dates
  const tokSh = getSheet(SH_TOKENS);
  const idxIssued  = HDR_TOKENS.indexOf('issued_at') + 1;
  const idxExpires = HDR_TOKENS.indexOf('expires_at') + 1;
  if (idxIssued>0)  tokSh.getRange(2, idxIssued, tokSh.getMaxRows()-1, 1).setNumberFormat('@');
  if (idxExpires>0) tokSh.getRange(2, idxExpires, tokSh.getMaxRows()-1, 1).setNumberFormat('@');

  // Seed admin
  if (u.getLastRow() < 2){
    const adminHash = toHashSHA256('admin');
    appendObject(u, {
      username:'admin', password_hash:adminHash, display_name:'Administrator',
      role:'Admin', mess_name:'', telegram_chat_id:'', active:'TRUE'
    });
  }
  // Seed menu default
  const menu = rowsToObjects(getSheet(SH_MENU));
  const needSnack = !menu.find(m=> m.jenis==='Snack' && String(m.is_default).toUpperCase()==='TRUE');
  const needNasi  = !menu.find(m=> m.jenis==='Nasi Kotak' && String(m.is_default).toUpperCase()==='TRUE');
  if (needSnack) appendObject(getSheet(SH_MENU), {
    id:Utilities.getUuid(), jenis:'Snack', nama:'Default Snack', harga_per_porsi:'7000', is_default:'TRUE', active:'TRUE'
  });
  if (needNasi) appendObject(getSheet(SH_MENU), {
    id:Utilities.getUuid(), jenis:'Nasi Kotak', nama:'Default Nasi Kotak', harga_per_porsi:'25000', is_default:'TRUE', active:'TRUE'
  });

  // Seed activities
  const actSh = getSheet(SH_ACT);
  if (rowsToObjects(actSh).length===0){
    ['Meeting','Field Day','Rapat Bulanan'].forEach(nm => appendObject(actSh, {
      id:Utilities.getUuid(), nama_kegiatan:nm, active:'TRUE'
    }));
  }

  // Config placeholders
  const cfgSh = getSheet(SH_CONFIG);
  function upsertCfg(k,v){
    const rows = rowsToObjects(cfgSh);
    const exists = rows.some(r=>r.key===k);
    if (!exists){ cfgSh.appendRow([k,v]); }
  }
  upsertCfg('TELEGRAM_BOT_TOKEN','');
  upsertCfg('ADMIN_CHAT_ID','');
}

/** ============ Auth ============ */
function login_(p){
  const usernameIn = normStr_(p.username||'');
  const password   = (p.password||'');
  if (!usernameIn || !password) return fail('Username/password wajib.');

  const users = rowsToObjects(getSheet(SH_USERS));
  const u = users.find(r => normStr_(r.username) === usernameIn && isActive_(r.active));
  if (!u) return fail('User tidak ditemukan atau tidak aktif.');

  const hash = toHashSHA256(password);
  if (String(u.password_hash||'').trim().toLowerCase() !== hash.toLowerCase()){
    return fail('Password salah.');
  }

  const token = Utilities.getUuid();
  const issued_at  = nowStr();
  const expires_at = Utilities.formatDate(new Date(Date.now()+12*60*60*1000), TZ, 'yyyy-MM-dd HH:mm:ss');
  appendObject(getSheet(SH_TOKENS), { token, username:u.username, role:u.role, issued_at, expires_at });

  logAudit_(u.username, 'login', 'User', u.username, '', '', 'Login success');
  return ok({ token, role:u.role, displayName:u.display_name, messName:u.mess_name||'', username:u.username });
}
function logout_(p){
  const token = p.token||'';
  if (!token) return ok({});
  const sh = getSheet(SH_TOKENS);
  const data = sh.getDataRange().getValues();
  if (data.length<2) return ok({});
  const heads = data[0]; const rows = data.slice(1);
  const idxTok = heads.indexOf('token');
  for (let i=0;i<rows.length;i++){
    if (rows[i][idxTok]===token){ sh.deleteRow(i+2); break; }
  }
  return ok({});
}
function requireAuth_(p){
  const token = p.token||'';
  if (!token) throw new Error('Unauthorized');

  const t = rowsToObjects(getSheet(SH_TOKENS)).find(r => String(r.token||'').trim() === token);
  if (!t) throw new Error('Token invalid.');

  const exp = toJsDate_(t.expires_at);
  if (!(exp instanceof Date) || isNaN(exp.getTime())) throw new Error('Token date invalid.');
  if (new Date() > exp) throw new Error('Token expired.');

  const u = rowsToObjects(getSheet(SH_USERS)).find(r=> String(r.username||'').trim() === String(t.username||'').trim() && isActive_(r.active));
  if (!u) throw new Error('User inactive.');

  return { username:u.username, role:u.role, displayName:u.display_name, messName:u.mess_name||'', telegram_chat_id:u.telegram_chat_id||'' };
}

/** ============ Price resolvers ============ */
function resolvePriceFromHistory_(jenis, waktu){
  const ph = ss().getSheetByName(SH_PRICE_HISTORY);
  if (!ph) return null;
  const data = ph.getDataRange().getValues();
  if (data.length < 2) return null;

  const head = data[0];
  const iJenis = head.indexOf('jenis');
  const iHarga = head.indexOf('harga');
  const iEff   = head.indexOf('effective_from');
  if (iJenis<0 || iHarga<0 || iEff<0) return null;

  const t = startOfDay_(waktu).getTime();
  let pick = null;
  for (let r=1; r<data.length; r++){
    const row = data[r];
    if (!sameJenis_(row[iJenis], jenis)) continue;
    const eff = new Date(row[iEff]).getTime();
    if (!isFinite(eff) || eff > t) continue;
    const h = toNum_(row[iHarga]);
    if (!pick || eff > pick.eff) pick = { harga:h, eff };
  }
  return pick ? pick.harga : null;
}
function resolveDefaultMenuPrice_(jenis){
  const rows = rowsToObjects(getSheet(SH_MENU)).filter(r => isActive_(r.active));
  const row  = rows.find(r => sameJenis_(r.jenis, jenis) && isActive_(r.is_default));
  return row ? toNum_(row.harga_per_porsi) : 0;
}

/** ============ Orders ============ */
function findOrderRow_(id){
  const sh = getSheet(SH_ORDERS);
  const data = sh.getDataRange().getValues();
  if (data.length<2) return null;
  const heads = data[0];
  const idxId = heads.indexOf('id');
  for (let i=1;i<data.length;i++){
    if (String(data[i][idxId]) === String(id)){
      return { sh, rowIndex:i+1, heads, row:data[i] };
    }
  }
  return null;
}
function rowToObject_(heads, row){
  const obj = {}; heads.forEach((h,i)=> obj[h]=val(row[i])); return obj;
}
function patchOrderById_(id, patch, actor, note){
  const found = findOrderRow_(id);
  if (!found) throw new Error('Order not found');
  const {sh, rowIndex, heads} = found;

  const beforeObj = rowToObject_(heads, sh.getRange(rowIndex,1,1,heads.length).getValues()[0]);
  const row = sh.getRange(rowIndex,1,1,heads.length).getValues()[0];
  heads.forEach((h,i)=>{ if (h in patch) row[i] = patch[h]; });
  sh.getRange(rowIndex,1,1,heads.length).setValues([row]);

  const afterObj = rowToObject_(heads, row);
  logAudit_(actor, 'update', 'Order', id, JSON.stringify(beforeObj), JSON.stringify(afterObj), note||'');
  return afterObj;
}

/** Create Order — LOCK harga pada saat dibuat */
function createOrder_(p){
  const me = requireAuth_(p);

  const sheet = getSheet(SH_ORDERS);
  const col   = getHeaderMap_(sheet);

  const jenis = p.jenis;
  const porsi = toNum_(p.porsi);
  const now   = new Date();
  const waktuPakai = p.waktu_pakai || '';

  // 1) harga efektif (riwayat) → fallback default menu
  let price = resolvePriceFromHistory_(jenis, now);
  if (!price || price<=0) price = resolveDefaultMenuPrice_(jenis);

  // 2) total
  const total = (price||0) * (porsi||0);

  // 3) row object sesuai headers
  const rowObj = {
    id: p.id || Utilities.getUuid(),
    created_at: now,
    username: p.username || me.username || '',
    display_name: p.display_name || me.displayName || '',
    jenis: jenis,
    waktu_pakai: waktuPakai,
    porsi: porsi,
    kegiatan: p.kegiatan || '',
    mess_tujuan: p.mess_tujuan || '',
    catatan: p.catatan || '',
    status: STAT.PENDING,
    allocated_mess: '',
    approved_by: '',
    approved_at: '',
    received_at: '',
    ready_at: '',
    price_per_porsi: price || 0,  // LOCK
    total_biaya: total || 0       // LOCK
  };

  // 4) tulis
  const headers = Object.keys(col);
  const row = headers.map(h => rowObj.hasOwnProperty(h) ? rowObj[h] : '');
  sheet.appendRow(row);

  logAudit_(me.username, 'create', 'Order', rowObj.id, '', JSON.stringify(rowObj), 'createOrder');
  return ok({ id: rowObj.id, price_per_porsi: rowObj.price_per_porsi, total_biaya: rowObj.total_biaya });
}

/** Orders (list) */
function getOrders_(p){
  const me = requireAuth_(p);
  const all = rowsToObjects(getSheet(SH_ORDERS));

  let list;
  if (me.role === 'Admin') list = all;
  else if (me.role === 'Mess') list = all.filter(r => String(r.allocated_mess||'') === String(me.messName||''));
  else list = all.filter(r => r.username === me.username);

  const status   = (p.status||'').trim();
  const jenis    = (p.jenis||'').trim();
  const dateFrom = (p.date_from||'').trim();
  const dateTo   = (p.date_to||'').trim();

  if (status) list = list.filter(r => r.status === status);
  if (jenis)  list = list.filter(r => r.jenis === jenis);
  if (dateFrom){
    const df = new Date(dateFrom+'T00:00:00');
    list = list.filter(r => r.waktu_pakai && new Date(r.waktu_pakai) >= df);
  }
  if (dateTo){
    const dt = new Date(dateTo+'T23:59:59');
    list = list.filter(r => r.waktu_pakai && new Date(r.waktu_pakai) <= dt);
  }

  list.sort((a,b)=> (a.created_at<b.created_at?1:-1));
  return ok({ orders:list });
}

/** ============ Admin actions ============ */
function adminAllocate_(p){
  const me = requireAuth_(p);
  if (me.role !== 'Admin') return fail('Forbidden');
  const id = (p.id||'').trim();
  const messName = (p.allocated_mess||'').trim();
  if (!id || !messName) return fail('id/allocated_mess wajib.');

  const updated = patchOrderById_(id, {
    status: STAT.ALOK,
    allocated_mess: messName,
    approved_by: me.username,
    approved_at: nowStr()
  }, me.username, 'Admin allocate');

  const dst = rowsToObjects(getSheet(SH_MESS)).find(m => String(m.nama_mess||'') === messName);
  const bot = getConfigValue('TELEGRAM_BOT_TOKEN',''); const chat = dst?.telegram_chat_id;
  if (bot && chat){
    try{ sendTelegram_(bot, chat, `Pesanan dialokasikan:\nID: ${updated.id}\nJenis: ${updated.jenis}\nWaktu: ${updated.waktu_pakai}\nPorsi: ${updated.porsi}\nDialokasikan ke: ${updated.allocated_mess}`); }catch(e){}
  }
  return ok({ id, status: updated.status, allocated_mess: updated.allocated_mess });
}

function adminReject_(p){
  const me = requireAuth_(p);
  if (me.role !== 'Admin') return fail('Forbidden');
  const id = (p.id||'').trim();
  const reason = (p.reason||'').trim();
  if (!id) return fail('id wajib.');

  const found = findOrderRow_(id);
  if (!found) return fail('Order not found');
  const { sh, rowIndex, heads } = found;
  const row = sh.getRange(rowIndex,1,1,heads.length).getValues()[0];
  const idxCat = heads.indexOf('catatan');
  const prevCat = row[idxCat] ? String(row[idxCat]) : '';
  const newCat = reason ? (prevCat ? prevCat + ' | Rejected: ' + reason : 'Rejected: ' + reason) : prevCat;

  const updated = patchOrderById_(id, {
    status: STAT.REJECT,
    allocated_mess: '',
    approved_by: me.username,
    approved_at: nowStr(),
    catatan: newCat
  }, me.username, 'Admin reject');

  return ok({ id, status: updated.status });
}

/** ============ Mess actions ============ */
function messUpdate_(p){
  const me = requireAuth_(p);
  if (me.role !== 'Mess') return fail('Forbidden');
  const id = (p.id||'').trim();
  const action = (p.action||'').trim(); // received|preparing|ready|done
  if (!id || !action) return fail('id/action wajib.');

  const row = findOrderRow_(id);
  if (!row) return fail('Order not found');
  const current = rowToObject_(row.heads, row.sh.getRange(row.rowIndex,1,1,row.heads.length).getValues()[0]);
  if (String(current.allocated_mess||'') !== String(me.messName||'')){
    return fail('Order bukan untuk Mess ini.');
  }

  let patch = {}, note = '';
  switch(action){
    case 'received':  patch = { status: STAT.TERIMA,  received_at: nowStr() }; note='Mess received';  break;
    case 'preparing': patch = { status: STAT.SIAPKAN };                           note='Mess preparing'; break;
    case 'ready':
      patch = { status: STAT.SIAP, ready_at: nowStr() }; note='Mess ready';
      const bot = getConfigValue('TELEGRAM_BOT_TOKEN','');
      const adminChat = getConfigValue('ADMIN_CHAT_ID','');
      if (bot && adminChat){ try{ sendTelegram_(bot, adminChat, `Pesanan siap:\nID: ${current.id}\nMess: ${me.messName}`); }catch(e){} }
      break;
    case 'done':      patch = { status: STAT.SELESAI }; note='Mess completed'; break;
    default:          return fail('Action tidak dikenal.');
  }
  const updated = patchOrderById_(id, patch, me.username, note);
  return ok({ id: updated.id, status: updated.status, received_at: updated.received_at, ready_at: updated.ready_at });
}

/** ============ Master Data (read + CRUD) ============ */
function getMasterData_(p){
  requireAuth_(p);

  const acts = rowsToObjects(getSheet(SH_ACT))
    .filter(r => isActive_(r.active))
    .map(r => ({ id:r.id, nama:r.nama_kegiatan }));

  const mess = rowsToObjects(getSheet(SH_MESS))
    .filter(r => isActive_(r.active))
    .map(r => ({ id:r.id, nama:r.nama_mess }));

  const menu = rowsToObjects(getSheet(SH_MENU))
    .filter(r => isActive_(r.active))
    .map(r => ({
      id: r.id,
      jenis: r.jenis,
      nama: r.nama,
      harga: toNum_(r.harga_per_porsi),     // frontend pakai field 'harga'
      is_default: isActive_(r.is_default)
    }));

  const defPrice = {};
  menu.forEach(m => { if (m.is_default && defPrice[m.jenis]==null) defPrice[m.jenis] = m.harga; });

  return ok({ activities:acts, messList:mess, menu, defaultPrice:defPrice });
}

function entitySpec_(name){
  const specs = {
    Users: { sheet:SH_USERS, headers:HDR_USERS, key:'username', genId:null, coerce:(r)=>{
      if ('active' in r) r.active = boolStr_(r.active);
      if (r.password_plain){ r.password_hash = toHashSHA256(String(r.password_plain)); delete r.password_plain; }
      if (r.role){ const role = String(r.role).trim(); if (!['Admin','User','Mess'].includes(role)) r.role = 'User'; }
    }},
    Menu: { sheet:SH_MENU, headers:HDR_MENU, key:'id', genId:()=>Utilities.getUuid(), coerce:(r)=>{
      if ('active' in r) r.active = boolStr_(r.active);
      if ('is_default' in r) r.is_default = boolStr_(r.is_default);
      if ('harga_per_porsi' in r) r.harga_per_porsi = String(r.harga_per_porsi||'');
    }},
    Activities: { sheet:SH_ACT, headers:HDR_ACT, key:'id', genId:()=>Utilities.getUuid(), coerce:(r)=>{
      if ('active' in r) r.active = boolStr_(r.active);
    }},
    Mess: { sheet:SH_MESS, headers:HDR_MESS, key:'id', genId:()=>Utilities.getUuid(), coerce:(r)=>{
      if ('active' in r) r.active = boolStr_(r.active);
    }},
    Config: { sheet:SH_CONFIG, headers:HDR_CONFIG, key:'key', genId:null, coerce:(_)=>{} }
  };
  const s = specs[name];
  if (!s) throw new Error('Unknown entity: '+name);
  ensureSheet(s.sheet, s.headers);
  return s;
}
function findRowByKey_(sh, keyField, keyVal){
  const data = sh.getDataRange().getValues();
  if (data.length<2) return { heads:data[0]||[], rowIndex:-1, row:null };
  const heads = data[0]; const idx = heads.indexOf(keyField);
  for (let i=1;i<data.length;i++){
    if (String(data[i][idx]) === String(keyVal)){
      return { heads, rowIndex:i+1, row:data[i] };
    }
  }
  return { heads:data[0], rowIndex:-1, row:null };
}
function writeRowByObject_(sh, obj){
  const heads = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const row = heads.map(h => val(obj[h]));
  sh.appendRow(row);
}
function updateRowFromObject_(sh, rowIndex, obj){
  const heads = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const row = sh.getRange(rowIndex,1,1,heads.length).getValues()[0];
  heads.forEach((h,i)=>{ if (h in obj) row[i] = obj[h]; });
  sh.getRange(rowIndex,1,1,heads.length).setValues([row]);
}

function mdList_(p){
  const me = requireAuth_(p);
  if (me.role !== 'Admin') return fail('Forbidden');

  const entity = (p.entity||'').trim();
  if (!entity) return fail('Entity parameter required');

  const spec = entitySpec_(entity);
  const sh = getSheet(spec.sheet);
  const data = sh.getDataRange().getValues();

  if (data.length < 2){
    return ok({ entity, headers:spec.headers, rows:[] });
  }
  const headers = data[0];
  const rows = data.slice(1).filter(r=> r.join('')!=='').map(r=>{
    const obj = {}; headers.forEach((h,i)=> obj[h] = r[i] ?? ''); return obj;
  });
  return ok({ entity, headers, rows });
}

/** ===== mdUpsert_ dengan logging PriceHistory untuk Menu ===== */
function mdUpsert_(p){
  const me = requireAuth_(p);
  if (me.role !== 'Admin') return fail('Forbidden');

  const entity = (p.entity||'').trim();
  const record = p.record || {};
  const spec = entitySpec_(entity);
  const sh = getSheet(spec.sheet);

  // key
  const keyField = spec.key;
  let keyVal = record[keyField];
  if (!keyVal || String(keyVal).trim()===''){
    if (spec.genId){ keyVal = spec.genId(); record[keyField] = keyVal; }
    else return fail('Key "'+keyField+'" wajib diisi.');
  }

  // coerce
  if (typeof spec.coerce === 'function') spec.coerce(record);

  // create/update
  const found = findRowByKey_(sh, keyField, keyVal);
  let before = null, after = null;
  if (found.rowIndex < 0){
    writeRowByObject_(sh, record);
    logAudit_(me.username, 'create', entity, keyVal, '', JSON.stringify(record), 'mdUpsert create');
    after = record; // untuk logging PriceHistory
  } else {
    before = rowToObject_(found.heads, found.row);
    updateRowFromObject_(sh, found.rowIndex, record);
    after  = rowToObject_(found.heads, sh.getRange(found.rowIndex,1,1,found.heads.length).getValues()[0]);
    logAudit_(me.username, 'update', entity, keyVal, JSON.stringify(before), JSON.stringify(after), 'mdUpsert update');
  }

  // === PriceHistory: hanya untuk Menu (default & active), saat create atau harga berubah
  if (entity === 'Menu'){
    const jenis    = String((after.jenis ?? before?.jenis) || '').trim();
    const isDef    = isActive_(after.is_default ?? before?.is_default);
    const active   = isActive_(after.active     ?? before?.active);
    const hargaNew = toNum_(after.harga_per_porsi);
    const hargaOld = toNum_(before?.harga_per_porsi);
    const changed  = !(hargaNew === hargaOld);

    if (jenis && isDef && active && hargaNew > 0 && (found.rowIndex < 0 || changed)){
      logPriceHistory_(jenis, hargaNew, new Date());
    }
  }

  return ok({ entity, key:keyVal });
}

function mdDelete_(p){
  const me = requireAuth_(p);
  if (me.role !== 'Admin') return fail('Forbidden');

  const entity = (p.entity||'').trim();
  const spec = entitySpec_(entity);
  const sh = getSheet(spec.sheet);

  const keyField = String(p.key||spec.key);
  const keyVal   = String(p.value||'').trim();
  if (!keyVal) return fail('value (key value) wajib.');

  const found = findRowByKey_(sh, keyField, keyVal);
  if (found.rowIndex < 0) return fail('Row not found');
  const before = rowToObject_(found.heads, found.row);
  sh.deleteRow(found.rowIndex);
  logAudit_(me.username, 'delete', entity, keyVal, JSON.stringify(before), '', 'mdDelete');
  return ok({ entity, key:keyVal, deleted:true });
}

/** ============ Audit & Telegram ============ */
function logAudit_(username, action, entity, entity_id, before, after, note){
  try{
    appendObject(getSheet(SH_AUDIT), {
      ts: nowStr(), username, action, entity, entity_id, before, after, note, ip:'', ua:''
    });
  }catch(e){}
}
function sendTelegram_(botToken, chatId, text){
  const url = 'https://api.telegram.org/bot'+botToken+'/sendMessage';
  const payload = { chat_id: chatId, text };
  UrlFetchApp.fetch(url, { method:'post', contentType:'application/json', payload:JSON.stringify(payload), muteHttpExceptions:true });
}

/** ============ PriceHistory helpers & onEdit (edit manual di Sheet) ============ */
function ensurePriceHistorySheet_(){
  return ensureSheet(SH_PRICE_HISTORY, HDR_PRICEH);
}
function logPriceHistory_(jenis, harga, effectiveDate){
  if (!jenis) return;
  const h = toNum_(harga);
  if (!(h > 0)) return;
  const eff = startOfDay_(effectiveDate || new Date());
  const ph = ensurePriceHistorySheet_();
  ph.appendRow([ new Date(), jenis, h, eff ]);
}
function onEdit(e){
  const sh = e && e.range && e.range.getSheet();
  if (!sh || sh.getName() !== SH_MENU) return;

  const row = e.range.getRow();
  if (row <= 1) return;

  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const iJenis = headers.indexOf('jenis');
  const iHarga = headers.indexOf('harga_per_porsi');
  const iDef   = headers.indexOf('is_default');
  const iAct   = headers.indexOf('active');
  if (iJenis<0 || iHarga<0 || iDef<0 || iAct<0) return;

  // log hanya jika kolom harga yang diubah
  if (e.range.getColumn() !== (iHarga+1)) return;

  const vals   = sh.getRange(row,1,1,sh.getLastColumn()).getValues()[0];
  const jenis  = vals[iJenis];
  const harga  = toNum_(vals[iHarga]);
  const isDef  = isActive_(vals[iDef]);
  const active = isActive_(vals[iAct]);

  if (jenis && isDef && active && harga>0){
    logPriceHistory_(jenis, harga, new Date());
  }
}

/** ============ Maintenance: Backfill harga/total order lama ============ */
function fixOrderPrices_(){
  const sh = getSheet(SH_ORDERS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return ok({ updated:0 });

  const head = data[0];
  const iJenis   = head.indexOf('jenis');
  const iPorsi   = head.indexOf('porsi');
  const iCreated = head.indexOf('created_at');
  const iWaktu   = head.indexOf('waktu_pakai');
  const iPrice   = head.indexOf('price_per_porsi');
  const iTotal   = head.indexOf('total_biaya');

  let updated = 0;
  for (let r=1; r<data.length; r++){
    const row   = data[r];
    const jenis = row[iJenis];
    const porsi = toNum_(row[iPorsi]);
    const price = toNum_(row[iPrice]);
    const total = toNum_(row[iTotal]);

    if (price>0 && total>0) continue;

    const ref = row[iCreated] || row[iWaktu] || new Date();
    let pr = resolvePriceFromHistory_(jenis, ref);
    if (!pr || pr<=0) pr = resolveDefaultMenuPrice_(jenis);
    const tt = (pr||0) * (porsi||0);

    if (iPrice>=0) sh.getRange(r+1, iPrice+1).setValue(pr||0);
    if (iTotal>=0) sh.getRange(r+1, iTotal+1).setValue(tt||0);
    updated++;
  }
  return ok({ updated });
}

/** ============ Misc ============ */
function setDbSheetId(id){
  PropertiesService.getScriptProperties().setProperty('DB_SHEET_ID', id);
}
function createTriggers_(){} // reserved
