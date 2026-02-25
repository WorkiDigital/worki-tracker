require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Proxy (necessário para rate-limit atrás de Nginx/EasyPanel)
app.set('trust proxy', 1);

const trackRoutes = require('./routes/track');
const dashboardRoutes = require('./routes/dashboard');
const webhookRoutes = require('./routes/webhook');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Configuração JWT
const JWT_SECRET = process.env.JWT_SECRET || 'worki-secret-key-2024';
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'admin123';

// ═══════════════════════════════════════
// MIDDLEWARE & CONFIG
// ═══════════════════════════════════════

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Logger de debug para Tracking
app.use((req, res, next) => {
  if (req.url.startsWith('/api/track')) {
    console.log(`📡 [INCOMING] ${req.method} ${req.url} | Origin: ${req.headers.origin || 'N/A'} | IP: ${req.ip}`);
  }
  next();
});

// Compressão
app.use(compression());

// CORS — permite requests do script na landing page e do próprio dashboard
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    // Permitir subdomínios ou o próprio domínio do host
    if (allowedOrigins.some(o => origin.startsWith(o)) || origin.includes('workidigital.tech')) {
      return callback(null, true);
    }
    callback(new Error('CORS bloqueado'));
  },
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Webhook-Secret', 'Authorization'],
}));

// Body parser
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Rate limit excedido' }
});

const dashboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Rate limit excedido' }
});

// ═══════════════════════════════════════
// AUTENTICAÇÃO
// ═══════════════════════════════════════

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Senha obrigatória' });
  }

  // No futuro podemos usar o bcrypt aqui, por enquanto simples comparação
  if (password === DASHBOARD_PASSWORD || password === process.env.API_KEY) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  }

  res.status(401).json({ error: 'Senha incorreta' });
});

// ═══════════════════════════════════════
// ROTAS
// ═══════════════════════════════════════

// Tracking (recebe eventos do frontend)
app.use('/api/track', trackLimiter, trackRoutes);

// Webhook WhatsApp
app.use('/api/webhook', webhookRoutes);

// Dashboard API (com autenticação JWT)
app.use('/api/dashboard', dashboardLimiter, dashboardRoutes);

// Dashboard frontend (arquivos estáticos)
app.use('/dashboard', express.static(path.join(__dirname, 'views')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    name: 'Worki Tracker API',
    version: '2.0.0',
    endpoints: {
      login: 'POST /api/auth/login',
      track_events: 'POST /api/track/events',
      track_match: 'POST /api/track/match',
      webhook_whatsapp: 'POST /api/webhook/whatsapp',
      dashboard_stats: 'GET /api/dashboard/stats',
      dashboard_leads: 'GET /api/dashboard/leads',
      dashboard_export: 'GET /api/dashboard/export',
      health: 'GET /health'
    }
  });
});

// ═══════════════════════════════════════
// ERROR HANDLER
// ═══════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('Erro:', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Erro interno' : err.message
  });
});

// ═══════════════════════════════════════
// START
// ═══════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  WORKI TRACKER — Backend v1.0.0');
  console.log('══════════════════════════════════════════');
  console.log(`  🚀 Servidor rodando na porta ${PORT}`);
  console.log(`  📊 Dashboard: http://localhost:${PORT}/dashboard/`);
  console.log(`  🔗 API: http://localhost:${PORT}/api/`);
  console.log(`  💚 Health: http://localhost:${PORT}/health`);
  console.log('══════════════════════════════════════════');
  console.log('');
});

module.exports = app;
