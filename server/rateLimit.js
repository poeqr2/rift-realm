// /projects/sandbox/rift-realm/server/rateLimit.js
// Token-bucket rate limiter, in-memory.
// Two flavors: HTTP middleware keyed on IP+route, WS message limiter keyed on socket.

class TokenBucket {
  constructor(capacity, refillPerSec) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerSec = refillPerSec;
    this.last = Date.now();
  }
  take(n = 1) {
    const now = Date.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + dt * this.refillPerSec);
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }
}

const httpBuckets = new Map();    // key -> bucket
const wsBuckets = new WeakMap();  // ws -> bucket

function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown'
  );
}

// HTTP rate limit middleware factory.
// e.g. rateLimitHttp({ capacity: 30, refillPerSec: 1, prefix: 'auth' })
function rateLimitHttp({ capacity = 60, refillPerSec = 1, prefix = '' } = {}) {
  return (req, res, next) => {
    const ip = clientIp(req);
    const key = `${prefix}:${ip}`;
    let b = httpBuckets.get(key);
    if (!b) {
      b = new TokenBucket(capacity, refillPerSec);
      httpBuckets.set(key, b);
    }
    if (!b.take()) {
      res.set('Retry-After', '2');
      return res.status(429).json({ error: 'rate limited' });
    }
    next();
  };
}

// WS message limiter. Apply on each incoming message.
function wsAllow(ws, { capacity = 30, refillPerSec = 8 } = {}) {
  let b = wsBuckets.get(ws);
  if (!b) {
    b = new TokenBucket(capacity, refillPerSec);
    wsBuckets.set(ws, b);
  }
  return b.take();
}

// Periodic GC for HTTP buckets (let them refill silently then drop)
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of httpBuckets) {
    if (now - b.last > 5 * 60_000 && b.tokens >= b.capacity) httpBuckets.delete(k);
  }
}, 60_000).unref?.();

module.exports = { rateLimitHttp, wsAllow };
