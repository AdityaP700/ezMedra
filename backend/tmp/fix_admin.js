const pool = require('../config/db');

async function fixAdmin() {
  try {
    const result = await pool.query(
      `UPDATE users SET admin_type = 'DEPARTMENT_ADMIN', updated_at = CURRENT_TIMESTAMP WHERE email = 'admin@slms.com' RETURNING id, admin_type, email`
    );
    console.log('✅ Admin updated:', JSON.stringify(result.rows[0]));
  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    process.exit(0);
  }
}

fixAdmin();
