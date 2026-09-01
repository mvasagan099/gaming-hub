import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { EMOJI_SET } from "@gaming-hub/shared";
import type { ChatEmoji, ChatMessage } from "@gaming-hub/shared";

interface RoomChatProps {
  messages: ChatMessage[];
  emojis: ChatEmoji[];
  myUserId: string | null;
  onSend: (text: string) => Promise<void>;
  onEmoji: (emoji: string) => Promise<void>;
}

interface FloatEmoji {
  key: number;
  senderName: string;
  emoji: string;
}

export function RoomChat({ messages, emojis, myUserId, onSend, onEmoji }: RoomChatProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [floats, setFloats] = useState<FloatEmoji[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);
  const seenRef = useRef(0);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    for (let i = seenRef.current; i < emojis.length; i++) {
      const emoji = emojis[i];
      const key = ++counterRef.current;
      setFloats((prev) => [...prev.slice(-4), { key, senderName: emoji.senderName, emoji: emoji.emoji }]);
      setTimeout(() => setFloats((prev) => prev.filter((f) => f.key !== key)), 2400);
    }
    seenRef.current = emojis.length;
  }, [emojis]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(body);
      setText("");
    } catch {
      // Error surfaces via the room error banner.
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div ref={listRef} className="absolute inset-0 overflow-y-auto pr-1 space-y-2">
          {messages.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-500 text-center pt-6">
              No messages yet. Say hi!
            </p>
          )}
          {messages.map((message) => {
            const mine = myUserId != null && message.userId === myUserId;
            if (message.isSystem) {
              return (
                <div key={message.id} className="text-center">
                  <span className="text-[10px] text-slate-500 italic">{message.body}</span>
                </div>
              );
            }
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-xs ${
                    mine
                      ? "bg-indigo-600 text-white rounded-br-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm"
                  }`}
                >
                  {!mine && (
                    <p className="text-[10px] font-bold text-indigo-400 dark:text-indigo-300 mb-0.5">
                      {message.senderName}
                    </p>
                  )}
                  <p className="leading-snug break-words">{message.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {floats.map((f) => (
          <div
            key={f.key}
            className="pointer-events-none absolute right-2 top-6 text-3xl animate-[emojiFloat_2.4s_ease-out_forwards]"
            title={`${f.senderName} reacted`}
          >
            {f.emoji}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 pt-2">
        {EMOJI_SET.map((emoji) => (
          <button
            key={emoji}
            onClick={() => void onEmoji(emoji)}
            className="w-7 h-7 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-sm transition-colors"
            title={`Send ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSend();
          }}
          placeholder="Type a message…"
          className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
        <button
          onClick={() => void handleSend()}
          disabled={!text.trim() || sending}
          className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
