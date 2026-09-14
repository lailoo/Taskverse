import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ProjectStore, ProjectConflict } from "../src/lib/project-db";
import { makeInitialProject } from "../src/lib/tasks";

test("SQLite survives reopening, backs up previous data, and rejects stale overwrites", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "wedding-db-"));
  let store = new ProjectStore(directory);
  try {
    assert.equal(store.read().project, null);
    const project = makeInitialProject();
    store.save(project, 0);
    store.close();
    store = new ProjectStore(directory);
    assert.deepEqual(store.read().project, project);
    assert.equal(store.read().revision, 1);
    const next = { ...project, budget: 80000 };
    store.save(next, 1);
    assert.throws(() => store.save(project, 1), ProjectConflict);
    assert.equal(store.read().project?.budget, 80000);
    const versions = store.listVersions();
    assert.equal(versions.length, 2);
    assert.equal(versions[0].revision, 1);
    assert.equal(store.readVersion(versions[0].id).budget, 0);
    assert.throws(() => store.readVersion("../../secret.json"));
    assert.equal(store.save(next, 2).revision, 2);
    const backups = readdirSync(path.join(directory, "backups"));
    assert.equal(backups.length, 2);
    assert.deepEqual(
      JSON.parse(
        readFileSync(
          path.join(directory, "backups", backups.sort()[1]),
          "utf8",
        ),
      ),
      project,
    );
    assert.throws(() => store.save({ tasks: [] }, 2));
    assert.equal(store.read().revision, 2);
    for (let i = 0; i < 33; i++)
      store.save({ ...next, budget: i + 1 }, store.read().revision);
    assert.equal(readdirSync(path.join(directory, "backups")).length, 30);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
