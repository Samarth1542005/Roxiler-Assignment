const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const { authenticate, bcrypt, createToken } = require('./auth');
const {
  createStoreSchema,
  createUserSchema,
  emailSchema,
  parseOrThrow,
  passwordChangeSchema,
  ratingSchema,
  signupSchema,
  uuidSchema
} = require('./validation');

const app = express();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const auth = authenticate();
const adminOnly = authenticate(['admin']);
const ownerOnly = authenticate(['owner']);

app.use(require('helmet')());
app.use(require('cors')({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173'
}));
app.use(express.json({ limit: '20kb' }));

app.get('/api/health', asyncRoute(async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Database health check failed', error);
    return res.status(503).json({ status: 'unavailable', error: 'Database is unavailable' });
  }
}));

app.post('/api/auth/signup', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }), asyncRoute(async (req, res) => {
  const input = parseOrThrow(signupSchema, req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, address, role)
     VALUES ($1, LOWER($2), $3, $4, 'user')
     RETURNING id, name, email, address, role`,
    [input.name, input.email, passwordHash, input.address]
  );
  const user = result.rows[0];
  res.status(201).json({ token: createToken(user), user });
}));

app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }), asyncRoute(async (req, res) => {
  const email = parseOrThrow(emailSchema, req.body.email);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const result = await pool.query(
    'SELECT id, name, email, address, role, password_hash FROM users WHERE email = LOWER($1)',
    [email]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect' });
  }
  delete user.password_hash;
  return res.json({ token: createToken(user), user });
}));

app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

app.put('/api/auth/password', auth, asyncRoute(async (req, res) => {
  const input = parseOrThrow(passwordChangeSchema, req.body);
  const current = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(input.currentPassword, current.rows[0].password_hash))) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);
  return res.json({ message: 'Password updated successfully' });
}));

app.get('/api/admin/summary', adminOnly, asyncRoute(async (_req, res) => {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM stores) AS stores,
      (SELECT COUNT(*)::int FROM ratings) AS ratings
  `);
  res.json(result.rows[0]);
}));

const userSorts = new Set(['name', 'email', 'address', 'role', 'created_at']);
app.get('/api/admin/users', adminOnly, asyncRoute(async (req, res) => {
  const sort = userSorts.has(req.query.sort) ? req.query.sort : 'name';
  const direction = req.query.direction === 'desc' ? 'DESC' : 'ASC';
  const search = `%${String(req.query.search || '').slice(0, 100)}%`;
  const role = ['admin', 'user', 'owner'].includes(req.query.role) ? req.query.role : null;
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.address, u.role,
       CASE WHEN u.role = 'owner' THEN (
         SELECT ROUND(AVG(r.value)::numeric, 2) FROM stores s
         LEFT JOIN ratings r ON r.store_id = s.id WHERE s.owner_id = u.id
       ) END AS rating
     FROM users u
     WHERE (u.name ILIKE $1 OR u.email ILIKE $1 OR u.address ILIKE $1)
       AND ($2::user_role IS NULL OR u.role = $2)
     ORDER BY ${sort} ${direction}`,
    [search, role]
  );
  res.json({ users: result.rows });
}));

app.get('/api/admin/users/:id', adminOnly, asyncRoute(async (req, res) => {
  const userId = parseOrThrow(uuidSchema, req.params.id);
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.address, u.role,
       CASE WHEN u.role = 'owner' THEN (
         SELECT ROUND(AVG(r.value)::numeric, 2) FROM stores s
         LEFT JOIN ratings r ON r.store_id = s.id WHERE s.owner_id = u.id
       ) END AS rating
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: result.rows[0] });
}));

app.post('/api/admin/users', adminOnly, asyncRoute(async (req, res) => {
  const input = parseOrThrow(createUserSchema, req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, address, role)
     VALUES ($1, LOWER($2), $3, $4, $5)
     RETURNING id, name, email, address, role`,
    [input.name, input.email, passwordHash, input.address, input.role]
  );
  res.status(201).json({ user: result.rows[0] });
}));

