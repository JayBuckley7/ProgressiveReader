import { useState, type ReactNode } from 'react';

/** An inline confirmation stays usable in embedded browsers as well as normal tabs. */
export function ConfirmAction({ children, message, onConfirm, className, disabled }: {
  children: ReactNode; message: string; onConfirm: () => void; className?: string; disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  return <span className="inline-flex flex-wrap items-center gap-2" onClick={event => event.stopPropagation()}>
    {!pending ? <button type="button" className={className} disabled={disabled} onClick={() => setPending(true)}>{children}</button> : <>
      <span className="text-sm" role="alert">{message}</span>
      <button type="button" className={className} disabled={disabled} onClick={() => { onConfirm(); setPending(false); }}>Confirm</button>
      <button type="button" className={className} onClick={() => setPending(false)}>Cancel</button>
    </>}
  </span>;
}
