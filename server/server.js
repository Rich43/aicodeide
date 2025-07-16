require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const { OpenAI } = require('openai');
const jsdiff = require('diff');
const Database = require('better-sqlite3');
const { spawn } = require('child_process'); // For Python validation
const { validatePythonCode } = require('./validatePythonCode');

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
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    content TEXT,
    version INTEGER DEFAULT 1,
    language TEXT,
    UNIQUE(project_id, path),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  )
`);

// Store client settings (API keys, failover order, auto-apply, autoArgueWithAI)
const clientSettings = new Map();
const clientCurrentProject = new Map(); // Maps ws to current projectId

const logEvent = (ws, message) => {
  const timestamp = new Date().toISOString();
  db.prepare('INSERT INTO logs (timestamp, message) VALUES (?, ?)').run(timestamp, message);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'log', message: `[${timestamp}] ${message}` }));
  } else {
    console.log(`[${timestamp}] ${message}`); // Log to console if WS not available
  }
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
        const response = await provider.client.chat.completions.create(
          {
            model: provider.model,
            messages,
          },
          provider.headers ? { headers: provider.headers } : undefined
        );
        const content = response.choices[0].message.content;
        logEvent(ws, `${provider.name} API call succeeded`);
        // Extract code block if present
        const codeMatch = content.match(/```(\w*)\n([\s\S]*?)\n```/); // Capture language
        codeBlock = codeMatch ? { content: codeMatch[2], language: codeMatch[1] || 'plaintext' } : null;

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
  
  // Send recent logs (already existing)
  const logs = db.prepare('SELECT timestamp, message FROM logs ORDER BY id DESC LIMIT 100').all();
  logs.forEach(log => ws.send(JSON.stringify({ type: 'log', message: `[${log.timestamp}] ${log.message}` })));

  ws.on('message', async (message) => {
    const { type, path, content, chatInput, settings, newPath, projectId, projectName } = JSON.parse(message);
    const currentProjectId = clientCurrentProject.get(ws);

    if (type === 'setSettings') {
      clientSettings.set(ws, settings);
      logEvent(ws, 'Settings updated');
      ws.send(JSON.stringify({ type: 'settingsSet', success: true }));
    } else if (type === 'listProjects') {
        const projects = db.prepare('SELECT id, name FROM projects ORDER BY name').all();
        ws.send(JSON.stringify({ type: 'projectsList', projects }));
    } else if (type === 'createProject') {
        try {
            const info = db.prepare('INSERT INTO projects (name) VALUES (?)').run(projectName);
            const newProjectId = info.lastInsertRowid;
            clientCurrentProject.set(ws, newProjectId);
            // Optionally, create a default index.js for new projects
            db.prepare('INSERT INTO files (project_id, path, content, language) VALUES (?, ?, ?, ?)').run(newProjectId, '/index.js', '// New project! console.log("Hello from ' + projectName + '");', 'javascript');
            
            logEvent(ws, `Created new project: ${projectName} (ID: ${newProjectId})`);
            ws.send(JSON.stringify({ type: 'projectCreated', projectId: newProjectId, projectName }));
            // Load the newly created project's files
            const files = db.prepare('SELECT path, content, version FROM files WHERE project_id = ?').all(newProjectId);
            ws.send(JSON.stringify({ type: 'init', files: files.reduce((acc, file) => ({ ...acc, [file.path]: { content: file.content, version: file.version } }), {}), currentProjectId: newProjectId }));

        } catch (e) {
            logEvent(ws, `Failed to create project ${projectName}: ${e.message}`);
            ws.send(JSON.stringify({ type: 'error', message: `Failed to create project: ${e.message}` }));
        }
    } else if (type === 'loadProject') {
        if (!projectId) {
            ws.send(JSON.stringify({ type: 'error', message: 'No project ID provided to load.' }));
            return;
        }
        const files = db.prepare('SELECT path, content, version, language FROM files WHERE project_id = ?').all(projectId);
        clientCurrentProject.set(ws, projectId);
        logEvent(ws, `Loaded project ID: ${projectId}`);
        ws.send(JSON.stringify({ 
            type: 'init', 
            files: files.reduce((acc, file) => ({ ...acc, [file.path]: { content: file.content, version: file.version, language: file.language } }), {}),
            currentProjectId: projectId
        }));
    } else if (type === 'update') {
      if (!currentProjectId) {
          ws.send(JSON.stringify({ type: 'error', message: 'No project selected. Cannot update file.' }));
          logEvent(ws, 'Update file failed: No project selected.');
          return;
      }
      const existingFile = db.prepare('SELECT content, version, language FROM files WHERE project_id = ? AND path = ?').get(currentProjectId, path);
      const oldContent = existingFile?.content || '';
      const oldVersion = existingFile?.version || 0;
      const fileLanguage = existingFile?.language || (path.endsWith('.js') ? 'javascript' : path.endsWith('.py') ? 'python' : path.endsWith('.css') ? 'css' : 'plaintext');

      db.prepare('INSERT OR REPLACE INTO files (project_id, path, content, version, language) VALUES (?, ?, ?, ?, ?)').run(currentProjectId, path, content, oldVersion + 1, fileLanguage);
      const diff = jsdiff.createPatch(path, oldContent, content);
      
      logEvent(ws, `Updated file ${path} in project ${currentProjectId}`);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'diff', path, diff, language: fileLanguage }));
        }
      });
    } else if (type === 'chat') {
      const settings = clientSettings.get(ws);
      if (!settings || !Object.values(settings.apiKeys).some(key => key)) {
        logEvent(ws, 'Chat request failed: No API keys configured');
        ws.send(JSON.stringify({ type: 'chat', content: 'Error: No API keys configured', provider: 'None' }));
        return;
      }
      if (!currentProjectId) {
          ws.send(JSON.stringify({ type: 'error', message: 'No project selected. Please load or create a project before chatting.' }));
          logEvent(ws, 'Chat request failed: No project selected.');
          return;
      }
      const projectFiles = db.prepare('SELECT path, content FROM files WHERE project_id = ?').all(currentProjectId);
      const context = projectFiles
        .map(file => `File: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
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

      // Python code validation and arguing
      if (response.codeBlock && response.codeBlock.language === 'python' && settings.autoArgueWithAI) {
          const validationErrors = await validatePythonCode(response.codeBlock.content, ws, logEvent);
          if (validationErrors.length > 0) {
              const errorMessage = `AI-generated Python code has issues:\n${validationErrors.join('\n')}\nPlease fix these and provide valid and PEP8 compliant Python code.`;
              logEvent(ws, `Auto-arguing with AI: ${errorMessage}`);
              ws.send(JSON.stringify({ type: 'chatStatus', status: 'Auto-arguing with AI about code quality...' }));
              // Add a new message to the chat history as if the user is arguing
              messages.push({ role: 'assistant', content: response.content }); // Add previous AI response
              messages.push({ role: 'user', content: errorMessage }); // Add new prompt for AI
              const revisedResponse = await callAI(messages, settings, ws); // Call AI again
              ws.send(JSON.stringify({
                  type: 'chat',
                  content: `[Auto-argued] ${revisedResponse.content}`,
                  provider: revisedResponse.provider,
                  codeBlock: revisedResponse.codeBlock,
                  rateLimit: revisedResponse.rateLimit,
              }));
              response.codeBlock = revisedResponse.codeBlock; // Update codeBlock if AI revised it
          }
      }

      // Auto-apply after potential arguing
      if (settings.autoApplyCode && response.codeBlock && path && currentProjectId) {
          const existingFile = db.prepare('SELECT content, version FROM files WHERE project_id = ? AND path = ?').get(currentProjectId, path);
          const oldContent = existingFile?.content || '';
          const oldVersion = existingFile?.version || 0;
          
          db.prepare('INSERT OR REPLACE INTO files (project_id, path, content, version, language) VALUES (?, ?, ?, ?, ?)').run(currentProjectId, path, response.codeBlock.content, oldVersion + 1, response.codeBlock.language);
          const diff = jsdiff.createPatch(path, oldContent, response.codeBlock.content);
          logEvent(ws, `Auto-applied code suggestion to ${path} in project ${currentProjectId}`);
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'diff', path, diff, language: response.codeBlock.language }));
            }
          });
      }
    } else if (type === 'applyCode') {
      if (currentProjectId && path && content) {
        const existingFile = db.prepare('SELECT content, version, language FROM files WHERE project_id = ? AND path = ?').get(currentProjectId, path);
        const oldContent = existingFile?.content || '';
        const oldVersion = existingFile?.version || 0;
        const fileLanguage = existingFile?.language || (path.endsWith('.js') ? 'javascript' : path.endsWith('.py') ? 'python' : path.endsWith('.css') ? 'css' : 'plaintext');

        db.prepare('INSERT OR REPLACE INTO files (project_id, path, content, version, language) VALUES (?, ?, ?, ?, ?)').run(currentProjectId, path, content, oldVersion + 1, fileLanguage);
        const diff = jsdiff.createPatch(path, oldContent, content);
        logEvent(ws, `Manually applied code suggestion to ${path} in project ${currentProjectId}`);
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'diff', path, diff, language: fileLanguage }));
          }
        });
      }
    } else if (type === 'createFile' || type === 'createFolder') {
      if (!currentProjectId) {
          ws.send(JSON.stringify({ type: 'error', message: `No project selected. Cannot ${type}.` }));
          logEvent(ws, `${type} failed: No project selected.`);
          return;
      }
      const fileLanguage = path.endsWith('.js') ? 'javascript' : path.endsWith('.py') ? 'python' : path.endsWith('.css') ? 'css' : 'plaintext';
      db.prepare('INSERT INTO files (project_id, path, content, language) VALUES (?, ?, ?, ?)').run(currentProjectId, path, '', fileLanguage);
      logEvent(ws, `${type === 'createFile' ? 'Created file' : 'Created folder'} ${path} in project ${currentProjectId}`);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type, path, language: fileLanguage }));
        }
      });
    } else if (type === 'rename') {
      if (!currentProjectId) {
          ws.send(JSON.stringify({ type: 'error', message: 'No project selected. Cannot rename file.' }));
          logEvent(ws, 'Rename file failed: No project selected.');
          return;
      }
      const existingFile = db.prepare('SELECT * FROM files WHERE project_id = ? AND path = ?').get(currentProjectId, path);
      if (existingFile) {
        db.prepare('UPDATE files SET path = ? WHERE project_id = ? AND path = ?').run(newPath, currentProjectId, path);
        logEvent(ws, `Renamed ${path} to ${newPath} in project ${currentProjectId}`);
      }
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'rename', oldPath: path, newPath }));
        }
      });
    } else if (type === 'delete') {
      if (!currentProjectId) {
          ws.send(JSON.stringify({ type: 'error', message: 'No project selected. Cannot delete file.' }));
          logEvent(ws, 'Delete file failed: No project selected.');
          return;
      }
      db.prepare('DELETE FROM files WHERE project_id = ? AND path LIKE ?').run(currentProjectId, `${path}%`); // Delete file or folder and its contents
      logEvent(ws, `Deleted ${path} from project ${currentProjectId}`);
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'delete', path }));
        }
      });
    } else if (type === 'export') {
      if (!currentProjectId) {
          ws.send(JSON.stringify({ type: 'error', message: 'No project selected. Cannot export.' }));
          logEvent(ws, 'Export failed: No project selected.');
          return;
      }
      const filesToExport = db.prepare('SELECT path, content FROM files WHERE project_id = ?').all(currentProjectId);
      const projectFilesMap = filesToExport.reduce((acc, file) => ({ ...acc, [file.path]: { content: file.content } }), {});
      logEvent(ws, `Exported project ${currentProjectId} as zip`);
      ws.send(JSON.stringify({ type: 'export', files: projectFilesMap }));
    }
  });

  ws.on('close', () => {
    clientSettings.delete(ws);
    clientCurrentProject.delete(ws);
    logEvent(null, 'Client disconnected');
  });
});

app.get('/file/:path', (req, res) => {
  const path = decodeURIComponent(req.params.path);
  const projectId = parseInt(req.query.projectId, 10);
  if (!projectId) {
    return res.status(400).json({ content: '', version: 0, error: 'Missing projectId query parameter' });
  }
  const file = db.prepare('SELECT content, version, language FROM files WHERE project_id = ? AND path = ?').get(projectId, path);
  res.json(file || { content: '', version: 0, language: 'plaintext' });
});

if (require.main === module) {
  server.listen(3000, () => console.log("Server running on port 3000"));
}

module.exports = { callAI };
