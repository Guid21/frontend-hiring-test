import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@apollo/client";
import {
  Subscription,
  type Query,
  type Mutation,
} from "../../__generated__/resolvers-types";
import {
  MESSAGE_ADDED_SUBSCRIPTION,
  MESSAGE_UPDATED_SUBSCRIPTION,
  MESSAGES_QUERY,
  SEND_MESSAGE_MUTATION,
} from "../../src/graphql/messages";

const PAGE_SIZE = 10;

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
        const newMessage = subscriptionData.data?.messageAdded;
        if (!newMessage) return prev;
        const cursor = `client:${newMessage.sender}:${newMessage.id}:${newMessage.updatedAt}`;
        const isOldMessage = prev.messages.edges.some(edge => edge.node.id === newMessage.id && edge.node.sender === newMessage.sender);

        return { 
          ...prev, 
          messages: { 
            ...prev.messages, 
            edges: isOldMessage ? prev.messages.edges : [...prev.messages.edges, {
              __typename: "MessageEdge",
              node: newMessage,
              cursor
            }], 
            pageInfo: prev.messages.pageInfo 
          } 
        };
      },
    })

    const unsubUpdated = subscribeToMore<Subscription>({
      document: MESSAGE_UPDATED_SUBSCRIPTION,
      updateQuery: (prev, { subscriptionData }) => {
        const newMessage = subscriptionData.data?.messageUpdated;
        if (!newMessage) return prev;
        return { 
          ...prev, 
          messages: { 
            ...prev.messages, 
            edges: prev.messages.edges.map(edge => {
              const isNewMessage = edge.node.id === newMessage.id;
              const isOlder = new Date(edge.node.updatedAt).getTime() <= new Date(newMessage.updatedAt).getTime();
              if (isNewMessage && !isOlder) {
                return ({
                  ...edge,
                  __typename: "MessageEdge",
                  node: newMessage
                })
              }
              
              return ({
                ...edge,
                __typename: "MessageEdge"
              })
            }), 
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
          fetchPolicy: 'no-cache',
        });
      }
    },
    [sendMessage]
  );
  return { sendMessage: handleSend, isSending };
}
