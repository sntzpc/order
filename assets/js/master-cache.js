// Cache ringan Master Data di sessionStorage
// Dipakai untuk: getMasterData -> mengurangi request berulang
window.MasterCache = {
  _KEY: 'md:v1',
  async get(token) {
    const hit = sessionStorage.getItem(this._KEY);
    if (hit) return JSON.parse(hit);
    const data = await apiPost('getMasterData', { token });
    sessionStorage.setItem(this._KEY, JSON.stringify(data));
    return data;
  },
  clear() {
    try { sessionStorage.removeItem(this._KEY); } catch(_) {}
  }
};
