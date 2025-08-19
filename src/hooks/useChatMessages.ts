import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useSubscription, useApolloClient } from "@apollo/client";
import {
  Subscription,
  type Message,
  type Query,
  type Mutation,
  type MessagePageInfo,
  type MessageEdge,
} from "../../__generated__/resolvers-types";
import {
  MESSAGE_ADDED_SUBSCRIPTION,
  MESSAGE_UPDATED_SUBSCRIPTION,
  MESSAGES_QUERY,
  SEND_MESSAGE_MUTATION,
} from "../../src/graphql/messages";

const PAGE_SIZE = 10;

export function useQueryMessages() {
  const { data, error, fetchMore, loading: isLoading } = useQuery<Query>(MESSAGES_QUERY, {
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

  return {
    messages,
    pageInfo: data?.messages?.pageInfo,
    error,
    isLoading,
    loadMore,
  };
}

function updateEdges({
  edges = [],
  node,
  pageInfo,
  readField,
}: {
  edges: MessageEdge[];
  node: Message;
  pageInfo: MessagePageInfo;
  readField?: (fieldName: string, obj: Message) => unknown;
}) {
  const getId = (n: Message) => (readField ? readField("id", n) as string : n.id);
  const getSender = (n: Message) => (readField ? readField("sender", n) as string : n.sender);
  const getUpdatedAt = (n: Message) => (readField ? readField("updatedAt", n) as string : n.updatedAt);

  const key = (n: Message) => `${getSender(n)}:${getId(n)}`;

  const nodeKey = key(node);
  const nodeUpdatedAt = new Date(getUpdatedAt(node));

  const idx = edges.findIndex((e) => key(e.node) === nodeKey);

  if (idx >= 0) {
    const prevNode = edges[idx].node;
    const prevUpdated = new Date(getUpdatedAt(prevNode));
    if (nodeUpdatedAt <= prevUpdated) return { edges, pageInfo };
    const next = edges.slice();
    next[idx] = { ...edges[idx], node };
    return { edges: next, pageInfo };
  }

  const newEdge = {
    __typename: "MessageEdge",
    node,
    cursor: `client:${getSender(node)}:${getId(node)}:${getUpdatedAt(node)}`,
  };

  return { edges: [...edges, newEdge], pageInfo };
}

export function useSubscriptionMessages() {
  const client = useApolloClient();
  useSubscription<Subscription>(MESSAGE_ADDED_SUBSCRIPTION, {
    onData: ({ data }) => {
      const node = data.data?.messageAdded;
      if (!node) return;
      client.cache.modify({
        fields: {
          messages(existingConn = {}, helpers) {
            const { readField } = helpers;
            const { edges = [], pageInfo } = existingConn;
            const result = updateEdges({ edges, node, pageInfo, readField });
            return { ...existingConn, edges: result.edges, pageInfo: result.pageInfo };
          },
        },
      });
    },
  });
  useSubscription<Subscription>(MESSAGE_UPDATED_SUBSCRIPTION, {
    onData: ({ data }) => {
      const updated = data.data?.messageUpdated;
      if (!updated) return;
      client.cache.modify({
        fields: {
          messages(existingConn = {}, helpers) {
            const { readField } = helpers;
            const { edges = [], pageInfo } = existingConn;
            const result = updateEdges({ edges, node: updated, pageInfo, readField });
            return { ...existingConn, edges: result.edges, pageInfo: result.pageInfo };
          },
        },
      });
    },
  });
}

export function useSendMessage() {
  const [sendMessage, { loading: isSending }] = useMutation<Mutation>(SEND_MESSAGE_MUTATION);
  const handleSend = useCallback(
    async (text: string) => {
      if (text.trim()) {
        await sendMessage({
          variables: { text },
          update(cache, { data }) {
            const msg = data?.sendMessage;
            if (!msg) return;
            cache.modify({
              fields: {
                messages(existingConn = {}, { readField }) {
                  const { edges = [], pageInfo } = existingConn;
                  const result = updateEdges({ edges, node: msg, pageInfo, readField });
                  return { ...existingConn, edges: result.edges, pageInfo: result.pageInfo };
                },
              },
            });
          },
        });
      }
    },
    [sendMessage]
  );
  return { sendMessage: handleSend, isSending };
}
