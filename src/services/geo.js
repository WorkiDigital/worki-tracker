class GeoService {
    constructor() {
        this.baseUrl = 'http://ip-api.com/json/';
    }

    /**
     * Consulta geolocalização por IP
     * @param {string} ip 
     * @returns {Promise<object|null>}
     */
    async lookup(ip) {
        if (!ip || ip === '::1' || ip === '127.0.0.1') return null;

        try {
            console.log(`[Geo] Looking up IP: ${ip}`);
            const res = await fetch(`${this.baseUrl}${ip}?fields=status,message,countryCode,region,city,zip`);
            const data = await res.json();

            if (data.status === 'success') {
                return {
                    city: data.city,
                    state: data.region,
                    country: data.countryCode,
                    zip_code: data.zip
                };
            }
            console.warn(`[Geo] API returned status: ${data.status} for IP: ${ip}`);
            return null;
        } catch (e) {
            console.error('[Geo] error looking up IP:', e.message);
            return null;
        }
    }
}

module.exports = new GeoService();
