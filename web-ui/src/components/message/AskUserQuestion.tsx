import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { CheckCircle, Bot } from 'lucide-react';
import type { Question } from '@/types';

interface AskUserQuestionProps {
  questions: Question[];
  isAlreadyAnswered?: boolean;
  responseData?: Record<string, unknown>;
  onSubmit: (updatedInput: unknown) => void;
}

export function AskUserQuestion({ questions, isAlreadyAnswered, responseData, onSubmit }: AskUserQuestionProps) {
  const [answered, setAnswered] = useState(isAlreadyAnswered || false);

  useEffect(() => {
    if (isAlreadyAnswered) setAnswered(true);
  }, [isAlreadyAnswered]);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});

  // When externally answered, populate answers from responseData
  useEffect(() => {
    if (!isAlreadyAnswered || !responseData?.updatedInput) return;
    const updatedInput = responseData.updatedInput as { answers?: Record<string, string> };
    if (!updatedInput.answers) return;
    const newAnswers: Record<number, string[]> = {};
    questions.forEach((q, idx) => {
      const val = updatedInput.answers?.[q.question];
      if (val) {
        newAnswers[idx] = val.split(',').map((s) => s.trim());
      }
    });
    setAnswers(newAnswers);
  }, [isAlreadyAnswered, responseData, questions]);
  const [otherInputs, setOtherInputs] = useState<Record<number, string>>({});

  const handleOptionToggle = (qIndex: number, value: string, isMulti: boolean) => {
    setAnswers((prev) => {
      const current = prev[qIndex] || [];
      if (isMulti) {
        if (current.includes(value)) {
          return { ...prev, [qIndex]: current.filter((v) => v !== value) };
        }
        return { ...prev, [qIndex]: [...current, value] };
      }
      return { ...prev, [qIndex]: [value] };
    });
  };

  const handleSubmit = () => {
    const result: Record<string, string> = {};
    questions.forEach((q, idx) => {
      const ans = answers[idx] || [];
      const otherVal = otherInputs[idx];
      const finalAns = ans.map((v) => (v === '__other__' && otherVal ? otherVal : v));
      result[q.question] = finalAns.join(',');
    });

    setAnswered(true);
    onSubmit({ questions, answers: result });
  };

  return (
    <Card className={`p-4 border-primary/30 bg-primary/5 ${answered ? 'opacity-60 pointer-events-none' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm">User Input Required</span>
      </div>

      {questions.map((q, qIdx) => (
        <div key={qIdx} className="mb-4 last:mb-0">
          {q.header && (
            <Badge variant="outline" className="mb-2">{q.header}</Badge>
          )}
          <p className="text-sm font-medium mb-2">{q.question}</p>
          <div className="space-y-1">
            {q.options.map((opt, oIdx) => (
              <label
                key={oIdx}
                className={`flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                  answers[qIdx]?.includes(opt.label) ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'
                }`}
              >
                <input
                  type={q.multiSelect ? 'checkbox' : 'radio'}
                  name={`q-${qIdx}`}
                  checked={answers[qIdx]?.includes(opt.label) || false}
                  onChange={() => handleOptionToggle(qIdx, opt.label, !!q.multiSelect)}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium">{opt.label}</div>
                  {opt.description && (
                    <div className="text-xs text-muted-foreground">{opt.description}</div>
                  )}
                </div>
              </label>
            ))}
            <label
              className={`flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                answers[qIdx]?.includes('__other__') ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'
              }`}
            >
              <input
                type={q.multiSelect ? 'checkbox' : 'radio'}
                name={`q-${qIdx}`}
                checked={answers[qIdx]?.includes('__other__') || false}
                onChange={() => handleOptionToggle(qIdx, '__other__', !!q.multiSelect)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="text-sm font-medium">Other</div>
                <Input
                  placeholder="Type your answer..."
                  value={otherInputs[qIdx] || ''}
                  onChange={(e) => setOtherInputs((prev) => ({ ...prev, [qIdx]: e.target.value }))}
                  onClick={(e) => e.stopPropagation()}
                  onFocus={() => handleOptionToggle(qIdx, '__other__', !!q.multiSelect)}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            </label>
          </div>
        </div>
      ))}

      {!answered && (
        <Button size="sm" onClick={handleSubmit} className="mt-2">
          Submit
        </Button>
      )}
      {answered && (
        <Badge variant="outline" className="text-success border-success mt-2">
          <CheckCircle className="w-3 h-3 mr-1" />
          Answered
        </Badge>
      )}
    </Card>
  );
}
