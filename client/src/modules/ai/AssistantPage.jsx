// Owner: Hooria. Route: /ai/assistant (registered in src/routes.jsx - do not rename this file or its export).
// AI Assistant chat (FR-AI-01, FR-AI-07). The user asks questions in plain words; Misbah's
// POST /api/ai/chat answers using live data. Errors (AI off, daily limit) appear inside the chat.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  Loader2,
  RotateCcw,
  SendHorizontal,
  Sparkles,
} from 'lucide-react';
import api from '../../api/client';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardIcon,
  CardTitle,
  DotPill,
  Page,
  Progress,
  Textarea,
} from '../../components/ui';
import { cn } from '@/lib/utils';

const MAX_QUESTION = 500; // FR-AI-01
const EXAMPLES = [
  'Is any projector free tomorrow?',
  'Which laptops are on floor 2?',
  'What are my requests?',
];

// Renders inline tokens: **bold**, *italic*, `code`, and [markdown links](url)
function renderInline(text) {
  if (typeof text !== 'string') return text;
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`|\[.*?\]\(.*?\))/g;
  const parts = text.split(regex);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[0.85em] text-primary">
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

function FormattedContent({ text, isUser }) {
  if (isUser) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }

  const rawLines = text.split('\n');
  const blocks = [];
  let currentList = null;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) {
      if (currentList) {
        blocks.push({ type: 'list', items: currentList });
        currentList = null;
      }
      continue;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.*)/);
    if (bulletMatch) {
      if (!currentList) currentList = [];
      currentList.push(bulletMatch[1]);
      continue;
    }

    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      if (!currentList) currentList = [];
      currentList.push(numMatch[2]);
      continue;
    }

    if (currentList) {
      blocks.push({ type: 'list', items: currentList });
      currentList = null;
    }

    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) });
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) });
    } else {
      blocks.push({ type: 'p', text: line });
    }
  }

  if (currentList) {
    blocks.push({ type: 'list', items: currentList });
  }

  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((block, idx) => {
        if (block.type === 'list') {
          return (
            <ul key={idx} className="my-1.5 space-y-1.5 pl-1">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="flex-1">{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'h2' || block.type === 'h3') {
          return (
            <h4 key={idx} className="pt-1 text-sm font-semibold tracking-tight text-foreground">
              {renderInline(block.text)}
            </h4>
          );
        }
        return (
          <p key={idx} className="text-sm">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}

// One chat bubble. The user is on the right, the assistant on the left.
function Bubble({ msg }) {
  const mine = msg.role === 'user';
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-3xl px-5 py-3.5 text-sm',
          mine && 'bg-primary text-primary-foreground rounded-br-md',
          !mine && !msg.error && 'bg-secondary/90 text-secondary-foreground rounded-bl-md border border-border/40 shadow-xs',
          msg.error && 'border-danger/40 bg-danger/14 text-danger rounded-bl-md border',
        )}
      >
        {msg.error && <AlertCircle className="mr-1.5 mb-0.5 inline size-4" />}
        <FormattedContent text={msg.content} isUser={mine} />
        {msg.links?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/40 pt-2.5">
            {msg.links.map((l) => (
              <Button key={l.href} asChild size="sm" variant="outline" className="h-8 gap-1.5 bg-background/50 text-xs shadow-xs hover:bg-background">
                <Link to={l.href} target="_blank" rel="noopener noreferrer">
                  {l.label} <ArrowUpRight className="size-3" />
                </Link>
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const [messages, setMessages] = useState([]); // [{ role: 'user' | 'assistant', content, links?, error? }]
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState(null);
  const bottomRef = useRef(null);

  const loadUsage = () =>
    api
      .get('/ai/usage')
      .then(setUsage)
      .catch(() => {});

  useEffect(() => {
    loadUsage();
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, sending]);

  async function send(text = question) {
    const q = text.trim();
    if (!q || sending) return;

    // History = earlier turns as plain text, oldest first. Error bubbles are not part of the conversation.
    const history = messages
      .filter((m) => !m.error)
      .map(({ role, content }) => ({ role, content }));

    setMessages((list) => [...list, { role: 'user', content: q }]);
    setQuestion('');
    setSending(true);

    try {
      const { answer, links } = await api.post('/ai/chat', { question: q, history });
      setMessages((list) => [...list, { role: 'assistant', content: answer, links }]);
    } catch (err) {
      // FR-AI-07: 503 (AI unavailable), 429 (daily limit) or a network error, shown as a chat message.
      // 'Failed to fetch' / 'Request failed (502)' mean the server itself did not answer.
      const offline = /^(Failed to fetch|Request failed)/.test(err.message);
      const text = offline
        ? 'Cannot reach the server right now. Please try again in a moment.'
        : err.message;
      setMessages((list) => [...list, { role: 'assistant', content: text, error: true }]);
    } finally {
      setSending(false);
      loadUsage();
    }
  }

  function onKeyDown(e) {
    // Enter sends, Shift+Enter makes a new line.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <Page
      title="AI"
      accent="assistant"
      description="Ask about assets, availability and your requests in plain words."
      actions={
        messages.length > 0 && (
          <Button variant="outline" onClick={() => setMessages([])} disabled={sending}>
            <RotateCcw /> New chat
          </Button>
        )
      }
    >
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_18rem]">
        <Card className="min-h-[28rem] gap-0 py-0">
          <div
            className="flex max-h-[60vh] min-h-[22rem] flex-col gap-3 overflow-y-auto p-5"
            aria-live="polite"
          >
            {messages.length === 0 && (
              <div className="m-auto flex max-w-md flex-col items-center gap-3 text-center">
                <span className="bg-orb size-14 rounded-full" aria-hidden="true" />
                <p className="font-display text-xl">How can I help?</p>
                <p className="text-muted-foreground text-sm">
                  I can check what is free, where things are and how your requests are going. Try one of these:
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map((ex) => (
                    <Button key={ex} size="sm" variant="secondary" onClick={() => send(ex)}>
                      {ex}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <Bubble key={i} msg={m} />
            ))}
            {sending && (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Thinking...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-border flex items-end gap-2 border-t p-4"
          >
            <div className="flex-1">
              <Textarea
                rows={2}
                maxLength={MAX_QUESTION}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask a question..."
                aria-label="Your question"
                className="resize-none"
              />
              <p className="text-muted-foreground mt-1 text-right text-xs tabular-nums">
                {question.length} / {MAX_QUESTION}
              </p>
            </div>
            <Button
              type="submit"
              variant="brand"
              size="icon"
              className="mb-6"
              disabled={sending || !question.trim()}
              aria-label="Send"
            >
              <SendHorizontal />
            </Button>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <CardIcon icon={Sparkles} /> Today's AI use
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {usage ? (
              <>
                <p className="font-display text-3xl">
                  {usage.used}
                  <span className="text-muted-foreground text-base"> of {usage.limit}</span>
                </p>
                <Progress value={(usage.used / usage.limit) * 100} />
                <p className="text-muted-foreground text-xs">
                  AI requests used today. Chat and Recommendation share this limit.
                </p>
                {!usage.ai_available && (
                  <DotPill tone="warning">AI is switched off on this server</DotPill>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Loading...</p>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
