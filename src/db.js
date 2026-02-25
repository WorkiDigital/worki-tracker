const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ Erro inesperado no PostgreSQL:', err);
});

// Helper para queries
const db = {
  query: (text, params) => pool.query(text, params),
  
  // Busca um registro
  one: async (text, params) => {
    const res = await pool.query(text, params);
    return res.rows[0] || null;
  },
  
  // Busca vários registros
  many: async (text, params) => {
    const res = await pool.query(text, params);
    return res.rows;
  },

  pool
};

module.exports = db;
