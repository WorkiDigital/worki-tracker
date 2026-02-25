const express = require('express');
const router = express.Router();
const TrackingService = require('../services/tracking');

// Middleware de autenticação para o dashboard
function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'API Key inválida' });
  }
  next();
}

router.use(authMiddleware);

// ═══════════════════════════════════════
// GET /api/dashboard/stats
// Estatísticas gerais
// ═══════════════════════════════════════
router.get('/stats', async (req, res) => {
  try {
    const { start, end, source, device } = req.query;
    const stats = await TrackingService.getStats({ start, end, source, device });
    res.json(stats);
  } catch (err) {
    console.error('Erro /dashboard/stats:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════
// GET /api/dashboard/leads
// Lista de leads com filtros
// ═══════════════════════════════════════
router.get('/leads', async (req, res) => {
  try {
    const { page, limit, status, search, sort, order, start, end, source, device } = req.query;
    const result = await TrackingService.getLeads({
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 50, 100),
      status,
      search,
      sort,
      order,
      filters: { start, end, source, device }
    });
    res.json(result);
  } catch (err) {
    console.error('Erro /dashboard/leads:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════
// GET /api/dashboard/leads/:visitorId/journey
// Jornada completa de um lead
// ═══════════════════════════════════════
router.get('/leads/:visitorId/journey', async (req, res) => {
  try {
    const journey = await TrackingService.getLeadJourney(req.params.visitorId);
    if (!journey) {
      return res.status(404).json({ error: 'Lead não encontrado' });
    }
    res.json(journey);
  } catch (err) {
    console.error('Erro /dashboard/leads/journey:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════
// GET /api/dashboard/sources
// Ranking de origens de tráfego
// ═══════════════════════════════════════
router.get('/sources', async (req, res) => {
  try {
    const sources = await TrackingService.getTopSources();
    res.json(sources);
  } catch (err) {
    console.error('Erro /dashboard/sources:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════
// POST /api/dashboard/leads/:visitorId/convert
// Marcar conversão manual
// ═══════════════════════════════════════
router.post('/leads/:visitorId/convert', async (req, res) => {
  try {
    const { source, value, product, payment } = req.body;
    const events = [{
      visitor_id: req.params.visitorId,
      event: 'conversion',
      data: { source: source || 'manual', value, product, payment }
    }];
    await TrackingService.processEvents(events);
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro convert manual:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════
// GET /api/dashboard/graphs
// Dados consolidados para gráficos
// ═══════════════════════════════════════
router.get('/graphs', async (req, res) => {
  try {
    const { start, end, source, device } = req.query;
    const data = await TrackingService.getDashboardGraphs({ start, end, source, device });
    res.json(data);
  } catch (err) {
    console.error('Erro /dashboard/graphs:', err);
    res.status(500).json({ error: 'Erro interno', message: err.message, stack: err.stack });
  }
});

module.exports = router;
