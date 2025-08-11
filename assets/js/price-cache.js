(function () {
  const LS_KEY = 'msrie_prices_v1';

  const api = {
    _data: { byJenis: {}, updatedAt: 0 },

    load() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) this._data = JSON.parse(raw) || this._data;
      } catch (_) {}
      // seed global cache for quick read
      window.PRICE_CACHE = { ...this._data.byJenis };
      return window.PRICE_CACHE;
    },

    save() {
      try {
        this._data.updatedAt = Date.now();
        localStorage.setItem(LS_KEY, JSON.stringify(this._data));
      } catch (_) {}
      const detail = { ...this._data.byJenis };
      window.PRICE_CACHE = detail;
      // keep both events for compatibility
      window.dispatchEvent(new CustomEvent('pricecache:updated', { detail }));
      window.dispatchEvent(new CustomEvent('msrie-price-cache-updated', { detail }));
    },

    // dari getMasterData (front-office)
    setFromGetMasterData(menuList) {
      const byJenis = {};
      (menuList || []).forEach(m => {
        const isDef = m.is_default === true || String(m.is_default).toLowerCase() === 'true';
        const harga = Number(m.harga ?? m.harga_per_porsi) || 0;
        if (isDef) byJenis[m.jenis] = harga;
      });
      if (Object.keys(byJenis).length) {
        this._data.byJenis = byJenis;
        this.save();
      }
    },

    // dari mdList('Menu') (back-office/Setting)
    setFromMenuRows(rows) {
      const byJenis = {};
      (rows || []).forEach(r => {
        const isDef = r.is_default === true
          || r.is_default === 'TRUE'
          || String(r.is_default).toLowerCase() === 'true'
          || r.is_default === 1;
        const harga = Number(r.harga_per_porsi) || 0;
        if (isDef) byJenis[r.jenis] = harga;
      });
      if (Object.keys(byJenis).length) {
        this._data.byJenis = byJenis;
        this.save();
      }
    },

    getPrice(jenis) { return Number(this._data.byJenis[jenis] || 0); },
    getAll() { return { ...this._data.byJenis }; }
  };

  // expose & prime once
  api.load();
  window.PriceCache = api;
})();
