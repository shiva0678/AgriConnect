import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useChatSocket } from "../../hooks/useChatSocket";
import {
  cacheChatMessage,
  chatKeys,
  useConversationByOrderQuery,
  useConversationMessagesQuery,
  useConversationsQuery,
  useMarkConversationReadMutation,
  useSendConversationMessageMutation,
} from "../../queries/chat";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { emitChatEvent } from "../../services/chatSocket";
import "./ChatPage.css";

const MESSAGE_LIMIT = 2000;

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function formatTime(value, options = { hour: "numeric", minute: "2-digit" }) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", options).format(date);
}

function shortOrderId(value) {
  return value ? `#${value.slice(0, 8).toUpperCase()}` : "Order";
}

function compareMessages(left, right) {
  const timeDifference =
    new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  return timeDifference || left.id.localeCompare(right.id);
}

function getMessagesFromPages(data) {
  const uniqueMessages = new Map();
  for (const page of [...(data?.pages || [])].reverse()) {
    for (const message of page.messages || []) {
      uniqueMessages.set(message.id, message);
    }
  }
  return [...uniqueMessages.values()].sort(compareMessages);
}

function ChatPage() {
  const { user, token } = useAuth();
  const { conversationId: routeConversationId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orderId = searchParams.get("orderId");
  const chatBasePath = user?.role === "farmer" ? "/farmer/chat" : "/buyer/chat";
  const conversationId = routeConversationId || null;
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const [joinFailure, setJoinFailure] = useState(null);
  const [viewportState, setViewportState] = useState({
    conversationId: null,
    atBottom: true,
    hasNewMessages: false,
  });
  const [peerReadState, setPeerReadState] = useState({
    conversationId: null,
    readAt: null,
  });
  const scrollContainerRef = useRef(null);
  const scrollHeightBeforeOlderRef = useRef(null);
  const atBottomRef = useRef({ conversationId: null, atBottom: true });
  const readAttemptRef = useRef("");
  const { socket, status: socketStatus, error: socketError, reconnectVersion, reconnect } =
    useChatSocket();
  const conversationsQuery = useConversationsQuery(user?.id);
  const orderConversationQuery = useConversationByOrderQuery(user?.id, orderId);
  const messagesQuery = useConversationMessagesQuery(user?.id, conversationId);
  const sendMessageMutation = useSendConversationMessageMutation();
  const markReadMutation = useMarkConversationReadMutation();
  const fetchMoreConversations = conversationsQuery.fetchNextPage;
  const hasMoreConversations = conversationsQuery.hasNextPage;
  const isFetchingMoreConversations = conversationsQuery.isFetchingNextPage;
  const refetchMessages = messagesQuery.refetch;
  const isHistoryLoaded = messagesQuery.isSuccess;
  const markReadRest = markReadMutation.mutateAsync;
  const conversations = useMemo(
    () => conversationsQuery.data?.pages.flatMap((page) => page.conversations) || [],
    [conversationsQuery.data],
  );
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === conversationId,
  ) || (
    orderConversationQuery.data?.conversation?.id === conversationId
      ? {
          ...orderConversationQuery.data.conversation,
          crop_name: orderConversationQuery.data.order.crop_name,
          order_status: orderConversationQuery.data.order.status,
          other_participant_id:
            orderConversationQuery.data.other_participant.id,
          other_participant_name:
            orderConversationQuery.data.other_participant.name,
          unread_count: 0,
        }
      : null
  );
  const messages = useMemo(
    () => getMessagesFromPages(messagesQuery.data),
    [messagesQuery.data],
  );
  const messageCount = messages.length;
  const messagePageCount = messagesQuery.data?.pages.length || 0;
  const isAtBottom = viewportState.conversationId !== conversationId
    || viewportState.atBottom;
  const hasNewMessages = viewportState.conversationId === conversationId
    && viewportState.hasNewMessages;
  const peerReadAt = peerReadState.conversationId === conversationId
    ? peerReadState.readAt
    : null;
  const joinError = joinFailure?.conversationId === conversationId
    ? joinFailure.message
    : "";
  const characterCount = Array.from(draft).length;
  const messageValidationError = characterCount > MESSAGE_LIMIT
    ? "Messages can contain at most 2,000 characters."
    : draft && !draft.trim()
      ? "Enter a message before sending."
      : "";
  const isSending = sendMessageMutation.isPending;
  const canSend = Boolean(
    conversationId
    && draft.trim()
    && characterCount <= MESSAGE_LIMIT
    && !isSending,
  );
  const latestOwnMessage = [...messages]
    .reverse()
    .find((message) => message.sender_id === user?.id);
  const hasBeenRead = Boolean(
    peerReadAt
    && latestOwnMessage
    && new Date(peerReadAt).getTime()
      >= new Date(latestOwnMessage.created_at).getTime(),
  );

  useEffect(() => {
    if (
      orderId
      && orderConversationQuery.data?.conversation?.id
      && !routeConversationId
    ) {
      navigate(
        `${chatBasePath}/${orderConversationQuery.data.conversation.id}`,
        { replace: true },
      );
    }
  }, [
    chatBasePath,
    navigate,
    orderConversationQuery.data,
    orderId,
    routeConversationId,
  ]);

  useEffect(() => {
    if (
      routeConversationId
      && !conversations.some((conversation) => conversation.id === routeConversationId)
      && hasMoreConversations
      && !isFetchingMoreConversations
    ) {
      void fetchMoreConversations();
    }
  }, [
    conversations,
    fetchMoreConversations,
    hasMoreConversations,
    isFetchingMoreConversations,
    routeConversationId,
  ]);

  const markConversationRead = useCallback(async (id) => {
    if (!id || !user?.id) return;
    try {
      if (socket?.connected) {
        await emitChatEvent(socket, "conversation:read", {
          conversationId: id,
        });
        void queryClient.invalidateQueries({
          queryKey: chatKeys.conversations(user.id),
        });
        void queryClient.invalidateQueries({
          queryKey: chatKeys.unreadCount(user.id),
        });
      } else {
        await markReadRest({
          conversationId: id,
          userId: user.id,
        });
      }
    } catch (error) {
      if (
        error.code === "CHAT_SOCKET_TIMEOUT"
        || error.code === "CHAT_SOCKET_DISCONNECTED"
      ) {
        await markReadRest({
          conversationId: id,
          userId: user.id,
        });
        return;
      }
      throw error;
    }
  }, [markReadRest, queryClient, socket, user]);

  useEffect(() => {
    if (!socket || socketStatus !== "connected" || !conversationId) {
      return undefined;
    }

    let active = true;
    emitChatEvent(socket, "conversation:join", { conversationId })
      .then(() => {
        if (active) setJoinFailure(null);
      })
      .catch((error) => {
        if (active) {
          setJoinFailure({
            conversationId,
            message: error.message || "Unable to open this conversation.",
          });
        }
      });

    return () => {
      active = false;
      if (socket.connected) {
        socket.emit("conversation:leave", { conversationId });
      }
    };
  }, [conversationId, reconnectVersion, socket, socketStatus]);

  useEffect(() => {
    if (
      !conversationId
      || !isHistoryLoaded
      || document.visibilityState !== "visible"
    ) {
      return;
    }
    const transportKey = socketStatus === "connected"
      ? `socket-${reconnectVersion}`
      : "rest";
    const readKey = `${conversationId}:${transportKey}`;
    if (readAttemptRef.current === readKey) return;
    readAttemptRef.current = readKey;
    void markConversationRead(conversationId).catch((error) => {
      readAttemptRef.current = "";
      setSendError(
        error.message || "Unable to update the conversation read state.",
      );
    });
  }, [
    conversationId,
    isHistoryLoaded,
    markConversationRead,
    reconnectVersion,
    socketStatus,
  ]);

  useEffect(() => {
    if (reconnectVersion > 0 && conversationId) {
      void refetchMessages();
    }
  }, [conversationId, reconnectVersion, refetchMessages]);

  const applyMessage = useCallback(async (message, isIncoming = false) => {
    if (!message?.id || !message.conversation_id || !user?.id) return;
    const userId = user.id;
    const queryKey = chatKeys.messages(userId, message.conversation_id);
    await cacheChatMessage(queryClient, queryKey, message);

    if (message.conversation_id === conversationId && isIncoming) {
      const currentAtBottom =
        atBottomRef.current.conversationId !== conversationId
        || atBottomRef.current.atBottom;
      if (!currentAtBottom) {
        setViewportState({
          conversationId,
          atBottom: false,
          hasNewMessages: true,
        });
      }
      if (document.visibilityState === "visible") {
        void markConversationRead(message.conversation_id).catch((error) => {
          setSendError(
            error.message || "Unable to update the conversation read state.",
          );
        });
      }
    }
  }, [conversationId, markConversationRead, queryClient, user]);

  useEffect(() => {
    if (!socket) return undefined;

    const handleNewMessage = (message) => {
      if (message?.conversation_id === conversationId) {
        void applyMessage(message, true);
      }
    };
    const handleMessageAck = (acknowledgement) => {
      const message = acknowledgement?.message;
      if (acknowledgement?.success && message?.conversation_id === conversationId) {
        void applyMessage(message);
      }
    };
    const handleReadState = (readState) => {
      if (
        readState?.conversationId === conversationId
        && readState.userId !== user?.id
      ) {
        setPeerReadState({
          conversationId,
          readAt: readState.last_read_at,
        });
      }
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:ack", handleMessageAck);
    socket.on("conversation:read", handleReadState);
    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:ack", handleMessageAck);
      socket.off("conversation:read", handleReadState);
    };
  }, [applyMessage, conversationId, socket, user?.id]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const previousPosition = scrollHeightBeforeOlderRef.current;
    if (
      previousPosition?.conversationId === conversationId
      && messagePageCount <= previousPosition.pageCount
    ) {
      return;
    }
    if (previousPosition?.conversationId === conversationId) {
      container.scrollTop +=
        container.scrollHeight - previousPosition.height;
      atBottomRef.current = {
        conversationId,
        atBottom: previousPosition.atBottom,
      };
      scrollHeightBeforeOlderRef.current = null;
      return;
    }
    if (previousPosition) scrollHeightBeforeOlderRef.current = null;
    const currentAtBottom =
      atBottomRef.current.conversationId !== conversationId
      || atBottomRef.current.atBottom;
    if (currentAtBottom) {
      container.scrollTop = container.scrollHeight;
      atBottomRef.current = { conversationId, atBottom: true };
    }
  }, [conversationId, messageCount, messagePageCount]);

  async function loadOlderMessages() {
    const container = scrollContainerRef.current;
    if (!container || messagesQuery.isFetchingNextPage) return;
    scrollHeightBeforeOlderRef.current = {
      conversationId,
      height: container.scrollHeight,
      atBottom: isAtBottom,
      pageCount: messagePageCount,
    };
    const result = await messagesQuery.fetchNextPage();
    if (
      result.isError
      || (result.data?.pages.length || 0) <= messagePageCount
    ) {
      scrollHeightBeforeOlderRef.current = null;
    }
  }

  function handleScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 90;
    atBottomRef.current = { conversationId, atBottom: nearBottom };
    setViewportState((previous) => ({
      conversationId,
      atBottom: nearBottom,
      hasNewMessages: nearBottom
        ? false
        : previous.conversationId === conversationId && previous.hasNewMessages,
    }));
  }

  function scrollToLatest() {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    atBottomRef.current = { conversationId, atBottom: true };
    setViewportState({
      conversationId,
      atBottom: true,
      hasNewMessages: false,
    });
  }

  async function submitMessage(event) {
    event?.preventDefault();
    if (!canSend || !conversationId) return;

    const content = draft;
    const clientMessageId = crypto.randomUUID();
    setSendError("");
    try {
      let message;
      let usedRest = false;
      if (socket?.connected) {
        try {
          const response = await emitChatEvent(socket, "message:send", {
            conversationId,
            content,
            clientMessageId,
          });
          message = response.message;
        } catch (error) {
          if (
            error.code !== "CHAT_SOCKET_TIMEOUT"
            && error.code !== "CHAT_SOCKET_DISCONNECTED"
          ) {
            throw error;
          }
          usedRest = true;
          message = await sendMessageMutation.mutateAsync({
            userId: user.id,
            conversationId,
            content,
            clientMessageId,
          });
        }
      } else {
        usedRest = true;
        message = await sendMessageMutation.mutateAsync({
          userId: user.id,
          conversationId,
          content,
          clientMessageId,
        });
      }

      atBottomRef.current = { conversationId, atBottom: true };
      setViewportState({
        conversationId,
        atBottom: true,
        hasNewMessages: false,
      });
      setDraft("");
      await cacheChatMessage(
        queryClient,
        chatKeys.messages(user.id, conversationId),
        message,
      );
      if (!usedRest) {
        void queryClient.invalidateQueries({
          queryKey: chatKeys.conversations(user.id),
        });
      }
    } catch (error) {
      setSendError(
        error.response
          ? getApiErrorMessage(error, "Unable to send this message.")
          : error.message || "Unable to send this message.",
      );
    }
  }

  function selectConversation(id) {
    setDraft("");
    setSendError("");
    navigate(`${chatBasePath}/${encodeURIComponent(id)}`);
  }

  const listError = conversationsQuery.isError
    ? getApiErrorMessage(conversationsQuery.error, "Unable to load conversations.")
    : "";
  const historyError = messagesQuery.isError
    ? getApiErrorMessage(messagesQuery.error, "Unable to load this conversation.")
    : "";

  return (
    <div className="farmer-page chat-page">
      <div className="farmer-page-heading chat-page-heading">
        <div>
          <p className="dashboard-eyebrow">Order-based conversations</p>
          <h2>Messages</h2>
          <p>Talk directly with the people behind each order.</p>
        </div>
        <div className={`chat-connection chat-connection--${socketStatus}`}>
          <span />
          <span>
            {socketStatus === "connected"
              ? "Live connection"
              : socketStatus === "connecting"
                ? "Connecting"
                : socketStatus === "reconnecting"
                  ? "Reconnecting"
                  : "REST mode"}
          </span>
          {socketStatus === "disconnected" && token && (
            <button type="button" onClick={reconnect}>Retry</button>
          )}
        </div>
      </div>

      {orderId && !routeConversationId && orderConversationQuery.isPending && (
        <div className="chat-page-alert chat-page-alert--loading" role="status">
          Opening this order conversation…
        </div>
      )}
      {orderConversationQuery.isError && (
        <div className="form-error chat-page-alert" role="alert">
          {getApiErrorMessage(
            orderConversationQuery.error,
            "Unable to open the order conversation.",
          )}
        </div>
      )}
      {socketError && (
        <div className="form-error chat-page-alert" role="alert">
          {socketError}
        </div>
      )}

      <div className={`chat-workspace${conversationId ? " has-selection" : ""}`}>
        <aside className="chat-sidebar" aria-label="Conversations">
          <div className="chat-sidebar__heading">
            <div>
              <span className="chat-label">Your inbox</span>
              <h3>Conversations</h3>
            </div>
            <span className="chat-count">{conversations.length}</span>
          </div>
          {listError ? (
            <div className="chat-state chat-state--error" role="alert">
              <strong>Couldn’t load your inbox</strong>
              <p>{listError}</p>
              <button
                type="button"
                className="chat-text-button"
                onClick={() => conversationsQuery.refetch()}
              >
                Try again
              </button>
            </div>
          ) : conversationsQuery.isPending ? (
            <div className="chat-state" role="status">Loading conversations…</div>
          ) : conversations.length === 0 ? (
            <div className="chat-state">
              <span className="chat-state__mark">◌</span>
              <strong>No conversations yet</strong>
              <p>Your eligible order conversations will appear here.</p>
            </div>
          ) : (
            <>
              <div className="chat-conversation-list">
                {conversations.map((conversation) => {
                  const latestPreview = conversation.latest_message_content
                    ? `${conversation.latest_message_sender_id === user?.id ? "You: " : ""}${conversation.latest_message_content}`
                    : "No messages yet";
                  return (
                    <button
                      type="button"
                      key={conversation.id}
                      className={`chat-conversation${conversation.id === conversationId ? " is-selected" : ""}`}
                      aria-current={conversation.id === conversationId ? "page" : undefined}
                      onClick={() => selectConversation(conversation.id)}
                    >
                      <span className="chat-person-avatar">
                        {initials(conversation.other_participant_name)}
                      </span>
                      <span className="chat-conversation__body">
                        <span className="chat-conversation__top">
                          <strong>{conversation.other_participant_name || "Participant"}</strong>
                          <time>{formatTime(conversation.latest_message_created_at || conversation.updated_at, { month: "short", day: "numeric" })}</time>
                        </span>
                        <span className="chat-conversation__context">
                          {conversation.crop_name || "Order"} · {shortOrderId(conversation.order_id)}
                        </span>
                        <span className="chat-conversation__bottom">
                          <span>{latestPreview}</span>
                          {Number(conversation.unread_count) > 0 && (
                            <b>{conversation.unread_count}</b>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {conversationsQuery.hasNextPage && (
                <button
                  type="button"
                  className="chat-load-more"
                  disabled={conversationsQuery.isFetchingNextPage}
                  onClick={() => conversationsQuery.fetchNextPage()}
                >
                  {conversationsQuery.isFetchingNextPage
                    ? "Loading…"
                    : "Load more conversations"}
                </button>
              )}
            </>
          )}
        </aside>

        <section className="chat-panel" aria-label="Conversation">
          {!conversationId ? (
            <div className="chat-empty-panel">
              <span className="chat-empty-panel__icon">✳</span>
              <p className="chat-label">Good conversations grow trust</p>
              <h3>Select an order to begin</h3>
              <p>Choose a buyer or farmer conversation from your inbox.</p>
            </div>
          ) : (
            <>
              <header className="chat-panel__header">
                <button
                  type="button"
                  className="chat-back-button"
                  onClick={() => navigate(chatBasePath)}
                  aria-label="Back to conversations"
                >
                  ←
                </button>
                <span className="chat-person-avatar chat-person-avatar--large">
                  {initials(selectedConversation?.other_participant_name)}
                </span>
                <div className="chat-panel__identity">
                  <strong>
                    {selectedConversation?.other_participant_name || "Order conversation"}
                  </strong>
                  <span>
                    {selectedConversation?.crop_name || "Order"}
                    {selectedConversation?.order_id
                      ? ` · ${shortOrderId(selectedConversation.order_id)}`
                      : ""}
                  </span>
                </div>
                {selectedConversation?.order_status && (
                  <span className={`chat-status chat-status--${selectedConversation.order_status}`}>
                    {selectedConversation.order_status}
                  </span>
                )}
              </header>

              {joinError && (
                <div className="form-error chat-panel-alert" role="alert">
                  {joinError}
                </div>
              )}

              <div
                className="chat-messages"
                ref={scrollContainerRef}
                onScroll={handleScroll}
                aria-live="polite"
                aria-label="Message history"
              >
                {messagesQuery.hasNextPage && (
                  <button
                    type="button"
                    className="chat-load-older"
                    disabled={messagesQuery.isFetchingNextPage}
                    onClick={loadOlderMessages}
                  >
                    {messagesQuery.isFetchingNextPage
                      ? "Loading older messages…"
                      : "Load older messages"}
                  </button>
                )}
                {messagesQuery.isPending ? (
                  <div className="chat-history-state" role="status">
                    Loading message history…
                  </div>
                ) : historyError ? (
                  <div className="chat-history-state chat-history-state--error" role="alert">
                    <strong>Conversation unavailable</strong>
                    <p>{historyError}</p>
                    <button
                      type="button"
                      className="chat-text-button"
                      onClick={() => messagesQuery.refetch()}
                    >
                      Try again
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="chat-history-state">
                    <strong>Start the conversation</strong>
                    <p>Keep messages about this order in one place.</p>
                  </div>
                ) : (
                  <div className="chat-message-list">
                    {messages.map((message, index) => {
                      const ownMessage = message.sender_id === user?.id;
                      const previous = messages[index - 1];
                      const dayBreak = !previous
                        || new Date(previous.created_at).toDateString()
                          !== new Date(message.created_at).toDateString();
                      return (
                        <div key={message.id}>
                          {dayBreak && (
                            <div className="chat-day-divider">
                              <span>{formatTime(message.created_at, {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}</span>
                            </div>
                          )}
                          <div className={`chat-message-row${ownMessage ? " is-own" : ""}`}>
                            <article className={`chat-bubble${ownMessage ? " chat-bubble--own" : ""}`}>
                              <p>{message.content}</p>
                              <footer>
                                <time dateTime={message.created_at}>
                                  {formatTime(message.created_at)}
                                </time>
                                {ownMessage
                                  && message.id === latestOwnMessage?.id
                                  && hasBeenRead
                                  && <span className="chat-seen">Seen</span>}
                              </footer>
                            </article>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {hasNewMessages && !isAtBottom && (
                <button
                  type="button"
                  className="chat-jump-latest"
                  onClick={scrollToLatest}
                >
                  New message ↓
                </button>
              )}

              {sendError && (
                <div className="form-error chat-panel-alert" role="alert">
                  {sendError}
                </div>
              )}

              <form className="chat-composer" onSubmit={submitMessage}>
                <label className="sr-only" htmlFor="chat-message-input">
                  Write a message
                </label>
                <textarea
                  id="chat-message-input"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setSendError("");
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter"
                      && !event.shiftKey
                      && !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void submitMessage();
                    }
                  }}
                  placeholder="Write a message…"
                  rows={1}
                  disabled={isSending || Boolean(historyError)}
                  aria-describedby="chat-composer-help chat-character-count"
                />
                <div className="chat-composer__footer">
                  <span id="chat-composer-help">
                    {messageValidationError || "Enter to send · Shift + Enter for a new line"}
                  </span>
                  <span
                    id="chat-character-count"
                    className={characterCount > MESSAGE_LIMIT ? "is-over-limit" : ""}
                  >
                    {characterCount}/{MESSAGE_LIMIT}
                  </span>
                  <button
                    type="submit"
                    className="chat-send-button"
                    disabled={!canSend}
                    aria-label={isSending ? "Sending message" : "Send message"}
                  >
                    {isSending ? "Sending…" : "Send"}
                    <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default ChatPage;
