import assert from "node:assert/strict";
import test from "node:test";
import { fetchPage, type PageRequest } from "./index.ts";

const html = "<p>甲</p>";

function okRequest(body = html): PageRequest {
  return async () => ({ status: 200, location: "", body });
}

test("回环、本机名和内网地址不发请求", async () => {
  const urls = ["http://127.0.0.1/secret", "http://[::1]/", "http://2130706433/", "http://localhost/a", "http://printer/a", "https://files.local/a"];
  for (const url of urls) {
    let called = false;
    const result = await fetchPage(url, {
      request: async () => {
        called = true;
        return { status: 200, location: "", body: html };
      },
    });
    assert.equal(called, false, url);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.detail, "这个地址不让拉");
  }
});

test("带账号的网址和不是网页的协议直接拒绝", async () => {
  const secret = await fetchPage("https://user:pass@example.com/a", { lookup: async () => ["93.184.216.34"], request: okRequest() });
  assert.equal(secret.ok, false);
  if (!secret.ok) assert.equal(secret.detail, "网址格式不对");
  const file = await fetchPage("file:///etc/passwd", { request: okRequest() });
  assert.equal(file.ok, false);
  if (!file.ok) assert.equal(file.detail, "网址格式不对");
});

test("解析到内网地址时不发请求", async () => {
  let called = false;
  const result = await fetchPage("https://example.com/a", {
    lookup: async () => ["127.0.0.1"],
    request: async () => {
      called = true;
      return { status: 200, location: "", body: html };
    },
  });
  assert.equal(called, false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.detail, "这个地址不让拉");
});

test("公网页面返回正文，跳到回环时停住", async () => {
  const ok = await fetchPage("https://example.com/post", {
    lookup: async () => ["93.184.216.34"],
    request: async (target) => {
      if (target.pathname === "/post") return { status: 302, location: "/next", body: "" };
      return { status: 200, location: "", body: html };
    },
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.html, html);
    assert.equal(ok.finalUrl, "https://example.com/next");
  }

  let sawLoopback = false;
  const blocked = await fetchPage("https://example.com/post", {
    lookup: async () => ["93.184.216.34"],
    request: async (target) => {
      if (target.hostname === "127.0.0.1") sawLoopback = true;
      return { status: 302, location: "http://127.0.0.1/secret", body: "" };
    },
  });
  assert.equal(sawLoopback, false);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.detail, "这个地址不让拉");
});

test("空页面、过大页面和失败状态用中文说明", async () => {
  const lookup = async () => ["93.184.216.34"];
  const empty = await fetchPage("https://example.com/a", { lookup, request: async () => ({ status: 200, location: "", body: "  " }) });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.detail, "页面是空的");
  const missing = await fetchPage("https://example.com/a", { lookup, request: async () => ({ status: 404, location: "", body: "no" }) });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.detail, "页面没有拉下来");
  const huge = await fetchPage("https://example.com/a", {
    lookup,
    request: async () => ({ status: 200, location: "", body: "x".repeat(1_500_001) }),
  });
  assert.equal(huge.ok, false);
  if (!huge.ok) assert.equal(huge.detail, "页面太大");
});
