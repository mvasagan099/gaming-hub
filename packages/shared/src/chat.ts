export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string | null;
  senderName: string;
  body: string;
  isSystem: boolean;
  createdAt: string;
}

export interface ChatEmoji {
  roomId: string;
  userId: string;
  senderName: string;
  emoji: string;
  createdAt: string;
}

export const EMOJI_SET = [
  "😂",
  "😍",
  "😎",
  "😡",
  "😭",
  "🤯",
  "🔥",
  "👍",
  "👏",
  "💪",
  "🙌",
  "🎉",
  "🤝",
  "😴",
  "👀",
  "🏆",
] as const;

export type EmojiCode = (typeof EMOJI_SET)[number];
