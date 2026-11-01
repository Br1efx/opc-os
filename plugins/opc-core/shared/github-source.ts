import { GITHUB_BOT, GITHUB_REPO } from "./dispatcher";

export type GithubComment = {
  id: string;
  login: string;
  body: string;
  at: string;
  issue: string;
  url: string;
};

export function mentionsBot(body: string, bot = GITHUB_BOT): boolean {
  return body.toLowerCase().includes(`@${bot.toLowerCase()}`);
}

export function parseComments(payload: unknown): GithubComment[] {
  if (!Array.isArray(payload)) return [];
  const comments: GithubComment[] = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const user = row.user;
    const login = user && typeof user === "object" ? String((user as { login?: unknown }).login ?? "") : "";
    const id = row.id;
    const body = typeof row.body === "string" ? row.body : "";
    const at = typeof row.created_at === "string" ? row.created_at : "";
    const url = typeof row.html_url === "string" ? row.html_url : "";
    const issueUrl = typeof row.issue_url === "string" ? row.issue_url : "";
    const issue = issueUrl.split("/").pop() ?? "";
    if (typeof id !== "number" && typeof id !== "string") continue;
    if (!login || !issue) continue;
    comments.push({ id: String(id), login, body, at, issue, url });
  }
  return comments;
}

/**
 * 参数里不放令牌。
 * 只把 OPC_GITHUB_TOKEN 放进子进程的 GH_TOKEN，不用调用方环境里别的令牌。
 */
export function githubCommand(args: readonly string[], env: Record<string, string | undefined>): { command: string; args: string[]; env: Record<string, string> } {
  const token = env.OPC_GITHUB_TOKEN || "";
  for (const arg of args) {
    if (token && arg.includes(token)) throw new Error("令牌不能出现在命令参数里");
    if (/^(?:ghp_|github_pat_|ghs_)/.test(arg) || /(?:token|authorization)=/i.test(arg)) {
      throw new Error("令牌不能出现在命令参数里");
    }
  }
  const next: Record<string, string> = {
    PATH: env.PATH || "",
    HOME: env.HOME || "",
    LANG: env.LANG || "C",
    GH_PROMPT_DISABLED: "1",
  };
  if (token) next.GH_TOKEN = token;
  return { command: "gh", args: [...args], env: next };
}

export function commentListArgs(since: string): string[] {
  const query = since ? `?since=${encodeURIComponent(since)}&per_page=100` : "?per_page=100&sort=created&direction=asc";
  return ["api", "--paginate", `repos/${GITHUB_REPO}/issues/comments${query}`];
}

export function commentCreateArgs(issue: string, body: string): string[] {
  return ["api", "--method", "POST", `repos/${GITHUB_REPO}/issues/${issue}/comments`, "-f", `body=${body}`];
}

export const SOURCE_PORTS = [
  { id: "github", title: "GitHub", enabled: true, detail: "用 gh 轮询 opc-os，不开入站端口。身份是 briefx-bot。" },
  { id: "card", title: "卡片墙", enabled: true, detail: "手动新建和转成任务会进同一套接单。" },
  { id: "telegram", title: "Telegram", enabled: false, detail: "只留端口，这一阶段不接。" },
  { id: "grok", title: "Grok", enabled: false, detail: "只留端口，这一阶段不接。" },
  { id: "schedule", title: "定时任务", enabled: false, detail: "只留端口，这一阶段不接。" },
  { id: "collect", title: "收集", enabled: false, detail: "只留端口，这一阶段不接。" },
] as const;
