/* فلوسي — طبقة الاتصال بالسيرفر الخاص + التوكن الدائم */
const Api = {
  token: localStorage.getItem('floosy_token') || '',
  user: null,
  accounts: [],
  activeId: Number(localStorage.getItem('floosy_account') || 0),
  server: false,       // هل يوجد سيرفر خاص؟
  online: true,        // هل السيرفر reachable الآن؟
  dirty: false,        // هل يوجد حفظ معلق (أوفلاين)؟
  _saveTimer: null,

  async check() {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 4000);
      const r = await fetch('api/health', { signal: c.signal });
      clearTimeout(t);
      this.server = r.ok;
    } catch (e) { this.server = false; }
    try { this.user = JSON.parse(localStorage.getItem('floosy_user') || 'null'); } catch (e) { this.user = null; }
    return this.server;
  },

  headers() {
    return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.token };
  },

  async login(username, password) {
    const r = await fetch('api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, device: navigator.userAgent.slice(0, 80) })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'login_failed');
    // حفظ دائم على الجهاز — التوكن صالح 10 سنين ولا يُمسح إلا بتسجيل الخروج
    this.token = d.token;
    this.user = d.user;
    this.accounts = d.accounts || [];
    localStorage.setItem('floosy_token', d.token);
    localStorage.setItem('floosy_user', JSON.stringify(d.user));
    if (!this.activeId || !this.accounts.find(a => a.id === this.activeId)) {
      this.activeId = (this.accounts[0] || {}).id || 0;
      localStorage.setItem('floosy_account', this.activeId);
    }
    return d;
  },

  logout() {
    this.token = ''; this.user = null; this.accounts = [];
    localStorage.removeItem('floosy_token');
    localStorage.removeItem('floosy_user');
    location.reload();
  },

  async me() {
    const r = await fetch('api/me', { headers: this.headers() });
    if (r.status === 401) throw new Error('unauthorized');
    const d = await r.json();
    this.user = d.user; this.accounts = d.accounts || [];
    localStorage.setItem('floosy_user', JSON.stringify(d.user));
    return d;
  },

  async loadSnapshot(accountId) {
    const r = await fetch('api/sync?account_id=' + accountId, { headers: this.headers() });
    if (r.status === 401) throw new Error('unauthorized');
    if (!r.ok) throw new Error('load_failed');
    return r.json();
  },

  // حفظ فوري مع debouncing — والكاش المحلي يتحدث دائمًا
  queueSave(accountId, data) {
    try { localStorage.setItem('floosy_cache_' + accountId, JSON.stringify({ data, at: Date.now() })); } catch (e) {}
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.pushNow(accountId, data), 900);
  },

  async pushNow(accountId, data) {
    try {
      const r = await fetch('api/sync?account_id=' + accountId, {
        method: 'PUT', headers: this.headers(), body: JSON.stringify({ data })
      });
      if (r.status === 401) throw new Error('unauthorized');
      if (!r.ok) throw new Error('save_failed');
      this.online = true; this.dirty = false;
      if (typeof updateConnBadge === 'function') updateConnBadge();
      return true;
    } catch (e) {
      if (String(e.message) === 'unauthorized') { this.logout(); return false; }
      this.online = false; this.dirty = true;
      if (typeof updateConnBadge === 'function') updateConnBadge();
      return false;
    }
  },

  cached(accountId) {
    try {
      const c = JSON.parse(localStorage.getItem('floosy_cache_' + accountId) || 'null');
      return c ? c.data : null;
    } catch (e) { return null; }
  },

  // ---- إدارة ----
  async overview() {
    const r = await fetch('api/overview', { headers: this.headers() });
    if (!r.ok) throw new Error('failed');
    return r.json();
  },
  async createAccount(payload) {
    const r = await fetch('api/accounts', { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'failed');
    return d;
  },
  async addPartner(payload) {
    const r = await fetch('api/partners', { method: 'POST', headers: this.headers(), body: JSON.stringify(payload) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'failed');
    return d;
  },
  async removeMember(accountId, userId) {
    const r = await fetch(`api/members?account_id=${accountId}&user_id=${userId}`, { method: 'DELETE', headers: this.headers() });
    if (!r.ok) throw new Error('failed');
    return r.json();
  },
  async resetPassword(account_id, user_id, new_password) {
    const r = await fetch('api/reset-password', { method: 'POST', headers: this.headers(), body: JSON.stringify({ account_id, user_id, new_password }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'failed');
    return d;
  },
  async changePassword(old_password, new_password) {
    const r = await fetch('api/change-password', { method: 'POST', headers: this.headers(), body: JSON.stringify({ old_password, new_password }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'failed');
    return d;
  }
};

// إعادة محاولة الحفظ المعلق كل 20 ثانية
setInterval(async () => {
  if (Api.server && Api.token && Api.dirty && typeof DB !== 'undefined') {
    await Api.pushNow(Api.activeId, snapshotOf(DB));
  }
}, 20000);
window.addEventListener('online', () => {
  if (Api.server && Api.token && Api.dirty && typeof DB !== 'undefined') Api.pushNow(Api.activeId, snapshotOf(DB));
});
