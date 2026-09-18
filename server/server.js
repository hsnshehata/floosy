// سيرفر فلوسي الخاص — يقدّم الواجهة + API. البيانات في ملف SQLite داخل DATA_DIR.
require('dotenv').config();
const express = require('express');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { db, DB_PATH } = require('./db');
const { buildRoutes } = require('./routes');

const PORT = Number(process.env.PORT || 3000);

// ---------- تجهيز المالك الأول (من متغيرات البيئة فقط — لا يوجد تسجيل عام) ----------
function seedAdmin() {
  const has = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (has > 0) return;
  const u = (process.env.ADMIN_USERNAME || '').trim();
  const p = process.env.ADMIN_PASSWORD || '';
  if (!u || !p) {
    console.error('❌ أول تشغيل: لازم تضبط ADMIN_USERNAME و ADMIN_PASSWORD في متغيرات البيئة.');
    process.exit(1);
  }
  const ins = db.prepare('INSERT INTO users (username, pass_hash, is_owner) VALUES (?, ?, 1)')
    .run(u, bcrypt.hashSync(String(p), 10));
  const ownerId = Number(ins.lastInsertRowid);
  const a = db.prepare("INSERT INTO accounts (name, type, owner_id) VALUES (?, 'shared', ?)")
    .run('سلتي الرئيسية 🧺', ownerId);
  const accountId = Number(a.lastInsertRowid);
  db.prepare("INSERT INTO members (account_id, user_id, role) VALUES (?, ?, 'owner')").run(accountId, ownerId);
  db.prepare('INSERT INTO snapshots (account_id, data) VALUES (?, ?)').run(accountId, '{}');
  console.log(`✅ اتعمل حساب المالك: ${u} + سلة رئيسية (id=${accountId})`);
}
seedAdmin();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
// هيدرات أمان أساسية
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use('/api', buildRoutes(db));

// الواجهة (نفس السيرفر — لا حاجة لسيرفر منفصل)
const WEB = path.join(__dirname, '..');
app.use(express.static(WEB, { extensions: ['html'] }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(WEB, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 فلوسي شغال على http://0.0.0.0:${PORT}`);
  console.log(`💾 قاعدة البيانات: ${DB_PATH}`);
});
