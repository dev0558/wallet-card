// Express app factory. server.js wires in real config; tests inject mocks.
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeCard, cleanText, FIELD_LIMITS } from '../public/fields.js';
import { normalizeHex, DEFAULT_COLORS } from '../public/colors.js';
import { enhanceCard, EnhanceError, DEFAULT_MODEL } from './claude.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * @param {object} opts
 * @param {object|null} opts.anthropic   Anthropic client, or null when no API key
 * @param {string} [opts.model]
 * @param {number} [opts.rateLimitPerMinute]
 * @param {boolean|string} [opts.trustProxy]  forwarded to app.set('trust proxy')
 * @param {(err: Error) => void} [opts.logError]
 */
export function createApp({
  anthropic = null,
  model = DEFAULT_MODEL,
  rateLimitPerMinute = 20,
  trustProxy = 'loopback',
  logError = (err) => console.error('[wallet-card]', err?.message || err),
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Local tunnels (ngrok/cloudflared) connect from loopback and set X-Forwarded-For.
  app.set('trust proxy', trustProxy);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    next();
  });

  const api = express.Router();
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: rateLimitPerMinute,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests. Try again in a minute.' },
    }),
  );
  api.use(express.json({ limit: '600kb', strict: true }));
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.get('/health', (req, res) => {
    res.json({ claude: Boolean(anthropic), model: anthropic ? model : null });
  });

  api.post('/enhance', async (req, res, next) => {
    if (!anthropic) {
      return res.status(503).json({ error: 'Claude is not configured on this server (ANTHROPIC_API_KEY is missing).' });
    }
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Expected a JSON object.' });
    }
    if (!body.card || typeof body.card !== 'object' || Array.isArray(body.card)) {
      return res.status(400).json({ error: 'Missing "card" object.' });
    }
    if (body.vibe !== undefined && typeof body.vibe !== 'string') {
      return res.status(400).json({ error: '"vibe" must be a string.' });
    }

    const { card, errors } = sanitizeCard(body.card, { keepPhoto: false });
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Some fields are invalid.', fields: errors });
    }
    const rawColors = body.card.colors && typeof body.card.colors === 'object' ? body.card.colors : {};
    card.colors = {
      background: normalizeHex(rawColors.background) || DEFAULT_COLORS.background,
      foreground: normalizeHex(rawColors.foreground) || DEFAULT_COLORS.foreground,
      label: normalizeHex(rawColors.label) || DEFAULT_COLORS.label,
    };
    const vibe = cleanText(body.vibe, FIELD_LIMITS.vibe);

    try {
      const result = await enhanceCard(anthropic, { card, vibe, model });
      res.json(result);
    } catch (err) {
      if (err instanceof EnhanceError) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  });

  api.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // JSON body errors and anything unexpected. Never leak internals.
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON.' });
    logError(err);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  app.use('/api', api);

  app.use(
    express.static(PUBLIC_DIR, {
      index: 'index.html',
      dotfiles: 'ignore',
      setHeaders(res, filePath) {
        const base = path.basename(filePath);
        if (base === 'sw.js' || base === 'index.html' || base === 'manifest.webmanifest') {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
        if (base.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      },
    }),
  );

  app.use((req, res) => res.status(404).type('text/plain').send('Not found'));

  return app;
}
