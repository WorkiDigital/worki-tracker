require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ═══════════════════════════════════════════
// MIGRAÇÃO v2.0 — Adiciona campos Meta Ads,
// Instagram e localização ao banco existente
// ═══════════════════════════════════════════

const alterations = [
    // Visitors — Instagram
    `ALTER TABLE visitors ADD COLUMN IF NOT EXISTS instagram VARCHAR(100)`,

    // Visitors — Meta Ads Tracking
    `ALTER TABLE visitors ADD COLUMN IF NOT EXISTS fbclid TEXT`,
    `ALTER TABLE visitors ADD COLUMN IF NOT EXISTS fbc TEXT`,
    `ALTER TABLE visitors ADD COLUMN IF NOT EXISTS fbp TEXT`,
    `ALTER TABLE visitors ADD COLUMN IF NOT EXISTS client_ip VARCHAR(50)`,
    `ALTER TABLE visitors ADD COLUMN IF NOT EXISTS client_user_agent TEXT`,

    // Visitors — Localização
    `ALTER TABLE visitors ADD COLUMN IF NOT EXISTS city VARCHAR(100)`,
    `ALTER TABLE visitors ADD COLUMN IF NOT EXISTS state VARCHAR(50)`,
    `ALTER TABLE visitors ADD COLUMN IF NOT EXISTS country VARCHAR(10)`,

    // Sessions — Meta Ads
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fbc TEXT`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fbp TEXT`,

    // WhatsApp Messages — Click-to-WhatsApp
    `ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS ctwa_clid TEXT`,

    // Novos índices
    `CREATE INDEX IF NOT EXISTS idx_visitors_instagram ON visitors(instagram)`,
    `CREATE INDEX IF NOT EXISTS idx_visitors_fbc ON visitors(fbc)`,
    `CREATE INDEX IF NOT EXISTS idx_visitors_fbp ON visitors(fbp)`,
    `CREATE INDEX IF NOT EXISTS idx_whatsapp_ctwa ON whatsapp_messages(ctwa_clid)`,
];

async function upgrade() {
    console.log('🔄 Rodando migração v2.0 (upgrade)...\n');

    try {
        for (const sql of alterations) {
            await pool.query(sql);
            const label = sql.match(/ADD COLUMN.*?(\w+)\s|CREATE INDEX.*?(\w+)\sON/);
            console.log(`  ✅ ${label ? (label[1] || label[2]) : 'OK'}`);
        }
        console.log('\n🎉 Migração v2.0 completa! Novos campos:');
        console.log('   • visitors: instagram, fbclid, fbc, fbp, client_ip, client_user_agent, city, state, country');
        console.log('   • sessions: fbc, fbp');
        console.log('   • whatsapp_messages: ctwa_clid');
        console.log('   • 4 novos índices\n');
    } catch (err) {
        console.error('❌ Erro na migração:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

upgrade();
