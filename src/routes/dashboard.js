const express = require('express');
const router = express.Router();
const TrackingService = require('../services/tracking');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'worki-secret-key-2024';

// Middleware de autenticação JWT para o dashboard
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // Fallback para API Key (apenas para compatibilidade temporária se necessário)
    const apiKey = req.headers['x-api-key'];
    if (apiKey === process.env.API_KEY) return next();

    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido ou expirado' });
    req.user = user;
    next();
  });
}

router.use(authMiddleware);

// ═══════════════════════════════════════
// GET /api/dashboard/export
// Exportar todos os leads em CSV
// ═══════════════════════════════════════
router.get('/export', async (req, res) => {
  try {
    const { start, end, status, source } = req.query;
    const csv = await TrackingService.getLeadsCSV({ start, end, status, source });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_worki.csv');
    res.send(csv);
  } catch (err) {
    console.error('Erro /dashboard/export:', err);
    res.status(500).json({ error: 'Erro ao gerar exportação' });
  }
});

// ═══════════════════════════════════════
// POST /api/dashboard/leads/bulk-delete
// Deletar leads em massa
// ═══════════════════════════════════════
router.post('/leads/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    const result = await TrackingService.bulkDeleteLeads(ids);
    res.json(result);
  } catch (err) {
    console.error('Erro /dashboard/leads/bulk-delete:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════
// PATCH /api/dashboard/leads/:visitorId/notes
// Atualizar notas internas do lead
// ═══════════════════════════════════════
router.patch('/leads/:visitorId/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await TrackingService.updateLeadNotes(req.params.visitorId, notes);
    res.json(result);
  } catch (err) {
    console.error('Erro PATCH /dashboard/leads/notes:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

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
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════
// DELETE /api/dashboard/leads/:visitorId
// Deletar um lead específico
// ═══════════════════════════════════════
router.delete('/leads/:visitorId', async (req, res) => {
  try {
    console.log(`🗑️ [DASHBOARD] Deletando lead: ${req.params.visitorId}`);
    const result = await TrackingService.deleteLead(req.params.visitorId);
    res.json(result);
  } catch (err) {
    console.error('Erro DELETE /api/dashboard/leads/:id:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════
// PUT /api/dashboard/leads/:visitorId
// Atualizar dados de um lead
// ═══════════════════════════════════════
router.put('/leads/:visitorId', async (req, res) => {
  try {
    console.log(`✏️ [DASHBOARD] Atualizando lead: ${req.params.visitorId}`);
    const result = await TrackingService.updateLead(req.params.visitorId, req.body);
    res.json(result);
  } catch (err) {
    console.error('Erro PUT /api/dashboard/leads/:id:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════
// DELETE /api/dashboard/leads
// Limpar todos os dados (Reset Total)
// ═══════════════════════════════════════
router.delete('/leads', async (req, res) => {
  try {
    console.log('⚠️ [DASHBOARD] Solicitação de RESET TOTAL de dados iniciada.');
    const result = await TrackingService.deleteAllLeads();
    console.log('✅ [DASHBOARD] Dados limpos com sucesso.');
    res.json(result);
  } catch (err) {
    console.error('Erro DELETE /api/dashboard/leads:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;

