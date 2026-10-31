import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../..");

function resolveFrom(pluginDir) {
  const require = createRequire(path.join(pluginDir, "package.json"));
  return fs.realpathSync(require.resolve("@opc-os/card-protocol"));
}

const core = resolveFrom(path.join(root, "plugins/opc-core"));
const peer = resolveFrom(path.join(root, "plugins/opc-spike-peer"));
const same = core === peer;

const protocol = await import(pathToFileURL(core).href);
// 示例跟随 card-protocol d1：类型是已知卡片，负责人是 Agent。
const sample = {
  id: "s1",
  type: "task",
  status: "open",
  title: "shared",
  oneLiner: "two plugins",
  owner: { kind: "agent", id: "spike" },
  source: "s1-resolve",
  evidence: [],
  related: [],
  time: "2026-10-31T00:00:00.000Z",
  unread: false,
};

console.log(`core ${core}`);
console.log(`peer ${peer}`);
console.log(`same_realpath ${same}`);
console.log(`revision ${protocol.CARD_PROTOCOL_REVISION}`);
console.log(`hasCardShape ${protocol.hasCardShape(sample)}`);
console.log(`rejects_empty ${protocol.hasCardShape({})}`);
if (!same || protocol.hasCardShape(sample) !== true || protocol.hasCardShape({}) !== false) {
  process.exit(1);
}
