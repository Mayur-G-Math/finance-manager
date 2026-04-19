import compression from 'compression';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import analyticsRoutes from './routes/analytics.js';
import transactionRoutes from './routes/transactions.js';
import { env } from './config/supabase.js';
import { authenticateRequest } from './middleware/authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '..', 'frontend');
const isProduction = process.env.NODE_ENV === 'production';

const app = express();

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false
});

function issueCsrfToken(req, res) {
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie('csrf_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
  });
  return token;
}

function enforceCsrf(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const cookieToken = req.cookies.csrf_token;
    const headerToken = req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return res.status(403).json({ error: 'Invalid CSRF token.' });
    }
  }

  return next();
}

app.disable('x-powered-by');
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", env.supabaseUrl, 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"]
      }
    }
  })
);

app.use(express.static(frontendPath));

app.get('/api/health', authLimiter, (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/config', authLimiter, (_req, res) => {
  res.json({
    supabaseUrl: env.supabaseUrl,
    supabaseAnonKey: env.supabaseAnonKey,
    currency: env.currency
  });
});

app.get('/api/csrf-token', authLimiter, (_req, res) => {
  res.json({ csrfToken: issueCsrfToken(_req, res) });
});

app.use('/api/transactions', apiLimiter, authenticateRequest, enforceCsrf, transactionRoutes);
app.use('/api/analytics', apiLimiter, authenticateRequest, enforceCsrf, analyticsRoutes);

app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'login.html'));
});

app.get('/signup', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'signup.html'));
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'dashboard.html'));
});

app.use((err, _req, res, next) => {
  if (err) {
    return res.status(500).json({ error: err.message || 'Unexpected server error.' });
  }

  return next();
});

if (!process.env.VERCEL) {
  app.listen(env.port, () => {
    console.log(`Finora server running on ${env.appUrl}`);
  });
}

export default app;
