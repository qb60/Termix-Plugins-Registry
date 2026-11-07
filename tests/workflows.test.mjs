import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { parseDocument } from "yaml";
for (const name of ["ci.yml", "sync.yml"]) {
  test(`workflow ${name} parses as YAML 1.2`, () => {
    const doc = parseDocument(
      fs.readFileSync(
        new URL(`../.github/workflows/${name}`, import.meta.url),
        "utf8",
      ),
      { uniqueKeys: true },
    );
    assert.deepEqual(doc.errors, []);
    const workflow = doc.toJS();
    assert.ok(
      workflow.on.workflow_dispatch !== undefined ||
        "workflow_dispatch" in workflow.on,
    );
    assert.ok(workflow.jobs);
    assert.equal(workflow.permissions.contents, "read");
    for (const job of Object.values(workflow.jobs))
      assert.ok(Array.isArray(job.steps));
  });
}
