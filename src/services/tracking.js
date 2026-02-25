const db = require('../db');
const metaService = require('./meta');
const geoService = require('./geo');

const TrackingService = {

  // ═══════════════════════════════════════
  // PROCESSAR BATCH DE EVENTOS
  // ═══════════════════════════════════════
  async processEvents(events) {
    const results = { processed: 0, errors: 0 };

    for (const event of events) {
      try {
        // 1. Garantir que o visitor existe
        await this.upsertVisitor(event);

        // 2. Salvar evento
        await db.query(
          `INSERT INTO events (visitor_id, session_id, event_type, page, url, data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [event.visitor_id, event.session_id, event.event, event.page, event.url, JSON.stringify(event.data || {})]
        );

        // 3. Processar por tipo
        switch (event.event) {
          case 'pageview':
            await this.processPageview(event);
            break;
          case 'scroll':
            await this.processScroll(event);
            break;
          case 'click':
            await this.processClick(event);
            break;
          case 'form_submit':
            await this.processFormSubmit(event);
            break;
          case 'identify':
            await this.processIdentify(event);
            break;
          case 'conversion':
            await this.processConversion(event);
            break;
          case 'page_exit':
            await this.processPageExit(event);
            break;
        }

        results.processed++;
      } catch (err) {
        console.error(`Erro processando evento ${event.event}:`, err.message);
        results.errors++;
      }
    }

    return results;
  },

  // ═══════════════════════════════════════
  // GET VALUE (Case-Insensitive helper)
  // ═══════════════════════════════════════
  getVal(obj, aliases) {
    if (!obj || typeof obj !== 'object') return null;
    const keys = Object.keys(obj);
    for (const alias of aliases) {
      const foundKey = keys.find(k => k.toLowerCase() === alias.toLowerCase());
      if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null && obj[foundKey] !== '') {
        return obj[foundKey];
      }
    }
    return null;
  },

  // ═══════════════════════════════════════
  // NORMALIZAR INSTAGRAM
  // ═══════════════════════════════════════
  normalizeInstagram(value) {
    if (!value) return null;
    let ig = value.trim();
    // Remove URL do Instagram se colaram o link completo
    ig = ig.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
    // Remove @ do início se existir
    ig = ig.replace(/^@/, '');
    // Remove barra final e parâmetros
    ig = ig.replace(/[/?].*$/, '');
    // Retorna com @ na frente, padronizado
    return ig ? `@${ig.toLowerCase()}` : null;
  },

  // ═══════════════════════════════════════
  // UPSERT VISITOR
  // ═══════════════════════════════════════
  async upsertVisitor(event) {
    const existing = await db.one(
      'SELECT id, total_visits FROM visitors WHERE visitor_id = $1',
      [event.visitor_id]
    );

    if (!existing) {
      const utm = event.data?.utm || {};
      const device = event.data?.device || {};
      const meta = event.data?.meta || {};
      const server = event._server || {};

      // Captura Meta Resiliente (pode vir no meta ou solto no data)
      const fbclid = meta.fbclid || event.data?.fbclid || null;
      const fbc = meta.fbc || event.data?.fbc || null;
      const fbp = meta.fbp || event.data?.fbp || null;

      // Consulta Geolocalização
      const geo = await geoService.lookup(server.ip);

      await db.query(
        `INSERT INTO visitors (
          visitor_id, fingerprint, 
          first_utm_source, first_utm_medium, first_utm_campaign, first_referrer, 
          device_type, device_os, device_browser, device_screen,
          fbclid, fbc, fbp, client_ip, client_user_agent,
          city, state, country, zip_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (visitor_id) DO NOTHING`,
        [
          event.visitor_id, event.fingerprint,
          utm.source, utm.medium, utm.campaign, event.data?.referrer,
          device.type, device.os, device.browser, device.screen,
          fbclid, fbc, fbp,
          server.ip || null, server.user_agent || null,
          geo?.city || null, geo?.state || null, geo?.country || null, geo?.zip_code || null
        ]
      );
    } else {
      // Atualizar campos Meta se ainda não existem + Verificar IP para Geo se mudou
      const meta = event.data?.meta || {};
      const server = event._server || {};

      // Captura Meta Resiliente
      const fbclid = meta.fbclid || event.data?.fbclid || null;
      const fbc = meta.fbc || event.data?.fbc || null;
      const fbp = meta.fbp || event.data?.fbp || null;

      await db.query(
        `UPDATE visitors SET 
          last_seen = NOW(), 
          updated_at = NOW(),
          fbclid = COALESCE(fbclid, $2),
          fbc = COALESCE(fbc, $3),
          fbp = COALESCE(fbp, $4),
          client_ip = COALESCE($5, client_ip),
          client_user_agent = COALESCE($6, client_user_agent)
         WHERE visitor_id = $1`,
        [
          event.visitor_id,
          fbclid, fbc, fbp,
          server.ip || null, server.user_agent || null
        ]
      );

      // Se o visitor existe mas não tem cidade, tenta capturar
      const v = await db.one('SELECT city, client_ip FROM visitors WHERE visitor_id = $1', [event.visitor_id]);
      if (!v.city && server.ip) {
        const geoUpdate = await geoService.lookup(server.ip);
        if (geoUpdate) {
          await db.query(
            'UPDATE visitors SET city = $2, state = $3, country = $4, zip_code = $5 WHERE visitor_id = $1',
            [event.visitor_id, geoUpdate.city, geoUpdate.state, geoUpdate.country, geoUpdate.zip_code]
          );
        }
      }
    }
  },

  // ═══════════════════════════════════════
  // PROCESSAR PAGEVIEW
  // ═══════════════════════════════════════
  async processPageview(event) {
    const utm = event.data?.utm || {};
    const meta = event.data?.meta || {};

    // Upsert session (agora com fbc e fbp)
    await db.query(
      `INSERT INTO sessions (session_id, visitor_id, utm_source, utm_medium, utm_campaign, 
       utm_term, utm_content, referrer, fbc, fbp, device_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (session_id) DO UPDATE SET pageviews = sessions.pageviews + 1`,
      [
        event.session_id, event.visitor_id,
        utm.source, utm.medium, utm.campaign, utm.term, utm.content,
        event.data?.referrer,
        meta.fbc || null, meta.fbp || null,
        event.data?.device?.type
      ]
    );

    // Incrementar pageviews do visitor
    await db.query(
      `UPDATE visitors SET 
        total_pageviews = total_pageviews + 1,
        last_seen = NOW(),
        status = CASE 
          WHEN total_visits > 1 AND status = 'visiting' THEN 'returning'
          ELSE status 
        END
       WHERE visitor_id = $1`,
      [event.visitor_id]
    );

    // Verificar se é nova sessão (nova visita)
    const sessionCount = await db.one(
      'SELECT COUNT(DISTINCT session_id) as count FROM sessions WHERE visitor_id = $1',
      [event.visitor_id]
    );

    if (sessionCount) {
      await db.query(
        'UPDATE visitors SET total_visits = $1 WHERE visitor_id = $2',
        [parseInt(sessionCount.count), event.visitor_id]
      );
    }
  },

  // ═══════════════════════════════════════
  // PROCESSAR SCROLL
  // ═══════════════════════════════════════
  async processScroll(event) {
    const depth = parseInt(event.data?.depth) || 0;
    await db.query(
      'UPDATE visitors SET max_scroll_depth = GREATEST(max_scroll_depth, $1) WHERE visitor_id = $2',
      [depth, event.visitor_id]
    );
  },

  // ═══════════════════════════════════════
  // PROCESSAR CLICK
  // ═══════════════════════════════════════
  async processClick(event) {
    // Se clicou no WhatsApp, registrar
    if (event.data?.type === 'whatsapp_click' && event.data?.phone) {
      await db.query(
        `UPDATE visitors SET 
          whatsapp_contacted = TRUE,
          whatsapp_date = COALESCE(whatsapp_date, NOW()),
          phone = COALESCE(phone, $1)
         WHERE visitor_id = $2`,
        [event.data.phone, event.visitor_id]
      );
    }

    // Se clicou no telefone, salvar número
    if (event.data?.type === 'phone_click' && event.data?.phone) {
      await db.query(
        'UPDATE visitors SET phone = COALESCE(phone, $1) WHERE visitor_id = $2',
        [event.data.phone.replace(/\D/g, ''), event.visitor_id]
      );
    }
  },

  // ═══════════════════════════════════════
  // PROCESSAR FORM SUBMIT
  // Agora captura Instagram e localização
  // ═══════════════════════════════════════
  async processFormSubmit(event) {
    const fields = event.data?.fields || {};

    const name = this.getVal(fields, ['nome', 'name', 'first_name', 'p_nome']);
    const email = this.getVal(fields, ['email', 'e-mail', 'mail', 'p_email']);
    const phoneVal = this.getVal(fields, ['telefone', 'phone', 'tel', 'whatsapp', 'celular', 'mob', 'p_telefone']);
    const phone = phoneVal ? String(phoneVal).replace(/\D/g, '') : null;
    const empresa = this.getVal(fields, ['empresa', 'company', 'org', 'p_empresa']);
    const instagramVal = this.getVal(fields, ['instagram', 'ig', '@', 'insta', 'perfil', 'p_instagram']);
    const instagram = this.normalizeInstagram(instagramVal);
    const city = this.getVal(fields, ['cidade', 'city', 'p_cidade']);
    const state = this.getVal(fields, ['estado', 'state', 'uf', 'p_estado']);
    const zip_code = this.getVal(fields, ['cep', 'zip', 'postal_code', 'zip_code', 'p_cep']);

    await db.query(
      `UPDATE visitors SET 
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        empresa = COALESCE($4, empresa),
        instagram = COALESCE($5, instagram),
        city = COALESCE($6, city),
        state = COALESCE($7, state),
        zip_code = COALESCE($8, zip_code),
        status = CASE WHEN status IN ('visiting', 'returning') THEN 'identified' ELSE status END,
        updated_at = NOW()
       WHERE visitor_id = $9`,
      [name, email, phone, empresa, instagram, city, state, zip_code, event.visitor_id]
    );

    // Sync with Meta CAPI (Lead)
    try {
      const visitor = await this.getVisitor(event.visitor_id);
      await metaService.sendEvent('Lead', visitor, { url: event.url });
    } catch (e) {
      console.error('[CAPI] Trigger error:', e);
    }
  },

  // ═══════════════════════════════════════
  // PROCESSAR IDENTIFY
  // Agora suporta Instagram e localização
  // ═══════════════════════════════════════
  async processIdentify(event) {
    const d = event.data || {};

    const name = this.getVal(d, ['nome', 'name', 'first_name']);
    const email = this.getVal(d, ['email', 'e-mail', 'mail']);
    const phoneVal = this.getVal(d, ['telefone', 'phone', 'tel', 'whatsapp', 'celular']);
    const phone = phoneVal ? String(phoneVal).replace(/\D/g, '') : null;
    const instagram = this.normalizeInstagram(this.getVal(d, ['instagram', 'ig', '@']));

    await db.query(
      `UPDATE visitors SET 
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        empresa = COALESCE($4, empresa),
        instagram = COALESCE($5, instagram),
        city = COALESCE($6, city),
        state = COALESCE($7, state),
        country = COALESCE($8, country),
        zip_code = COALESCE($9, zip_code),
        status = CASE WHEN status IN ('visiting', 'returning') THEN 'identified' ELSE status END,
        updated_at = NOW()
       WHERE visitor_id = $10`,
      [
        name, email, phone, this.getVal(d, ['empresa', 'company']),
        instagram, this.getVal(d, ['city', 'cidade']), this.getVal(d, ['state', 'estado', 'uf']),
        this.getVal(d, ['country', 'pais']), this.getVal(d, ['zip_code', 'cep', 'zip']),
        event.visitor_id
      ]
    );
  },

  // ═══════════════════════════════════════
  // PROCESSAR CONVERSÃO
  // ═══════════════════════════════════════
  async processConversion(event) {
    const d = event.data || {};

    // Registrar conversão
    await db.query(
      `INSERT INTO conversions (visitor_id, source, value, product, payment, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [event.visitor_id, d.source, d.value, d.product, d.payment, JSON.stringify(d)]
    );

    // Atualizar visitor
    const visitor = await db.one('SELECT first_seen FROM visitors WHERE visitor_id = $1', [event.visitor_id]);
    const daysToConvert = visitor
      ? Math.ceil((Date.now() - new Date(visitor.first_seen).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    await db.query(
      `UPDATE visitors SET 
        converted = TRUE,
        conversion_value = $1,
        conversion_source = $2,
        conversion_date = NOW(),
        days_to_convert = $3,
        status = 'converted',
        updated_at = NOW()
       WHERE visitor_id = $4`,
      [d.value || 0, d.source, daysToConvert, event.visitor_id]
    );

    // Sync with Meta CAPI (CompleteRegistration)
    try {
      const visitor = await this.getVisitor(event.visitor_id);
      await metaService.sendEvent('CompleteRegistration', visitor, {
        url: event.url,
        value: d.value,
        product: d.product
      });
    } catch (e) {
      console.error('[CAPI] Trigger error:', e);
    }
  },

  async getVisitor(visitorId) {
    return db.one('SELECT * FROM visitors WHERE visitor_id = $1', [visitorId]);
  },

  // ═══════════════════════════════════════
  // PROCESSAR SAÍDA DA PÁGINA
  // ═══════════════════════════════════════
  async processPageExit(event) {
    const timeOnPage = event.data?.time_on_page || 0;
    await db.query(
      `UPDATE visitors SET 
        total_time_seconds = total_time_seconds + $1,
        updated_at = NOW()
       WHERE visitor_id = $2`,
      [timeOnPage, event.visitor_id]
    );

    // Atualizar sessão
    if (event.session_id) {
      await db.query(
        `UPDATE sessions SET 
          ended_at = NOW(),
          duration_seconds = duration_seconds + $1
         WHERE session_id = $2`,
        [timeOnPage, event.session_id]
      );
    }
  },

  // ═══════════════════════════════════════
  // MATCH — Vincular conversão externa
  // Agora suporta match por Instagram e atualização de Nome
  // ═══════════════════════════════════════
  async matchConversion({ name, phone, email, instagram, source, value, product, payment, data }) {
    // Normalizar inputs
    const cleanPhone = phone ? phone.replace(/\D/g, '') : null;
    const cleanIG = this.normalizeInstagram(instagram);

    // Buscar visitor por telefone, email ou instagram
    let visitor = null;

    if (cleanPhone) {
      visitor = await db.one(
        'SELECT visitor_id, first_seen FROM visitors WHERE phone = $1 ORDER BY last_seen DESC LIMIT 1',
        [cleanPhone]
      );
    }

    if (!visitor && email) {
      visitor = await db.one(
        'SELECT visitor_id, first_seen FROM visitors WHERE email = $1 ORDER BY last_seen DESC LIMIT 1',
        [email]
      );
    }

    if (!visitor && cleanIG) {
      visitor = await db.one(
        'SELECT visitor_id, first_seen FROM visitors WHERE instagram = $1 ORDER BY last_seen DESC LIMIT 1',
        [cleanIG]
      );
    }

    // Se não encontrou por dados do visitor, tenta por WhatsApp messages
    if (!visitor && cleanPhone) {
      const waMsg = await db.one(
        'SELECT visitor_id FROM whatsapp_messages WHERE phone = $1 AND visitor_id IS NOT NULL ORDER BY created_at DESC LIMIT 1',
        [cleanPhone]
      );
      if (waMsg) {
        visitor = await db.one(
          'SELECT visitor_id, first_seen FROM visitors WHERE visitor_id = $1',
          [waMsg.visitor_id]
        );
      }
    }

    if (!visitor) {
      return { matched: false, reason: 'Nenhum visitante encontrado com esse telefone/email/instagram' };
    }

    // Registrar conversão
    const daysToConvert = Math.ceil(
      (Date.now() - new Date(visitor.first_seen).getTime()) / (1000 * 60 * 60 * 24)
    );

    await db.query(
      `INSERT INTO conversions (visitor_id, source, value, product, payment, data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [visitor.visitor_id, source, value, product, payment, JSON.stringify(data || {})]
    );

    await db.query(
      `UPDATE visitors SET 
        converted = TRUE,
        conversion_value = $1,
        conversion_source = $2,
        conversion_date = NOW(),
        days_to_convert = $3,
        status = 'converted',
        name = COALESCE($4, name),
        updated_at = NOW()
       WHERE visitor_id = $5`,
      [value || 0, source, daysToConvert, name || null, visitor.visitor_id]
    );

    // Salvar evento na timeline
    await db.query(
      `INSERT INTO events (visitor_id, event_type, data)
       VALUES ($1, 'conversion', $2)`,
      [visitor.visitor_id, JSON.stringify({ source, value, product, payment, matched: true })]
    );

    return {
      matched: true,
      visitor_id: visitor.visitor_id,
      days_to_convert: daysToConvert
    };
  },

  // ═══════════════════════════════════════
  // WEBHOOK WHATSAPP (Evolution API)
  // Agora captura ctwa_clid para atribuição Meta Ads
  // ═══════════════════════════════════════
  async processWhatsAppWebhook(payload) {
    const data = payload.data || payload;
    const key = data.key || {};
    const remoteJid = key.remoteJid || '';
    const fromMe = key.fromMe || false;

    // Extrair número de telefone
    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    if (!phone || phone.length < 8) return { processed: false, reason: 'Número inválido' };

    const pushName = data.pushName || null;
    const message = data.message?.conversation
      || data.message?.extendedTextMessage?.text
      || '[mídia]';

    // Extrair ctwa_clid (Click-to-WhatsApp Attribution)
    const ctwaClid = data.contextInfo?.forwardedNewsletterMessageInfo?.ctwaClid
      || data.contextInfo?.ctwaContext?.sourceUrl?.match?.(/ctwa_clid=([^&]+)/)?.[1]
      || payload.ctwa_clid
      || null;

    // Salvar mensagem com ctwa_clid
    await db.query(
      `INSERT INTO whatsapp_messages (phone, push_name, message, from_me, ctwa_clid, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [phone, pushName, message, fromMe, ctwaClid, JSON.stringify(payload)]
    );

    // Tentar fazer match com visitor
    // 1. Por telefone no visitors
    let visitor = await db.one(
      'SELECT visitor_id FROM visitors WHERE phone = $1 ORDER BY last_seen DESC LIMIT 1',
      [phone]
    );

    // 2. Por clique no WhatsApp (evento com esse número)
    if (!visitor) {
      const clickEvent = await db.one(
        `SELECT visitor_id FROM events 
         WHERE event_type = 'click' AND data->>'phone' = $1
         ORDER BY created_at DESC LIMIT 1`,
        [phone]
      );
      if (clickEvent) visitor = clickEvent;
    }

    if (visitor) {
      // Vincular mensagem ao visitor
      await db.query(
        'UPDATE whatsapp_messages SET visitor_id = $1, matched = TRUE WHERE phone = $2 AND visitor_id IS NULL',
        [visitor.visitor_id, phone]
      );

      // Atualizar visitor
      await db.query(
        `UPDATE visitors SET 
          whatsapp_contacted = TRUE,
          whatsapp_date = COALESCE(whatsapp_date, NOW()),
          name = COALESCE($1, name),
          phone = COALESCE(phone, $2),
          updated_at = NOW()
         WHERE visitor_id = $3`,
        [pushName, phone, visitor.visitor_id]
      );

      // Evento na timeline
      await db.query(
        `INSERT INTO events (visitor_id, event_type, data)
         VALUES ($1, 'whatsapp_contact', $2)`,
        [visitor.visitor_id, JSON.stringify({ phone, pushName, message: message.substring(0, 200), fromMe, ctwaClid })]
      );

      return { processed: true, matched: true, visitor_id: visitor.visitor_id };
    }

    return { processed: true, matched: false, phone };
  },

  // ═══════════════════════════════════════
  // CONSULTAS — Dashboard
  // ═══════════════════════════════════════
  async getStats(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.start && filters.start !== '') {
      params.push(filters.start);
      where += ` AND first_seen >= $${params.length}::timestamp`;
    }
    if (filters.end && filters.end !== '') {
      params.push(filters.end);
      where += ` AND first_seen::date <= $${params.length}::date`;
    }
    if (filters.source) {
      params.push(filters.source === 'direto' ? null : filters.source);
      where += filters.source === 'direto' ? ` AND first_utm_source IS NULL` : ` AND first_utm_source = $${params.length}`;
    }
    if (filters.device) {
      params.push(filters.device);
      where += ` AND device_type = $${params.length}`;
    }

    const stats = await db.one(`
      SELECT
        COUNT(*) as total_visitors,
        COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '7 days') as active_7d,
        COUNT(*) FILTER (WHERE converted = TRUE) as conversions,
        COALESCE(SUM(conversion_value) FILTER (WHERE converted = TRUE), 0) as total_revenue,
        ROUND(AVG(days_to_convert) FILTER (WHERE converted = TRUE), 1) as avg_days_to_convert,
        ROUND(
          COUNT(*) FILTER (WHERE converted = TRUE)::numeric / 
          NULLIF(COUNT(*), 0) * 100, 1
        ) as conversion_rate,
        COUNT(*) FILTER (WHERE whatsapp_contacted = TRUE) as whatsapp_contacts,
        COUNT(*) FILTER (WHERE status NOT IN ('visiting', 'returning')) as identified_leads,
        COUNT(*) FILTER (WHERE instagram IS NOT NULL) as with_instagram,
        COUNT(*) FILTER (WHERE fbclid IS NOT NULL) as from_meta_ads
      FROM visitors
      ${where}
    `, params);

    const weekStats = await db.one(`
      SELECT
        COUNT(*) FILTER (WHERE first_seen > NOW() - INTERVAL '7 days') as new_this_week,
        COUNT(*) FILTER (WHERE first_seen > NOW() - INTERVAL '14 days' AND first_seen <= NOW() - INTERVAL '7 days') as new_last_week
      FROM visitors
      ${where}
    `, params);

    return { ...stats, ...weekStats };
  },

  async getLeads({ page = 1, limit = 50, status, search, sort = 'last_seen', order = 'DESC', filters = {} }) {
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    let params = [];
    let i = 1;

    if (status && status !== 'all') {
      where.push(`status = $${i++}`);
      params.push(status);
    }

    if (search) {
      where.push(`(name ILIKE $${i} OR email ILIKE $${i} OR phone ILIKE $${i} OR empresa ILIKE $${i} OR instagram ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }

    // Filtros globais
    if (filters.start && filters.start !== '') {
      params.push(filters.start);
      where.push(`first_seen >= $${i++}::timestamp`);
    }
    if (filters.end && filters.end !== '') {
      params.push(filters.end);
      where.push(`first_seen::date <= $${i++}::date`);
    }
    if (filters.source) {
      params.push(filters.source === 'direto' ? null : filters.source);
      if (filters.source === 'direto') {
        where.push(`first_utm_source IS NULL`);
      } else {
        where.push(`first_utm_source = $${i++}`);
      }
    }
    if (filters.device) {
      params.push(filters.device);
      where.push(`device_type = $${i++}`);
    }

    const whereClause = 'WHERE ' + where.join(' AND ');
    const allowedSorts = ['last_seen', 'first_seen', 'total_visits', 'total_pageviews', 'conversion_value'];
    const safeSort = allowedSorts.includes(sort) ? sort : 'last_seen';
    const safeOrder = order === 'ASC' ? 'ASC' : 'DESC';

    const leads = await db.many(
      `SELECT * FROM visitors ${whereClause}
       ORDER BY ${safeSort} ${safeOrder}
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );

    const total = await db.one(
      `SELECT COUNT(*) as count FROM visitors ${whereClause}`,
      params
    );

    return { leads, total: parseInt(total.count), page, limit };
  },

  async getLeadJourney(visitorId) {
    const visitor = await db.one(
      'SELECT * FROM visitors WHERE visitor_id = $1',
      [visitorId]
    );

    if (!visitor) return null;

    const events = await db.many(
      'SELECT * FROM events WHERE visitor_id = $1 ORDER BY created_at ASC',
      [visitorId]
    );

    const sessions = await db.many(
      'SELECT * FROM sessions WHERE visitor_id = $1 ORDER BY started_at ASC',
      [visitorId]
    );

    const conversions = await db.many(
      'SELECT * FROM conversions WHERE visitor_id = $1 ORDER BY created_at ASC',
      [visitorId]
    );

    const whatsappMessages = await db.many(
      'SELECT * FROM whatsapp_messages WHERE visitor_id = $1 ORDER BY created_at ASC',
      [visitorId]
    );

    return { visitor, events, sessions, conversions, whatsappMessages };
  },

  async getTopSources() {
    const s = await db.many(`
      SELECT 
        COALESCE(first_utm_source, 'direto') as source,
        COUNT(*) as visitors,
        COUNT(*) FILTER (WHERE converted = TRUE) as conversions,
        COALESCE(SUM(conversion_value) FILTER (WHERE converted = TRUE), 0) as revenue
      FROM visitors
      GROUP BY COALESCE(first_utm_source, 'direto')
      ORDER BY visitors DESC
      LIMIT 10
    `);
    return s;
  },

  // ═══════════════════════════════════════
  // NOVOS DADOS PARA GRÁFICOS
  // ═══════════════════════════════════════
  async getDashboardGraphs(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.start && filters.start !== '') {
      params.push(filters.start);
      where += ` AND v.first_seen >= $${params.length}::timestamp`;
    }
    if (filters.end && filters.end !== '') {
      params.push(filters.end);
      where += ` AND v.first_seen::date <= $${params.length}::date`;
    }
    if (filters.source) {
      if (filters.source === 'direto') {
        where += ` AND v.first_utm_source IS NULL`;
      } else {
        params.push(filters.source);
        where += ` AND v.first_utm_source = $${params.length}`;
      }
    }
    if (filters.device) {
      params.push(filters.device);
      where += ` AND v.device_type = $${params.length}`;
    }

    // Compensar índice dos parâmetros para o gráfico de linha ($1 e $2 são start/end)
    const graphWhere = where.replace(/\$(\d+)/g, (match, p1) => `$${parseInt(p1) + 2}`);

    // 1. TimeSeries: Série de dias
    const timeSeries = await db.many(`
      WITH days AS (
        SELECT d::date as day 
        FROM generate_series(
          COALESCE($1::timestamp, CURRENT_DATE - INTERVAL '14 days'),
          COALESCE($2::timestamp, CURRENT_DATE),
          '1 day'::interval
        ) AS d
      ),
      daily_visitors AS (
        SELECT v.first_seen::date as day, COUNT(*) as count 
        FROM visitors v 
        ${graphWhere} 
        GROUP BY 1
      ),
      daily_views AS (
        SELECT e.created_at::date as day, COUNT(*) as count 
        FROM events e 
        JOIN visitors v ON v.visitor_id = e.visitor_id
        ${graphWhere.replace(/v\.first_seen/g, 'e.created_at')} 
        AND e.event_type = 'pageview'
        GROUP BY 1
      )
      SELECT 
        TO_CHAR(days.day, 'DD/MM') as date,
        COALESCE(dv.count, 0) as new_visitors,
        COALESCE(dw.count, 0) as pageviews
      FROM days
      LEFT JOIN daily_visitors dv ON dv.day = days.day
      LEFT JOIN daily_views dw ON dw.day = days.day
      ORDER BY days.day ASC
    `, [filters.start || null, filters.end || null, ...params]);

    // 2. Distribuição por Dispositivo
    const devices = await db.many(`
      SELECT 
        COALESCE(v.device_type, 'outro') as label,
        COUNT(*) as value
      FROM visitors v
      ${where}
      GROUP BY v.device_type
      ORDER BY value DESC
    `, params);

    // 3. Top Fontes
    const sources = await db.many(`
      SELECT 
        COALESCE(v.first_utm_source, 'direto') as label,
        COUNT(*) as value
      FROM visitors v
      ${where}
      GROUP BY 1
      ORDER BY value DESC
      LIMIT 10
    `, params);

    // 4. FUNIL: Visitantes -> Identificados -> Convertidos
    const funnel = await db.one(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status NOT IN ('visiting', 'returning')) as identified,
        COUNT(*) FILTER (WHERE converted = TRUE) as converted
      FROM visitors v
      ${where}
    `, params);

    // 5. Localização
    const locations = await db.many(`
      SELECT 
        COALESCE(v.city, 'Desconhecido') as city,
        COALESCE(v.state, '??') as state,
        COUNT(*) as value
      FROM visitors v
      ${where}
      GROUP BY 1, 2
      ORDER BY value DESC
      LIMIT 10
    `, params);

    return { timeSeries, devices, sources, funnel, locations };
  },

  // ═══════════════════════════════════════
  // DELETAR UM LEAD ESPECÍFICO
  // ═══════════════════════════════════════
  async deleteLead(visitorId) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM conversions WHERE visitor_id = $1', [visitorId]);
      await client.query('DELETE FROM whatsapp_messages WHERE visitor_id = $1', [visitorId]);
      await client.query('DELETE FROM events WHERE visitor_id = $1', [visitorId]);
      await client.query('DELETE FROM sessions WHERE visitor_id = $1', [visitorId]);
      await client.query('DELETE FROM visitors WHERE visitor_id = $1', [visitorId]);
      await client.query('COMMIT');
      return { success: true, visitor_id: visitorId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ═══════════════════════════════════════
  // ATUALIZAR UM LEAD
  // ═══════════════════════════════════════
  async updateLead(visitorId, data) {
    const allowed = ['name', 'email', 'phone', 'empresa', 'instagram', 'status'];
    const sets = [];
    const params = [];
    let i = 1;

    for (const key of allowed) {
      if (data[key] !== undefined) {
        sets.push(`${key} = $${i++}`);
        params.push(data[key] || null);
      }
    }

    if (sets.length === 0) {
      return { success: false, reason: 'Nenhum campo válido para atualizar' };
    }

    sets.push(`updated_at = NOW()`);
    params.push(visitorId);

    await db.query(
      `UPDATE visitors SET ${sets.join(', ')} WHERE visitor_id = $${i}`,
      params
    );

    const updated = await db.one('SELECT * FROM visitors WHERE visitor_id = $1', [visitorId]);
    return { success: true, lead: updated };
  },

  // ═══════════════════════════════════════
  // DELETAR TODOS OS LEADS (RESET TOTAL)
  // ═══════════════════════════════════════
  async deleteAllLeads() {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '30s'");
      await client.query('TRUNCATE conversions, whatsapp_messages, events, sessions, visitors CASCADE');
      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
};

module.exports = TrackingService;
