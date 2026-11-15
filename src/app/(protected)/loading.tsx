export default function Loading() {
  return <div role="status" aria-live="polite" className="loading-state">
    <p>Memuatkan rekod anda…</p>
    <div className="skeleton-heading" aria-hidden="true" />
    <div className="summary-grid" aria-hidden="true">{[0, 1, 2].map((item) => <div key={item} className="account-card skeleton-card"><span /><span /></div>)}</div>
  </div>;
}
