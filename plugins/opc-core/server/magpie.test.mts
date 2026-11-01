import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { loadGateway } from "./magpie.ts";

const tags = {
  probe: true,
  spendLimitUsd: 1,
  person: "me",
  project: "opc",
  role: "owner",
  module: "m3-gateway",
  now: "2026-11-01T08:00:00.000Z",
};

test("探测会请求 hello、额度和今日用量，并把熔断写入数据仓", async () => {
  const seen: { method: string; url: string; authorization: string; person: string }[] = [];
  const magpie = await listen((req, res) => {
    seen.push({
      method: req.method ?? "",
      url: req.url ?? "",
      authorization: String(req.headers.authorization ?? ""),
      person: String(req.headers["x-opc-person"] ?? ""),
    });
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const body = fixture(path);
    res.writeHead(body ? 200 : 404, { "content-type": "application/json" });
    res.end(body ?? "{}");
  });
  const ingested: { url: string; person: string; body: string }[] = [];
  const datad = await listen((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      ingested.push({
        url: req.url ?? "",
        person: String(req.headers["x-opc-person"] ?? ""),
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });

  try {
    const snap = await loadGateway(tags, { gatewayOrigin: magpie, datadOrigin: datad });
    assert.equal(snap.source, "live");
    assert.equal(snap.todayUsd, 3.5);
    assert.equal(snap.breaker.tripped, true);
    assert.equal(snap.breaker.card?.title, "成本熔断");
    assert.equal(snap.datad.status, "stored");
    const urls = seen.map((item) => item.url);
    assert.ok(urls.some((url) => url.startsWith("/api/hello")));
    assert.ok(urls.some((url) => url.startsWith("/v1/magpie/quotas")));
    assert.ok(urls.some((url) => url.startsWith("/v1/magpie/usage?period=today")));
    assert.equal(seen[0]?.authorization, "Bearer magpie-opc-m3-gateway");
    assert.equal(seen[0]?.person, "me");
    assert.equal(ingested.length, 1);
    assert.equal(ingested[0]?.person, "me");
    assert.match(ingested[0]?.body ?? "", /opc.gateway.cost-alert/);
  } finally {
    await close(magpie);
    await close(datad);
  }
});

test("正式用量 404 时改走短路径", async () => {
  const magpie = await listen((req, res) => {
    const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    if (path === "/v1/magpie/usage") {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    if (path === "/usage") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ cost: 0.4, calls: 1, errors: 0 }));
      return;
    }
    const body = fixture(path);
    res.writeHead(body ? 200 : 404, { "content-type": "application/json" });
    res.end(body ?? "{}");
  });
  try {
    const snap = await loadGateway(
      { ...tags, spendLimitUsd: 25 },
      { gatewayOrigin: magpie, datadOrigin: "http://127.0.0.1:1" },
    );
    assert.equal(snap.todayUsd, 0.4);
    assert.equal(snap.source, "live");
    assert.equal(snap.breaker.tripped, false);
    assert.equal(snap.datad.status, "down");
  } finally {
    await close(magpie);
  }
});

test("关闭探测时不访问网关，手机看到模拟花费", async () => {
  let hits = 0;
  const magpie = await listen((_req, res) => {
    hits += 1;
    res.writeHead(500);
    res.end("nope");
  });
  try {
    const snap = await loadGateway(
      { ...tags, probe: false, spendLimitUsd: 25 },
      { gatewayOrigin: magpie, datadOrigin: "http://127.0.0.1:1" },
    );
    assert.equal(hits, 0);
    assert.equal(snap.source, "mock");
    assert.equal(snap.todayUsd, 1.25);
    assert.match(snap.note, /模拟/);
  } finally {
    await close(magpie);
  }
});

function fixture(path: string): string | null {
  if (path === "/api/hello") return JSON.stringify({ name: "magpie", version: "9" });
  if (path === "/v1/models") return JSON.stringify({ data: [{ id: "cursor/gpt", owned_by: "cursor" }] });
  if (path === "/v1/magpie/quotas") {
    return JSON.stringify({ object: "list", data: [{ provider: "cursor", user: "ada", remainingPct: 40 }] });
  }
  if (path === "/v1/magpie/usage") return JSON.stringify({ cost: 3.5, calls: 4, errors: 1 });
  if (path === "/v1/magpie/usage/requests") {
    return JSON.stringify({ rows: [{ model: "gpt", agent: "opc", cost: 0.2 }] });
  }
  if (path === "/v1/magpie/route") return JSON.stringify({ model: "cursor/gpt", provider: "cursor" });
  if (path === "/v1") return JSON.stringify({ name: "magpie", version: "9", pid: 42 });
  return null;
}

const servers = new Set<import("node:http").Server>();

function listen(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  const server = createServer(handler);
  servers.add(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const url = new URL("http://127.0.0.1");
      url.port = String(address.port);
      resolve(url.origin);
    });
  });
}

function close(origin: string): Promise<void> {
  const port = new URL(origin).port;
  for (const server of servers) {
    const address = server.address();
    if (address && typeof address === "object" && String(address.port) === port) {
      servers.delete(server);
      return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  }
  return Promise.resolve();
}
