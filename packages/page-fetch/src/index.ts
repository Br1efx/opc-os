import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const MAX_BYTES = 1_500_000;
const MAX_HOPS = 4;
const TIMEOUT_MS = 12_000;

export type PageResponse = { status: number; location: string; body: string };

export type PageLookup = (hostname: string) => Promise<string[]>;

export type PageRequest = (target: URL) => Promise<PageResponse>;

export type PageFetchResult = { ok: true; html: string; finalUrl: string } | { ok: false; detail: string };

export type PageFetchDeps = {
  lookup?: PageLookup;
  request?: PageRequest;
};

/** 用户给出的网址。主机不能事先写进权限清单，所以拉页放在插件源码外面。 */
export async function fetchPage(raw: string, deps: PageFetchDeps = {}): Promise<PageFetchResult> {
  const lookupHost = deps.lookup ?? defaultLookup;
  const request = deps.request ?? defaultRequest;
  let current: URL;
  try {
    current = new URL(raw);
  } catch {
    return { ok: false, detail: "网址格式不对" };
  }
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const blocked = await explainBlocked(current, lookupHost);
    if (blocked) return { ok: false, detail: blocked };
    let response: PageResponse;
    try {
      response = await request(current);
    } catch (error) {
      return { ok: false, detail: messageOf(error) };
    }
    if (response.body.length > MAX_BYTES) return { ok: false, detail: "页面太大" };
    if (isRedirect(response.status)) {
      if (!response.location.trim()) return { ok: false, detail: "页面没有拉下来" };
      try {
        current = new URL(response.location, current);
      } catch {
        return { ok: false, detail: "页面没有拉下来" };
      }
      continue;
    }
    if (response.status !== 200) return { ok: false, detail: "页面没有拉下来" };
    if (!response.body.trim()) return { ok: false, detail: "页面是空的" };
    return { ok: true, html: response.body, finalUrl: current.href };
  }
  return { ok: false, detail: "页面没有拉下来" };
}

async function explainBlocked(target: URL, lookupHost: PageLookup): Promise<string | null> {
  if (target.protocol !== "http:" && target.protocol !== "https:") return "网址格式不对";
  if (target.username || target.password) return "网址格式不对";
  const host = bareHost(target.hostname);
  if (!host) return "网址格式不对";
  if (isBlockedName(host) || isPrivateAddress(host)) return "这个地址不让拉";
  if (net.isIP(host) !== 0) return null;
  let addresses: string[];
  try {
    addresses = await lookupHost(host);
  } catch {
    return "页面没有拉下来";
  }
  if (addresses.length === 0) return "页面没有拉下来";
  if (addresses.some((address) => isPrivateAddress(address))) return "这个地址不让拉";
  return null;
}

function bareHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").replace(/\.+$/g, "").toLowerCase();
}

function isBlockedName(host: string): boolean {
  if (host === "localhost" || host === "localhost.localdomain" || host === "metadata.google.internal") return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (net.isIP(host) === 0 && !host.includes(".")) return true;
  return false;
}

function isPrivateAddress(host: string): boolean {
  const bare = bareHost(host);
  const mapped = ipv4FromMapped(bare);
  const ip = mapped ?? bare;
  if (net.isIP(ip) === 4) return ipv4Private(ip);
  if (net.isIP(ip) === 6) return ipv6Private(ip);
  return false;
}

function ipv4FromMapped(host: string): string | null {
  const marker = "::ffff:";
  const at = host.lastIndexOf(marker);
  if (at < 0) return null;
  const tail = host.slice(at + marker.length);
  if (net.isIP(tail) === 4) return tail;
  const groups = tail.split(":");
  if (groups.length !== 2 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  const hi = Number.parseInt(groups[0] ?? "", 16);
  const lo = Number.parseInt(groups[1] ?? "", 16);
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

function ipv4Private(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function ipv6Private(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  const head = lower.split(":").find((part) => part !== "") ?? "";
  if (head === "fe80" || head.startsWith("fc") || head.startsWith("fd")) return true;
  const mapped = ipv4FromMapped(lower);
  return mapped !== null && ipv4Private(mapped);
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && (error.message === "页面太大" || error.message === "超时了")) return error.message;
  return "页面没有拉下来";
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function defaultRequest(target: URL): Promise<PageResponse> {
  const lib = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          "user-agent": "opc-os-collect",
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const locationHeader = res.headers.location;
        const location = Array.isArray(locationHeader) ? (locationHeader[0] ?? "") : (locationHeader ?? "");
        const lengthHeader = res.headers["content-length"];
        const declared = Number(Array.isArray(lengthHeader) ? lengthHeader[0] : (lengthHeader ?? 0));
        if (Number.isFinite(declared) && declared > MAX_BYTES) {
          res.resume();
          reject(new Error("页面太大"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Uint8Array | string) => {
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
          size += buf.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new Error("页面太大"));
            return;
          }
          chunks.push(buf);
        });
        res.on("end", () => {
          resolve({ status, location, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("超时了"));
    });
    req.on("error", () => {
      reject(new Error("页面没有拉下来"));
    });
    req.end();
  });
}
