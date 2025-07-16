const assert = require('assert');

async function callAIStub(messages, settings) {
  const { failoverOrder } = settings;
  const providers = [
    {
      name: 'xAI',
      client: { chat: { completions: { create: async () => { throw { status: 429, message: 'Rate limit' }; } } } },
      model: 'stub-model'
    },
    {
      name: 'OpenAI',
      client: { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'ok' } }], headers: {} }) } } },
      model: 'stub-model'
    }
  ].sort((a, b) => failoverOrder.indexOf(a.name) - failoverOrder.indexOf(b.name));

  for (const provider of providers) {
    try {
      const response = await provider.client.chat.completions.create({ messages, model: provider.model });
      return { provider: provider.name, content: response.choices[0].message.content };
    } catch (err) {
      continue;
    }
  }
  return { provider: 'None', content: 'Error' };
}

(async () => {
  const messages = [{ role: 'user', content: 'hi' }];
  const settings = { failoverOrder: ['xAI', 'OpenAI'] };
  const result = await callAIStub(messages, settings);
  assert.strictEqual(result.provider, 'OpenAI', 'Should failover to OpenAI');
  assert.strictEqual(result.content, 'ok');
  console.log('Failover test passed');
})();
