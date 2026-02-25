const express = require('express');
const router = express.Router();
const TrackingService = require('../services/tracking');

// ═══════════════════════════════════════
// POST /api/track/events
// Recebe batch de eventos do script frontend
// ═══════════════════════════════════════
router.post('/events', async (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];

    if (events.length === 0) {
      return res.status(400).json({ error: 'Nenhum evento recebido' });
    }

    if (events.length > 50) {
      return res.status(400).json({ error: 'Máximo 50 eventos por request' });
    }

    // Injetar dados server-side (IP e User Agent) em cada evento
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    for (const event of events) {
      event._server = { ip: clientIp, user_agent: userAgent };
    }

    const result = await TrackingService.processEvents(events);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Erro /track/events:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ═══════════════════════════════════════
// POST /api/track/match
// Vincular conversão externa com visitor
// Suporta match por phone, email ou instagram
// ═══════════════════════════════════════
router.post('/match', async (req, res) => {
  try {
    const { name, phone, email, instagram, source, value, product, payment, data } = req.body;

    if (!phone && !email && !instagram) {
      return res.status(400).json({ error: 'Informe phone, email ou instagram para fazer o match' });
    }

    const result = await TrackingService.matchConversion({
      name, phone, email, instagram, source, value, product, payment, data
    });

    res.json(result);
  } catch (err) {
    console.error('Erro /track/match:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;

