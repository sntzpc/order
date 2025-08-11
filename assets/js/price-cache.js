// assets/js/price-cache.js
(function(){
  const LS_KEY = 'price_cache_v1';

  function load(){
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }
    catch(_) { return {}; }
  }

  function save(cache){
    try { localStorage.setItem(LS_KEY, JSON.stringify(cache || {})); } catch(_){}
    // expose ke global agar cepat diakses tanpa JSON.parse
    window.PRICE_CACHE = cache || {};
    // broadcast (dua nama event supaya kompatibel dg kode lama)
    const detail = window.PRICE_CACHE;
    window.dispatchEvent(new CustomEvent('pricecache:updated',        { detail }));
    window.dispatchEvent(new CustomEvent('msrie-price-cache-updated', { detail }));
  }

  function isTrue(v){
    if (typeof v === 'boolean') return v;
    const s = String(v).trim().toLowerCase();
    return ['true','1','yes','ya','y','aktif','active'].includes(s);
  }

  // Bangun cache dari baris "Menu" (ambil yang is_default)
  function rebuildFromMenuRows(rows){
    const cache = {};
    (rows || []).forEach(r=>{
      if (isTrue(r.is_default)) {
        const jenis = String(r.jenis || '').trim();
        if (jenis) cache[jenis] = Number(r.harga_per_porsi ?? r.harga ?? 0) || 0;
      }
    });
    save(cache);
  }

  // expose helpers
  window.priceCacheLoad = load;
  window.priceCacheSave = save;
  window.priceCacheRebuildFromMenuRows = rebuildFromMenuRows;

  // prime dari localStorage saat pertama kali file ini diload
  window.PRICE_CACHE = load();
})();
