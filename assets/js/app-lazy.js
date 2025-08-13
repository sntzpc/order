// app-lazy.js — memuat modul hanya saat diperlukan
(function () {
  const loaded = new Set();

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (loaded.has(src)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true; s.dataset.once = src;
      s.onload = () => { loaded.add(src); resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function loadChartAndXlsx() {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js');
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  }

  async function bootOrder()  { await loadScriptOnce('assets/js/price-cache.js'); await loadScriptOnce('assets/js/order.js');  if (window.orderInit)  await window.orderInit(); }
  async function bootAdmin()  { await loadScriptOnce('assets/js/admin.js');  if (window.adminInit)  await window.adminInit(); }
  async function bootMess()   { await loadScriptOnce('assets/js/mess.js');   if (window.messInit)   await window.messInit(); }
  async function bootMaster() { await loadScriptOnce('assets/js/master.js'); if (window.masterInit) await window.masterInit(); }
  async function bootReport() { await loadChartAndXlsx(); await loadScriptOnce('assets/js/report.js'); if (window.reportInit) await window.reportInit(); }
  async function bootAccess() { await loadScriptOnce('assets/js/access.js'); if (window.accessInit) await window.accessInit(); }

  // Dipanggil dari auth.js setelah login sukses
  window.bootAppAfterLogin = async function (sess) {
    // tampilkan app & role gating
    document.getElementById('cardLogin')?.classList.add('d-none');
    document.getElementById('appWrap')?.classList.remove('d-none');

    if (sess?.role === 'Admin') {
      document.querySelectorAll('.role-admin').forEach(e => e.classList.remove('d-none'));
    }
    if (sess?.role === 'Mess') {
      document.querySelectorAll('.role-mess').forEach(e => e.classList.remove('d-none'));
    }

    // tab default: Order
    await bootOrder();

    // lazy init saat tab pertama kali ditampilkan
    const map = new Map([
      ['#tabAdmin',  bootAdmin],
      ['#tabMess',   bootMess],
      ['#tabMaster', bootMaster],
      ['#tabReport', bootReport],
      ['#tabAccess', bootAccess],
      ['#tabOrder',  bootOrder], // berjaga2 kalau user balik ke Order
    ]);

    document.querySelectorAll('a[data-bs-toggle="tab"]').forEach(link => {
      link.addEventListener('shown.bs.tab', (ev) => {
        const href = ev.target.getAttribute('href');
        const fn = map.get(href);
        if (typeof fn === 'function') fn(); // once or multi—idempotent
      });
    });
  };
})();
