import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@apollo/client";
import {
  Subscription,
  type Query,
  type Mutation,
  type MessageEdge,
  type Message,
} from "../../__generated__/resolvers-types";
import {
  MESSAGE_ADDED_SUBSCRIPTION,
  MESSAGE_UPDATED_SUBSCRIPTION,
  MESSAGES_QUERY,
  SEND_MESSAGE_MUTATION,
} from "../../src/graphql/messages";

const PAGE_SIZE = 10;

const getCursor = (message: Message) => `client:${message.sender}:${message.id}`;

export function useQueryMessages() {
  const { data, error, fetchMore, loading: isLoading, subscribeToMore } = useQuery<Query>(MESSAGES_QUERY, {
    variables: { first: PAGE_SIZE },
    notifyOnNetworkStatusChange: true,
  });

  const messages = useMemo(
    () => data?.messages?.edges?.map((edge) => edge.node) ?? [],
    [data]
  );

  const endCursor = data?.messages?.pageInfo?.endCursor;
  const hasNextPage = data?.messages?.pageInfo?.hasNextPage;

  const loadMore = useCallback(async () => {
    if (hasNextPage && endCursor) {
      fetchMore({
        variables: { first: PAGE_SIZE, after: endCursor },
      });
    }
  }, [hasNextPage, endCursor, fetchMore]);


  useEffect(() => {
    const unsubAdded = subscribeToMore<Subscription, Query>({
      document: MESSAGE_ADDED_SUBSCRIPTION,
      updateQuery: (prev, { subscriptionData }) => {
        const messageAdded = subscriptionData.data?.messageAdded;
        if (!messageAdded) return prev;
        const alreadyExists = prev.messages.edges.some((edge) => edge.node.id === messageAdded.id && edge.node.sender === messageAdded.sender);

        if (alreadyExists) {
          return prev;
        }
        const cursor = getCursor(messageAdded);
        const newEdge = {
          __typename: "MessageEdge" as const,
          cursor: cursor,
          node: messageAdded
        };

        return {
          ...prev,
          messages: {
            ...prev.messages,
            edges: [...prev.messages.edges, newEdge],
            pageInfo: {
              ...prev.messages.pageInfo,
              hasNextPage: false,
            },
          },
        };
      },
    })

    const unsubUpdated = subscribeToMore<Subscription>({
      document: MESSAGE_UPDATED_SUBSCRIPTION,
      updateQuery: (prev, { subscriptionData }) => {
        const messageUpdated = subscriptionData.data?.messageUpdated;
        if (!messageUpdated) return prev;
        const updatedEdges = prev.messages.edges.map((edge) => {
          if (edge.node.id === messageUpdated.id && edge.node.sender === messageUpdated.sender) {
            const existingUpdatedAt = edge.node.updatedAt;
            const incomingUpdatedAt = messageUpdated.updatedAt;

            if (new Date(incomingUpdatedAt).getTime() >= new Date(existingUpdatedAt).getTime()) {
              return { ...edge, node: { ...edge.node, ...messageUpdated } };
            }
          }
          return edge;
        });
        return {
          ...prev,
          messages: {
            ...prev.messages,
            edges: updatedEdges,
            pageInfo: prev.messages.pageInfo
          }
        };
      },
    })

    return () => {
      unsubAdded();
      unsubUpdated();
    }
  }, [subscribeToMore])

  return {
    messages,
    pageInfo: data?.messages?.pageInfo,
    error,
    isLoading,
    loadMore,
  };
}


export function useSendMessage() {
  const [sendMessage, { loading: isSending }] = useMutation<Mutation>(SEND_MESSAGE_MUTATION);
  const handleSend = useCallback(
    async (text: string) => {
      if (text.trim()) {
        await sendMessage({
          variables: { text },
          update: (cache, { data }) => {
            const newMessage = data?.sendMessage;
            if (!newMessage) return;
            const cursor = getCursor(newMessage);
            const existing = cache.readQuery<Query>({
              query: MESSAGES_QUERY,
              variables: { first: PAGE_SIZE },
            });
            const existingEdge = existing?.messages.edges.find(edge => edge.node.id === newMessage.id && edge.node.sender === newMessage.sender);

            const isSkip = existingEdge && new Date(existingEdge?.node.updatedAt ?? 0).getTime() <= new Date(newMessage.updatedAt).getTime();

            if (isSkip) {
              return;
            }

            cache.modify({
              fields: {
                messages(existingConn = {},) {
                  const { edges = [] }: { edges: MessageEdge[] } = existingConn;
                  return {
                    ...existingConn,
                    edges: existingEdge ? edges.map(edge => {
                      if (edge.node.id === newMessage.id && edge.node.sender === newMessage.sender) {
                        return {
                          ...edge,
                          __typename: "MessageEdge",
                          node: newMessage,
                        }
                      }
                      return edge;
                    }) : [...edges, {
                      __typename: "MessageEdge",
                      node: newMessage,
                      cursor,
                    }]
                  };
                }
              }
            });
          },
          fetchPolicy: 'no-cache',
        });
      }
    },
    [sendMessage]
  );
  return { sendMessage: handleSend, isSending };
}
