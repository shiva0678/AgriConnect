import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  fetchConversationByOrder,
  fetchConversationMessages,
  fetchConversations,
  fetchUnreadCount,
  markConversationRead,
  sendConversationMessage,
} from "../services/chatApi";

const MESSAGE_PAGE_SIZE = 30;

export const chatKeys = {
  all: ["chat"],
  conversations: (userId) => ["chat", "conversations", userId],
  conversationByOrder: (userId, orderId) => [
    "chat",
    "order-conversation",
    userId,
    orderId,
  ],
  messages: (userId, conversationId) => [
    "chat",
    "messages",
    userId,
    conversationId,
  ],
  unreadCount: (userId) => ["chat", "unread-count", userId],
};

function compareMessages(left, right) {
  const timeDifference =
    new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  return timeDifference || left.id.localeCompare(right.id);
}

export function upsertChatMessage(previous, message) {
  if (!message?.id) return previous;

  if (!previous?.pages?.length) {
    return {
      pages: [{
        success: true,
        messages: [message],
        pagination: {
          limit: MESSAGE_PAGE_SIZE,
          has_more: false,
          next_cursor: null,
        },
      }],
      pageParams: [null],
    };
  }

  let found = false;
  const seenIds = new Set();
  const pages = previous.pages.map((page) => {
    const messages = [];
    for (const existing of page.messages || []) {
      if (existing.id === message.id) {
        if (!found) {
          messages.push(message);
          found = true;
        }
        seenIds.add(message.id);
      } else if (!seenIds.has(existing.id)) {
        messages.push(existing);
        seenIds.add(existing.id);
      }
    }
    return { ...page, messages: messages.sort(compareMessages) };
  });

  if (!found) {
    pages[0] = {
      ...pages[0],
      messages: [...pages[0].messages, message].sort(compareMessages),
    };
  }

  return { ...previous, pages };
}

export async function cacheChatMessage(queryClient, queryKey, message) {
  await queryClient.cancelQueries({ queryKey, exact: true });
  const previous = queryClient.getQueryData(queryKey);
  if (!previous?.pages?.length) {
    await queryClient.invalidateQueries({ queryKey, exact: true });
    return;
  }

  queryClient.setQueryData(queryKey, (current) =>
    current?.pages?.length
      ? upsertChatMessage(current, message)
      : current,
  );
}

export function useConversationsQuery(userId) {
  return useInfiniteQuery({
    queryKey: chatKeys.conversations(userId),
    queryFn: ({ pageParam, signal }) =>
      fetchConversations({ page: pageParam, limit: 50, signal }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    enabled: Boolean(userId),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useConversationByOrderQuery(userId, orderId) {
  return useQuery({
    queryKey: chatKeys.conversationByOrder(userId, orderId),
    queryFn: ({ signal }) => fetchConversationByOrder(orderId, { signal }),
    enabled: Boolean(userId && orderId),
  });
}

export function useConversationMessagesQuery(userId, conversationId) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(userId, conversationId),
    queryFn: ({ pageParam, signal }) =>
      fetchConversationMessages(conversationId, {
        limit: MESSAGE_PAGE_SIZE,
        before: pageParam?.created_at,
        beforeId: pageParam?.id,
        signal,
      }),
    initialPageParam: null,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more
        ? lastPage.pagination.next_cursor
        : undefined,
    enabled: Boolean(userId && conversationId),
  });
}

export function useSendConversationMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendConversationMessage,
    onSuccess: async (message, variables) => {
      await cacheChatMessage(
        queryClient,
        chatKeys.messages(variables.userId, variables.conversationId),
        message,
      );
      void queryClient.invalidateQueries({
        queryKey: chatKeys.conversations(variables.userId),
      });
      void queryClient.invalidateQueries({
        queryKey: chatKeys.unreadCount(variables.userId),
      });
    },
  });
}

export function useMarkConversationReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId }) => markConversationRead(conversationId),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: chatKeys.conversations(variables.userId),
      });
      void queryClient.invalidateQueries({
        queryKey: chatKeys.unreadCount(variables.userId),
      });
    },
  });
}

export function useUnreadCountQuery(userId) {
  return useQuery({
    queryKey: chatKeys.unreadCount(userId),
    queryFn: ({ signal }) => fetchUnreadCount({ signal }),
    enabled: Boolean(userId),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
