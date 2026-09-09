// Post-build: gzip the ffmpeg wasm core to .wasm.gz and drop the original.
// Cloudflare's per-asset limit is 25MiB; the raw core is ~31MiB, gzip shrinks
// it to ~10MiB. The app fetches the .gz and decompresses it in JS with
// DecompressionStream (see src/executor/wasm.ts) — not via Content-Encoding,
// which Cloudflare strips when set through _headers.
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, constants } from "node:zlib";

const assetsDir = fileURLToPath(new URL("../dist/assets/", import.meta.url));
const targets = readdirSync(assetsDir).filter(
  (f) => f.startsWith("ffmpeg-core-") && f.endsWith(".wasm"),
);

if (targets.length === 0) {
  console.error("[compress-wasm] no ffmpeg-core-*.wasm found in dist/assets");
  process.exit(1);
}

for (const name of targets) {
  const raw = readFileSync(join(assetsDir, name));
  const gz = gzipSync(raw, { level: constants.Z_BEST_COMPRESSION });
  writeFileSync(join(assetsDir, `${name}.gz`), gz);
  unlinkSync(join(assetsDir, name));
  const mib = (n) => (n / 2 ** 20).toFixed(1);
  console.log(
    `[compress-wasm] ${name}: ${mib(raw.length)} MiB -> ${mib(gz.length)} MiB`,
  );
}
