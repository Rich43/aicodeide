const assert = require('assert');
const { spawn } = require('child_process');
const WebSocket = require('../server/node_modules/ws');
const path = require('path');

(async () => {
  const serverPath = path.join(__dirname, '..', 'server', 'server.js');
  const serverProc = spawn('node', [serverPath]);
  await new Promise(resolve => {
    serverProc.stdout.on('data', data => {
      if (data.toString().includes('Server running')) resolve();
    });
  });

  const ws = new WebSocket('ws://localhost:3000');
  await new Promise(res => ws.on('open', res));

  function waitFor(type) {
    return new Promise(resolve => {
      const listener = data => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === type) {
            ws.off('message', listener);
            resolve(msg);
          }
        } catch {}
      };
      ws.on('message', listener);
    });
  }

  ws.send(JSON.stringify({ type: 'createProject', projectName: 'testproj' }));
  const created = await waitFor('projectCreated');
  const projectId = created.projectId;
  await waitFor('init');

  ws.send(JSON.stringify({ type: 'createFile', path: '/hello.py' }));
  await waitFor('createFile');

  const content = 'print("hi")\n';
  ws.send(JSON.stringify({ type: 'update', path: '/hello.py', content }));
  await waitFor('diff');

  ws.send(JSON.stringify({ type: 'export' }));
  const exportMsg = await waitFor('export');
  assert(exportMsg.files['/hello.py'], 'Export should include hello.py');
  assert.strictEqual(exportMsg.files['/hello.py'].content, content);

  const resp = await fetch(`http://localhost:3000/file/${encodeURIComponent('/hello.py')}?projectId=${projectId}`);
  const fileData = await resp.json();
  assert.strictEqual(fileData.content, content);
  assert.strictEqual(fileData.language, 'python');

  ws.terminate();
  serverProc.kill();
  console.log('Server integration test passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
