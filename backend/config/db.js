const { Pool } = require('pg');
require('dotenv').config();

// ── Toggle: set USE_MOCK_DB=true in .env to use in-memory DB ──
if (process.env.USE_MOCK_DB === 'true') {
  console.log('🧪 Using MOCK database (in-memory)');
  module.exports = require('./mockDb');
} else {
  const useSsl = process.env.DB_SSL === 'true' || (process.env.DB_HOST || '').includes('supabase.co');
  const sslConfig = useSsl ? { rejectUnauthorized: false } : false;

  const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: sslConfig,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      }
    : {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: sslConfig,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      };

  const pool = new Pool(poolConfig);

  pool.on('connect', () => {
    console.log('📦 Connected to PostgreSQL');
  });

  pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
    process.exit(-1);
  });

  module.exports = pool;
}

