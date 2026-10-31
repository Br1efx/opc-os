import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(
  path.resolve(import.meta.dirname, "../../../plugins/opc-spike-peer/package.json"),
);
const { execCommand } = await import(pathToFileURL(require.resolve("@getpaseo/plugin/server")).href);

const home = process.env.PASEO_SPIKE_HOME;
if (!home) {
  console.error("需要 PASEO_SPIKE_HOME");
  process.exit(1);
}

function withHome(args) {
  return ["--home", home, ...args];
}

const created = await execCommand(
  "paseo",
  withHome([
    "schedule",
    "create",
    "--every",
    "24h",
    "--cwd",
    "/tmp",
    "--name",
    "opc-os-s4",
    "--provider",
    "codex",
    "--json",
    "opc-os spike S4 noop. Do not call tools.",
  ]),
);
console.log("--- create stdout ---");
console.log(created.stdout);
console.log("--- create stderr ---");
console.log(created.stderr);
const payload = JSON.parse(created.stdout);
if (!payload.id) {
  console.error("create did not return an id");
  process.exit(1);
}

const deleted = await execCommand("paseo", withHome(["schedule", "delete", "--json", payload.id]));
console.log("--- delete stdout ---");
console.log(deleted.stdout);
console.log("--- delete stderr ---");
console.log(deleted.stderr);

const listed = await execCommand("paseo", withHome(["schedule", "ls", "--json"]));
console.log("--- ls stdout ---");
console.log(listed.stdout);
const rows = JSON.parse(listed.stdout);
if (rows.some((row) => row.id === payload.id)) {
  console.error("schedule still listed");
  process.exit(1);
}
