require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const alterations = [
    // Visitors — Adicionando CEP (Zip Code)
    `ALTER TABLE visitors ADD COLUMN IF NOT EXISTS zip_code VARCHAR(30)`,
];

async function upgrade() {
    console.log('🔄 Rodando migração v3.0 (Zip Code)...\n');

    try {
        for (const sql of alterations) {
            await pool.query(sql);
            console.log(`  ✅ SQL Executado: ${sql.substring(0, 50)}...`);
        }
        console.log('\n🎉 Migração v3.0 completa!\n');
    } catch (err) {
        console.error('❌ Erro na migração:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

upgrade();
