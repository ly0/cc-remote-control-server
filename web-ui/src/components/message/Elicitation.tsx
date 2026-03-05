import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { CheckCircle, Terminal } from 'lucide-react';
import type { Message } from '@/types';

interface ElicitationProps {
  event: Message;
  onElicitationResponse?: (requestId: string, action: 'accept' | 'decline', content?: Record<string, unknown>) => void;
}

export function Elicitation({ event, onElicitationResponse }: ElicitationProps) {
  const req = event.request;
  const requestId = event.request_id || req?.request_id;
  const serverName = req?.mcp_server_name || 'MCP Server';
  const message = req?.message || 'Input required';
  const schema = req?.requested_schema;

  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [responded, setResponded] = useState(false);

  const handleSubmit = (action: 'accept' | 'decline') => {
    setResponded(true);
    onElicitationResponse?.(requestId || '', action, action === 'accept' ? formData : {});
  };

  return (
    <Card className={`p-4 border-warning/30 bg-warning/5 ${responded ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <Terminal className="w-4 h-4 text-warning" />
        <span className="font-semibold text-sm">MCP Input Request</span>
      </div>
      <Badge variant="secondary" className="mb-2">{serverName}</Badge>
      <p className="text-sm mb-3">{message}</p>

      {schema?.properties && (
        <div className="space-y-3 mb-3">
          {Object.entries(schema.properties).map(([key, prop]) => (
            <div key={key}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {prop.title || key}
              </label>
              {prop.type === 'boolean' ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={(formData[key] as boolean) || false}
                    onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <span className="text-sm">{prop.description || key}</span>
                </label>
              ) : prop.enum ? (
                <select
                  value={(formData[key] as string) || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
                >
                  {prop.enum.map((v) => (
                    <option key={String(v)} value={String(v)}>
                      {String(v)}
                    </option>
                  ))}
                </select>
              ) : prop.type === 'number' || prop.type === 'integer' ? (
                <Input
                  type="number"
                  placeholder={prop.description || key}
                  value={(formData[key] as number) || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                  className="h-8 text-sm"
                />
              ) : (
                <Input
                  placeholder={prop.description || key}
                  value={(formData[key] as string) || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="h-8 text-sm"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {!responded && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => handleSubmit('accept')}>
            Accept
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleSubmit('decline')}>
            Decline
          </Button>
        </div>
      )}
      {responded && (
        <Badge variant="outline" className="text-success border-success">
          <CheckCircle className="w-3 h-3 mr-1" />
          Responded
        </Badge>
      )}
    </Card>
  );
}
