import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { api } from '../api/client';

function Bubble({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
          isUser
            ? 'rounded-br-sm bg-indigo-600 text-white'
            : 'rounded-bl-sm bg-slate-800 text-slate-200'
        }`}
      >
        {content}
      </div>
    </div>
  );
}

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // History is only fetched once the panel is actually opened, so the widget
  // costs nothing on pages the student never chats from.
  useEffect(() => {
    if (!open || loaded) return;
    api.chat.history()
      .then((r) => {
        setMessages(r.messages);
        setSuggestions(r.suggestions || []);
        setLoaded(true);
      })
      .catch((err) => setError(err.message));
  }, [open, loaded]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;

    setError('');
    setInput('');
    // Shown immediately with a temporary id; the server's copy replaces the
    // list on the next render, so a failed send can roll it back.
    const optimistic = { id: `tmp-${Date.now()}`, role: 'user', content: question };
    setMessages((m) => [...m, optimistic]);
    setSending(true);

    try {
      const r = await api.chat.send(question);
      setMessages((m) => [...m, r.message]);
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(question);
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const clear = async () => {
    if (!window.confirm('Clear this conversation?')) return;
    try {
      await api.chat.clear();
      setMessages([]);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open the study assistant"
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500"
      >
        <MessageCircle size={24} />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end p-0 sm:p-5">
      {/* Backdrop only on phones, where the panel fills the screen. */}
      <div className="absolute inset-0 bg-black/50 sm:hidden" onClick={() => setOpen(false)} />

      <div className="relative flex h-full w-full flex-col border border-slate-800 bg-surface-900 shadow-2xl sm:h-[34rem] sm:w-[24rem] sm:rounded-2xl">
        <header className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600/20">
            <Bot size={17} className="text-indigo-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Study Assistant</p>
            <p className="text-xs text-slate-500">Knows your units, tasks and timetable</p>
          </div>
          {messages.length > 0 && (
            <button onClick={clear} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-400" title="Clear conversation">
              <Trash2 size={15} />
            </button>
          )}
          <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" title="Close">
            <X size={17} />
          </button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {!loaded && !error && (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-600" />
            </div>
          )}

          {loaded && messages.length === 0 && (
            <div className="py-4 text-center">
              <Bot size={30} className="mx-auto mb-3 text-slate-700" />
              <p className="text-sm text-slate-400">Ask me anything about your studies</p>
              <p className="mt-1 text-xs text-slate-600">
                Your timetable, deadlines, progress — or how any page works.
              </p>
            </div>
          )}

          {messages.map((m) => <Bubble key={m.id} role={m.role} content={m.content} />)}

          {sending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-slate-800 px-3.5 py-2.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500" />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        {loaded && messages.length === 0 && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-slate-800 px-4 py-3">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:border-indigo-500 hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-end gap-2 border-t border-slate-800 p-3"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a newline.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about today, deadlines, or how to…"
            className="input max-h-28 flex-1 resize-none py-2"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40"
            aria-label="Send"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </form>
      </div>
    </div>
  );
}
