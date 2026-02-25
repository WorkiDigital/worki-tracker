require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migration = `

-- ═══════════════════════════════════════════
-- WORKI TRACKER — Database Schema v2.0
-- Inclui dados Meta Ads, Instagram e localização
-- ═══════════════════════════════════════════

-- Visitantes únicos
CREATE TABLE IF NOT EXISTS visitors (
  id SERIAL PRIMARY KEY,
  visitor_id VARCHAR(100) UNIQUE NOT NULL,
  fingerprint VARCHAR(50),
  
  -- Dados identificados (preenchidos quando faz identify/form)
  name VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(30),
  empresa VARCHAR(200),
  instagram VARCHAR(100),
  
  -- Meta Ads Tracking (CAPI)
  fbclid TEXT,
  fbc TEXT,
  fbp TEXT,
  client_ip VARCHAR(50),
  client_user_agent TEXT,
  
  -- Localização (GeoIP / Formulário)
  city VARCHAR(100),
  state VARCHAR(50),
  country VARCHAR(10),
  zip_code VARCHAR(20),
  
  -- Primeira visita
  first_seen TIMESTAMP DEFAULT NOW(),
  first_utm_source VARCHAR(100),
  first_utm_medium VARCHAR(100),
  first_utm_campaign VARCHAR(200),
  first_referrer TEXT,
  
  -- Device
  device_type VARCHAR(20),
  device_os VARCHAR(50),
  device_browser VARCHAR(50),
  device_screen VARCHAR(20),
  
  -- Métricas agregadas
  total_visits INTEGER DEFAULT 1,
  total_pageviews INTEGER DEFAULT 0,
  total_time_seconds INTEGER DEFAULT 0,
  max_scroll_depth INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(20) DEFAULT 'visiting',
  -- visiting, returning, identified, converted, abandoned
  
  -- Conversão
  converted BOOLEAN DEFAULT FALSE,
  conversion_value DECIMAL(12,2),
  conversion_source VARCHAR(100),
  conversion_date TIMESTAMP,
  days_to_convert INTEGER,
  
  -- WhatsApp
  whatsapp_contacted BOOLEAN DEFAULT FALSE,
  whatsapp_date TIMESTAMP,
  
  last_seen TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Todos os eventos (timeline completa)
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  visitor_id VARCHAR(100) NOT NULL,
  session_id VARCHAR(100),
  
  event_type VARCHAR(50) NOT NULL,
  -- pageview, click, scroll, form_submit, identify, 
  -- conversion, whatsapp_contact, heartbeat, exit_intent, page_exit
  
  page VARCHAR(500),
  url TEXT,
  
  -- Dados do evento (JSON flexível)
  data JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sessões
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100) UNIQUE NOT NULL,
  visitor_id VARCHAR(100) NOT NULL,
  
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(200),
  utm_term VARCHAR(200),
  utm_content VARCHAR(200),
  referrer TEXT,
  
  -- Meta Ads
  fbc TEXT,
  fbp TEXT,
  
  device_type VARCHAR(20),
  
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration_seconds INTEGER DEFAULT 0,
  pageviews INTEGER DEFAULT 0
);

-- Conversões (registro detalhado)
CREATE TABLE IF NOT EXISTS conversions (
  id SERIAL PRIMARY KEY,
  visitor_id VARCHAR(100) NOT NULL,
  
  source VARCHAR(100),
  -- website, bio_link, whatsapp, instagram, manual
  
  value DECIMAL(12,2),
  product VARCHAR(300),
  payment VARCHAR(50),
  order_id VARCHAR(100),
  
  -- Dados extras
  data JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Mensagens WhatsApp (do webhook Evolution)
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id SERIAL PRIMARY KEY,
  visitor_id VARCHAR(100),
  
  phone VARCHAR(30) NOT NULL,
  push_name VARCHAR(200),
  message TEXT,
  from_me BOOLEAN DEFAULT FALSE,
  
  -- Click-to-WhatsApp (atribuição Meta Ads)
  ctwa_clid TEXT,
  
  -- Dados brutos do webhook
  raw_data JSONB DEFAULT '{}',
  
  matched BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ═══════════════════════════════════════════
-- UPGRADE SCHEMA (Garante colunas v2 para bancos legados)
-- ═══════════════════════════════════════════

-- Visitors
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS instagram VARCHAR(100);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS fbclid TEXT;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS fbc TEXT;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS fbp TEXT;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS client_ip VARCHAR(50);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS client_user_agent TEXT;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS state VARCHAR(50);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS country VARCHAR(10);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);

-- Sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fbc TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fbp TEXT;

-- WhatsApp Messages
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS ctwa_clid TEXT;

-- ═══════════════════════════════════════════
-- ÍNDICES para performance
-- ═══════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_visitors_visitor_id ON visitors(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitors_phone ON visitors(phone);
CREATE INDEX IF NOT EXISTS idx_visitors_email ON visitors(email);
CREATE INDEX IF NOT EXISTS idx_visitors_status ON visitors(status);
CREATE INDEX IF NOT EXISTS idx_visitors_fingerprint ON visitors(fingerprint);
CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON visitors(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_instagram ON visitors(instagram);
CREATE INDEX IF NOT EXISTS idx_visitors_fbc ON visitors(fbc);
CREATE INDEX IF NOT EXISTS idx_visitors_fbp ON visitors(fbp);

CREATE INDEX IF NOT EXISTS idx_events_visitor_id ON events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);

CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_session ON sessions(session_id);

CREATE INDEX IF NOT EXISTS idx_conversions_visitor ON conversions(visitor_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_phone ON whatsapp_messages(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_visitor ON whatsapp_messages(visitor_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_ctwa ON whatsapp_messages(ctwa_clid);

`;

async function migrate() {
  console.log('🔄 Rodando migração...\n');

  try {
    await pool.query(migration);
    console.log('✅ Tabelas criadas com sucesso:');
    console.log('   • visitors');
    console.log('   • events');
    console.log('   • sessions');
    console.log('   • conversions');
    console.log('   • whatsapp_messages');
    console.log('\n✅ Índices criados');
    console.log('\n🎉 Migração completa!\n');
  } catch (err) {
    console.error('❌ Erro na migração:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
