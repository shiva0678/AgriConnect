import { io } from "socket.io-client";
import { api } from "./api";

export function createChatSocket(token) {
  const apiUrl = api.defaults.baseURL || window.location.origin;
  const socketUrl = new URL(apiUrl, window.location.origin).origin;
  return io(socketUrl, {
    autoConnect: false,
    auth: { token },
    reconnection: true,
  });
}

export function emitChatEvent(socket, eventName, payload, timeout = 10000) {
  if (!socket?.connected) {
    return Promise.reject(
      Object.assign(new Error("The live connection is unavailable."), {
        code: "CHAT_SOCKET_DISCONNECTED",
      }),
    );
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        Object.assign(new Error("The live connection did not respond."), {
          code: "CHAT_SOCKET_TIMEOUT",
        }),
      );
    }, timeout);

    socket.emit(eventName, payload, (response) => {
      clearTimeout(timer);
      if (response?.success) {
        resolve(response);
      } else {
        reject(
          Object.assign(
            new Error(response?.message || "The chat request was rejected."),
            { code: "CHAT_SOCKET_REJECTED" },
          ),
        );
      }
    });
  });
}
