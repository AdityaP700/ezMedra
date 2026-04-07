require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool();
pool.query(`
  SELECT u.id, u.email, u.attendance_percentage, SUM(a.attended_weight) as attended, SUM(a.conducted_weight) as conducted
  FROM users u
  LEFT JOIN attendance a ON u.id = a.student_id
  WHERE u.email = 'borderline.student@slms.com'
  GROUP BY u.id
`).then(res => {
  console.log(res.rows);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});