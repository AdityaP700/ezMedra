require('dotenv').config();
const pool = require('./config/db');

pool.query(`
  SELECT u.id, u.email, u.attendance_percentage, u.first_name, u.role
  FROM users u
  WHERE u.email LIKE '%critical%' OR u.email LIKE '%borderline%'
`).then(res => {
  console.log("USERS:", res.rows);
  return pool.query(`
    SELECT a.student_id, COUNT(*) as total_attendance,
           SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as present_count,
           SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absent_count
    FROM attendance a
    JOIN users u ON u.id = a.student_id
    WHERE u.email LIKE '%critical%' OR u.email LIKE '%borderline%'
    GROUP BY a.student_id
  `);
}).then(res => {
  console.log("ATTENDANCE RECORDS:", res.rows);
  process.exit();
}).catch(console.error);