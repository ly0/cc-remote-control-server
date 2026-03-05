import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { Environment } from '@/types';

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environment: Environment | null;
  onCreate: (envId: string, title: string, prompt: string) => Promise<void>;
}

export function NewSessionDialog({
  open,
  onOpenChange,
  environment,
  onCreate,
}: NewSessionDialogProps) {
  const [title, setTitle] = useState('Remote Session');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!environment) return;
    setLoading(true);
    try {
      await onCreate(environment.id, title.trim(), prompt.trim());
      setTitle('Remote Session');
      setPrompt('');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>New Session</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="env">Environment</Label>
            <Input
              id="env"
              value={environment ? `${environment.machine_name} — ${environment.directory}` : ''}
              disabled
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Session Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Remote Session"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt">Initial Prompt (optional)</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter an initial message..."
              rows={3}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating...' : 'Create Session'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
