const { Pool } = require('pg');

// ── Toggle: set USE_MOCK_DB=true in .env to use in-memory DB ──
if (process.env.USE_MOCK_DB === 'true') {
  console.log('🧪 Using MOCK database (in-memory)');
  module.exports = require('./mockDb');
} else {
  // Ensure DATABASE_URL is defined
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ FATAL: DATABASE_URL is missing in environment variables.');
    throw new Error('DATABASE_URL is required to connect to the database.');
  }

  const isSupabase = databaseUrl.includes('supabase.co');
  const useSsl = process.env.DB_SSL === 'true' || isSupabase;
  const sslConfig = useSsl ? { rejectUnauthorized: false } : false;

  const poolConfig = {
    connectionString: databaseUrl,
    ssl: sslConfig,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  const pool = new Pool(poolConfig);

  pool.on('connect', () => {
    const targetDb = isSupabase ? 'Supabase' : 'Local PostgreSQL';
    console.log(`📦 Connected to ${targetDb} database via Pool successfully`);
  });

  pool.on('error', (err) => {
    console.error(`❌ Unexpected database error on idle client (Pool):`, err);
    process.exit(-1);
  });

  // Small utility log to confirm singleton init
  console.log(`🔗 Database pool initialized for ${isSupabase ? 'Supabase' : 'Local PostgreSQL'}`);

  module.exports = pool;
}

