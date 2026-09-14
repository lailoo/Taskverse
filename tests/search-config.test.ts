import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getSearchConfig, publicSearchConfig, resolveSearchConfig, saveSearchConfig } from "../src/lib/search-config";

test("search key persists privately, blank input keeps it, and public configuration never exposes it", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "wedding-search-settings-"));
  try {
    const config = resolveSearchConfig({ apiKey: " test-key " }, { apiKey: "" });
    assert.deepEqual(publicSearchConfig(config), { provider: "tavily", configured: true });
    await saveSearchConfig(config, directory);
    assert.deepEqual(await getSearchConfig(directory), { apiKey: "test-key" });
    assert.equal((await stat(path.join(directory,"search-config.json"))).mode & 0o777,0o600);
    assert.equal(resolveSearchConfig({ apiKey: "" }, config).apiKey, "test-key");
    assert.equal((await readFile(path.join(directory,"search-config.json"),"utf8")).includes("test-key"),true);
    for (const apiKey of ["", "bad\nkey", "x".repeat(4097), 123]) assert.throws(() => resolveSearchConfig({ apiKey }, { apiKey: "" }), /Key/);
    const station=resolveSearchConfig({provider:"xiaohongshu-mcp"},config);
    assert.equal(station.apiKey,"test-key");
    await saveSearchConfig(station,directory);
    assert.deepEqual(await getSearchConfig(directory),station,"switching search modes must preserve the optional public-search credential");
    assert.deepEqual(publicSearchConfig(station),{provider:"xiaohongshu-mcp",configured:true});
  } finally { await rm(directory,{recursive:true,force:true}); }
});
