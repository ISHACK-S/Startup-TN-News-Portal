export function AdminLoading({ label = 'Loading workspace…' }) {
  return <div className="admin-loading" role="status"><span className="admin-spinner" aria-hidden="true" />{label}</div>;
}

export function AdminError({ message, onRetry }) {
  return (
    <div className="admin-alert admin-alert--error" role="alert">
      <span>{message}</span>
      {onRetry && <button type="button" className="admin-link-button" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function AdminEmpty({ title, message }) {
  return (
    <div className="admin-empty">
      <span className="admin-empty-mark" aria-hidden="true">—</span>
      <h2>{title}</h2>
      <p>{message}</p>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, busy = false, onCancel, onConfirm }) {
  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section className="admin-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <span className="admin-dialog-kicker">Please confirm</span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message">{message}</p>
        <div className="admin-dialog-actions">
          <button className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button className="admin-button admin-button--danger" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
