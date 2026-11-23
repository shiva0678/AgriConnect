import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { chatKeys, useUnreadCountQuery } from "../queries/chat";
import { useChatSocket } from "./useChatSocket";

export function useChatUnreadCount(userId) {
  const queryClient = useQueryClient();
  const { socket, reconnectVersion } = useChatSocket();
  const unreadCountQuery = useUnreadCountQuery(userId);

  useEffect(() => {
    if (!socket || !userId) return undefined;

    const handleNewMessage = (message) => {
      void queryClient.invalidateQueries({
        queryKey: chatKeys.conversations(userId),
      });
      if (message?.sender_id !== userId) {
        void queryClient.invalidateQueries({
          queryKey: chatKeys.unreadCount(userId),
          exact: true,
        });
      }
    };

    const handleReadState = (readState) => {
      if (readState?.userId !== userId) return;
      void queryClient.invalidateQueries({
        queryKey: chatKeys.conversations(userId),
      });
      void queryClient.invalidateQueries({
        queryKey: chatKeys.unreadCount(userId),
        exact: true,
      });
    };

    socket.on("message:new", handleNewMessage);
    socket.on("conversation:read", handleReadState);
    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("conversation:read", handleReadState);
    };
  }, [queryClient, socket, userId]);

  useEffect(() => {
    if (!userId || reconnectVersion === 0) return;
    void queryClient.invalidateQueries({
      queryKey: chatKeys.conversations(userId),
    });
    void queryClient.invalidateQueries({
      queryKey: chatKeys.unreadCount(userId),
      exact: true,
    });
  }, [queryClient, reconnectVersion, userId]);

  return unreadCountQuery;
}
