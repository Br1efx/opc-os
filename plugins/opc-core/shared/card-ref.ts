import { CARD_PROTOCOL_REVISION, hasCardShape, type Card } from "@opc-os/card-protocol";

/** 核心插件引用的协议修订标记。S1 用它证明和另一个插件是同一份包。 */
export const CORE_CARD_REVISION = CARD_PROTOCOL_REVISION;

export function coreAcceptsCard(value: unknown): value is Card {
  return hasCardShape(value);
}
