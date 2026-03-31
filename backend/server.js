const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { errorHandler } = require('./middleware/errorHandler');
const { rateLimit } = require('./middleware/rateLimit.middleware');
const { registerEventHandlers } = require('./events/registerHandlers');
const { startSystemWorker } = require('./workers/system.worker');
const { runProductizationMigrations } = require('./config/productization.migration');

const app = express();

registerEventHandlers();

// ── Core Middleware ────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 180 }));

// ── Health Check ──────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'SLMS API is running', timestamp: new Date().toISOString() });
});

// ── Route Mounting ────────────────────────────────
const authRoutes = require('./modules/auth/auth.routes');
const leaveRoutes = require('./modules/leave/leave.routes');
const facultyRoutes = require('./modules/faculty/faculty.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const reportRoutes = require('./modules/reports/reports.routes');
const academicRoutes = require('./modules/academic/academic.routes');
const notificationRoutes = require('./modules/notifications/notifications.routes');

app.use('/api/auth', authRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/notifications', notificationRoutes);

// ── 404 Handler ───────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global Error Handler ──────────────────────────
app.use(errorHandler);

// ── Start Server ──────────────────────────────────
const PORT = process.env.PORT || 5000;

async function boot() {
  if (process.env.USE_MOCK_DB !== 'true') {
    try {
      await runProductizationMigrations();
      console.log('✅ Productization migrations ensured.');
    } catch (error) {
      console.error('❌ Failed to run productization migrations:', error.message);
      process.exit(1);
    }
  }

  app.listen(PORT, () => {
    console.log(`🚀 SLMS Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
    if (process.env.ENABLE_BACKGROUND_WORKER !== 'false') {
      startSystemWorker();
    }
  });
}

boot();

module.exports = app;
