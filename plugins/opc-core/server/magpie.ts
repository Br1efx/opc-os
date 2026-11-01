import http from "node:http";
import https from "node:https";
import {
  assertLoopback,
  gatewaySnapshotSchema,
  interpretMagpie,
  mockSnapshot,
  requestPlan,
  tagHeaders,
  type FetchDoc,
  type GatewaySnapshot,
  type PlannedRead,
  type Tags,
} from "../shared/gateway";

/** 字面量放在发起请求的文件里，权限清单才能对照主机。 */
const DEFAULT_GATEWAY_ORIGIN = "http://127.0.0.1:3425";
const DEFAULT_DATAD_ORIGIN = "http://127.0.0.1:3475";

export type GatewayInput = {
  probe: boolean;
  spendLimitUsd: number;
  person: string;
  project: string;
  role: string;
  module: string;
  now: string;
};

type RequestInit = {
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
};

export type HttpRequest = (url: string, init: RequestInit) => Promise<{ status: number; body: string }>;

export type GatewayDeps = {
  gatewayOrigin?: string;
  datadOrigin?: string;
  request?: HttpRequest;
};

/**
 * 探测关闭时返回标明的模拟花费。
 * 打开后只访问调用方传入的本机源；RPC 本身不接收任意地址。
 */
export async function loadGateway(input: GatewayInput, deps: GatewayDeps = {}): Promise<GatewaySnapshot> {
  const tags: Tags = {
    person: input.person.trim(),
    project: input.project.trim(),
    role: input.role.trim(),
    module: input.module.trim(),
  };
  const headers = tagHeaders(tags);
  const now = Number.isNaN(Date.parse(input.now)) ? new Date().toISOString() : input.now;
  const gatewayOrigin = deps.gatewayOrigin ?? DEFAULT_GATEWAY_ORIGIN;
  const datadOrigin = deps.datadOrigin ?? DEFAULT_DATAD_ORIGIN;
  assertLoopback(gatewayOrigin);
  assertLoopback(datadOrigin);
  const request = deps.request ?? httpRequest;

  const snap = input.probe
    ? await readLive(gatewayOrigin, headers, input.spendLimitUsd, now, tags, request)
    : mockSnapshot(tags, input.spendLimitUsd, now);

  const datad = await postDatad(datadOrigin, snap, headers, request);
  return gatewaySnapshotSchema.parse({ ...snap, datad });
}

async function readLive(
  origin: string,
  headers: Record<string, string>,
  limitUsd: number,
  now: string,
  tags: Tags,
  request: HttpRequest,
): Promise<GatewaySnapshot> {
  const plan = requestPlan(origin, headers["x-magpie-session"] ?? "");
  const docs = {
    hello: await fetchFirst(plan, "hello", headers, request),
    models: await fetchFirst(plan, "models", headers, request),
    quotas: await fetchFirst(plan, "quotas", headers, request),
    usage: await fetchFirst(plan, "usage", headers, request),
    requests: await fetchFirst(plan, "requests", headers, request),
    route: await fetchFirst(plan, "route", headers, request),
    info: await fetchFirst(plan, "info", headers, request),
  };
  return interpretMagpie({ probe: true, tags, limitUsd, now, ...docs });
}

async function fetchFirst(
  plan: readonly PlannedRead[],
  key: PlannedRead["key"],
  headers: Record<string, string>,
  request: HttpRequest,
): Promise<FetchDoc> {
  const item = plan.find((entry) => entry.key === key);
  if (!item) return { ok: false, body: null };
  for (const url of item.urls) {
    try {
      const response = await request(url, { method: "GET", headers, timeoutMs: 4000 });
      if (response.status >= 200 && response.status < 300) {
        try {
          return { ok: true, body: JSON.parse(response.body) as unknown };
        } catch {
          return { ok: false, body: null };
        }
      }
      if (response.status !== 404) return { ok: false, body: null };
    } catch {
      return { ok: false, body: null };
    }
  }
  return { ok: false, body: null };
}

async function postDatad(
  origin: string,
  snap: GatewaySnapshot,
  headers: Record<string, string>,
  request: HttpRequest,
): Promise<GatewaySnapshot["datad"]> {
  const url = `${assertLoopback(origin).origin}/v1/ingest`;
  try {
    const response = await request(url, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        name: snap.breaker.tripped ? "opc.gateway.cost-alert" : "opc.gateway.snapshot",
        costUsd: snap.todayUsd,
      }),
      timeoutMs: 800,
    });
    if (response.status >= 200 && response.status < 300) {
      return { status: "stored", detail: "已写入本机 opc-datad。" };
    }
    return { status: "down", detail: `opc-datad 回应 ${response.status}。` };
  } catch {
    return { status: "down", detail: "opc-datad 没开。网关数字仍然显示。" };
  }
}

export function httpRequest(url: string, init: RequestInit): Promise<{ status: number; body: string }> {
  const target = assertLoopback(url);
  const lib = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: init.method,
        headers: init.headers,
      },
      (res) => {
        let body = "";
        let size = 0;
        res.on("data", (chunk) => {
          const text = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
          size += text.length;
          if (size > 1_000_000) {
            req.destroy(new Error("响应太大"));
            return;
          }
          body += text;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.setTimeout(init.timeoutMs, () => req.destroy(new Error("超时")));
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}
