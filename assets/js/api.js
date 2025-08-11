// ==== API WRAPPER (NO-CORS via JSONP) ====
// Pola: sisipkan <script src="...&callback=__jsonpXYZ"> lalu resolve Promise saat callback dipanggil.
// Catatan: GET-only. Pastikan payload kecil.

function apiJsonp(action, data = {}) {
  return new Promise((resolve, reject) => {
    const cbName = '__jsonp_cb_' + Math.random().toString(36).slice(2);
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Request timeout'));
    }, 20000);

    function cleanup() {
      clearTimeout(timeout);
      try { delete window[cbName]; } catch(_) {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = function (resp) {
      cleanup();
      if (!resp || resp.ok !== true) {
        return reject(new Error(resp && resp.error ? resp.error : 'Unknown error'));
      }
      resolve(resp.data);
    };

    const script = document.createElement('script');
    const params = new URLSearchParams({
      action,
      data: JSON.stringify(data),
      callback: cbName
    });
    script.src = CONFIG.WEB_APP_URL + '?' + params.toString();
    script.async = true;
    script.onerror = () => { cleanup(); reject(new Error('Network error')); };
    document.head.appendChild(script);
  });
}

// Agar kompatibel dengan kode lama, sediakan alias:
async function apiPost(action, data={}) {
  return apiJsonp(action, data);
}
// ========== GLOBAL BUSY untuk setiap API ==========
// simpan referensi apiPost asli
window.__apiPostRaw = window.apiPost;
window.apiPost = async function(action, data){
  // Cache ringan untuk getMasterData (30 detik)
  const cacheKey = action === 'getMasterData' ? '__cache_md' : null;
  const now = Date.now();
  if (cacheKey){
    const c = window.__mdCache || {};
    if (c.data && (now - c.ts) < 30000){ return c.data; }
  }

  showBusy();
  try{
    const res = await window.__apiPostRaw(action, data);
    if (cacheKey){
      window.__mdCache = { ts: now, data: res };
    }
    return res;
  } finally {
    hideBusy();
  }
};

async function apiGet(action, params={}) {
  // JSONP juga memakai GET, jadi samakan saja
  return apiJsonp(action, params);
}
