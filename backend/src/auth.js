const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

function tokenSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters');
  }
  return secret;
}

function createToken(user) {
  return jwt.sign({ sub: user.id }, tokenSecret(), { expiresIn: '12h' });
}

function authenticate(roles = []) {
  return async (req, res, next) => {
    try {
      const authorization = req.get('authorization') || '';
      const [scheme, token] = authorization.split(' ');
      if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const payload = jwt.verify(token, tokenSecret());
      const result = await pool.query(
        'SELECT id, name, email, address, role FROM users WHERE id = $1',
        [payload.sub]
      );
      const user = result.rows[0];
      if (!user) return res.status(401).json({ error: 'Account no longer exists' });
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ error: 'You do not have permission to perform this action' });
      }
      req.user = user;
      return next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }
      return next(error);
    }
  };
}

module.exports = { authenticate, bcrypt, createToken };