const storeSorts = new Set(['name', 'email', 'address', 'created_at']);
app.get('/api/admin/stores', adminOnly, asyncRoute(async (req, res) => {
  const sort = storeSorts.has(req.query.sort) ? req.query.sort : 'name';
  const direction = req.query.direction === 'desc' ? 'DESC' : 'ASC';
  const search = `%${String(req.query.search || '').slice(0, 100)}%`;
  const result = await pool.query(
    `SELECT s.id, s.name, s.email, s.address, s.owner_id,
       ROUND(AVG(r.value)::numeric, 2) AS rating, COUNT(r.id)::int AS rating_count,
       u.name AS owner_name
     FROM stores s
     LEFT JOIN ratings r ON r.store_id = s.id
     LEFT JOIN users u ON u.id = s.owner_id
     WHERE s.name ILIKE $1 OR s.email ILIKE $1 OR s.address ILIKE $1
     GROUP BY s.id, u.name
     ORDER BY ${sort} ${direction}`,
    [search]
  );
  res.json({ stores: result.rows });
}));

app.post('/api/admin/stores', adminOnly, asyncRoute(async (req, res) => {
  const input = parseOrThrow(createStoreSchema, req.body);
  if (input.ownerId) {
    const owner = await pool.query('SELECT id FROM users WHERE id = $1 AND role = $2', [input.ownerId, 'owner']);
    if (!owner.rows[0]) return res.status(400).json({ error: 'Select a valid store owner' });
  }
  const result = await pool.query(
    `INSERT INTO stores (name, email, address, owner_id)
     VALUES ($1, LOWER($2), $3, $4) RETURNING id, name, email, address, owner_id`,
    [input.name, input.email, input.address, input.ownerId || null]
  );
  res.status(201).json({ store: result.rows[0] });
}));

app.get('/api/stores', auth, asyncRoute(async (req, res) => {
  const search = `%${String(req.query.search || '').slice(0, 100)}%`;
  const result = await pool.query(
    `SELECT s.id, s.name, s.address, ROUND(AVG(all_ratings.value)::numeric, 2) AS overall_rating,
       COUNT(all_ratings.id)::int AS rating_count, my_rating.value AS user_rating
     FROM stores s
     LEFT JOIN ratings all_ratings ON all_ratings.store_id = s.id
     LEFT JOIN ratings my_rating ON my_rating.store_id = s.id AND my_rating.user_id = $1
     WHERE s.name ILIKE $2 OR s.address ILIKE $2
     GROUP BY s.id, my_rating.value
     ORDER BY s.name ASC`,
    [req.user.id, search]
  );
  res.json({ stores: result.rows });
}));

app.put('/api/stores/:id/rating', authenticate(['user']), asyncRoute(async (req, res) => {
  const storeId = parseOrThrow(uuidSchema, req.params.id);
  const input = parseOrThrow(ratingSchema, req.body);
  const result = await pool.query(
    `INSERT INTO ratings (user_id, store_id, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, store_id)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
     RETURNING id, store_id, value, updated_at`,
    [req.user.id, storeId, input.value]
  );
  res.json({ rating: result.rows[0] });
}));

app.get('/api/owner/dashboard', ownerOnly, asyncRoute(async (req, res) => {
  const ratingSorts = new Set(['name', 'email', 'value', 'updated_at']);
  const sort = ratingSorts.has(req.query.sort) ? req.query.sort : 'updated_at';
  const direction = req.query.direction === 'asc' ? 'ASC' : 'DESC';
  const storeResult = await pool.query(
    `SELECT s.id, s.name, s.address, ROUND(AVG(r.value)::numeric, 2) AS average_rating,
       COUNT(r.id)::int AS rating_count
     FROM stores s LEFT JOIN ratings r ON r.store_id = s.id
     WHERE s.owner_id = $1
     GROUP BY s.id`,
    [req.user.id]
  );
  if (!storeResult.rows[0]) {
    return res.json({ store: null, ratings: [] });
  }
  const store = storeResult.rows[0];
  const ratingsResult = await pool.query(
    `SELECT u.name, u.email, r.value, r.updated_at
     FROM ratings r JOIN users u ON u.id = r.user_id
     WHERE r.store_id = $1 ORDER BY ${sort} ${direction}`,
    [store.id]
  );
  return res.json({ store, ratings: ratingsResult.rows });
}));

app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));

app.use((error, _req, res, _next) => {
  if (error.code === '23505') {
    return res.status(409).json({ error: 'A record with the same unique value already exists' });
  }
  if (error.code === '23503') {
    return res.status(404).json({ error: 'The requested record was not found' });
  }
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error('Unhandled API error', error);
  return res.status(500).json({ error: 'An unexpected server error occurred' });
});

module.exports = app;
