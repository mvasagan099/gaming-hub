import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { EMOJI_SET } from "@gaming-hub/shared";
import { useMultiplayerStore } from "../../../store/multiplayerStore";
import { useAuthStore } from "../../../store/authStore";

interface FloatEmoji {
  key: number;
  senderName: string;
  emoji: string;
}

const TYPING_THROTTLE_MS = 3000;

/** Compact in-match chat: messages, floating emoji reactions, typing indicator. */
export function MultiplayerMatchChat() {
  const messages = useMultiplayerStore((s) => s.messages);
  const emojis = useMultiplayerStore((s) => s.emojis);
  const typing = useMultiplayerStore((s) => s.typing);
  const sendMessage = useMultiplayerStore((s) => s.sendMessage);
  const sendEmoji = useMultiplayerStore((s) => s.sendEmoji);
  const sendTyping = useMultiplayerStore((s) => s.sendTyping);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [floats, setFloats] = useState<FloatEmoji[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);
  const seenRef = useRef(0);
  const lastTypingSentRef = useRef(0);
  const typedOnceRef = useRef(false);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, typing]);

  useEffect(() => {
    for (let i = seenRef.current; i < emojis.length; i++) {
      const emoji = emojis[i];
      const key = ++counterRef.current;
      setFloats((prev) => [...prev.slice(-4), { key, senderName: emoji.senderName, emoji: emoji.emoji }]);
      setTimeout(() => setFloats((prev) => prev.filter((f) => f.key !== key)), 2400);
    }
    seenRef.current = emojis.length;
  }, [emojis]);

  const notifyTyping = () => {
    const now = Date.now();
    if (!typedOnceRef.current || now - lastTypingSentRef.current >= TYPING_THROTTLE_MS) {
      lastTypingSentRef.current = now;
      typedOnceRef.current = true;
      void sendTyping().catch(() => undefined);
    }
  };

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendMessage(body);
      setText("");
      typedOnceRef.current = false;
    } catch {
      // Errors surface via the room error banner / toast.
    } finally {
      setSending(false);
    }
  };

  const typingNames = typing.map((t) => t.senderName).filter(Boolean);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div ref={listRef} className="absolute inset-0 overflow-y-auto pr-1 space-y-2">
          {messages.length === 0 && (
            <p className="text-xs text-slate-500 text-center pt-4">
              No messages yet. Say hi!
            </p>
          )}
          {messages.map((message) => {
            const mine = userId != null && message.userId === userId;
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
          {typingNames.length > 0 && (
            <p className="text-[10px] text-slate-500 italic px-1">
              {typingNames.length === 1 ? `${typingNames[0]} is typing…` : `${typingNames.join(", ")} are typing…`}
            </p>
          )}
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
            onClick={() => void sendEmoji(emoji)}
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
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) notifyTyping();
          }}
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
