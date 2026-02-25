require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const trackRoutes = require('./routes/track');
const webhookRoutes = require('./routes/webhook');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Proxy (necessário para rate-limit atrás de Nginx/EasyPanel)
app.set('trust proxy', 1);

// ═══════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════

// Segurança
app.use(helmet({
  contentSecurityPolicy: false, // Dashboard usa inline scripts
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Compressão
app.use(compression());

// CORS — permite requests do script na landing page
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: function (origin, callback) {
    // Permite requests sem origin (server-to-server, webhooks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('CORS bloqueado'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Webhook-Secret'],
}));

// Body parser
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const trackLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 120, // 120 requests por minuto por IP
  message: { error: 'Rate limit excedido' }
});

const dashboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Rate limit excedido' }
});

// ═══════════════════════════════════════
// ROTAS
// ═══════════════════════════════════════

// Tracking (recebe eventos do frontend)
app.use('/api/track', trackLimiter, trackRoutes);

// Webhook WhatsApp (sem rate limit severo)
app.use('/api/webhook', webhookRoutes);

// Dashboard API (com autenticação)
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
    version: '1.0.0',
    endpoints: {
      track_events: 'POST /api/track/events',
      track_match: 'POST /api/track/match',
      webhook_whatsapp: 'POST /api/webhook/whatsapp',
      dashboard_stats: 'GET /api/dashboard/stats',
      dashboard_leads: 'GET /api/dashboard/leads',
      dashboard_journey: 'GET /api/dashboard/leads/:id/journey',
      dashboard_ui: 'GET /dashboard/',
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
