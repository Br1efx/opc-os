import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { GATEWAY_DEFAULTS } from "./gateway";

/**
 * 网关页自己的主机设置，和外壳的模块开关分开。
 * 真机探测默认关闭，手机先看到标明的模拟花费。
 */
export const gatewaySettings = defineSettings({
  id: "gateway",
  scope: "host",
  version: 1,
  schema: z.object({
    probe: z.boolean().default(GATEWAY_DEFAULTS.probe),
    spendLimitUsd: z.number().min(0).max(1_000_000).default(GATEWAY_DEFAULTS.spendLimitUsd),
    person: z.string().min(1).max(64).default(GATEWAY_DEFAULTS.person),
    project: z.string().min(1).max(64).default(GATEWAY_DEFAULTS.project),
    role: z.string().min(1).max(64).default(GATEWAY_DEFAULTS.role),
    module: z.string().min(1).max(64).default(GATEWAY_DEFAULTS.module),
  }),
});
