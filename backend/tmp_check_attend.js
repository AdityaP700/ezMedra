const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool();
pool.query("SELECT student_id, status, count(*) FROM attendance GROUP BY student_id, status").then(res => {
  console.log(res.rows);
  process.exit(0);
}).catch(console.error);