// Post-build: brotli-compress the ffmpeg wasm core to .wasm.br and drop the
// original. Cloudflare's per-asset limit is 25MiB; the raw core is ~31MiB,
// brotli shrinks it to ~10MiB. The platform serves the .br with
// Content-Encoding: br (see public/_headers) and fetch() decompresses
// transparently.
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";

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
  const br = brotliCompressSync(raw, {
    params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
  });
  writeFileSync(join(assetsDir, `${name}.br`), br);
  unlinkSync(join(assetsDir, name));
  const mib = (n) => (n / 2 ** 20).toFixed(1);
  console.log(
    `[compress-wasm] ${name}: ${mib(raw.length)} MiB -> ${mib(br.length)} MiB`,
  );
}
