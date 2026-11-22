/**
 * WonderWorks Network's own picture (owner, 2026-11-22: "give a unique picture for network, put the same in both the
 * places"): three people on an orbit, each joined to the member at its centre. Drawn in currentColor, so it sits on the
 * brand gradient in white; used for the top bar's Network icon and the quick actions' Network button.
 */
export function NetworkMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.4" strokeDasharray="2.2 2.4" />
      <path d="M12 12 12 4.2M12 12 5.4 15.9M12 12 18.6 15.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="3.6" r="2.3" fill="currentColor" />
      <circle cx="4.8" cy="16.2" r="2.3" fill="currentColor" />
      <circle cx="19.2" cy="16.2" r="2.3" fill="currentColor" />
      <circle cx="12" cy="12" r="3.1" fill="currentColor" />
    </svg>
  );
}
