import { DatabaseSync } from "node:sqlite";
import { Engine, MemoryRepositories } from "@opc-os/intake-core";
import { defineAgentTool } from "@getpaseo/plugin/server";
import { z } from "zod";

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE intake_state (id INTEGER PRIMARY KEY, json TEXT)");
db.prepare("INSERT INTO intake_state (id, json) VALUES (1, ?)").run("{}");
const row = db.prepare("SELECT json FROM intake_state WHERE id = 1").get();
const tool = defineAgentTool({
  name: "opc_intake_read",
  description: "读取",
  input: z.object({}),
  execute() {
    return { text: "ok" };
  },
});
const engine = new Engine({
  repo: new MemoryRepositories(),
  policy: () => {
    throw new Error("unused");
  },
  scope: { scope: () => ({ listened: true, observed: false }) },
  assessor: { request() {} },
  executor: { start() {}, deliver() {}, stop() {} },
  outbox: { send() {}, status() {} },
  now: () => new Date().toISOString(),
});

console.log(
  JSON.stringify({
    node: process.version,
    sqlite: row.json,
    tool: tool.name,
    engine: engine.constructor.name,
  }),
);
