require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const { OpenAI } = require('openai');
const jsdiff = require('diff');
const Database = require('better-sqlite3');

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize SQLite database
const db = new Database('logs.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    message TEXT
  )
`);

// Project storage with nested directories
let projectFiles = {
  '/index.js': { content: '// Welcome\nconsole.log("Hello, World!");', version: 1 },
  '/styles.css': { content: 'body { background: #f0f0f0; }', version: 1 },
  '/src/app.js': { content: '// App logic', version: 1 },
};

// Store client settings (API keys, failover order, auto-apply)
const clientSettings = new Map();

const logEvent = (ws, message) => {
  const timestamp = new Date().toISOString();
  db.prepare('INSERT INTO logs (timestamp, message) VALUES (?, ?)').run(timestamp, message);
  ws.send(JSON.stringify({ type: 'log', message: `[${timestamp}] ${message}` }));
};

async function callAI(messages, settings, ws, maxRetries = 3) {
  const { apiKeys, failoverOrder } = settings;
  const providers = [
    {
      name: 'xAI',
      client: new OpenAI({ apiKey: apiKeys.xai, baseURL: 'https://api.x.ai/v1' }),
      model: 'grok-2-1212',
    },
    {
      name: 'OpenAI',
      client: new OpenAI({ apiKey: apiKeys.openai }),
      model: 'gpt-4o-mini',
    },
    {
      name: 'Anthropic',
      client: new OpenAI({ apiKey: apiKeys.anthropic, baseURL: 'https://api.anthropic.com/v1' }),
      model: 'claude-3-5-sonnet-20241022',
      headers: { 'x-api-key': apiKeys.anthropic, 'anthropic-version': '2023-06-01' },
    },
    {
      name: 'OpenRouter',
      client: new OpenAI({ apiKey: apiKeys.openrouter, baseURL: 'https://openrouter.ai/api/v1' }),
      model: apiKeys.openrouterModel || 'meta-llama/llama-3.1-8b-instruct:free',
      headers: { 'HTTP-Referer': 'http://localhost:3000', 'X-Title': 'Coding AI IDE' },
    },
  ].sort((a, b) => failoverOrder.indexOf(a.name) - failoverOrder.indexOf(b.name));

  let codeBlock = null;
  for (const provider of providers) {
    if (!apiKeys[provider.name.toLowerCase()]) continue;
    logEvent(ws, `Attempting ${provider.name} API call`);
    ws.send(JSON.stringify({ type: 'chatStatus', status: `Processing with ${provider.name}...` }));
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await provider.client.chat.completions.create({
          model: provider.model,
          messages,
          ...(provider.headers || {}),
        });
        const content = response.choices[0].message.content;
        logEvent(ws, `${provider.name} API call succeeded`);
        // Extract code block if present
        const codeMatch = content.match(/```[\w]*\n([\s\S]*?)\n```/);
        codeBlock = codeMatch ? codeMatch[1] : null;
        // Parse rate limit headers
        const rateLimit = {
          remaining: response.headers?.['x-ratelimit-remaining-requests'] || response.headers?.['x-ratelimit-remaining'],
          limit: response.headers?.['x-ratelimit-limit-requests'] || response.headers?.['x-ratelimit-limit'],
        };
        return { content, provider: provider.name, codeBlock, rateLimit };
      } catch (error) {
        const errorMessage = error.status === 429 ? `${provider.name} rate limit exceeded` :
                            error.status === 401 ? `${provider.name} invalid API key` :
                            `${provider.name} failed: ${error.message}`;
        logEvent(ws, errorMessage);
        if (error.status === 429 || error.status >= 500) {
          const waitTime = Math.pow(2, attempt) * 1000;
          ws.send(JSON.stringify({ type: 'chatStatus', status: `Retrying ${provider.name} (${attempt + 1}/${maxRetries})...` }));
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        } else if (error.status === 401) {
          ws.send(JSON.stringify({ type: 'chatStatus', status: errorMessage }));
          break;
        }
      }
    }
    ws.send(JSON.stringify({ type: 'chatStatus', status: `Failed with ${provider.name}, trying next provider...` }));
  }
  logEvent(ws, 'All API providers failed');
  return { content: 'Error: All API providers failed', provider: 'None', codeBlock: null, rateLimit: {} };
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  logEvent(ws, 'Client connected');
  ws.send(JSON.stringify({ type: 'init', files: projectFiles }));
  // Send recent logs
  const logs = db.prepare('SELECT timestamp, message FROM logs ORDER BY id DESC LIMIT 100').all();
  logs.forEach(log => ws.send(JSON.stringify({ type: 'log', message: `[${log.timestamp}] ${log.message}` })));

  ws.on('message', async (message) => {
    const { type, path, content, chatInput, settings, newPath } = JSON.parse(message);

    if (type === 'setSettings') {
      clientSettings.set(ws, settings);
      logEvent(ws, 'Settings updated');
      ws.send(JSON.stringify({ type: 'settingsSet', success: true }));
    } else if (type === 'update') {
      const oldContent = projectFiles[path]?.content || '';
      const diff = jsdiff.createPatch(path, oldContent, content);
      projectFiles[path] = { content, version: (projectFiles[path]?.version || 0) + 1 };
      logEvent(ws, `Updated file ${path}`);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'diff', path, diff }));
        }
      });
    } else if (type === 'chat') {
      const settings = clientSettings.get(ws);
      if (!settings || !Object.values(settings.apiKeys).some(key => key)) {
        logEvent(ws, 'Chat request failed: No API keys configured');
        ws.send(JSON.stringify({ type: 'chat', content: 'Error: No API keys configured', provider: 'None' }));
        return;
      }
      const context = Object.entries(projectFiles)
        .map(([p, f]) => `File: ${p}\n\`\`\`\n${f.content}\n\`\`\``)
        .join('\n\n');
      const messages = [
        { role: 'system', content: `You are a coding assistant. Project context:\n${context}` },
        { role: 'user', content: chatInput },
      ];
      const response = await callAI(messages, settings, ws);
      ws.send(JSON.stringify({ 
        type: 'chat', 
        content: response.content, 
        provider: response.provider, 
        codeBlock: response.codeBlock,
        rateLimit: response.rateLimit,
      }));
      if (settings.autoApplyCode && response.codeBlock && path) {
        const diff = jsdiff.createPatch(path, projectFiles[path]?.content || '', response.codeBlock);
        projectFiles[path] = { content: response.codeBlock, version: (projectFiles[path]?.version || 0) + 1 };
        logEvent(ws, `Auto-applied code suggestion to ${path}`);
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'diff', path, diff }));
          }
        });
      }
    } else if (type === 'applyCode') {
      if (projectFiles[path] && content) {
        const diff = jsdiff.createPatch(path, projectFiles[path].content || '', content);
        projectFiles[path] = { content, version: (projectFiles[path]?.version || 0) + 1 };
        logEvent(ws, `Manually applied code suggestion to ${path}`);
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'diff', path, diff }));
          }
        });
      }
    } else if (type === 'createFile' || type === 'createFolder') {
      projectFiles[path] = { content: '', version: 1 };
      logEvent(ws, `${type === 'createFile' ? 'Created file' : 'Created folder'} ${path}`);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type, path }));
        }
      });
    } else if (type === 'rename') {
      if (projectFiles[path]) {
        projectFiles[newPath] = projectFiles[path];
        delete projectFiles[path];
        logEvent(ws, `Renamed ${path} to ${newPath}`);
      }
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'rename', oldPath: path, newPath }));
        }
      });
    } else if (type === 'delete') {
      delete projectFiles[path];
      logEvent(ws, `Deleted ${path}`);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'delete', path }));
        }
      });
    } else if (type === 'export') {
      logEvent(ws, 'Exported project as zip');
      ws.send(JSON.stringify({ type: 'export', files: projectFiles }));
    }
  });
});

app.get('/file/:path', (req, res) => {
  const path = decodeURIComponent(req.params.path);
  res.json(projectFiles[path] || { content: '', version: 0 });
});

server.listen(3000, () => console.log('Server running on port 3000'));