import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Read the repository file deliberately: Node --env-file preserves inherited keys.
export function loadConfig(path = new URL('../.env', import.meta.url)) {
  let values;
  try { values = parseEnv(readFileSync(path, 'utf8')); }
  catch { throw new Error('Cannot read repository .env; copy .env.example and configure the backend key.'); }
  const apiKey = values.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY in repository .env.');
  return { apiKey, model: 'gemini-3.1-flash-live-preview' };
}

if (process.env.NODE_TEST_CONTEXT) {
  const { test } = await import('node:test');
  const assert = await import('node:assert/strict');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  test('repository key wins over inherited key; errors disclose no credential', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ai-presenter-config-'));
    const path = join(dir, '.env');
    const inherited = process.env.GEMINI_API_KEY;
    try {
      process.env.GEMINI_API_KEY = 'inherited-test-secret';
      writeFileSync(path, 'GEMINI_API_KEY="repository-test-secret"\n');
      assert.equal(loadConfig(path).apiKey, 'repository-test-secret');
      assert.equal(loadConfig(path).model, 'gemini-3.1-flash-live-preview');
      writeFileSync(path, 'GEMINI_API_KEY=\n');
      assert.throws(() => loadConfig(path), /^Error: Missing GEMINI_API_KEY in repository .env\.$/);
      assert.throws(() => loadConfig(join(dir, 'absent')), /^Error: Cannot read repository .env/);
    } finally {
      if (inherited === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = inherited;
      rmSync(dir, { recursive: true });
    }
  });
}
