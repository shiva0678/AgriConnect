import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { usePriceAssistantMutation } from "../../queries/priceAssistant";
import "./PriceAssistant.css";

const suggestedQuestions = [
  "What is the Tomato modal price in Karnataka?",
  "Which markets have the highest Tomato prices?",
  "Compare Tomato prices across available markets.",
  "What is the average price of Onion?",
  "Which commodities are available in the dataset?",
];

function getAssistantError(error) {
  const status = error?.response?.status;
  if (status === 401) {
    return {
      message: "Your session may have expired. Please log in again to continue.",
      needsLogin: true,
    };
  }
  if (status === 400) {
    return {
      message:
        error?.response?.data?.message || "Please check your question and try again.",
    };
  }
  if (status === 503) {
    return {
      message:
        "The AI service is temporarily unavailable. Your question is still here—please try again shortly.",
    };
  }
  return {
    message:
      "We couldn’t get a price answer right now. Please try again.",
  };
}

function formatPrice(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "Not available";
  }
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatHistoricalPrice(value) {
  const price = formatPrice(value);
  return price === "Not available" ? price : `INR ${price} / quintal`;
}

function highlightAnswerValues(answer) {
  return answer
    .split(/((?:₹\s*)?\d[\d,]*(?:\.\d+)?)/g)
    .map((part, index) =>
      index % 2 === 1 ? <strong key={`${part}-${index}`}>{part}</strong> : part,
    );
}

