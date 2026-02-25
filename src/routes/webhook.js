const express = require('express');
const router = express.Router();
const TrackingService = require('../services/tracking');

// ═══════════════════════════════════════
// POST /api/webhook/whatsapp
// Recebe webhooks da Evolution API
// ═══════════════════════════════════════
router.post('/whatsapp', async (req, res) => {
  try {
    const payload = req.body;

    // Validar secret se configurado
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && req.headers['x-webhook-secret'] !== secret) {
      return res.status(401).json({ error: 'Secret inválido' });
    }

    // Verificar se é evento de mensagem
    const event = payload.event || '';
    if (!event.includes('messages') && !event.includes('MESSAGES')) {
      // Eventos que não são mensagens (status, presence, etc) — ignorar
      return res.json({ ok: true, ignored: true, event });
    }

    const result = await TrackingService.processWhatsAppWebhook(payload);

    if (result.matched) {
      console.log(`✅ WhatsApp match: ${result.visitor_id} (phone: ${payload.data?.key?.remoteJid})`);
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('Erro webhook WhatsApp:', err);
    // Sempre retorna 200 pro webhook não ficar retentando
    res.json({ ok: false, error: err.message });
  }
});

module.exports = router;
