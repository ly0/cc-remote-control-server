import { useMemo } from 'react';
import type { Message, MessageContent } from '@/types';

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface TaskItem {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed' | 'deleted';
  description?: string;
}

export interface TaskState {
  todos: TodoItem[];
  tasks: Map<string, TaskItem>;
  hasTasks: boolean;
}

/**
 * Extract task ID from a tool_result text string.
 * Handles both JSON format and plain text like "Task #1 created successfully: ..."
 */
function parseTaskIdFromText(text: string): string | null {
  // Try JSON first
  try {
    const parsed = JSON.parse(text);
    const taskData = parsed?.task ?? parsed?.data?.task;
    if (taskData?.id) return String(taskData.id);
    if (parsed?.id) return String(parsed.id);
  } catch {
    // Not JSON — try regex on plain text
  }
  const match = text.match(/Task #(\S+)\b/);
  return match ? match[1] : null;
}

/**
 * Find the task ID from a tool_result for a given tool_use block ID.
 */
function findTaskIdFromResult(messages: Message[], toolUseId: string): string | null {
  for (const msg of messages) {
    if (msg.type !== 'user') continue;
    const content = msg.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as MessageContent[]) {
      if (block.type === 'tool_result' && block.tool_use_id === toolUseId) {
        const resultContent = block.content;
        if (typeof resultContent === 'string') {
          return parseTaskIdFromText(resultContent);
        }
        if (Array.isArray(resultContent)) {
          for (const item of resultContent) {
            if (typeof item === 'object' && item && 'text' in item && typeof (item as { text: string }).text === 'string') {
              const id = parseTaskIdFromText((item as { text: string }).text);
              if (id) return id;
            }
          }
        }
        return null;
      }
    }
  }
  return null;
}

/**
 * Extract task/todo state from all messages.
 */
export function useTaskState(messages: Message[]): TaskState {
  return useMemo(() => {
    let todos: TodoItem[] = [];
    const tasks = new Map<string, TaskItem>();

    for (const msg of messages) {
      if (msg.type !== 'assistant') continue;
      const content = msg.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content as MessageContent[]) {
        if (block.type !== 'tool_use') continue;
        const input = block.input as Record<string, unknown> | undefined;
        if (!input) continue;

        switch (block.name) {
          case 'TodoWrite': {
            // TodoWrite replaces entire todo list
            const rawTodos = input.todos;
            if (Array.isArray(rawTodos)) {
              todos = rawTodos.map((t: unknown) => {
                const todo = t as Record<string, unknown>;
                const s = normalizeStatus(todo.status as string);
                return {
                  content: (todo.content as string) || '',
                  status: (s === 'deleted' ? 'completed' : s) as TodoItem['status'],
                };
              });
            }
            break;
          }

          case 'TaskCreate': {
            const subject = (input.subject as string) || '';
            const description = (input.description as string) || undefined;
            const toolUseId = block.id;
            let taskId = `pending-${toolUseId || Date.now()}`;

            if (toolUseId) {
              const resolved = findTaskIdFromResult(messages, toolUseId);
              if (resolved) {
                taskId = resolved;
              }
            }

            tasks.set(taskId, {
              id: taskId,
              subject,
              status: 'pending',
              description,
            });
            break;
          }

          case 'TaskUpdate': {
            const taskId = (input.taskId as string) || '';
            if (!taskId) break;
            let existing = tasks.get(taskId);

            // If not found by ID, search for a pending-xxx entry that might match
            if (!existing) {
              for (const [key, task] of tasks) {
                if (key.startsWith('pending-')) {
                  // Re-key this entry under the real ID
                  tasks.delete(key);
                  task.id = taskId;
                  tasks.set(taskId, task);
                  existing = task;
                  break;
                }
              }
            }

            if (existing) {
              if (input.status) existing.status = normalizeStatus(input.status as string);
              if (input.subject) existing.subject = input.subject as string;
              if (input.description !== undefined) existing.description = input.description as string;
            } else {
              // Task not found locally (possibly created before history), create entry
              tasks.set(taskId, {
                id: taskId,
                subject: (input.subject as string) || `Task #${taskId}`,
                status: normalizeStatus((input.status as string) || 'pending'),
                description: input.description as string | undefined,
              });
            }
            break;
          }
        }
      }
    }

    const hasTasks = todos.length > 0 || tasks.size > 0;
    return { todos, tasks, hasTasks };
  }, [messages]);
}

function normalizeStatus(status: string): 'pending' | 'in_progress' | 'completed' | 'deleted' {
  switch (status) {
    case 'pending':
    case 'in_progress':
    case 'completed':
    case 'deleted':
      return status;
    case 'in-progress':
      return 'in_progress';
    default:
      return 'pending';
  }
}
