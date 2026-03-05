import { useState } from 'react';
import { ChevronDown, ChevronRight, ListChecks } from 'lucide-react';
import type { TaskState, TodoItem, TaskItem } from '@/hooks/useTaskState';

interface TaskPanelProps {
  taskState: TaskState;
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

function TodoList({ todos }: { todos: TodoItem[] }) {
  return (
    <ul className="space-y-0.5">
      {todos.map((todo, i) => (
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

function TaskList({ tasks }: { tasks: Map<string, TaskItem> }) {
  const visibleTasks = Array.from(tasks.values()).filter((t) => t.status !== 'deleted');
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

export function TaskPanel({ taskState }: TaskPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!taskState.hasTasks) return null;

  const { todos, tasks } = taskState;
  const visibleTasks = Array.from(tasks.values()).filter((t) => t.status !== 'deleted');

  // When tasks exist, hide todos to avoid duplicate display
  const showTodos = todos.length > 0 && visibleTasks.length === 0;

  // Count completed / total — only count what's visible
  const allItems = [
    ...(showTodos ? todos.map((t) => t.status) : []),
    ...visibleTasks.map((t) => t.status),
  ];
  const completedCount = allItems.filter((s) => s === 'completed').length;
  const totalCount = allItems.length;

  return (
    <div className="mx-4 mb-3 rounded-md border border-border bg-muted/30 overflow-hidden">
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
          {showTodos && <TodoList todos={todos} />}
          {visibleTasks.length > 0 && <TaskList tasks={tasks} />}
        </div>
      )}
    </div>
  );
}
