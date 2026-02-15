import assert from "node:assert/strict";
import test from "node:test";

import { buildLatestJson } from "./generate-latest-json.mjs";

const release = {
  name: "Pomodoroom v1.2.3",
  body: "Release notes",
  published_at: "2026-02-11T00:00:00.000Z",
  assets: [
    {
      name: "Pomodoroom_1.2.3_x64-setup.exe",
      browser_download_url: "https://example.com/Pomodoroom_1.2.3_x64-setup.exe",
    },
    {
      name: "Pomodoroom_1.2.3_x64-setup.exe.sig",
      browser_download_url:
        "https://example.com/Pomodoroom_1.2.3_x64-setup.exe.sig",
      body: "windows-sig",
    },
    {
      name: "Pomodoroom_x64.app.tar.gz",
      browser_download_url: "https://example.com/Pomodoroom_x64.app.tar.gz",
    },
    {
      name: "Pomodoroom_x64.app.tar.gz.sig",
      browser_download_url: "https://example.com/Pomodoroom_x64.app.tar.gz.sig",
      body: "mac-sig",
    },
    {
      name: "Pomodoroom_aarch64.app.tar.gz",
      browser_download_url:
        "https://example.com/Pomodoroom_aarch64.app.tar.gz",
    },
    {
      name: "Pomodoroom_aarch64.app.tar.gz.sig",
      browser_download_url:
        "https://example.com/Pomodoroom_aarch64.app.tar.gz.sig",
      body: "mac-arm-sig",
    },
    {
      name: "Pomodoroom_1.2.3_amd64.AppImage",
      browser_download_url: "https://example.com/Pomodoroom_1.2.3_amd64.AppImage",
    },
    {
      name: "Pomodoroom_1.2.3_amd64.AppImage.sig",
      browser_download_url:
        "https://example.com/Pomodoroom_1.2.3_amd64.AppImage.sig",
      body: "linux-sig",
    },
  ],
};

test("builds updater manifest with signatures for all supported platforms", async () => {
  const latest = await buildLatestJson({
    version: "1.2.3",
    release,
    fetchText: async (asset) => asset.body ?? "",
  });

  assert.equal(latest.version, "1.2.3");
  assert.equal(latest.notes, "Release notes");
  assert.equal(
    latest.platforms["windows-x86_64"].signature,
    "windows-sig",
  );
  assert.equal(
    latest.platforms["darwin-x86_64"].signature,
    "mac-sig",
  );
  assert.equal(
    latest.platforms["darwin-aarch64"].signature,
    "mac-arm-sig",
  );
  assert.equal(
    latest.platforms["linux-x86_64"].signature,
    "linux-sig",
  );
});

test("throws when signature is missing for a selected platform asset", async () => {
  const brokenRelease = {
    ...release,
    assets: [
      {
        name: "Pomodoroom_1.2.3_x64-setup.exe",
        browser_download_url: "https://example.com/Pomodoroom_1.2.3_x64-setup.exe",
      },
    ],
  };

  await assert.rejects(
    () =>
      buildLatestJson({
        version: "1.2.3",
        release: brokenRelease,
        fetchText: async (asset) => asset.body ?? "",
      }),
    /No updater-compatible assets were found in this release/,
  );
});

test("uses signed MSI when unsigned NSIS asset is also present", async () => {
  const mixedWindowsRelease = {
    ...release,
    assets: [
      ...release.assets.filter(
        (asset) => asset.name !== "Pomodoroom_1.2.3_x64-setup.exe.sig",
      ),
      {
        name: "Pomodoroom_1.2.3_x64_en-US.msi",
        browser_download_url:
          "https://example.com/Pomodoroom_1.2.3_x64_en-US.msi",
      },
      {
        name: "Pomodoroom_1.2.3_x64_en-US.msi.sig",
        browser_download_url:
          "https://example.com/Pomodoroom_1.2.3_x64_en-US.msi.sig",
        body: "windows-msi-sig",
      },
    ],
  };

  const latest = await buildLatestJson({
    version: "1.2.3",
    release: mixedWindowsRelease,
    fetchText: async (asset) => asset.body ?? "",
  });

  assert.equal(latest.platforms["windows-x86_64"].signature, "windows-msi-sig");
  assert.equal(
    latest.platforms["windows-x86_64-msi"].signature,
    "windows-msi-sig",
  );
});

test("uses stable tag download base URL when provided", async () => {
  const latest = await buildLatestJson({
    version: "1.2.3",
    release,
    fetchText: async (asset) => asset.body ?? "",
    downloadBaseUrl:
      "https://github.com/rebuildup/pomodoroom/releases/download/v1.2.3",
  });

  assert.equal(
    latest.platforms["windows-x86_64"].url,
    "https://github.com/rebuildup/pomodoroom/releases/download/v1.2.3/Pomodoroom_1.2.3_x64-setup.exe",
  );
});
