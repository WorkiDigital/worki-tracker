const crypto = require('crypto');
// Using native global fetch available in Node 18+

class MetaService {
    constructor() {
        this.pixelId = process.env.FB_PIXEL_ID;
        this.accessToken = process.env.FB_ACCESS_TOKEN;
        this.apiUrl = `https://graph.facebook.com/v18.0/${this.pixelId}/events?access_token=${this.accessToken}`;
    }

    hash(data) {
        if (!data) return null;
        return crypto.createHash('sha256').update(String(data).trim().toLowerCase()).digest('hex');
    }

    async sendEvent(event_name, visitor, eventData = {}) {
        if (!this.pixelId || !this.accessToken) return;

        try {
            const payload = {
                data: [{
                    event_name,
                    event_time: Math.floor(Date.now() / 1000),
                    action_source: 'website',
                    event_id: eventData.event_id || `${visitor.visitor_id}_${Date.now()}`,
                    event_source_url: eventData.url || '',
                    user_data: {
                        em: [this.hash(visitor.email)],
                        ph: [this.hash(visitor.phone)],
                        external_id: [this.hash(visitor.visitor_id)],
                        client_ip_address: visitor.client_ip,
                        client_user_agent: visitor.client_user_agent,
                        fbc: visitor.fbc || eventData.fbc,
                        fbp: visitor.fbp || eventData.fbp
                    },
                    custom_data: {
                        value: eventData.value,
                        currency: 'BRL',
                        content_name: eventData.product
                    }
                }]
            };

            console.log(`[CAPI] Sending ${event_name} for ${visitor.visitor_id}`);
            const res = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.error) console.error('[CAPI] Error:', data.error);
        } catch (e) {
            console.error('[CAPI] Sync error:', e);
        }
    }
}

module.exports = new MetaService();
