import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const tauriConfigPath = path.resolve("src-tauri/tauri.conf.json");
const updaterEndpoint =
  "https://github.com/rebuildup/pomodoroom-desktop/releases/latest/download/latest.json";

test("tauri updater config is enabled and points to latest.json", async () => {
  const raw = await fs.readFile(tauriConfigPath, "utf8");
  const config = JSON.parse(raw);

  assert.equal(config.bundle?.active, true, "bundle.active must be true");
  assert.equal(
    config.plugins?.updater?.active,
    true,
    "plugins.updater.active must be true",
  );
  assert.ok(
    Array.isArray(config.plugins?.updater?.endpoints),
    "plugins.updater.endpoints must be an array",
  );
  assert.ok(
    config.plugins.updater.endpoints.includes(updaterEndpoint),
    "updater endpoint must include release latest.json URL",
  );
  assert.ok(
    typeof config.plugins?.updater?.pubkey === "string" &&
      config.plugins.updater.pubkey.trim().length > 0,
    "plugins.updater.pubkey must be set",
  );
});
