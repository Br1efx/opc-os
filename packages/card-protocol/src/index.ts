/**
 * 统一卡片协议的类型桩（D0）。
 *
 * 字段与架构说明对齐：id、类型、状态、标题、一句话、负责人、来源、
 * 证据链接、关联卡、时间、未读。这里只给出 TypeScript 形状。
 * 取值范围、校验、Markdown 存法、以及卡片墙如何读取，都不在本包里。
 */

/** 类型桩标记。不是已经发布的协议版本号。 */
export const CARD_PROTOCOL_REVISION = "stub" as const;

/** 卡片类型。选题、任务、资产、问题、素材等取值尚未冻结，故用字符串。 */
export type CardType = string;

/** 卡片状态。状态机尚未冻结，故用字符串。 */
export type CardStatus = string;

/**
 * 一张卡。
 * `owner` 在桩阶段用字符串表示负责人（人或 Agent），不区分身份体系。
 * `evidence` 是证据链接，`related` 是关联卡的 id。
 * `time` 是时间字符串，时区和精度尚未冻结。
 */
export interface Card {
  id: string;
  type: CardType;
  status: CardStatus;
  title: string;
  oneLiner: string;
  owner: string;
  source: string;
  evidence: readonly string[];
  related: readonly string[];
  time: string;
  unread: boolean;
}
