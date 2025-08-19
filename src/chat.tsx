import React, { useCallback, useMemo } from "react";
import { ItemContent, Virtuoso } from "react-virtuoso";
import cn from "clsx";
import {
  MessageSender,
  type Message,
  type Query,
} from "../__generated__/resolvers-types";
import css from "./chat.module.css";
import { gql, useQuery } from "@apollo/client";

const MESSAGES_QUERY = gql`
  query Messages($first: Int, $after: MessagesCursor) {
    messages(first: $first, after: $after) {
      edges {
        node {
          id
          text
          status
          updatedAt
          sender
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const PAGE_SIZE = 10;

const Item: React.FC<Message> = ({ text, sender }) => {
  return (
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
};

const getItem: ItemContent<Message, unknown> = (_, data) => {
  return <Item {...data} />;
};

export const Chat: React.FC = () => {
  const { data, fetchMore } = useQuery<Query>(MESSAGES_QUERY, {
    variables: { first: PAGE_SIZE},
    notifyOnNetworkStatusChange: true,
  });

  const messages = useMemo(() =>
    data?.messages?.edges?.map((edge) => edge.node) ?? [],
    [data]
  );

  const endCursor = data?.messages?.pageInfo?.endCursor;
  const hasNextPage = data?.messages?.pageInfo?.hasNextPage;

  const loadMore = useCallback(() => {
    if (hasNextPage && endCursor) {
      fetchMore({
        variables: { first: PAGE_SIZE, after: endCursor },
        updateQuery: (prevResult, { fetchMoreResult }) => {
          if (!fetchMoreResult) return prevResult;
          return {
            messages: {
              ...fetchMoreResult.messages,
              edges: [
                ...prevResult.messages.edges,
                ...fetchMoreResult.messages.edges,
              ],
            },
          };
        },
      });
    }
  }, [fetchMore, hasNextPage, endCursor]);

  return (
    <div className={css.root}>
      <div className={css.container}>
        <Virtuoso
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
        />
        <button>Send</button>
      </div>
    </div>
  );
};
