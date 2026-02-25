# Worki Tracker — Backend

Sistema de rastreamento de jornada de leads com dashboard, webhook WhatsApp (Evolution API) e API de match para conversões externas.

## Deploy no EasyPanel (Passo a Passo)

### 1. Criar o banco PostgreSQL

No EasyPanel:
- Clique em **"+ New"** → **"Database"** → **"PostgreSQL"**
- Nome: `worki-tracker-db`
- Anote a **connection string** que o EasyPanel gerar (será algo como):
  ```
  postgresql://postgres:SENHA@worki-tracker-db:5432/postgres
  ```

### 2. Criar o serviço da API

No EasyPanel:
- Clique em **"+ New"** → **"App"**
- Nome: `worki-tracker`
- **Source**: 
  - Se usar GitHub: conecte o repo e selecione
  - Se upload manual: faça zip desta pasta e faça upload

### 3. Configurar variáveis de ambiente

Na aba **"Environment"** do serviço, adicione:

```
PORT=3000
NODE_ENV=production
DATABASE_URL=postgresql://postgres:SENHA@worki-tracker-db:5432/postgres
ALLOWED_ORIGINS=https://seusite.com.br,https://www.seusite.com.br
API_KEY=gere-uma-chave-segura-aqui
EVOLUTION_API_URL=https://sua-evolution.com
EVOLUTION_API_KEY=sua-api-key
EVOLUTION_INSTANCE=sua-instancia
```

> **Para gerar a API_KEY**, use: `openssl rand -hex 32`

### 4. Configurar domínio

Na aba **"Domains"**:
- Adicione: `tracker.seusite.com.br` (ou o subdomínio que preferir)
- Ative HTTPS

### 5. Deploy

Clique em **"Deploy"**. O Dockerfile vai:
1. Instalar dependências
2. Rodar a migração (criar tabelas)
3. Iniciar o servidor

### 6. Verificar

Acesse: `https://tracker.seusite.com.br/health`

Deve retornar:
```json
{"status": "ok", "uptime": 5.123, "timestamp": "2026-02-25T..."}
```

---

## Configurar o Script na Landing Page

No `<head>` da sua landing page, altere o endpoint:

```javascript
const CONFIG = {
  endpoint: 'https://tracker.seusite.com.br/api/track',
  // ... resto da config
};
```

---

## Configurar Webhook no Evolution API

Na sua instância do Evolution API, adicione o webhook:

- **URL**: `https://tracker.seusite.com.br/api/webhook/whatsapp`
- **Events**: `MESSAGES_UPSERT`
- **Headers** (opcional): `X-Webhook-Secret: sua-secret-aqui`

---

## Acessar o Dashboard

Acesse: `https://tracker.seusite.com.br/dashboard/`

Vai pedir a API Key que você configurou no passo 3.

---

## Endpoints da API

| Método | Rota | Descrição | Auth |
|--------|------|-----------|------|
| POST | `/api/track/events` | Recebe eventos do script | CORS |
| POST | `/api/track/match` | Vincula conversão externa | CORS |
| POST | `/api/webhook/whatsapp` | Webhook Evolution API | Secret |
| GET | `/api/dashboard/stats` | Estatísticas gerais | API Key |
| GET | `/api/dashboard/leads` | Lista de leads | API Key |
| GET | `/api/dashboard/leads/:id/journey` | Jornada completa | API Key |
| GET | `/api/dashboard/sources` | Ranking de origens | API Key |
| POST | `/api/dashboard/leads/:id/convert` | Conversão manual | API Key |
| GET | `/health` | Health check | Nenhum |

### Exemplo: Registrar conversão do link da bio

```bash
curl -X POST https://tracker.seusite.com.br/api/track/match \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "85999112233",
    "source": "bio_link",
    "value": 2899.90,
    "product": "Sofá Retrátil 3 Lugares"
  }'
```

### Exemplo: Ver jornada de um lead

```bash
curl https://tracker.seusite.com.br/api/dashboard/leads/wk_abc123/journey \
  -H "X-API-Key: sua-api-key"
```

---

## Estrutura do Projeto

```
worki-tracker-backend/
├── Dockerfile
├── package.json
├── .env.example
└── src/
    ├── index.js          # Servidor Express
    ├── db.js             # Conexão PostgreSQL
    ├── migrate.js        # Criação das tabelas
    ├── routes/
    │   ├── track.js      # POST /api/track/*
    │   ├── webhook.js    # POST /api/webhook/*
    │   └── dashboard.js  # GET /api/dashboard/*
    ├── services/
    │   └── tracking.js   # Lógica de negócio
    └── views/
        └── index.html    # Dashboard UI
```
