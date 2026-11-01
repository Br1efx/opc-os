import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FlowSnapshot } from "../shared/intake-flow";

export function openIntakeDb(file: string): DatabaseSync {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE IF NOT EXISTS intake_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  )`);
  return db;
}

export function readFlowState(db: DatabaseSync): FlowSnapshot | null {
  const row = db.prepare("SELECT json FROM intake_state WHERE id = 1").get() as { json?: string } | undefined;
  if (!row?.json) return null;
  return JSON.parse(row.json) as FlowSnapshot;
}

export function writeFlowState(db: DatabaseSync, snapshot: FlowSnapshot): void {
  const json = JSON.stringify(snapshot);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "INSERT INTO intake_state (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
    ).run(json);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function resolveOpcHome(preferred = "/home/br1efx/.opc"): { path: string; fallback: boolean; detail: string } {
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return { path: preferred, fallback: false, detail: "" };
  } catch {
    const home = path.join(process.env.HOME || "/tmp", ".opc");
    fs.mkdirSync(home, { recursive: true });
    return {
      path: home,
      fallback: true,
      detail: "写不了 /home/br1efx/.opc，状态改在当前用户目录。执行器要在 br1efx 用户下跑，需真机验证。",
    };
  }
}
