import { AlertCircle, Terminal, Bot, User } from 'lucide-react';

interface AvatarProps {
  type: 'user' | 'assistant' | 'system' | 'error';
}

export function Avatar({ type }: AvatarProps) {
  const bgColor = type === 'user'
    ? 'bg-blue-500'
    : type === 'assistant'
      ? 'bg-purple-500'
      : type === 'error'
        ? 'bg-red-500'
        : 'bg-gray-500';

  const Icon = type === 'user'
    ? User
    : type === 'assistant'
      ? Bot
      : type === 'error'
        ? AlertCircle
        : Terminal;

  return (
    <div className={`shrink-0 w-10 h-10 rounded-full ${bgColor} flex items-center justify-center`}>
      <Icon className="w-5 h-5 text-white" />
    </div>
  );
}
