import { useState, useRef } from 'react';
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react';
import type { TaskState, TodoItem, TaskItem } from '@/hooks/useTaskState';
import type { Message, MessageContent } from '@/types';

/**
 * Determine if the assistant turn is still active by scanning messages
 * from the end, skipping noise types (keep_alive, system, control_response).
 */
function computeIsTurnActive(messages: Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const type = msg.type;

    if (type === 'assistant' || type === 'stream_event') return true;
    if (type === 'result') return false;
    if (type === 'control_request') return true;

    if (type === 'user') {
      // tool_result only → turn still active (system-generated response)
      const content = msg.message?.content;
      if (
        Array.isArray(content) &&
        content.length > 0 &&
        content.every((b: MessageContent) => b.type === 'tool_result')
      ) {
        return true;
      }
      return false; // real user input
    }
    // skip keep_alive, system, control_response — continue searching
  }
  return false;
}

interface TaskPanelProps {
  taskState: TaskState;
  messages: Message[];
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <span className="text-green-500 shrink-0">&#10003;</span>;
    case 'in_progress':
      return <span className="text-yellow-500 shrink-0 animate-pulse">&#9203;</span>;
    default:
      return <span className="text-muted-foreground shrink-0">&#9744;</span>;
  }
}

function TodoList({ todos, hiddenCompletedIds }: { todos: TodoItem[]; hiddenCompletedIds: Set<string> | null }) {
  const visibleTodos = hiddenCompletedIds
    ? todos.filter((t) => t.status !== 'completed' || !hiddenCompletedIds.has(t.content))
    : todos.filter((t) => t.status !== 'completed');
  if (visibleTodos.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {visibleTodos.map((todo, i) => (
        <li key={i} className="flex items-start gap-2 text-sm py-0.5 px-1">
          <StatusIcon status={todo.status} />
          <span className={todo.status === 'completed' ? 'line-through text-muted-foreground' : ''}>
            {todo.content}
          </span>
        </li>
      ))}
    </ul>
  );
}

function TaskList({ tasks, hiddenCompletedIds }: { tasks: Map<string, TaskItem>; hiddenCompletedIds: Set<string> | null }) {
  const visibleTasks = Array.from(tasks.values()).filter((t) => {
    if (t.status === 'deleted') return false;
    if (t.status !== 'completed') return true;
    // completed: show only if NOT in hiddenCompletedIds (= newly completed this turn)
    return hiddenCompletedIds ? !hiddenCompletedIds.has(t.id) : false;
  });
  if (visibleTasks.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {visibleTasks.map((task) => (
        <li key={task.id} className="flex items-start gap-2 text-sm py-0.5 px-1">
          <StatusIcon status={task.status} />
          <span className={task.status === 'completed' ? 'line-through text-muted-foreground' : ''}>
            {task.subject}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TaskPanel({ taskState, messages }: TaskPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const prevCompletedRef = useRef<Set<string>>(new Set());
  const wasTurnActiveRef = useRef(false);

  if (!taskState.hasTasks) return null;

  const isTurnActive = computeIsTurnActive(messages);
  const { todos, tasks } = taskState;

  // Turn inactive→active: snapshot currently completed IDs
  if (isTurnActive && !wasTurnActiveRef.current) {
    const snapshot = new Set<string>();
    for (const [, task] of tasks) {
      if (task.status === 'completed') snapshot.add(task.id);
    }
    todos.forEach((t) => {
      if (t.status === 'completed') snapshot.add(t.content);
    });
    prevCompletedRef.current = snapshot;
  }
  wasTurnActiveRef.current = isTurnActive;

  // hiddenCompletedIds:
  // - turn active: snapshot set (hide previously completed, show newly completed)
  // - turn inactive: null (hide all completed)
  const hiddenCompletedIds = isTurnActive ? prevCompletedRef.current : null;

  const allTasks = Array.from(tasks.values()).filter((t) => t.status !== 'deleted');

  // When tasks exist, hide todos to avoid duplicate display
  const showTodos = todos.length > 0 && allTasks.length === 0;

  // Check if there are any visible items
  const hasVisibleTasks = allTasks.some((t) =>
    t.status !== 'completed' || (hiddenCompletedIds ? !hiddenCompletedIds.has(t.id) : false)
  );
  const hasVisibleTodos = showTodos && todos.some((t) =>
    t.status !== 'completed' || (hiddenCompletedIds ? !hiddenCompletedIds.has(t.content) : false)
  );
  if (!hasVisibleTasks && !hasVisibleTodos) return null;

  // Count completed / total for progress display
  const allItems = [
    ...(showTodos ? todos.map((t) => t.status) : []),
    ...allTasks.map((t) => t.status),
  ];
  const completedCount = allItems.filter((s) => s === 'completed').length;
  const totalCount = allItems.length;

  return (
    <div className="w-full px-4 pt-3 pb-0">
    <div className="rounded-md border border-border bg-muted/30 overflow-hidden">
      <button
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <ListChecks className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-semibold text-primary">Tasks</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {completedCount}/{totalCount}
        </span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-2 space-y-2">
          {showTodos && <TodoList todos={todos} hiddenCompletedIds={hiddenCompletedIds} />}
          {hasVisibleTasks && (
            <TaskList tasks={tasks} hiddenCompletedIds={hiddenCompletedIds} />
          )}
        </div>
      )}
    </div>
    </div>
  );
}
