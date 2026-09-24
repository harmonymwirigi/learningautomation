const { verifyToken } = require('../services/auth');
const { findById, toPublic } = require('../services/users');

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

// Every data route sits behind this: it turns a bearer token into req.userId,
// which is the only thing route handlers are allowed to scope queries by.
async function requireAuth(req, res, next) {
  try {
    const payload = verifyToken(readToken(req));
    if (!payload) {
      return res.status(401).json({ error: 'Sign in to continue', code: 'unauthenticated' });
    }

    const user = toPublic(await findById(payload.sub));
    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists', code: 'unauthenticated' });
    }

    // Checked on every request, not just at login, so suspending an account
    // takes effect immediately even if that student is already signed in.
    if (!user.is_active) {
      return res.status(403).json({
        error: 'This account has been suspended. Contact your administrator.',
        code: 'suspended',
      });
    }

    req.userId = user.id;
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// Mounted after requireAuth, so req.user is already loaded and verified.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required', code: 'forbidden' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, readToken };
