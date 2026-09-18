// المصادقة: JWT بعمر 10 سنين (يفضل محفوظ على الجهاز للأبد) + حماية ضد التخمين
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '';
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('❌ لازم تضبط JWT_SECRET (32 حرف على الأقل) في متغيرات البيئة.');
  process.exit(1);
}
// توكن يدوم 10 سنين = عمليًا للأبد على الجهاز
const TOKEN_TTL = '3650d';

function signToken(user) {
  return jwt.sign({ uid: user.id, u: user.username, o: !!user.is_owner }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function authMiddleware(db) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    try {
      const p = jwt.verify(token, JWT_SECRET);
      const row = db.prepare('SELECT id, username, is_owner FROM users WHERE id = ?').get(p.uid);
      if (!row) return res.status(401).json({ error: 'unknown_user' });
      req.user = { id: row.id, username: row.username, is_owner: !!row.is_owner };
      next();
    } catch (e) {
      return res.status(401).json({ error: 'bad_token' });
    }
  };
}

// تحديد معدل محاولات الدخول: 10 محاولات / 10 دقايق لكل IP
const attempts = new Map();
function loginLimiter(req, res, next) {
  const ip = req.ip || 'x';
  const now = Date.now();
  const arr = (attempts.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  if (arr.length >= 10) return res.status(429).json({ error: 'too_many_try_later' });
  arr.push(now);
  attempts.set(ip, arr);
  next();
}

// هل المستخدم عضو/مالك في الحساب؟
function canAccess(db, userId, isOwner, accountId) {
  if (isOwner) return true;
  const r = db.prepare('SELECT 1 FROM members WHERE account_id = ? AND user_id = ?').get(accountId, userId);
  return !!r;
}
function isAccountOwner(db, userId, isOwner, accountId) {
  if (isOwner) return true;
  const r = db.prepare("SELECT 1 FROM members WHERE account_id = ? AND user_id = ? AND role = 'owner'").get(accountId, userId);
  return !!r;
}

module.exports = { signToken, authMiddleware, loginLimiter, canAccess, isAccountOwner, TOKEN_TTL };
