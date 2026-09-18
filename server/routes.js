// كل مسارات الـ API
const express = require('express');
const bcrypt = require('bcryptjs');
const { signToken, authMiddleware, loginLimiter, canAccess, isAccountOwner } = require('./auth');

const MAX_PARTNERS_SEPARATE = 5;

function buildRoutes(db) {
  const r = express.Router();
  const auth = authMiddleware(db);

  // ---------- صحة السيرفر (بدون دخول) ----------
  r.get('/health', (req, res) => res.json({ ok: true, app: 'floosy', time: new Date().toISOString() }));

  // ---------- دخول ----------
  r.post('/login', loginLimiter, (req, res) => {
    const { username, password, device } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'missing' });
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
    if (!u || !bcrypt.compareSync(String(password), u.pass_hash))
      return res.status(401).json({ error: 'wrong_credentials' });
    const token = signToken(u);
    const accs = db.prepare(`
      SELECT a.id, a.name, a.type, m.role FROM accounts a
      JOIN members m ON m.account_id = a.id AND m.user_id = ?
      ORDER BY a.id`).all(u.id);
    res.json({
      token,
      user: { id: u.id, username: u.username, is_owner: !!u.is_owner },
      accounts: u.is_owner
        ? db.prepare('SELECT id, name, type FROM accounts ORDER BY id').all().map(a => ({ ...a, role: 'owner' }))
        : accs,
      device: device || null,
    });
  });

  // ---------- بياناتي ----------
  r.get('/me', auth, (req, res) => {
    const accs = req.user.is_owner
      ? db.prepare('SELECT id, name, type FROM accounts ORDER BY id').all().map(a => ({ ...a, role: 'owner' }))
      : db.prepare(`SELECT a.id, a.name, a.type, m.role FROM accounts a
          JOIN members m ON m.account_id = a.id AND m.user_id = ? ORDER BY a.id`).all(req.user.id);
    res.json({ user: req.user, accounts: accs });
  });

  // ---------- تغيير كلمة المرور (لنفسي) ----------
  r.post('/change-password', auth, (req, res) => {
    const { old_password, new_password } = req.body || {};
    if (!new_password || String(new_password).length < 6)
      return res.status(400).json({ error: 'weak_password' });
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(String(old_password || ''), u.pass_hash))
      return res.status(401).json({ error: 'wrong_old' });
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?')
      .run(bcrypt.hashSync(String(new_password), 10), req.user.id);
    res.json({ ok: true });
  });

  // ---------- مزامنة السلة (snapshot) ----------
  r.get('/sync', auth, (req, res) => {
    const accountId = Number(req.query.account_id);
    if (!accountId) return res.status(400).json({ error: 'no_account' });
    if (!canAccess(db, req.user.id, req.user.is_owner, accountId))
      return res.status(403).json({ error: 'forbidden' });
    const row = db.prepare('SELECT data, updated_at FROM snapshots WHERE account_id = ?').get(accountId);
    res.json({ account_id: accountId, data: row ? JSON.parse(row.data) : null, updated_at: row?.updated_at || null });
  });

  r.put('/sync', auth, (req, res) => {
    const accountId = Number(req.query.account_id);
    if (!accountId) return res.status(400).json({ error: 'no_account' });
    if (!canAccess(db, req.user.id, req.user.is_owner, accountId))
      return res.status(403).json({ error: 'forbidden' });
    const data = req.body && req.body.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'bad_data' });
    // حد أمان لحجم السلة (10MB)
    const str = JSON.stringify(data);
    if (str.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'too_big' });
    db.prepare(`INSERT INTO snapshots (account_id, data, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(account_id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')`)
      .run(accountId, str);
    res.json({ ok: true });
  });

  // ---------- نظرة عامة (حساباتي + الأعضاء) ----------
  r.get('/overview', auth, (req, res) => {
    let accs;
    if (req.user.is_owner) {
      accs = db.prepare(`SELECT a.*, u.username AS owner_name FROM accounts a
        LEFT JOIN users u ON u.id = a.owner_id ORDER BY a.id`).all();
    } else {
      accs = db.prepare(`SELECT a.*, u.username AS owner_name FROM accounts a
        JOIN members m ON m.account_id = a.id AND m.user_id = ?
        LEFT JOIN users u ON u.id = a.owner_id ORDER BY a.id`).all(req.user.id);
    }
    const out = accs.map(a => ({
      id: a.id, name: a.name, type: a.type, owner_name: a.owner_name,
      my_role: req.user.is_owner ? 'owner' : (db.prepare('SELECT role FROM members WHERE account_id=? AND user_id=?').get(a.id, req.user.id)?.role),
      members: db.prepare(`SELECT u.id, u.username, u.created_at, m.role FROM members m
        JOIN users u ON u.id = m.user_id WHERE m.account_id = ? ORDER BY m.role, u.id`).all(a.id),
    }));
    res.json({ accounts: out, i_am_owner: req.user.is_owner, max_partners: MAX_PARTNERS_SEPARATE });
  });

  // ---------- إنشاء سلة/حساب جديد (المالك العام فقط) ----------
  // type: shared (سلة مشتركة) | separate (حساب منفصل)
  // ممكن إنشاء مالك الحساب المنفصل معاه مباشرة: owner_username + owner_password
  r.post('/accounts', auth, (req, res) => {
    if (!req.user.is_owner) return res.status(403).json({ error: 'owner_only' });
    const { name, type, owner_username, owner_password } = req.body || {};
    if (!name || !['shared', 'separate'].includes(type))
      return res.status(400).json({ error: 'bad_input' });
    let ownerId = req.user.id;
    if (type === 'separate' && owner_username) {
      if (!owner_password || String(owner_password).length < 6)
        return res.status(400).json({ error: 'weak_password' });
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(String(owner_username).trim()))
        return res.status(409).json({ error: 'username_taken' });
      const ins = db.prepare('INSERT INTO users (username, pass_hash) VALUES (?, ?)')
        .run(String(owner_username).trim(), bcrypt.hashSync(String(owner_password), 10));
      ownerId = Number(ins.lastInsertRowid);
    }
    const a = db.prepare('INSERT INTO accounts (name, type, owner_id) VALUES (?, ?, ?)')
      .run(String(name).trim(), type, ownerId);
    const accountId = Number(a.lastInsertRowid);
    db.prepare("INSERT INTO members (account_id, user_id, role) VALUES (?, ?, 'owner')").run(accountId, ownerId);
    db.prepare('INSERT INTO snapshots (account_id, data) VALUES (?, ?)').run(accountId, '{}');
    res.json({ ok: true, account_id: accountId });
  });

  // ---------- إضافة شريك (يوزر جديد + عضوية) ----------
  // المالك العام: أي حساب. مالك الحساب المنفصل: حسابه فقط + حد أقصى 5 شركاء.
  r.post('/partners', auth, (req, res) => {
    const { account_id, username, password } = req.body || {};
    const accountId = Number(account_id);
    if (!accountId || !username || !password) return res.status(400).json({ error: 'bad_input' });
    if (String(password).length < 6) return res.status(400).json({ error: 'weak_password' });
    const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    if (!acc) return res.status(404).json({ error: 'no_account' });
    const manager = isAccountOwner(db, req.user.id, req.user.is_owner, accountId);
    if (!manager) return res.status(403).json({ error: 'not_manager' });
    // الشريك العادي لا يضيف شركاء — فقط مالك الحساب أو المالك العام
    if (!req.user.is_owner) {
      if (acc.type !== 'separate') return res.status(403).json({ error: 'owner_only' });
      const partners = db.prepare("SELECT COUNT(*) c FROM members WHERE account_id = ? AND role = 'partner'").get(accountId).c;
      if (partners >= MAX_PARTNERS_SEPARATE) return res.status(409).json({ error: 'partners_limit_5' });
    }
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(String(username).trim()))
      return res.status(409).json({ error: 'username_taken' });
    const ins = db.prepare('INSERT INTO users (username, pass_hash) VALUES (?, ?)')
      .run(String(username).trim(), bcrypt.hashSync(String(password), 10));
    db.prepare("INSERT INTO members (account_id, user_id, role) VALUES (?, ?, 'partner')")
      .run(accountId, Number(ins.lastInsertRowid));
    res.json({ ok: true, user_id: Number(ins.lastInsertRowid) });
  });

  // ---------- حذف عضو من حساب ----------
  r.delete('/members', auth, (req, res) => {
    const accountId = Number(req.query.account_id);
    const userId = Number(req.query.user_id);
    if (!accountId || !userId) return res.status(400).json({ error: 'bad_input' });
    if (!isAccountOwner(db, req.user.id, req.user.is_owner, accountId))
      return res.status(403).json({ error: 'not_manager' });
    const m = db.prepare('SELECT role FROM members WHERE account_id = ? AND user_id = ?').get(accountId, userId);
    if (!m) return res.status(404).json({ error: 'not_member' });
    if (m.role === 'owner' && !req.user.is_owner)
      return res.status(403).json({ error: 'cant_remove_owner' });
    if (userId === req.user.id) return res.status(400).json({ error: 'cant_remove_self' });
    db.prepare('DELETE FROM members WHERE account_id = ? AND user_id = ?').run(accountId, userId);
    // لو مبقاش عضو في أي حساب — نحذف اليوزر (مالك عام فقط)
    if (req.user.is_owner) {
      const left = db.prepare('SELECT COUNT(*) c FROM members WHERE user_id = ?').get(userId).c;
      if (!left) db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    }
    res.json({ ok: true });
  });

  // ---------- تصفير باسورد عضو (المدير) ----------
  r.post('/reset-password', auth, (req, res) => {
    const { account_id, user_id, new_password } = req.body || {};
    if (!account_id || !user_id || !new_password || String(new_password).length < 6)
      return res.status(400).json({ error: 'bad_input' });
    if (!isAccountOwner(db, req.user.id, req.user.is_owner, Number(account_id)))
      return res.status(403).json({ error: 'not_manager' });
    if (!db.prepare('SELECT 1 FROM members WHERE account_id = ? AND user_id = ?').get(Number(account_id), Number(user_id)))
      return res.status(404).json({ error: 'not_member' });
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?')
      .run(bcrypt.hashSync(String(new_password), 10), Number(user_id));
    res.json({ ok: true });
  });

  return r;
}

module.exports = { buildRoutes, MAX_PARTNERS_SEPARATE };
