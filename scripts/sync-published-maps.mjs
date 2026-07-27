import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const packages = [
  {
    packageId: 'fireviewer-die-pontaix-r1-v4',
    manifestSha256: '1040f24bfacd1b38a8b45ae0079154728da9955f82b273eca590614454606193',
    catalogSha256: '63a07bc703f54c90ba0101b2e32f4ade2c860c1ea646fc983d67871d84b871fe',
    catalogBytes: 136_473,
  },
];

const sourceOrigin = new URL(
  process.env.FV_PUBLISHED_ASSET_ORIGIN ?? 'https://fireviewer.vercel.app',
);
const outputRoot = join(process.cwd(), 'dist', 'maps');
const manifestOnly = process.argv.includes('--manifest-only');

if (sourceOrigin.protocol !== 'https:') {
  throw new Error('FV_PUBLISHED_ASSET_ORIGIN must use HTTPS.');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assetUrl(packageId, relativePath) {
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  return new URL(`/maps/${encodeURIComponent(packageId)}/${encodedPath}`, sourceOrigin);
}

function safeTarget(packageId, relativePath) {
  const normalized = normalize(relativePath);
  if (
    normalized === '..'
    || normalized.startsWith(`..${sep}`)
    || normalized.includes(`${sep}..${sep}`)
  ) {
    throw new Error(`Unsafe published asset path: ${relativePath}`);
  }
  return join(outputRoot, packageId, normalized);
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      }
    }
  }
  throw new Error(`Unable to fetch ${url}: ${String(lastError)}`);
}

async function fetchVerifiedJson(packageId, relativePath, expectedSha256, expectedBytes) {
  const response = await fetchWithRetry(assetUrl(packageId, relativePath));
  const buffer = Buffer.from(await response.arrayBuffer());
  if (expectedBytes !== undefined && buffer.byteLength !== expectedBytes) {
    throw new Error(`${relativePath}: expected ${expectedBytes} bytes, got ${buffer.byteLength}.`);
  }
  const digest = sha256(buffer);
  if (digest !== expectedSha256) {
    throw new Error(`${relativePath}: SHA-256 mismatch (${digest}).`);
  }
  const target = safeTarget(packageId, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { force: true });
  await writeFile(target, buffer);
  return JSON.parse(buffer.toString('utf8'));
}

function collectCatalogAssets(catalog) {
  const assets = [];
  for (const tile of catalog.terrain_tiles ?? []) {
    for (const field of ['colour', 'elevation']) {
      const asset = tile[field];
      if (asset?.path && asset?.sha256 && Number.isInteger(asset?.byte_count)) {
        assets.push(asset);
      }
    }
  }
  for (const tile of catalog.feature_tiles ?? []) {
    const asset = tile.features;
    if (asset?.path && asset?.sha256 && Number.isInteger(asset?.byte_count)) {
      assets.push(asset);
    }
  }
  const unique = new Map(assets.map((asset) => [asset.path, asset]));
  if (unique.size !== assets.length) {
    throw new Error('The published catalog contains duplicate asset paths.');
  }
  return [...unique.values()];
}

async function downloadVerifiedAsset(packageId, asset) {
  const response = await fetchWithRetry(assetUrl(packageId, asset.path));
  if (!response.body) {
    throw new Error(`${asset.path}: response body is unavailable.`);
  }
  const target = safeTarget(packageId, asset.path);
  const temporary = `${target}.part`;
  await mkdir(dirname(target), { recursive: true });
  await rm(temporary, { force: true });

  const hash = createHash('sha256');
  let byteCount = 0;
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      byteCount += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      verifier,
      createWriteStream(temporary, { flags: 'wx' }),
    );
    const digest = hash.digest('hex');
    if (byteCount !== asset.byte_count) {
      throw new Error(`${asset.path}: expected ${asset.byte_count} bytes, got ${byteCount}.`);
    }
    if (digest !== asset.sha256) {
      throw new Error(`${asset.path}: SHA-256 mismatch (${digest}).`);
    }
    await rm(target, { force: true });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function runPool(items, workerCount, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(workerCount, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index]);
      }
    }),
  );
}

for (const publishedPackage of packages) {
  const manifest = await fetchVerifiedJson(
    publishedPackage.packageId,
    'package-manifest.json',
    publishedPackage.manifestSha256,
  );
  if (manifest.package_id !== publishedPackage.packageId) {
    throw new Error(`Unexpected package id: ${manifest.package_id}`);
  }
  if (
    manifest.catalog?.sha256 !== publishedPackage.catalogSha256
    || manifest.catalog?.byte_count !== publishedPackage.catalogBytes
  ) {
    throw new Error(`${publishedPackage.packageId}: manifest catalog contract changed.`);
  }

  const catalog = await fetchVerifiedJson(
    publishedPackage.packageId,
    'catalog.json',
    publishedPackage.catalogSha256,
    publishedPackage.catalogBytes,
  );
  const assets = collectCatalogAssets(catalog);
  if (assets.length !== 144) {
    throw new Error(`${publishedPackage.packageId}: expected 144 assets, got ${assets.length}.`);
  }
  if (!manifestOnly) {
    await runPool(assets, 4, (asset) => downloadVerifiedAsset(publishedPackage.packageId, asset));
  }
  console.log(
    `${publishedPackage.packageId}: ${assets.length + 2} published files verified`
      + (manifestOnly ? ' (manifest-only).' : '.'),
  );
}

for (const publishedPackage of packages) {
  const manifestPath = safeTarget(publishedPackage.packageId, 'package-manifest.json');
  JSON.parse(await readFile(manifestPath, 'utf8'));
}