function SupportingData({ data }) {
  if (!data) return null;

  const summary = data.summary || {};
  const commodity = data.filters?.commodities?.join(", ");
  const hasSummary = [
    summary.minimumModalPrice,
    summary.maximumModalPrice,
    summary.averageModalPrice,
    summary.recordCount,
  ].some((value) => value !== null && value !== undefined);
  const markets = Array.isArray(data.marketBreakdown) ? data.marketBreakdown : [];
  const observations = Array.isArray(data.observations) ? data.observations : [];

  if (!commodity && !hasSummary && markets.length === 0 && observations.length === 0) {
    return null;
  }

  return (
    <section className="price-assistant-support" aria-label="Supporting price information">
      <div className="price-assistant-support__heading">
        <div>
          <span className="price-assistant-overline">From the records</span>
          <h4>Price insights</h4>
        </div>
        {commodity && <span className="price-assistant-commodity">{commodity}</span>}
      </div>
      {hasSummary && (
        <dl className="price-assistant-stats">
          {[
            ["Observations", summary.recordCount],
            ["Average modal (INR/quintal)", summary.averageModalPrice],
            ["Lowest modal (INR/quintal)", summary.minimumModalPrice],
            ["Highest modal (INR/quintal)", summary.maximumModalPrice],
          ]
            .filter(([, value]) => value !== null && value !== undefined)
            .map(([label, value], index) => (
              <div className="price-assistant-metric" key={label}>
                <span className="price-assistant-metric__icon" aria-hidden="true">
                  {["◉", "≈", "↓", "↑"][index]}
                </span>
                <dt>{label}</dt>
                <dd>{index === 0 ? value : formatHistoricalPrice(value)}</dd>
                {index > 0 && <small>AGMARKNET source convention; CSV has no unit column</small>}
              </div>
            ))}
        </dl>
      )}
      {markets.length > 0 && (
        <div className="price-assistant-markets">
          <div className="price-assistant-table-wrap">
            <table>
              <caption>Market comparison from matching observations</caption>
              <thead>
                <tr>
                  <th scope="col">Market</th>
                  <th scope="col">Location</th>
                  <th scope="col">Average modal (INR/quintal)</th>
                  <th scope="col">Records</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((market, index) => (
                  <tr key={`${market.market}-${market.district || ""}-${index}`}>
                    <th scope="row">{market.market}</th>
                    <td>{[market.district, market.state].filter(Boolean).join(", ") || "Not specified"}</td>
                    <td>{formatHistoricalPrice(market.averageModalPrice)}</td>
                    <td>{market.recordCount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {observations.length > 0 && (
        <div className="price-assistant-markets">
          <h4 className="price-assistant-observations-title">Recorded observations</h4>
          <ul>
            {observations.map((observation, index) => (
              <li key={observation.id || `${observation.market}-${index}`}>
                <span>
                  <strong>{observation.commodity}</strong>
                  <small>
                    {[observation.market, observation.district, observation.state]
                      .filter(Boolean)
                      .join(", ")}
                  </small>
                </span>
                <span>
                  {formatHistoricalPrice(observation.modal_price)}
                  <small>recorded modal price</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AssistantReply({ message }) {
  const error = message.error;
  const location = useLocation();
  const answer = message.answer?.trim()
    || "I couldn't find an answer in the available records. Try another crop or market.";

  return (
    <div className="price-assistant-message-row price-assistant-message-row--assistant">
      <div className="price-assistant-avatar price-assistant-avatar--ai" aria-hidden="true">✳</div>
      <article
        className={`price-assistant-message price-assistant-message--assistant${error ? " is-error" : ""}`}
      >
        <span className="price-assistant-message__label">
          {error ? "Assistant notice" : "Price Assistant"}
        </span>
        <p>{highlightAnswerValues(answer)}</p>
        {error?.needsLogin && (
          <Link
            className="price-assistant-login"
            to="/login"
            state={{ from: location.pathname }}
          >
            Log in again
          </Link>
        )}
        {!error && (
          <>
            <div className="price-assistant-date" aria-label="Historical observation date">
              <span>Historical data · not live market prices</span>
              <strong>
                Observation date: {message.dataAsOf || "Not available"}
              </strong>
            </div>
            <SupportingData data={message.supportingData} />
          </>
        )}
      </article>
    </div>
  );
}

function PriceAssistant() {
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const submissionInProgress = useRef(false);
  const composerRef = useRef(null);
  const { mutateAsync, isPending } = usePriceAssistantMutation();
  const latestObservationDate = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && !message.error)?.dataAsOf;

  async function submitQuestion(rawQuestion) {
    const submittedQuestion = rawQuestion.trim();
    if (!submittedQuestion || isPending || submissionInProgress.current) return;

    submissionInProgress.current = true;
    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-question`,
        role: "user",
        text: submittedQuestion,
      },
    ]);

    try {
      const response = await mutateAsync({ question: submittedQuestion });
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-answer`,
          role: "assistant",
          answer: response.answer,
          dataAsOf: response.dataAsOf,
          source: response.source,
          supportingData: response.supportingData,
        },
      ]);
      setQuestion((current) =>
        current === submittedQuestion ? "" : current,
      );
    } catch (error) {
      const assistantError = getAssistantError(error);
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          role: "assistant",
          error: assistantError,
          answer: assistantError.message,
        },
      ]);
    } finally {
      submissionInProgress.current = false;
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    submitQuestion(question);
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitQuestion(question);
    }
  }

  return (
    <section className="farmer-page reveal-up price-assistant-page">
      <header className="price-assistant-hero">
        <div className="price-assistant-hero__copy">
          <span className="price-assistant-ai-badge">
            <span aria-hidden="true">✳</span> AI PRICE ASSISTANT
          </span>
          <p className="price-assistant-hero__eyebrow">
            {user?.role === "farmer" ? "Farmer workspace" : "Buyer workspace"}
            <span /> Data-backed mandi insights
          </p>
          <h2>Your Smart Mandi <em>Price Companion</em></h2>
          <p className="price-assistant-hero__description">
            Ask thoughtful questions about recorded crop prices and compare
            available market information with clarity.
          </p>
          <div className="price-assistant-hero__availability">
            <span className="price-assistant-availability__dot" />
            <span>
              Historical dataset available
              <small>
                {latestObservationDate
                  ? `Latest response dated ${latestObservationDate}`
                  : "Observation date shown with each answer"}
              </small>
            </span>
          </div>
        </div>
        <div className="price-assistant-hero__art" aria-hidden="true">
          <div className="price-assistant-orbit price-assistant-orbit--outer" />
          <div className="price-assistant-orbit price-assistant-orbit--inner" />
          <div className="price-assistant-orb">
            <span>✳</span>
            <small>AGRI<br />INSIGHT</small>
          </div>
          <span className="price-assistant-art-label price-assistant-art-label--top">MARKET SIGNALS</span>
          <span className="price-assistant-art-label price-assistant-art-label--bottom">GROUNDED IN RECORDS</span>
          <i className="price-assistant-art-dot price-assistant-art-dot--one" />
          <i className="price-assistant-art-dot price-assistant-art-dot--two" />
        </div>
        {messages.length > 0 && (
          <button
            className="price-assistant-clear"
            type="button"
            onClick={() => {
              setMessages([]);
              setQuestion("");
              composerRef.current?.focus();
            }}
            disabled={isPending}
          >
            <span aria-hidden="true">↺</span> Clear conversation
          </button>
        )}
      </header>

      <div className="price-assistant-notice" role="note">
        <span className="price-assistant-notice__icon" aria-hidden="true">◷</span>
        <p>
          <strong>Historical market data only.</strong> These observations are
          not live market prices.
        </p>
        <span className="price-assistant-notice__date">
          {latestObservationDate
            ? `Observation date · ${latestObservationDate}`
            : "Observation date · shown with each response"}
        </span>
      </div>

      <section
        className={`price-assistant-chat${messages.length ? " has-messages" : ""}`}
        aria-label="Price Assistant conversation"
      >
        <div className="price-assistant-messages" role="log" aria-live="polite" aria-relevant="additions">
          {messages.length === 0 && (
            <div className="price-assistant-empty">
              <div className="price-assistant-welcome">
                <span className="price-assistant-empty__icon" aria-hidden="true">
                  ✳
                </span>
                <span className="price-assistant-overline">A better view of the market</span>
                <h3>Let&apos;s make smarter crop decisions.</h3>
                <p>
                  Ask about historical mandi prices, compare markets and explore
                  available price information.
                </p>
              </div>
              <div className="price-assistant-suggestions">
                <h4>Start with a question</h4>
                <div>
                  {suggestedQuestions.map((suggestion, index) => (
                    <button
                      type="button"
                      key={suggestion}
                      disabled={isPending}
                      onClick={() => {
                        setQuestion(suggestion);
                        submitQuestion(suggestion);
                      }}
                    >
                      <span className="price-assistant-suggestion__index">
                        0{index + 1}
                      </span>
                      <span>{suggestion}</span>
                      <span className="price-assistant-suggestion__arrow" aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {messages.map((message) =>
            message.role === "user" ? (
              <article
                className="price-assistant-message price-assistant-message--user"
                key={message.id}
              >
                <div className="price-assistant-avatar price-assistant-avatar--user" aria-hidden="true">
                  {user?.name?.charAt(0)?.toUpperCase() || "Y"}
                </div>
                <div className="price-assistant-message__body">
                  <span className="price-assistant-message__label">You</span>
                  <p>{message.text}</p>
                </div>
              </article>
            ) : (
              <AssistantReply key={message.id} message={message} />
            ),
          )}
          {isPending && (
            <div
              className="price-assistant-loading"
              role="status"
              aria-live="polite"
            >
              <span className="price-assistant-avatar price-assistant-avatar--ai" aria-hidden="true">✳</span>
              <div className="price-assistant-loading__bubble">
                <span className="price-assistant-message__label">Price Assistant</span>
                <span className="price-assistant-typing" aria-label="Assistant is thinking">
                  <i /><i /><i />
                </span>
              </div>
            </div>
          )}
        </div>

        <form className="price-assistant-form" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="price-assistant-question">
            Ask anything about historical mandi prices
          </label>
          <textarea
            ref={composerRef}
            id="price-assistant-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask anything about historical mandi prices..."
            rows={2}
            maxLength={1000}
            disabled={isPending}
            required
          />
          <div className="price-assistant-composer__footer">
            <span>Enter to send · Shift + Enter for a new line</span>
            <button
              className="price-assistant-send"
              type="submit"
              aria-label={isPending ? "Sending question" : "Send question"}
              disabled={isPending || !question.trim()}
            >
              <span>{isPending ? "Thinking" : "Ask assistant"}</span>
              <span className="price-assistant-send__icon" aria-hidden="true">
                {isPending ? <i /> : "↑"}
              </span>
            </button>
          </div>
        </form>
        <div className="price-assistant-composer-note">
          <span aria-hidden="true">◇</span>
          Historical price values follow the AGMARKNET INR/quintal convention; the imported CSV does not include a unit column.
        </div>
      </section>
    </section>
  );
}

export default PriceAssistant;
