require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool();
pool.query("SELECT id, email, first_name, role, attendance_percentage FROM users WHERE email LIKE '%critical%' OR email LIKE '%borderline%'")
.then(res => {
  require('fs').writeFileSync('db_output.json', JSON.stringify(res.rows, null, 2));
  return pool.query("SELECT student_id, status, count(*) FROM attendance GROUP BY student_id, status");
})
.then(res => {
  require('fs').appendFileSync('db_output.json', '\n' + JSON.stringify(res.rows, null, 2));
  process.exit(0);
}).catch(e => {
  require('fs').writeFileSync('db_error.txt', e.message);
  process.exit(1);
});