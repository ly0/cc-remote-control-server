import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardCheck, Play, Pencil, MessageSquare, Sparkles } from 'lucide-react';
import type { Message } from '@/types';

interface PlanApprovalCardProps {
  event: Message;
  isAlreadyAnswered?: boolean;
  responseData?: Record<string, unknown>;
  onPlanApproval?: (
    requestId: string,
    action: 'approve' | 'reject',
    mode?: string,
    clearContext?: boolean,
    planContent?: string,
    feedback?: string,
  ) => void;
}

export function PlanApprovalCard({ event, isAlreadyAnswered, responseData, onPlanApproval }: PlanApprovalCardProps) {
  const [answered, setAnswered] = useState(isAlreadyAnswered || false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  useEffect(() => {
    if (isAlreadyAnswered) setAnswered(true);
  }, [isAlreadyAnswered]);

  const requestId = event.request_id || event.request?.request_id || '';
  const planContent = event.request?.plan_content;

  // Determine what was chosen from responseData
  const answeredMode = responseData?.mode as string | undefined;

  const handleApprove = (mode: string, clearContext: boolean) => {
    setAnswered(true);
    setSelectedAction(clearContext ? 'clear-auto' : mode === 'acceptEdits' ? 'auto' : 'manual');
    onPlanApproval?.(requestId, 'approve', mode, clearContext, planContent);
  };

  const handleReject = () => {
    if (!feedbackText.trim() && !showFeedback) {
      setShowFeedback(true);
      return;
    }
    setAnswered(true);
    setSelectedAction('reject');
    onPlanApproval?.(requestId, 'reject', undefined, undefined, undefined, feedbackText.trim() || undefined);
  };

  const getResultLabel = () => {
    if (selectedAction === 'clear-auto') return 'Approved: Clear context & auto-accept';
    if (selectedAction === 'auto') return 'Approved: Auto-accept edits';
    if (selectedAction === 'manual') return 'Approved: Manual approval';
    if (selectedAction === 'reject') return 'Sent back for more planning';
    if (answeredMode) return `Mode: ${answeredMode}`;
    return 'Responded';
  };

  if (answered) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 text-sm text-muted-foreground">
        <ClipboardCheck className="w-4 h-4 text-primary" />
        <span className="font-medium">Plan</span>
        <span>—</span>
        <Badge variant="outline" className="text-primary border-primary">
          {getResultLabel()}
        </Badge>
      </div>
    );
  }

  return (
    <Card className="p-4 border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardCheck className="w-5 h-5 text-primary" />
        <span className="font-semibold">Plan Ready to Execute</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Claude has completed the plan. Choose how to proceed:
      </p>

      <div className="space-y-2">
        <Button
          variant="default"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => handleApprove('acceptEdits', true)}
        >
          <Sparkles className="w-4 h-4" />
          Clear context &amp; auto-accept edits
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => handleApprove('acceptEdits', false)}
        >
          <Play className="w-4 h-4" />
          Auto-accept edits
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => handleApprove('default', false)}
        >
          <Pencil className="w-4 h-4" />
          Manually approve edits
        </Button>
        <div className="pt-1">
          {showFeedback ? (
            <div className="space-y-2">
              <Textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="What changes would you like to the plan?"
                className="min-h-[60px] text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleReject}>
                  <MessageSquare className="w-4 h-4 mr-1" />
                  Send feedback
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowFeedback(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => setShowFeedback(true)}
            >
              <MessageSquare className="w-4 h-4" />
              Continue planning (provide feedback)
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
