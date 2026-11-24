import { useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  createAdminChatSession,
  createUuid,
  fetchAdminChatSession,
  fetchAdminChatSessions,
  sendAdminChatMessage,
} from "../../services/adminChatApi";
import { formatCount } from "./adminFormat";
import {
  CROP_CATEGORY_OPTIONS,
  CROP_STATUS_OPTIONS,
  createDefaultManualFilters,
  DATE_RANGE_OPTIONS,
  ENTITY_OPTIONS,
  ORDER_STATUS_OPTIONS,
  USER_ROLE_OPTIONS,
  USER_STATUS_OPTIONS,
  buildManualAdminChatPrompt,
} from "./adminChatFilters";
import "./AdminChatbot.css";

const EXAMPLE_QUESTIONS = [
  "Tell me about AgriConnect",
  "How do farmers and buyers use the marketplace?",
  "How many farmers registered in the last 30 days?",
  "How many available crops are there?",
];

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? currencyFormatter.format(amount) : "Not available";
}

function formatPeriod(period) {
  if (!period?.from || !period?.to) return "Period";
  return `${period.from} – ${period.to}`;
}

function mapHistoryMessages(descendingMessages) {
  const chronological = [...descendingMessages].reverse();
  return chronological.map((message, index) => {
    const previousMessage = chronological[index - 1];
    return {
      ...message,
      requestSummary: message.senderType === "assistant"
        && previousMessage?.senderType === "admin"
        ? previousMessage.content
        : null,
    };
  });
}

function isAnalyticsAnswer(message) {
  if (message.analyticsResult) return true;
  return /^(?:The aggregate count for\b|The (?:users|crops|orders) count was\b|Gross delivered order value\b)/i
    .test(message.content || "");
}

function AnalyticsResult({ result }) {
  if (!result || typeof result !== "object") return null;

  if (result.metric === "gross_delivered_order_value" && result.current && result.previous) {
    return (
      <div className="admin-chat-result admin-chat-result--comparison">
        <div>
          <span>Current period · {formatPeriod(result.current)}</span>
          <strong>{formatMoney(result.current.value)}</strong>
          <small>{formatCount(result.current.deliveredOrderCount)} delivered orders</small>
        </div>
        <div>
          <span>Previous period · {formatPeriod(result.previous)}</span>
          <strong>{formatMoney(result.previous.value)}</strong>
          <small>{formatCount(result.previous.deliveredOrderCount)} delivered orders</small>
        </div>
        <p>Gross delivered order value, not platform revenue.</p>
      </div>
    );
  }

  if (result.metric === "count" && result.current && result.previous) {
    return (
      <div className="admin-chat-result admin-chat-result--comparison">
        <div>
          <span>Current period · {formatPeriod(result.current)}</span>
          <strong>{formatCount(result.current.count)}</strong>
        </div>
        <div>
          <span>Previous period · {formatPeriod(result.previous)}</span>
          <strong>{formatCount(result.previous.count)}</strong>
        </div>
      </div>
    );
  }

  if (result.operation === "delivered_order_value") {
    return (
      <div className="admin-chat-result">
        <span>Gross delivered order value</span>
        <strong>{formatMoney(result.grossDeliveredOrderValue)}</strong>
        <small>{formatCount(result.deliveredOrderCount)} delivered orders · not platform revenue</small>
      </div>
    );
  }

  if (Number.isFinite(Number(result.count))) {
    const entity = ENTITY_OPTIONS.find((option) => option.value === result.entity)?.label || "Records";
    return (
      <div className="admin-chat-result">
        <span>{entity} counted</span>
        <strong>{formatCount(result.count)}</strong>
      </div>
    );
  }
  return null;
}

