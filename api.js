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

  // ---- حفظ: كاش فوري + طابور عمليات ----
  queueSave(accountId, data) {
    try { localStorage.setItem('floosy_cache_' + accountId, JSON.stringify({ data, at: Date.now() })); } catch (e) {}
    this.enqueueFor(accountId, data);
    this.scheduleFlush();
  },

  // ============ طابور الأوفلاين (outbox) ============
  // كل تعديل يتحول لعمليات (add/del/set لكل عنصر) وتتخزن على الجهاز،
  // وأول ما النت يرجع تندمج فوق نسخة السيرفر بالترتيب وتترفع.
  outbox: JSON.parse(localStorage.getItem('floosy_outbox') || '[]'),
  synced: JSON.parse(localStorage.getItem('floosy_synced') || '{}'),
  _flushTimer: null,
  _flushing: false,
  COLL: ['txs', 'projects', 'budgets', 'reminders', 'debts', 'cats'],

  persistOutbox() {
    try {
      localStorage.setItem('floosy_outbox', JSON.stringify(this.outbox.slice(-500)));
      localStorage.setItem('floosy_synced', JSON.stringify(this.synced));
    } catch (e) {}
    if (typeof updateConnBadge === 'function') updateConnBadge();
  },

  emptySnap() { return { txs: [], projects: [], budgets: [], reminders: [], debts: [], cats: [] }; },

  diffSnaps(oldS, newS) {
    const ops = [];
    for (const c of this.COLL) {
      const a = new Map((oldS[c] || []).map(x => [x.id, x]));
      const b = new Map((newS[c] || []).map(x => [x.id, x]));
      for (const [id, obj] of b) {
        if (!a.has(id)) ops.push({ c, a: 'add', id, o: obj });
        else if (JSON.stringify(a.get(id)) !== JSON.stringify(obj)) ops.push({ c, a: 'set', id, o: obj });
      }
      for (const id of a.keys()) if (!b.has(id)) ops.push({ c, a: 'del', id });
    }
    return ops;
  },

  applyOps(snap, ops) {
    const s = JSON.parse(JSON.stringify(snap));
    for (const k of this.COLL) if (!Array.isArray(s[k])) s[k] = [];
    for (const op of ops) {
      const arr = s[op.c];
      const i = arr.findIndex(x => x.id === op.id);
      if (op.a === 'del') { if (i >= 0) arr.splice(i, 1); }
      else { if (i >= 0) arr[i] = op.o; else arr.push(op.o); }
    }
    return s;
  },

  enqueueFor(accountId, data) {
    let oldS = this.emptySnap();
    try { if (this.synced[accountId]) oldS = { ...this.emptySnap(), ...JSON.parse(this.synced[accountId]) }; } catch (e) {}
    const news = { ...this.emptySnap() };
    for (const c of this.COLL) news[c] = data[c] || [];
    const ops = this.diffSnaps(oldS, news);
    if (!ops.length) return 0;
    this.outbox.push({ qid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), accountId, ops });
    // ضغط: آخر عملية لكل عنصر هي اللي تفضل
    const seen = new Set();
    const compact = [];
    const flat = [];
    for (const e of this.outbox) for (const op of e.ops) flat.push({ ...op, accountId: e.accountId, ts: e.ts });
    for (let i = flat.length - 1; i >= 0; i--) {
      const k = flat[i].accountId + '|' + flat[i].c + '|' + flat[i].id;
      if (!seen.has(k)) { seen.add(k); compact.unshift(flat[i]); }
    }
    const byAcc = {};
    for (const op of compact) { (byAcc[op.accountId] = byAcc[op.accountId] || []).push(op); }
    this.outbox = Object.entries(byAcc).map(([accountId, ops2]) => ({ qid: 'c', ts: Date.now(), accountId: Number(accountId), ops: ops2 }));
    this.persistOutbox();
    return ops.length;
  },

  queueCount(accountId) {
    return this.outbox.reduce((n, e) => n + ((accountId && e.accountId !== accountId) ? 0 : e.ops.length), 0);
  },

  scheduleFlush(ms = 1200) {
    clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this.flushAll(), ms);
  },

  async flushAccount(accountId) {
    const ops = this.outbox.filter(e => e.accountId === accountId).flatMap(e => e.ops);
    try {
      const s = await this.loadSnapshot(accountId);
      let base = (s.data && Object.keys(s.data).length) ? s.data : (this.cached(accountId) || {});
      base = { ...this.emptySnap(), ...(base || {}) };
      const merged = this.applyOps(base, ops);
      const r = await fetch('api/sync?account_id=' + accountId, {
        method: 'PUT', headers: this.headers(), body: JSON.stringify({ data: { ...merged, settings: (this.cached(accountId) || {}).settings || {} } })
      });
      if (r.status === 401) throw new Error('unauthorized');
      if (!r.ok) throw new Error('save_failed');
      this.outbox = this.outbox.filter(e => e.accountId !== accountId);
      this.synced[accountId] = JSON.stringify(merged);
      this.online = true; this.dirty = false;
      this.persistOutbox();
      return { ok: true, n: ops.length };
    } catch (e) {
      if (String(e.message) === 'unauthorized') { this.logout(); return { ok: false }; }
      this.online = false; this.dirty = true;
      this.persistOutbox();
      return { ok: false };
    }
  },

  async flushAll() {
    if (!this.server || !this.token || this._flushing) return { ok: false };
    this._flushing = true;
    try {
      const accs = [...new Set(this.outbox.map(e => e.accountId))];
      if (this.activeId && !accs.includes(this.activeId)) accs.unshift(this.activeId);
      let total = 0;
      for (const id of accs) {
        if (!id) continue;
        const r = await this.flushAccount(id);
        if (!r.ok) break;
        total += r.n || 0;
      }
      // حدّث آخر نسخة متزامنة للسلة النشطة حتى لو مفيش عمليات
      if (this.activeId && typeof DB !== 'undefined' && this.online) {
        this.synced[this.activeId] = JSON.stringify({ txs: DB.txs, projects: DB.projects, budgets: DB.budgets, reminders: DB.reminders, debts: DB.debts, cats: DB.cats });
        this.persistOutbox();
      }
      if (total > 0 && typeof toast === 'function') toast(`☁️ اترفع ${total} عملية كانت مستنية النت ✅`);
      return { ok: true, total };
    } finally { this._flushing = false; }
  },

  async pushNow(accountId, data) {
    this.queueSave(accountId, data);
    return this.flushAll();
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

// إعادة محاولة رفع الطابور كل 20 ثانية + لحظة رجوع النت + تغيير الشبكة
setInterval(() => { if (Api.server && Api.token) Api.flushAll(); }, 20000);
window.addEventListener('online', () => { if (typeof toast === 'function') toast('🌐 النت رجع — جارٍ رفع الطابور...'); Api.flushAll(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && Api.server && Api.token) Api.flushAll(); });
