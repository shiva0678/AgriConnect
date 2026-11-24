export function AdminSkeleton({ variant = "panel", count = 1 }) {
  return (
    <div
      className={`admin-skeleton admin-skeleton--${variant}`}
      role="status"
      aria-label="Loading administrator data"
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <span className="admin-skeleton__line" key={index} />
      ))}
    </div>
  );
}

export function AdminErrorState({ onRetry }) {
  return (
    <div className="admin-state admin-state--error" role="alert">
      <span className="admin-state__symbol" aria-hidden="true">!</span>
      <div>
        <strong>Analytics could not be loaded</strong>
        <p>Check your connection and try again.</p>
        {onRetry && (
          <button
            className="admin-text-button"
            type="button"
            onClick={() => onRetry()}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function AdminEmptyState({ message = "No data is available yet." }) {
  return (
    <div className="admin-state admin-state--empty">
      <span className="admin-state__symbol" aria-hidden="true">⌁</span>
      <p>{message}</p>
    </div>
  );
}

export function AdminPanel({ eyebrow, title, action, children, className = "" }) {
  return (
    <section className={`admin-panel ${className}`.trim()}>
      <header className="admin-panel__header">
        <div>
          {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
