import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PLATFORM_CANDIDATES = [
  {
    keys: ["windows-x86_64-nsis", "windows-x86_64"],
    matcher: (name) => /_x64-setup\.exe$/i.test(name),
  },
  {
    keys: ["windows-x86_64-msi", "windows-x86_64"],
    matcher: (name) => /_x64_en-US\.msi$/i.test(name),
  },
  {
    keys: ["darwin-aarch64-app", "darwin-aarch64"],
    matcher: (name) => /aarch64\.app\.tar\.gz$/i.test(name),
  },
  {
    keys: ["darwin-x86_64-app", "darwin-x86_64"],
    matcher: (name) => /x64\.app\.tar\.gz$/i.test(name),
  },
  {
    keys: ["linux-x86_64-appimage", "linux-x86_64"],
    matcher: (name) => /_amd64\.AppImage$/i.test(name),
  },
];

function parseArgs(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      map.set(key, value);
      i += 1;
    } else {
      map.set(key, "true");
    }
  }
  return map;
}

async function fetchSignatureText(asset, token) {
  const downloadUrl = asset.url || asset.browser_download_url;
  if (!downloadUrl) {
    throw new Error(`Signature asset ${asset.name} has no downloadable URL`);
  }

  const headers = {
    Accept: "application/octet-stream",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(downloadUrl, { headers });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch signature asset ${asset.name}: HTTP ${response.status}`,
    );
  }

  return (await response.text()).trim();
}

export async function buildLatestJson({
  version,
  release,
  downloadBaseUrl,
  fetchText = (asset) => fetchSignatureText(asset),
}) {
  const assets = release.assets ?? [];
  const platforms = {};

  for (const candidate of PLATFORM_CANDIDATES) {
    const installers = assets.filter(
      (asset) => !asset.name.endsWith(".sig") && candidate.matcher(asset.name),
    );
    if (installers.length === 0) {
      continue;
    }

    let selectedInstaller = null;
    let selectedSignature = null;
    for (const installer of installers) {
      const signatureAssetName = `${installer.name}.sig`;
      const signatureAsset = assets.find(
        (asset) => asset.name === signatureAssetName,
      );
      if (!signatureAsset) {
        continue;
      }

      const signature = (await fetchText(signatureAsset)).trim();
      if (!signature) {
        throw new Error(`Signature asset ${signatureAssetName} is empty`);
      }

      selectedInstaller = installer;
      selectedSignature = signature;
      break;
    }

    if (!selectedInstaller || !selectedSignature) {
      continue;
    }

    for (const key of candidate.keys) {
      platforms[key] = {
        url: downloadBaseUrl
          ? `${downloadBaseUrl}/${selectedInstaller.name}`
          : selectedInstaller.browser_download_url,
        signature: selectedSignature,
      };
    }
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error("No updater-compatible assets were found in this release");
  }

  return {
    version,
    notes: release.body?.trim() || release.name || `Release v${version}`,
    pub_date: release.published_at || new Date().toISOString(),
    platforms,
  };
}

async function fetchRelease({ owner, repo, releaseId, token }) {
  const headers = {
    Accept: "application/vnd.github+json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/${releaseId}`,
    { headers },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch release ${releaseId}: HTTP ${response.status}`,
    );
  }
  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const owner = args.get("owner");
  const repo = args.get("repo");
  const releaseId = args.get("release-id");
  const version = args.get("version");
  const outputPath = args.get("output") || "latest.json";
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !releaseId || !version) {
    throw new Error(
      "Usage: node scripts/generate-latest-json.mjs --owner <owner> --repo <repo> --release-id <id> --version <version> [--output latest.json]",
    );
  }

  const release = await fetchRelease({ owner, repo, releaseId, token });
  const latest = await buildLatestJson({
    version,
    release,
    downloadBaseUrl: `https://github.com/${owner}/${repo}/releases/download/v${version}`,
    fetchText: (asset) => fetchSignatureText(asset, token),
  });

  await fs.writeFile(outputPath, JSON.stringify(latest, null, 2), "utf8");
  console.log(`Generated ${outputPath} with ${Object.keys(latest.platforms).length} platform entries.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
