const buckets = new Map();

function rateLimit({ windowMs = 60_000, max = 120 } = {}) {
  return (req, res, next) => {
    const key = req.user?.userId ? `u:${req.user.userId}` : `ip:${req.ip}`;
    const now = Date.now();
    const entry = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count += 1;
    buckets.set(key, entry);

    if (entry.count > max) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded. Please retry later.',
      });
    }

    next();
  };
}

module.exports = { rateLimit };
