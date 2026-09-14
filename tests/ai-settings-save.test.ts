import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

test("saving tests the model first and preserves the previous config on failure", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "wedding-ai-settings-"));
  const route = pathToFileURL(path.resolve("src/app/api/ai/settings/route.ts")).href;
  try {
    const result = spawnSync(process.execPath, ["--import", pathToFileURL(path.resolve("node_modules/tsx/dist/loader.mjs")).href, "--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { readFileSync, existsSync } from 'node:fs';
      const imported = await import(${JSON.stringify(route)});
      const { POST } = imported.default ?? imported;
      const request = (model, action = 'save') => new Request('http://localhost/api/ai/settings', {
        method: 'POST', headers: { host: 'localhost', origin: 'http://localhost' },
        body: JSON.stringify({ action, provider: 'custom', baseUrl: 'https://example.com/v1', model, apiKey: 'test-only' }),
      });
      globalThis.fetch = async () => Response.json({}, { status: 401 });
      assert.equal((await POST(request('bad'))).status, 502);
      assert.equal(existsSync('.local/ai-config.json'), false);
      globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
      assert.equal((await POST(request('test', 'test'))).status, 200);
      assert.equal(existsSync('.local/ai-config.json'), false);
      assert.equal((await POST(request('good'))).status, 200);
      const previous = readFileSync('.local/ai-config.json', 'utf8');
      assert.equal(JSON.parse(previous).model, 'good');
      globalThis.fetch = async () => Response.json({ choices: [] });
      assert.equal((await POST(request('broken'))).status, 502);
      assert.equal(readFileSync('.local/ai-config.json', 'utf8'), previous);
    `], { cwd: directory, encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: path.resolve("tsconfig.json") } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
