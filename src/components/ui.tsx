import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  const v = {
    primary: 'bg-[var(--accent)] text-[var(--on-accent)] hover:brightness-110',
    secondary: 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-3)]',
    ghost: 'bg-transparent text-[var(--text)] hover:bg-[var(--surface-2)]',
    danger: 'bg-[var(--danger)] text-white hover:brightness-110',
  }[variant];
  const s = { sm: 'min-h-10 px-3 text-sm', md: 'min-h-11 px-4 text-base', lg: 'min-h-13 px-6 text-lg' }[size];
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40 ${v} ${s} ${className}`}
      {...rest}
    />
  );
}

export function LinkButton({ to, children, variant = 'primary', className = '' }: { to: string; children: ReactNode; variant?: 'primary' | 'secondary'; className?: string }) {
  const v = variant === 'primary' ? 'bg-[var(--accent)] text-[var(--on-accent)] hover:brightness-110' : 'bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-3)]';
  return (
    <Link to={to} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-medium outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)] ${v} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--card-shadow)] ${className}`}>{children}</div>;
}

/** Accessible modal built on <dialog> (focus trap, Esc to close). */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="modal-title"
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/50`}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="mb-3 flex items-start justify-between gap-4">
            <h2 id="modal-title" className="font-serif text-xl font-bold">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label={t('ctl.close')} className="-m-2 rounded-lg p-2 text-2xl leading-none hover:bg-[var(--surface-2)] focus-visible:ring-4 focus-visible:ring-[var(--focus)]">
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; desc?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-[var(--muted)]">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-xl border p-3 text-center transition focus-within:ring-4 focus-within:ring-[var(--focus)] ${
              value === o.value ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-semibold' : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'
            }`}
          >
            <input type="radio" className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="block">{o.label}</span>
            {o.desc && <span className="mt-1 block text-xs font-normal text-[var(--muted)]">{o.desc}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span>{label}</span>
      <span className="relative inline-flex items-center">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-[var(--surface-3)] transition peer-checked:bg-[var(--accent)] peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--focus)]" />
        <span className="absolute left-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
      {label}
    </span>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">{children}</h1>
      {sub && <p className="mt-2 text-[var(--muted)]">{sub}</p>}
    </header>
  );
}
