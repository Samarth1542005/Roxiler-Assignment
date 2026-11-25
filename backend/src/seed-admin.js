require('dotenv').config();
const pool = require('./db');
const { bcrypt } = require('./auth');
const { createUserSchema, parseOrThrow } = require('./validation');

async function seedAdmin() {
  const input = parseOrThrow(createUserSchema, {
    name: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    address: process.env.ADMIN_ADDRESS || '',
    role: 'admin'
  });
  const passwordHash = await bcrypt.hash(input.password, 12);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, address, role)
     VALUES ($1, LOWER($2), $3, $4, 'admin')
     RETURNING id, name, email`,
    [input.name, input.email, passwordHash, input.address]
  );
  console.log(`Created administrator ${result.rows[0].email} (${result.rows[0].id})`);
}

seedAdmin()
  .catch((error) => {
    console.error('Could not create administrator:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
