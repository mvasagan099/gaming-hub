import React, { useState, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { Send, MessageSquare } from 'lucide-react';

const initialMessages: ChatMessage[] = [
  { id: '1', sender: 'GamingBot', avatar: '🤖', text: 'Welcome to Gaming Hub Global Chat! Respect other players.', timestamp: '14:30', isSystem: true },
  { id: '2', sender: 'ShadowNinja99', avatar: '🥷', text: 'Anyone up for a 500 coin Chess match?', timestamp: '14:32' },
  { id: '3', sender: 'LudoKing', avatar: '🎲', text: 'Joined room for Ludo multiplayer!', timestamp: '14:35' },
];

export const ChatDrawer: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('chat_history');
    return saved ? JSON.parse(saved) : initialMessages;
  });
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    localStorage.setItem('chat_history', JSON.stringify(messages));
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'You',
      avatar: '🎮',
      text: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText('');
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-3xl border border-slate-800 p-4">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
        <MessageSquare className="w-4 h-4 text-indigo-400" />
        <h3 className="font-extrabold text-white text-sm">Global Community Chat</h3>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-1 max-h-80">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.isSystem ? 'justify-center' : ''}`}>
            {msg.isSystem ? (
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full border border-indigo-500/20 text-center font-medium">
                {msg.text}
              </span>
            ) : (
              <>
                <span className="text-xl select-none">{msg.avatar}</span>
                <div className="flex-1 bg-slate-900/70 p-2.5 rounded-2xl border border-slate-800/80">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-xs font-bold text-indigo-300">{msg.sender}</span>
                    <span className="text-[9px] text-slate-500">{msg.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-200">{msg.text}</p>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={sendMessage} className="pt-3 flex gap-2 border-t border-slate-800">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type message..."
          className="flex-1 bg-slate-900 text-xs text-white rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition-all"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