function MessageBubble({ message }) {
  const isAdmin = message.senderType === "admin";
  const analytics = !isAdmin && isAnalyticsAnswer(message);
  const label = isAdmin
    ? "You"
    : analytics
      ? "Platform analytics"
      : /^which\b|^could you clarify\b/i.test(message.content || "")
        ? "Clarification"
        : "AgriConnect answer";

  return (
    <article
      className={`admin-chat-message${isAdmin ? " admin-chat-message--admin" : ""}`}
      aria-label={`${label} message`}
    >
      <div className="admin-chat-message__avatar" aria-hidden="true">
        {isAdmin ? "A" : "✳"}
      </div>
      <div className="admin-chat-message__body">
        <div className="admin-chat-message__meta">
          <strong>{label}</strong>
          {message.createdAt && (
            <time dateTime={message.createdAt}>
              {new Intl.DateTimeFormat(undefined, {
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(message.createdAt))}
            </time>
          )}
          {message.localStatus && (
            <span className={`admin-chat-message__status admin-chat-message__status--${message.localStatus}`}>
              {message.localStatus === "sending"
                ? "Sending"
                : message.localStatus === "processing"
                  ? "Processing"
                  : "Not sent"}
            </span>
          )}
        </div>
        <div className={`admin-chat-bubble${isAdmin ? " admin-chat-bubble--admin" : ""}`}>
          <p>{message.content}</p>
          {!isAdmin && <AnalyticsResult result={message.analyticsResult} />}
          {!isAdmin && analytics && (message.filterSummary || message.requestSummary) && (
            <div className="admin-chat-message__summary">
              <span>{message.filterSummary ? "Filter request" : "Question analyzed"}</span>
              <p>{message.filterSummary || message.requestSummary}</p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function SelectField({ label, value, options, onChange, placeholder = "Any" }) {
  return (
    <label className="admin-chat-filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => {
          const item = typeof option === "string"
            ? { value: option, label: option.replaceAll("_", " ") }
            : option;
          return <option key={item.value} value={item.value}>{item.label}</option>;
        })}
      </select>
    </label>
  );
}

function AdminChatbot() {
  const [sessions, setSessions] = useState([]);
  const [sessionsPagination, setSessionsPagination] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsMoreLoading, setSessionsMoreLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState("");
  const [creatingSession, setCreatingSession] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesPagination, setMessagesPagination] = useState(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesMoreLoading, setMessagesMoreLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [messagesPaginationError, setMessagesPaginationError] = useState("");
  const [messageReloadCount, setMessageReloadCount] = useState(0);
  const [composer, setComposer] = useState("");
  const [draftFilterSummary, setDraftFilterSummary] = useState("");
  const [filterError, setFilterError] = useState("");
  const [sendError, setSendError] = useState(null);
  const [sending, setSending] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [manualFilters, setManualFilters] = useState(createDefaultManualFilters);
  const [manualFilterError, setManualFilterError] = useState("");
  const messagesEndRef = useRef(null);
  const sendLockRef = useRef(false);
  const selectedSessionIdRef = useRef(null);
  const skipNextMessageLoadRef = useRef(null);
  const skipScrollRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetchAdminChatSessions({ signal: controller.signal })
      .then((data) => {
        if (!active) return;
        const nextSessions = Array.isArray(data.sessions) ? data.sessions : [];
        setSessions(nextSessions);
        setSessionsPagination(data.pagination || null);
        if (nextSessions[0]) {
          selectedSessionIdRef.current = nextSessions[0].id;
          setMessagesError("");
          setMessagesPaginationError("");
          setMessagesLoading(true);
          setSelectedSessionId(nextSessions[0].id);
        }
      })
      .catch((error) => {
        if (active && error.name !== "CanceledError") {
          setSessionsError(getApiErrorMessage(error, "Chat sessions could not be loaded."));
        }
      })
      .finally(() => {
        if (active) setSessionsLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return undefined;
    if (skipNextMessageLoadRef.current === selectedSessionId) {
      skipNextMessageLoadRef.current = null;
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    fetchAdminChatSession(selectedSessionId, { signal: controller.signal })
      .then((data) => {
        if (!active || selectedSessionIdRef.current !== selectedSessionId) return;
        setMessages(mapHistoryMessages(Array.isArray(data.messages) ? data.messages : []));
        setMessagesPagination(data.pagination || null);
        setMessagesError("");
        setMessagesPaginationError("");
      })
      .catch((error) => {
        if (
          active
          && selectedSessionIdRef.current === selectedSessionId
          && error.name !== "CanceledError"
        ) {
          setMessagesError(getApiErrorMessage(error, "This conversation could not be loaded."));
        }
      })
      .finally(() => {
        if (active && selectedSessionIdRef.current === selectedSessionId) {
          setMessagesLoading(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedSessionId, messageReloadCount]);

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function refreshSessions() {
    try {
      const data = await fetchAdminChatSessions();
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setSessionsPagination(data.pagination || null);
      setSessionsError("");
    } catch (error) {
      setSessionsError(getApiErrorMessage(error, "Chat sessions could not be refreshed."));
    }
  }

  async function loadMoreSessions() {
    if (!sessionsPagination?.hasMore || !sessionsPagination.nextCursor || sessionsMoreLoading) return;
    setSessionsMoreLoading(true);
    setSessionsError("");
    try {
      const data = await fetchAdminChatSessions({ cursor: sessionsPagination.nextCursor });
      setSessions((current) => {
        const existingIds = new Set(current.map((session) => session.id));
        return [
          ...current,
          ...(data.sessions || []).filter((session) => !existingIds.has(session.id)),
        ];
      });
      setSessionsPagination(data.pagination || null);
    } catch (error) {
      setSessionsError(getApiErrorMessage(error, "More conversations could not be loaded."));
    } finally {
      setSessionsMoreLoading(false);
    }
  }

  async function createSession(title = null) {
    const data = await createAdminChatSession(title);
    if (!data.session?.id) {
      throw new Error("The server returned an invalid chat session.");
    }
    const session = data.session;
    selectedSessionIdRef.current = session.id;
    skipNextMessageLoadRef.current = session.id;
    setSessions((current) => [
      session,
      ...current.filter((item) => item.id !== session.id),
    ]);
    setSelectedSessionId(session.id);
    setMessages([]);
    setMessagesPagination(null);
    setMessagesError("");
    setMessagesPaginationError("");
    setMessagesMoreLoading(false);
    setMessagesLoading(false);
    return session;
  }

  async function handleNewChat() {
    if (sessionsLoading || creatingSession || sending || pendingRequest) return;
    setCreatingSession(true);
    setSessionsError("");
    try {
      await createSession("New chat");
      setComposer("");
      setDraftFilterSummary("");
      setSendError(null);
    } catch (error) {
      setSessionsError(getApiErrorMessage(error, "A new chat could not be created."));
    } finally {
      setCreatingSession(false);
    }
  }

  async function loadEarlierMessages() {
    if (!selectedSessionId || !messagesPagination?.hasMore || !messagesPagination.nextCursor || messagesMoreLoading) return;
    const requestSessionId = selectedSessionId;
    setMessagesMoreLoading(true);
    setMessagesPaginationError("");
    try {
      const data = await fetchAdminChatSession(requestSessionId, {
        cursor: messagesPagination.nextCursor,
      });
      if (selectedSessionIdRef.current !== requestSessionId) return;
      const older = mapHistoryMessages(Array.isArray(data.messages) ? data.messages : []);
      skipScrollRef.current = true;
      setMessages((current) => {
        const currentIds = new Set(current.map((message) => message.id));
        return [
          ...older.filter((message) => !currentIds.has(message.id)),
          ...current,
        ];
      });
      setMessagesPagination(data.pagination || null);
      setMessagesPaginationError("");
    } catch (error) {
      if (selectedSessionIdRef.current === requestSessionId) {
        setMessagesPaginationError(getApiErrorMessage(error, "Earlier messages could not be loaded."));
      }
    } finally {
      if (selectedSessionIdRef.current === requestSessionId) {
        setMessagesMoreLoading(false);
      }
    }
  }

  function retryMessageHistory() {
    if (!selectedSessionId || messagesLoading) return;
    setMessagesError("");
    setMessagesPaginationError("");
    setMessagesLoading(true);
    setMessageReloadCount((count) => count + 1);
  }

  async function performPendingRequest(request) {
    setSendError(null);
    setMessages((current) => current.map((message) => (
      message.id === request.localMessageId
        ? { ...message, localStatus: "sending" }
        : message
    )));
    try {
      const data = await sendAdminChatMessage({
        sessionId: request.sessionId,
        message: request.message,
        idempotencyKey: request.idempotencyKey,
      });
      if (!data.userMessage?.id || !data.assistantMessage?.id) {
        throw new Error("The server returned an incomplete chat response.");
      }
      setMessages((current) => {
        const withoutOptimistic = current.filter((message) => (
          message.id !== request.localMessageId
          && message.id !== data.userMessage.id
          && message.id !== data.assistantMessage.id
        ));
        return [
          ...withoutOptimistic,
          data.userMessage,
          {
            ...data.assistantMessage,
            analyticsResult: data.result,
            filterSummary: request.filterSummary || "",
            requestSummary: request.message,
          },
        ];
      });
      setPendingRequest(null);
      setSendError(null);
      setComposer("");
      setDraftFilterSummary("");
      void refreshSessions();
    } catch (error) {
      const conflict = error?.response?.status === 409;
      const fallback = conflict
        ? "A request is already being processed in this conversation. Retry this same request after it completes."
        : "Your message could not be completed. Retry it to safely replay or finish the same request.";
      setSendError({
        kind: conflict ? "processing" : "error",
        message: conflict
          ? fallback
          : getApiErrorMessage(error, fallback),
      });
      setMessages((current) => current.map((message) => (
        message.id === request.localMessageId
          ? { ...message, localStatus: conflict ? "processing" : "failed" }
          : message
      )));
      setPendingRequest(request);
    }
  }

  async function handleSend(event) {
    event.preventDefault();
    const message = composer.trim();
    if (
      !message
      || sendLockRef.current
      || pendingRequest
      || sessionsLoading
      || messagesLoading
    ) return;
    if (message.length > 1200) {
      setFilterError("Messages can contain at most 1,200 characters.");
      return;
    }

    sendLockRef.current = true;
    setSending(true);
    setFilterError("");
    setSendError(null);
    setMessagesError("");
    try {
      let sessionId = selectedSessionId;
      if (!sessionId) {
        const session = await createSession(message.slice(0, 160));
        sessionId = session.id;
      }
      const request = {
        sessionId,
        message,
        idempotencyKey: createUuid(),
        localMessageId: createUuid(),
        filterSummary: draftFilterSummary,
      };
      setPendingRequest(request);
      setMessages((current) => [
        ...current,
        {
          id: request.localMessageId,
          senderType: "admin",
          content: message,
          createdAt: new Date().toISOString(),
          localStatus: "sending",
        },
      ]);
      await performPendingRequest(request);
    } catch (error) {
      setSendError({
        kind: "error",
        message: getApiErrorMessage(error, "A conversation could not be started."),
      });
    } finally {
      sendLockRef.current = false;
      setSending(false);
    }
  }

  async function handleRetry() {
    if (!pendingRequest || sendLockRef.current) return;
    sendLockRef.current = true;
    setSending(true);
    try {
      await performPendingRequest(pendingRequest);
    } finally {
      sendLockRef.current = false;
      setSending(false);
    }
  }

  function applyManualFilters(event) {
    event.preventDefault();
    setManualFilterError("");
    const prepared = buildManualAdminChatPrompt(manualFilters);
    if (prepared.error) {
      setManualFilterError(prepared.error);
      return;
    }
    setComposer(prepared.question);
    setDraftFilterSummary(prepared.summary);
    setFilterError("");
  }

  function updateManualFilter(name, value) {
    setManualFilters((current) => (
      name === "entity"
        ? { ...current, entity: value, metric: "count" }
        : { ...current, [name]: value }
    ));
    setManualFilterError("");
  }

  function updateComposer(value) {
    setComposer(value);
    if (draftFilterSummary) setDraftFilterSummary("");
    if (filterError) setFilterError("");
  }

  function handleComposerKeyDown(event) {
    if (
      event.key === "Enter"
      && !event.shiftKey
      && !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const selectedSession = sessions.find((session) => session.id === selectedSessionId);
  const canNavigate = !sending && !pendingRequest && !creatingSession;
  const manualPromptPreview = buildManualAdminChatPrompt(manualFilters);

  return (
    <section className="admin-chatbot" aria-label="Administrator AI chatbot">
      <aside className="admin-chat-history">
        <div className="admin-chat-history__heading">
          <div>
            <p className="admin-eyebrow">Private workspace</p>
            <h2>Conversations</h2>
          </div>
          <button
            className="admin-chat-icon-button"
            type="button"
            aria-label="Start a new chat"
            title="New chat"
            onClick={handleNewChat}
            disabled={sessionsLoading || creatingSession || sending || Boolean(pendingRequest)}
          >
            +
          </button>
        </div>
        <button
          className="admin-button admin-button--primary admin-chat-new-button"
          type="button"
          onClick={handleNewChat}
          disabled={sessionsLoading || creatingSession || sending || Boolean(pendingRequest)}
        >
          <span aria-hidden="true">＋</span>
          {creatingSession ? "Starting…" : "New chat"}
        </button>

        {sessionsLoading ? (
          <div className="admin-chat-session-state" role="status">Loading conversations…</div>
        ) : sessionsError ? (
          <div className="admin-chat-session-error" role="alert">
            <p>{sessionsError}</p>
            <button type="button" onClick={refreshSessions}>Retry</button>
          </div>
        ) : sessions.length ? (
          <div className="admin-chat-session-list" aria-label="Chat history">
            {sessions.map((session) => (
              <button
                className={`admin-chat-session${session.id === selectedSessionId ? " is-active" : ""}`}
                key={session.id}
                type="button"
                aria-current={session.id === selectedSessionId ? "page" : undefined}
                onClick={() => {
                  if (canNavigate && session.id !== selectedSessionId) {
                    selectedSessionIdRef.current = session.id;
                    setMessages([]);
                    setMessagesPagination(null);
                    setMessagesError("");
                    setMessagesPaginationError("");
                    setMessagesMoreLoading(false);
                    setMessagesLoading(true);
                    setSelectedSessionId(session.id);
                    setSendError(null);
                  }
                }}
                disabled={!canNavigate}
              >
                <span className="admin-chat-session__icon" aria-hidden="true">◷</span>
                <span>
                  <strong>{session.title || "Untitled chat"}</strong>
                  <small>{session.lastMessageAt
                    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(session.lastMessageAt))
                    : "No messages yet"}</small>
                </span>
              </button>
            ))}
            {sessionsPagination?.hasMore && (
              <button
                className="admin-chat-load-more"
                type="button"
                onClick={loadMoreSessions}
                disabled={sessionsMoreLoading}
              >
                {sessionsMoreLoading ? "Loading…" : "Load more chats"}
              </button>
            )}
          </div>
        ) : (
          <div className="admin-chat-session-state">
            <span aria-hidden="true">✳</span>
            <p>Your private admin conversations will appear here.</p>
          </div>
        )}
        <p className="admin-chat-history__note">
          Conversations are visible only to the administrator who created them.
        </p>
      </aside>

      <div className="admin-chat-main">
        <header className="admin-chat-header">
          <div>
            <p className="admin-eyebrow"><span aria-hidden="true" /> ADMIN ASSISTANT</p>
            <h2>{selectedSession?.title || "Ask AgriConnect"}</h2>
            <p>Ask about AgriConnect or explore live, read-only platform metrics.</p>
          </div>
          <button
            className={`admin-button admin-button--quiet admin-chat-filter-toggle${filtersOpen ? " is-open" : ""}`}
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="admin-chat-filters"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <span aria-hidden="true">⌁</span>
            Filters
          </button>
        </header>

        {filtersOpen && (
          <form
            className="admin-chat-filters"
            id="admin-chat-filters"
            onSubmit={applyManualFilters}
          >
            <div className="admin-chat-filters__intro">
              <div>
                <strong>Build an analytics question</strong>
                <p>Controls use the backend-supported analytics filters. Only the generated message is sent.</p>
              </div>
              <button
                className="admin-chat-text-button"
                type="button"
                onClick={() => {
                  setManualFilters(createDefaultManualFilters());
                  setManualFilterError("");
                }}
              >
                Reset
              </button>
            </div>
            <div className="admin-chat-filter-grid">
              <SelectField
                label="Entity"
                value={manualFilters.entity}
                options={ENTITY_OPTIONS}
                onChange={(value) => updateManualFilter("entity", value)}
              />
              {manualFilters.entity === "orders" && (
                <SelectField
                  label="Measure"
                  value={manualFilters.metric}
                  options={[
                    { value: "count", label: "Order count" },
                    { value: "gross_value", label: "Gross delivered order value" },
                  ]}
                  onChange={(value) => updateManualFilter("metric", value)}
                  placeholder="Choose measure"
                />
              )}
              {manualFilters.entity === "users" && (
                <>
                  <SelectField
                    label="User role"
                    value={manualFilters.role}
                    options={USER_ROLE_OPTIONS}
                    onChange={(value) => updateManualFilter("role", value)}
                  />
                  <SelectField
                    label="User status"
                    value={manualFilters.userStatus}
                    options={USER_STATUS_OPTIONS}
                    onChange={(value) => updateManualFilter("userStatus", value)}
                  />
                </>
              )}
              {manualFilters.entity === "crops" && (
                <>
                  <SelectField
                    label="Crop status"
                    value={manualFilters.cropStatus}
                    options={CROP_STATUS_OPTIONS}
                    onChange={(value) => updateManualFilter("cropStatus", value)}
                  />
                  <SelectField
                    label="Crop category"
                    value={manualFilters.category}
                    options={CROP_CATEGORY_OPTIONS}
                    onChange={(value) => updateManualFilter("category", value)}
                  />
                </>
              )}
              {manualFilters.entity === "orders" && manualFilters.metric !== "gross_value" && (
                <SelectField
                  label="Order status"
                  value={manualFilters.orderStatus}
                  options={ORDER_STATUS_OPTIONS}
                  onChange={(value) => updateManualFilter("orderStatus", value)}
                />
              )}
              {!manualFilters.comparison && (
                <SelectField
                  label="Date range"
                  value={manualFilters.dateRange}
                  options={DATE_RANGE_OPTIONS.filter((option) => option.value)}
                  onChange={(value) => updateManualFilter("dateRange", value)}
                  placeholder="Any date"
                />
              )}
              {manualFilters.dateRange === "custom" && !manualFilters.comparison && (
                <>
                  <label className="admin-chat-filter-field">
                    <span>From</span>
                    <input
                      type="date"
                      value={manualFilters.customFrom}
                      onChange={(event) => updateManualFilter("customFrom", event.target.value)}
                    />
                  </label>
                  <label className="admin-chat-filter-field">
                    <span>To</span>
                    <input
                      type="date"
                      value={manualFilters.customTo}
                      onChange={(event) => updateManualFilter("customTo", event.target.value)}
                    />
                  </label>
                </>
              )}
              <label className="admin-chat-filter-field">
                <span>State contains</span>
                <input
                  type="text"
                  maxLength={80}
                  value={manualFilters.state}
                  onChange={(event) => updateManualFilter("state", event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label className="admin-chat-filter-field">
                <span>District contains</span>
                <input
                  type="text"
                  maxLength={80}
                  value={manualFilters.district}
                  onChange={(event) => updateManualFilter("district", event.target.value)}
                  placeholder="Optional"
                />
              </label>
              <SelectField
                label="Compare periods"
                value={manualFilters.comparison}
                options={[
                  { value: "month", label: "This month vs last month" },
                  { value: "custom", label: "Custom periods" },
                ]}
                onChange={(value) => updateManualFilter("comparison", value)}
                placeholder="No comparison"
              />
            </div>
            {manualFilters.comparison === "custom" && (
              <div className="admin-chat-period-grid">
                <fieldset>
                  <legend>Earlier period</legend>
                  <label className="admin-chat-filter-field">
                    <span>From</span>
                    <input
                      type="date"
                      value={manualFilters.previousFrom}
                      onChange={(event) => updateManualFilter("previousFrom", event.target.value)}
                    />
                  </label>
                  <label className="admin-chat-filter-field">
                    <span>To</span>
                    <input
                      type="date"
                      value={manualFilters.previousTo}
                      onChange={(event) => updateManualFilter("previousTo", event.target.value)}
                    />
                  </label>
                </fieldset>
                <fieldset>
                  <legend>Later period</legend>
                  <label className="admin-chat-filter-field">
                    <span>From</span>
                    <input
                      type="date"
                      value={manualFilters.currentFrom}
                      onChange={(event) => updateManualFilter("currentFrom", event.target.value)}
                    />
                  </label>
                  <label className="admin-chat-filter-field">
                    <span>To</span>
                    <input
                      type="date"
                      value={manualFilters.currentTo}
                      onChange={(event) => updateManualFilter("currentTo", event.target.value)}
                    />
                  </label>
                </fieldset>
              </div>
            )}
            {manualFilters.metric === "gross_value" && (
              <p className="admin-chat-financial-note">
                Gross delivered order value is not platform revenue. Payment and settlement data are not available to this chatbot.
              </p>
            )}
            {manualFilterError && <p className="admin-chat-form-error" role="alert">{manualFilterError}</p>}
            {!manualFilterError && manualPromptPreview.error && (
              <p className="admin-chat-filter-hint">{manualPromptPreview.error}</p>
            )}
            <div className="admin-chat-filters__actions">
              <button
                className="admin-button admin-button--primary"
                type="submit"
                disabled={Boolean(manualPromptPreview.error)}
              >
                Use these filters <span aria-hidden="true">↗</span>
              </button>
              {draftFilterSummary && (
                <span className="admin-chat-filter-applied">Prepared: {draftFilterSummary}</span>
              )}
            </div>
          </form>
        )}

        <div className="admin-chat-conversation" aria-live="polite">
          {messagesPagination?.hasMore && (
            <button
              className="admin-chat-load-more admin-chat-load-more--messages"
              type="button"
              onClick={loadEarlierMessages}
              disabled={messagesMoreLoading}
            >
              {messagesMoreLoading ? "Loading earlier messages…" : "Load earlier messages"}
            </button>
          )}
          {messagesLoading ? (
            <div className="admin-chat-conversation-state" role="status">
              <span className="admin-chat-spinner" aria-hidden="true" />
              Loading conversation…
            </div>
          ) : messagesError ? (
            <div className="admin-chat-conversation-state admin-chat-conversation-state--error" role="alert">
              <p>{messagesError}</p>
              <button className="admin-chat-text-button" type="button" onClick={retryMessageHistory}>
                Retry loading
              </button>
            </div>
          ) : messages.length ? (
            <div className="admin-chat-message-list">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {sending && (
                <div className="admin-chat-processing" role="status">
                  <span className="admin-chat-spinner" aria-hidden="true" />
                  Checking validated platform aggregates…
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="admin-chat-empty">
              <span className="admin-chat-empty__mark" aria-hidden="true">✳</span>
              <p className="admin-eyebrow">AgriConnect admin assistant</p>
              <h3>What would you like to understand?</h3>
              <p>Explore how AgriConnect works, or ask questions about real user, crop, and order totals from the platform database.</p>
              <div className="admin-chat-examples">
                {EXAMPLE_QUESTIONS.map((question) => (
                  <button
                    type="button"
                    key={question}
                    onClick={() => {
                      updateComposer(question);
                      setSendError(null);
                    }}
                  >
                    {question}<span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
              <div ref={messagesEndRef} />
            </div>
          )}
          {messagesPaginationError && (
            <div className="admin-chat-inline-error" role="alert">
              <span>{messagesPaginationError}</span>
              {messagesPagination?.hasMore && (
                <button className="admin-chat-text-button" type="button" onClick={loadEarlierMessages}>
                  Retry earlier messages
                </button>
              )}
            </div>
          )}
        </div>

        {sendError && (
          <div className={`admin-chat-send-error admin-chat-send-error--${sendError.kind}`} role="alert">
            <p>{sendError.message}</p>
            {pendingRequest && (
              <button type="button" onClick={handleRetry} disabled={sending}>
                {sending ? "Retrying…" : sendError.kind === "processing" ? "Retry same request" : "Retry message"}
              </button>
            )}
          </div>
        )}
        {filterError && <p className="admin-chat-form-error" role="alert">{filterError}</p>}
        {draftFilterSummary && (
          <div className="admin-chat-draft-summary">
            <span>Prepared filter request</span>
            <p>{draftFilterSummary}</p>
          </div>
        )}
        <form className="admin-chat-composer" onSubmit={handleSend}>
          <label className="admin-chat-sr-only" htmlFor="admin-chat-message">
            Ask a question about AgriConnect
          </label>
          <textarea
            id="admin-chat-message"
            value={composer}
            onChange={(event) => updateComposer(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask about AgriConnect, users, crops, orders, or historical prices…"
            maxLength={1200}
            rows={2}
            disabled={sessionsLoading || sending || Boolean(pendingRequest) || messagesLoading}
          />
          <div className="admin-chat-composer__footer">
            <span>{composer.length}/1,200 · Enter to send · Shift+Enter for a new line</span>
            <button
              className="admin-button admin-button--primary"
              type="submit"
              disabled={sessionsLoading || sending || Boolean(pendingRequest) || messagesLoading || !composer.trim()}
            >
              {sending ? "Processing…" : "Send"}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>
        <p className="admin-chat-privacy-note">
          Project answers are curated. Statistics use validated, read-only aggregates; private messages and payment data are never returned.
        </p>
      </div>
    </section>
  );
}

export default AdminChatbot;
