require('dotenv').config();
const app = require('./app');
const pool = require('./db');

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, () => {
  console.log(`Store ratings API listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
