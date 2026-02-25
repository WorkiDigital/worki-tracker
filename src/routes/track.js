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
// ═══════════════════════════════════════
router.post('/match', async (req, res) => {
  try {
    const { phone, email, source, value, product, payment, data } = req.body;

    if (!phone && !email) {
      return res.status(400).json({ error: 'Informe phone ou email para fazer o match' });
    }

    const result = await TrackingService.matchConversion({
      phone, email, source, value, product, payment, data
    });

    res.json(result);
  } catch (err) {
    console.error('Erro /track/match:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
