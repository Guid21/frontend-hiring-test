import React, { useCallback, useMemo, useRef, useState } from "react";
import { ItemContent, Virtuoso, VirtuosoHandle } from "react-virtuoso";
import cn from "clsx";
import {
  MessageSender,
  type Message,
  type Query,
  type Mutation,
} from "../__generated__/resolvers-types";
import css from "./chat.module.css";
import { ApolloClient, useMutation, useQuery } from "@apollo/client";
import { MESSAGES_QUERY, SEND_MESSAGE_MUTATION } from "./graphql/messages";

const PAGE_SIZE = 10;

const useUpsertMessageInCache = (client: ApolloClient<unknown>) => useCallback(
  (messages: Message[]) => {
    client.cache.updateQuery<{ messages: Query["messages"] }>({
      query: MESSAGES_QUERY,
      variables: { first: PAGE_SIZE },
    }, (cachedData) => {
      if (!cachedData) return cachedData;
      const edges = cachedData.messages.edges.slice();
      
      messages.forEach((message) => {
        const idx = edges.findIndex((e) => e.node.id === message.id);
        if (idx !== -1) {
          // Only update if incoming message is fresher
          if (new Date(message.updatedAt) > new Date(edges[idx].node.updatedAt)) {
            edges[idx] = { ...edges[idx], node: message };
          }
        } else {
          // Add new message to the end (or start, depending on order)
          edges.push({ node: message, cursor: message.id });
        }
      });
      
      return {
        ...cachedData,
        messages: {
          ...cachedData.messages,
          edges,
        },
      };
    });
  },
  [client.cache]
);

const useQueryMessages = () => {
  const { data, error, fetchMore, client, loading: isLoading } = useQuery<Query>(MESSAGES_QUERY, {
    variables: { first: PAGE_SIZE },
    notifyOnNetworkStatusChange: true,
  });
  const upsertMessageInCache = useUpsertMessageInCache(client);

  const messages = useMemo(
    () => data?.messages?.edges?.map((edge) => edge.node) ?? [],
    [data]
  );
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()),
    [messages]
  );

  const endCursor = data?.messages?.pageInfo?.endCursor;
  const hasNextPage = data?.messages?.pageInfo?.hasNextPage;

  const loadMore = useCallback(async () => {
    if (hasNextPage && endCursor) {
      const {data} = await fetchMore({
        variables: { first: PAGE_SIZE, after: endCursor },
        updateQuery: (prevResult, { fetchMoreResult }) => {
          if (!fetchMoreResult) return prevResult;
          return {
            messages: {
              ...prevResult.messages,
              pageInfo: fetchMoreResult.messages.pageInfo
            },
          };
        },
      });
      upsertMessageInCache(data.messages.edges.map((edge) => edge.node));
    }
  }, [ hasNextPage, endCursor, fetchMore, upsertMessageInCache]);

  return {
    messages: sortedMessages,
    pageInfo: data?.messages?.pageInfo,
    error,
    isLoading,
    loadMore,
  };
};

const useSendMessage = ({ onCompleted }: { onCompleted?: () => void }) => {
  const [sendMessage, { loading: isSending, client }] = useMutation<Mutation>(SEND_MESSAGE_MUTATION);
  const upsertMessageInCache = useUpsertMessageInCache(client);

  const handleSend = useCallback(
    async (text: string) => {
      if (text.trim()) {
        await sendMessage({
          variables: { text }, onCompleted, update: (_, { data }) => {
            const message = data?.sendMessage;
            if (message) upsertMessageInCache([message]);
          },
        });
      }
    },
    [sendMessage, onCompleted, upsertMessageInCache]
  );

  return {
    sendMessage: handleSend,
    isSending,
  };
};

export const Chat: React.FC = () => {
  const [input, setInput] = useState("");
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { messages, loadMore } = useQueryMessages();



  const { sendMessage } = useSendMessage({
    onCompleted: () => {
      setInput("");
    },
  });

  const handleMessage = useCallback(() => {
    sendMessage(input);
  }, [sendMessage, input]);


  return (
    <div className={css.root}>
      <div className={css.container}>
        <Virtuoso
          ref={virtuosoRef}
          className={css.list}
          data={[...messages]}
          
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
        <button onClick={handleMessage}>
          Send
        </button>
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
