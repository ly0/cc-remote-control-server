import type { Message, MessageContent } from '@/types';

/**
 * Check if a message is a pure tool_result user message
 * (content array contains only tool_result blocks, no text blocks).
 */
function isToolResultOnlyMessage(msg: Message): boolean {
  if (msg.type !== 'user') return false;
  const content = msg.message?.content;
  if (!Array.isArray(content) || content.length === 0) return false;
  return content.every((block) => block.type === 'tool_result');
}

/**
 * Pre-process the messages array to build cross-message tool_use_id → tool_result mapping.
 *
 * Returns:
 * - toolResultsByIndex: Map where key is the assistant message index,
 *   value is a Map of tool_use_id → tool_result MessageContent
 * - hiddenIndices: Set of message indices that should be hidden
 *   (pure tool_result user messages that have been associated)
 */
export function buildCrossMessageToolResultMap(messages: Message[]) {
  const toolResultsByIndex = new Map<number, Map<string, MessageContent>>();
  const hiddenIndices = new Set<number>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!isToolResultOnlyMessage(msg)) continue;

    const content = msg.message!.content as MessageContent[];

    // Find the nearest preceding assistant message
    let assistantIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].type === 'assistant') {
        assistantIdx = j;
        break;
      }
    }
    if (assistantIdx === -1) continue;

    // Build the result map for this assistant message
    if (!toolResultsByIndex.has(assistantIdx)) {
      toolResultsByIndex.set(assistantIdx, new Map());
    }
    const resultMap = toolResultsByIndex.get(assistantIdx)!;

    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        resultMap.set(block.tool_use_id, block);
      }
    }

    hiddenIndices.add(i);
  }

  return { toolResultsByIndex, hiddenIndices };
}
