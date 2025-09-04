// server/server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3200;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve arquivos estáticos (index.html, etc)

// URL da API do Zabbix (✅ SEM espaços!)
const ZABBIX_URL = 'https://zbx-poc-psql.duckdns.org/zabbix/api_jsonrpc.php';

// Agente HTTPS para ignorar certificados inválidos (apenas para desenvolvimento)
const agent = new https.Agent({
  rejectUnauthorized: false // ❗️Remover em produção com certificado válido
});

// Rota de login
app.post('/api/login', async (req, res) => {
  const { user, password, mfa } = req.body;

  console.log('Tentativa de login recebida:', { user, mfa: mfa ? 'presente' : 'não fornecido' });

  try {
    const response = await axios.post(
      ZABBIX_URL,
      {
        jsonrpc: '2.0',
        method: 'user.login',
        params: {
          username: user,
          password: password,
          mfa_token: mfa || undefined
        },
        id: 1
      },
      {
        headers: { 'Content-Type': 'application/json' },
        httpsAgent: agent
      }
    );

    const data = response.data;

    if (data.error) {
      const errorMessage = data.error.data || data.error.message;

      if (errorMessage.toLowerCase().includes('mfa') || errorMessage.includes('token')) {
        return res.json({
          error: 'Autenticação MFA necessária.',
          mfa_required: true
        });
      }

      return res.json({ error: errorMessage });
    }

    const auth = data.result;
    console.log('Login bem-sucedido para o usuário:', user);
    return res.json({ auth });

  } catch (error) {
    console.error('Erro ao conectar ao Zabbix:', error.message);

    if (error.code === 'ECONNABORTED') {
      return res.status(500).json({ error: 'Tempo de conexão esgotado.' });
    }

    if (error.code === 'ENOTFOUND') {
      return res.status(500).json({ error: 'Servidor Zabbix não encontrado.' });
    }

    return res.status(500).json({
      error: 'Erro ao conectar ao Zabbix. Verifique a URL e o certificado SSL.'
    });
  }
});

// Rota para listar grupos de hosts
app.get('/api/hostgroups', async (req, res) => {
  const auth = req.headers['x-zabbix-auth'];
  if (!auth) return res.status(401).json({ error: 'Não autorizado.' });

  try {
    const response = await axios.post(
      ZABBIX_URL,
      {
        jsonrpc: '2.0',
        method: 'hostgroup.get',
        params: { output: ['name'] },
        id: 1
      },
      {
        headers: {
          'Authorization': `Bearer ${auth}`,
          'Content-Type': 'application/json'
        },
        httpsAgent: agent
      }
    );

    if (response.data.error) {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    res.json(response.data.result);
  } catch (error) {
    console.error('Erro ao buscar grupos:', error.message);
    res.status(500).json({ error: 'Falha ao buscar grupos.' });
  }
});

// Rota para listar hosts por grupo (usando groupid)
app.get('/api/hosts', async (req, res) => {
  const auth = req.headers['x-zabbix-auth'];
  if (!auth) return res.status(401).json({ error: 'Não autorizado.' });

  try {
    const { group } = req.query;
    if (!group) return res.json([]);

    // 1. Buscar groupid pelo nome
    const groupResponse = await axios.post(
      ZABBIX_URL,
      {
        jsonrpc: '2.0',
        method: 'hostgroup.get',
        params: {
          output: ['groupid'],
          filter: { name: [group] }
        },
        id: 1
      },
      {
        headers: { 'Authorization': `Bearer ${auth}` },
        httpsAgent: agent
      }
    );

    if (groupResponse.data.error || !groupResponse.data.result.length) {
      return res.status(404).json({ error: 'Grupo não encontrado.' });
    }

    const groupid = groupResponse.data.result[0].groupid;

    // 2. Buscar hosts pelo groupid
    const hostResponse = await axios.post(
      ZABBIX_URL,
      {
        jsonrpc: '2.0',
        method: 'host.get',
        params: {
          output: ['host'],
          groupids: [groupid]
        },
        id: 2
      },
      {
        headers: { 'Authorization': `Bearer ${auth}` },
        httpsAgent: agent
      }
    );

    if (hostResponse.data.error) {
      return res.status(401).json({ error: 'Token inválido.' });
    }

    res.json(hostResponse.data.result);
  } catch (error) {
    console.error('Erro ao buscar hosts:', error.message);
    res.status(500).json({ error: 'Falha ao buscar hosts.' });
  }
});

// Rota para listar gráficos
app.get('/api/graphs', async (req, res) => {
  const auth = req.headers['x-zabbix-auth'];
  const { host } = req.query; // Só usamos host por enquanto

  if (!auth) return res.status(401).json({ error: 'Não autorizado.' });
  if (!host) return res.status(400).json({ error: 'Host não fornecido.' });

  try {
    // Primeiro, buscar o hostid pelo nome
    const hostResponse = await axios.post(
      ZABBIX_URL,
      {
        jsonrpc: '2.0',
        method: 'host.get',
        params: {
          output: ['hostid'],
          filter: { host: [host] }
        },
        id: 1
      },
      {
        headers: { 'Authorization': `Bearer ${auth}` },
        httpsAgent: agent
      }
    );

    if (hostResponse.data.error || !hostResponse.data.result.length) {
      return res.status(404).json({ error: 'Host não encontrado.' });
    }

    const hostid = hostResponse.data.result[0].hostid;

    // Buscar gráficos pelo hostid
    const graphResponse = await axios.post(
      ZABBIX_URL,
      {
        jsonrpc: '2.0',
        method: 'graph.get',
        params: {
          output: ['graphid', 'name'],
          hostids: [hostid]
        },
        id: 2
      },
      {
        headers: { 'Authorization': `Bearer ${auth}` },
        httpsAgent: agent
      }
    );

    if (graphResponse.data.error) {
      return res.status(401).json({ error: 'Token inválido.' });
    }

    res.json(graphResponse.data.result);
  } catch (error) {
    console.error('Erro ao buscar gráficos:', error.message);
    res.status(500).json({ error: 'Falha ao buscar gráficos.' });
  }
});

// Rota de teste (opcional)
app.get('/api/test-auth', async (req, res) => {
  const auth = req.headers['x-zabbix-auth'];
  if (!auth) return res.status(401).json({ error: 'Não autorizado.' });

  try {
    const response = await axios.post(
      ZABBIX_URL,
      {
        jsonrpc: '2.0',
        method: 'apiinfo.version',
        id: 1
      },
      {
        headers: { 'Authorization': `Bearer ${auth}` },
        httpsAgent: agent
      }
    );

    if (response.data.error) {
      return res.status(401).json({ error: 'Token inválido.' });
    }

    res.json({ version: response.data.result });
  } catch (error) {
    res.status(500).json({ error: 'Falha ao testar autenticação.' });
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`🔗 Acesse: http://zbx-poc-psql.duckdns.org:${PORT}`);
});