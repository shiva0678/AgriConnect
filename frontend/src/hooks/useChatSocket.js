import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "../context/AuthContext";
import { createChatSocket } from "../services/chatSocket";

const ChatSocketContext = createContext(null);

const initialState = {
  socket: null,
  status: "disconnected",
  error: "",
  reconnectVersion: 0,
};

function useChatSocketConnection(token, enabled) {
  const [state, setState] = useState(initialState);
  const socket = useMemo(
    () => (token && enabled ? createChatSocket(token) : null),
    [enabled, token],
  );

  useEffect(() => {
    if (!socket) return undefined;
    let hasConnected = false;

    const handleConnect = () => {
      setState((previous) => ({
        ...previous,
        socket,
        token,
        status: "connected",
        error: "",
        reconnectVersion:
          previous.socket === socket
            ? previous.reconnectVersion + (hasConnected ? 1 : 0)
            : 0,
      }));
      hasConnected = true;
    };

    const handleDisconnect = (reason) => {
      const serverDisconnected = reason === "io server disconnect";
      setState((previous) => ({
        ...previous,
        socket,
        token,
        status: serverDisconnected ? "disconnected" : "reconnecting",
        error: serverDisconnected
          ? "The live connection was closed. Check your session and reconnect."
          : "Live chat disconnected. Reconnecting; REST chat remains available.",
      }));
    };

    const handleConnectError = (error) => {
      const authenticationFailed = error.message === "Authentication required.";
      setState((previous) => ({
        ...previous,
        socket,
        token,
        status: authenticationFailed ? "disconnected" : "reconnecting",
        error: authenticationFailed
          ? "Chat authentication failed. Please sign in again."
          : "Unable to connect to live chat. REST chat remains available.",
      }));
      if (authenticationFailed) {
        socket.disconnect();
      }
    };

    const handleReconnectFailed = () => {
      setState((previous) => ({
        ...previous,
        socket,
        token,
        status: "disconnected",
        error: "Live chat could not reconnect. You can retry or keep using REST chat.",
      }));
    };

    const handleConversationError = (payload) => {
      if (payload?.message) {
        setState((previous) => ({
          ...previous,
          socket,
          token,
          error: payload.message,
        }));
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("conversation:error", handleConversationError);
    socket.io.on("reconnect_failed", handleReconnectFailed);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("conversation:error", handleConversationError);
      socket.io.off("reconnect_failed", handleReconnectFailed);
      socket.disconnect();
    };
  }, [socket, token]);

  const reconnect = useCallback(() => {
    if (socket && !socket.connected) {
      setState((previous) => ({
        ...previous,
        socket,
        token,
        status: "connecting",
        error: "",
      }));
      socket.connect();
    }
  }, [socket, token]);

  const stateMatchesSocket = state.socket === socket;
  const visibleState = !socket
    ? initialState
    : stateMatchesSocket
      ? state
      : { ...initialState, socket, status: "connecting" };

  return {
    ...visibleState,
    reconnect,
  };
}

export function ChatSocketProvider({ children }) {
  const { token, isAuthenticated, loading } = useAuth();
  const socketState = useChatSocketConnection(
    token,
    isAuthenticated && !loading,
  );

  return createElement(
    ChatSocketContext.Provider,
    { value: socketState },
    children,
  );
}

export function useChatSocket() {
  const socketState = useContext(ChatSocketContext);
  if (!socketState) {
    throw new Error("useChatSocket must be used inside ChatSocketProvider.");
  }
  return socketState;
}
