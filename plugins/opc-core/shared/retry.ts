/** 先存后做的重试间隔：2 秒起，翻倍，到 1 分钟封顶。attempt 从 0 开始。 */
export function retryDelayMs(attempt: number): number {
  const step = Math.max(0, Math.floor(attempt));
  return Math.min(60_000, 2_000 * 2 ** step);
}
