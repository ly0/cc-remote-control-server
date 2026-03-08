import { useMemo } from 'react';
import type { Message } from '@/types';

export interface RenderItem {
  type: 'single' | 'merged-assistant';
  messages: Message[];
  originalIndices: number[];
  key: string;
}

/**
 * Group consecutive visible assistant messages into merged render items.
 * Non-assistant messages remain as single items.
 */
export function useGroupedMessages(
  messages: Message[],
  hiddenIndices: Set<number>,
  debugMode?: boolean,
): RenderItem[] {
  return useMemo(() => {
    const items: RenderItem[] = [];
    let currentGroup: { messages: Message[]; indices: number[] } | null = null;

    const flushGroup = () => {
      if (!currentGroup) return;
      if (currentGroup.messages.length === 1) {
        items.push({
          type: 'single',
          messages: currentGroup.messages,
          originalIndices: currentGroup.indices,
          key: `${currentGroup.messages[0].uuid || currentGroup.indices[0]}-${currentGroup.indices[0]}`,
        });
      } else {
        items.push({
          type: 'merged-assistant',
          messages: currentGroup.messages,
          originalIndices: currentGroup.indices,
          key: `merged-${currentGroup.messages[0].uuid || currentGroup.indices[0]}-${currentGroup.indices[0]}`,
        });
      }
      currentGroup = null;
    };

    for (let i = 0; i < messages.length; i++) {
      if (!debugMode && hiddenIndices.has(i)) continue;
      const msg = messages[i];

      if (msg.type === 'assistant') {
        if (!currentGroup) {
          currentGroup = { messages: [msg], indices: [i] };
        } else {
          currentGroup.messages.push(msg);
          currentGroup.indices.push(i);
        }
      } else {
        flushGroup();
        items.push({
          type: 'single',
          messages: [msg],
          originalIndices: [i],
          key: `${msg.uuid || i}-${i}`,
        });
      }
    }
    flushGroup();

    return items;
  }, [messages, hiddenIndices, debugMode]);
}
