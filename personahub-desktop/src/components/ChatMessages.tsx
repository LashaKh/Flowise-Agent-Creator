import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';

interface ChatMessagesProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export default function ChatMessages({ messages, isStreaming }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or content streams in
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Send a message to start the conversation.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
        <StreamingIndicator />
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [showTimestamp, setShowTimestamp] = useState(false);
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      <div className="max-w-[75%] relative">
        <div
          className={`rounded-lg px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-indigo-600 text-white'
              : message.error
                ? 'bg-gray-800 text-white border border-red-500/50'
                : 'bg-gray-800 text-gray-100'
          }`}
        >
          {message.content}
          {message.isStreaming && <StreamingCursor />}
          {message.error && (
            <p className="text-red-400 text-xs mt-2">{message.error}</p>
          )}
        </div>
        {showTimestamp && (
          <div
            className={`absolute -bottom-5 text-[10px] text-gray-500 ${
              isUser ? 'right-0' : 'left-0'
            }`}
          >
            {formatTime(message.createdAt)}
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-gray-800 rounded-lg px-4 py-2.5">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function StreamingCursor() {
  return <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-text-bottom" />;
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
