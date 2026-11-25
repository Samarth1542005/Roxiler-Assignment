const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');

test('role-based API workflows persist ratings and enforce authorization', async () => {
  process.env.JWT_SECRET = 'integration-test-secret-with-more-than-thirty-two-characters';
  process.env.CLIENT_ORIGIN = 'http://localhost:5173';

  const { PGlite } = await import('@electric-sql/pglite');
  const database = new PGlite();
  const pool = require('../src/db');
  pool.query = (...args) => database.query(...args);

  const schema = await readFile(`${__dirname}/../db/schema.sql`, 'utf8');
  await database.exec(schema);
  await database.exec(schema);
  const { bcrypt } = require('../src/auth');
  const app = require('../src/app');
  const adminPassword = 'AdminPass!9';
  const adminHash = await bcrypt.hash(adminPassword, 4);
  await database.query(
    `INSERT INTO users (name, email, password_hash, address, role)
     VALUES ($1, $2, $3, $4, 'admin')`,
    ['GoodStore Platform Administrator', 'admin@example.test', adminHash, 'Admin Avenue']
  );

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, { method = 'GET', token, body } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: response.status, ...(await response.json()), httpStatus: response.status };
  };

  try {
    assert.deepEqual(await call('/health'), { status: 'ok', httpStatus: 200 });

    const admin = await call('/auth/login', {
      method: 'POST',
      body: { email: 'admin@example.test', password: adminPassword }
    });
    assert.equal(admin.status, 200);
    assert.equal(admin.user.role, 'admin');

    const ownerCreated = await call('/admin/users', {
      method: 'POST',
      token: admin.token,
      body: {
        name: 'GoodStore Local Business Owner',
        email: 'owner@example.test',
        password: 'OwnerPass!9',
        address: 'Market Street',
        role: 'owner'
      }
    });
    assert.equal(ownerCreated.status, 201);

    const additionalAdmin = await call('/admin/users', {
      method: 'POST',
      token: admin.token,
      body: {
        name: 'GoodStore Additional Admin',
        email: 'admin2@example.test',
        password: 'SecondPass!9',
        address: 'Admin Road',
        role: 'admin'
      }
    });
    assert.equal(additionalAdmin.status, 201);

    const storeCreated = await call('/admin/stores', {
      method: 'POST',
      token: admin.token,
      body: {
        name: 'Neighborhood Market',
        email: 'market@example.test',
        address: 'Market Street',
        ownerId: ownerCreated.user.id
      }
    });
    assert.equal(storeCreated.status, 201);

    const signup = await call('/auth/signup', {
      method: 'POST',
      body: {
        name: 'Community Rating Customer',
        email: 'customer@example.test',
        password: 'CustomerPass!9',
        address: 'West Avenue'
      }
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.user.role, 'user');

    let rating = await call(`/stores/${storeCreated.store.id}/rating`, {
      method: 'PUT',
      token: signup.token,
      body: { value: 4 }
    });
    assert.equal(rating.status, 200);
    rating = await call(`/stores/${storeCreated.store.id}/rating`, {
      method: 'PUT',
      token: signup.token,
      body: { value: 5 }
    });
    assert.equal(rating.rating.value, 5);

    const owner = await call('/auth/login', {
      method: 'POST',
      body: { email: 'owner@example.test', password: 'OwnerPass!9' }
    });
    const ownerDashboard = await call('/owner/dashboard', { token: owner.token });
    assert.equal(ownerDashboard.store.average_rating, '5.00');
    assert.equal(ownerDashboard.ratings.length, 1);

    const ownerListing = await call('/admin/users?role=owner&search=Owner', { token: admin.token });
    assert.equal(ownerListing.users[0].rating, '5.00');
    const storeListing = await call('/admin/stores?search=Market', { token: admin.token });
    assert.equal(storeListing.stores[0].rating, '5.00');
    const customerStores = await call('/stores?search=Market', { token: signup.token });
    assert.equal(customerStores.stores[0].overall_rating, '5.00');
    assert.equal(customerStores.stores[0].user_rating, 5);

    const summary = await call('/admin/summary', { token: admin.token });
    assert.deepEqual(summary, { status: 200, users: 4, stores: 1, ratings: 1, httpStatus: 200 });
    assert.equal((await call('/admin/summary', { token: signup.token })).status, 403);
    assert.equal((await call(`/stores/${storeCreated.store.id}/rating`, {
      method: 'PUT',
      token: signup.token,
      body: { value: 6 }
    })).status, 400);

    assert.equal((await call('/auth/password', {
      method: 'PUT',
      token: signup.token,
      body: { currentPassword: 'CustomerPass!9', newPassword: 'UpdatedPass!9' }
    })).status, 200);
    assert.equal((await call('/auth/login', {
      method: 'POST',
      body: { email: 'customer@example.test', password: 'UpdatedPass!9' }
    })).status, 200);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await database.close();
    await pool.end();
  }
});
