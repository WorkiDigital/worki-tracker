const fs = require('fs');
const { Pool } = require('pg');

// Manual .env parse
const env = fs.readFileSync('.env', 'utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();

const pool = new Pool({ connectionString: dbUrl });
const db = {
    query: (text, params) => pool.query(text, params),
    one: async (text, params) => {
        const res = await pool.query(text, params);
        return res.rows[0] || null;
    },
    many: async (text, params) => {
        const res = await pool.query(text, params);
        return res.rows;
    }
};

const TrackingService = {
    async getDashboardGraphs(filters = {}) {
        let where = 'WHERE 1=1';
        const params = [];

        if (filters.start) {
            params.push(filters.start);
            where += ` AND v.first_seen >= $${params.length}`;
        }
        if (filters.end) {
            params.push(filters.end);
            where += ` AND v.first_seen::date <= $${params.length}`;
        }

        const graphWhere = where.replace(/\$(\d+)/g, (match, p1) => `$${parseInt(p1) + 2}`);

        const q = `
      WITH days AS (
        SELECT day::date as day 
        FROM generate_series(
          COALESCE($1::timestamp, CURRENT_DATE - INTERVAL '14 days'),
          COALESCE($2::timestamp, CURRENT_DATE),
          '1 day'::interval
        ) day
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
    `;

        try {
            console.log('Executing TimeSeries...');
            const timeSeries = await db.many(q, [filters.start || null, filters.end || null, ...params]);
            console.log('TimeSeries Success:', timeSeries.length, 'rows');

            console.log('Executing Devices...');
            const devices = await db.many(`
        SELECT 
          COALESCE(v.device_type, 'outro') as label,
          COUNT(*) as value
        FROM visitors v
        ${where}
        GROUP BY 1
        ORDER BY value DESC
      `, params);
            console.log('Devices Success:', devices.length, 'rows');

            return { timeSeries, devices };
        } catch (e) {
            console.error('SQL ERROR:', e.message);
            console.error('QUERY:', q);
            throw e;
        }
    }
};

async function test() {
    try {
        await TrackingService.getDashboardGraphs({});
        console.log('TEST PASSED!');
    } catch (e) {
        process.exit(1);
    } finally {
        await pool.end();
    }
}

test();
