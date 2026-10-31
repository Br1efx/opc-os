import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const store = path.join(root, "node_modules/.pnpm");
const entry = fs.readdirSync(store).find((name) => name.startsWith("@getpaseo+relay@"));
if (!entry) {
  console.error("node_modules 里没有 @getpaseo/relay");
  process.exit(1);
}
const relayRoot = path.join(store, entry, "node_modules/@getpaseo/relay");
const pkg = JSON.parse(fs.readFileSync(path.join(relayRoot, "package.json"), "utf8"));
const records = await import(path.join(relayRoot, "dist/protected-records.js"));
const noise = await import(path.join(relayRoot, "dist/noise/cipher-state.js"));

const bytes = 5 * 1024 * 1024;
const frame = new Uint8Array(bytes);
for (let i = 0; i < frame.length; i += 4096) frame[i] = i & 0xff;

const key = new Uint8Array(32);
for (let i = 0; i < key.length; i += 1) key[i] = i + 1;
const sender = new noise.CipherState();
const receiver = new noise.CipherState();
sender.initializeKey(key);
receiver.initializeKey(key);

const started = process.hrtime.bigint();
const wire = records.encodeProtectedRecord("binary", frame, sender);
const decoded = records.decodeProtectedRecord(wire, receiver);
const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
let same = decoded.data.byteLength === frame.byteLength;
if (same) {
  for (let i = 0; i < frame.length; i += 4096) {
    if (decoded.data[i] !== frame[i]) {
      same = false;
      break;
    }
  }
}

console.log(`package ${pkg.name}@${pkg.version}`);
console.log(`frame_bytes ${bytes}`);
console.log(`max_chunk_data_bytes ${records.MAX_CHUNK_DATA_BYTES}`);
console.log(`max_frame_bytes ${records.MAX_FRAME_BYTES}`);
console.log(`chunk_count ${records.chunkCount(bytes)}`);
console.log(`wire_bytes ${wire.byteLength}`);
console.log(`roundtrip_ok ${same}`);
console.log(`local_encrypt_decrypt_ms ${elapsedMs.toFixed(1)}`);
console.log("note local CPU framing only; not a phone Relay transfer");
if (!same) process.exit(1);
