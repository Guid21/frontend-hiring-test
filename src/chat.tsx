import React, { useCallback, useRef, useState } from "react";
import { ItemContent, Virtuoso, VirtuosoHandle } from "react-virtuoso";
import cn from "clsx";
import {
  MessageSender,
  type Message,
} from "../__generated__/resolvers-types";
import css from "./chat.module.css";
import { useQueryMessages, useSubscriptionMessages, useSendMessage } from "./hooks/useChatMessages";


export const Chat: React.FC = () => {
  const [input, setInput] = useState("");
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { messages, loadMore, error } = useQueryMessages();
  useSubscriptionMessages();
  const { sendMessage } = useSendMessage();

  const handleMessage = useCallback(() => {
    sendMessage(input);
  }, [sendMessage, input]);

  return (
    <div className={css.root}>
      <div className={css.container}>
        {error && (
          <div style={{ color: 'red', marginBottom: 8 }}>
            Error loading messages: {error.message}
          </div>
        )}
        <Virtuoso
          ref={virtuosoRef}
          className={css.list}
          data={messages}
          itemContent={getItem}
          endReached={loadMore}
          overscan={200}
        />
      </div>
      <div className={css.footer}>
        <input
          type="text"
          className={css.textInput}
          placeholder="Message text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleMessage();
          }}
        />
        <button onClick={handleMessage}>Send</button>
      </div>
    </div>
  );
};

const Item: React.FC<Message> = ({ text, sender }) => (
  <div className={css.item}>
    <div
      className={cn(
        css.message,
        sender === MessageSender.Admin ? css.out : css.in
      )}
    >
      {text}
    </div>
  </div>
);

const getItem: ItemContent<Message, unknown> = (_, data) => <Item {...data} />;
