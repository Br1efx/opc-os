import { CARD_PROTOCOL_REVISION, hasCardShape, type Card } from "@opc-os/card-protocol";

/** 探针插件引用的协议修订标记。应与 opc-core 的 CORE_CARD_REVISION 相同。 */
export const PEER_CARD_REVISION = CARD_PROTOCOL_REVISION;

export function peerAcceptsCard(value: unknown): value is Card {
  return hasCardShape(value);
}
