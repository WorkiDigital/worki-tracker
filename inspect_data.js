const { Pool } = require('pg');
const fs = require('fs');

async function inspect() {
    try {
        const env = fs.readFileSync('.env', 'utf8');
        const dbUrlMatch = env.match(/DATABASE_URL=(.+)/);
        if (!dbUrlMatch) {
            console.error('DATABASE_URL not found in .env');
            process.exit(1);
        }
        const dbUrl = dbUrlMatch[1].trim();
        const pool = new Pool({ connectionString: dbUrl });

        console.log('--- Resumo de Visitantes (últimos 10) ---');
        const visitors = await pool.query('SELECT visitor_id, name, email, phone FROM visitors ORDER BY created_at DESC LIMIT 10');
        console.table(visitors.rows);

        console.log('\n--- Últimos 5 Eventos form_submit ---');
        const events = await pool.query("SELECT visitor_id, data FROM events WHERE event_type = 'form_submit' ORDER BY created_at DESC LIMIT 5");

        events.rows.forEach(row => {
            console.log(`Visitor ID: ${row.visitor_id}`);
            console.log('Data:', JSON.stringify(row.data, null, 2));
            console.log('-----------------------------------');
        });

        await pool.end();
    } catch (e) {
        console.error(e);
    }
}

inspect();
