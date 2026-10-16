// Shared interface components (HOME_SHARED_UI_V1 §5). Small radii, no floating shadows, visible focus
// (global :focus-visible outline), explicit disabled colours, colour transitions only.
import { useEffect, useId, useRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-[var(--ui-primary-bg)] text-[var(--ui-primary-fg)] hover:bg-[var(--ui-primary-hover)] border border-transparent',
  secondary: 'bg-[var(--surface)] text-[var(--text)] border border-[var(--ui-control-border)] hover:bg-[var(--surface-2)]',
  ghost: 'bg-transparent text-[var(--text)] border border-transparent underline-offset-4 hover:bg-[var(--surface-2)]',
  danger: 'bg-[var(--ui-danger-bg)] text-[var(--ui-danger-fg)] hover:bg-[var(--ui-danger-hover)] border border-transparent',
};
const DISABLED = 'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[var(--ui-disabled-bg)] disabled:text-[var(--ui-disabled-fg)] disabled:hover:bg-[var(--ui-disabled-bg)]';
const SIZE = { sm: 'min-h-11 px-3 text-sm', md: 'min-h-11 px-4 text-base', lg: 'min-h-12 px-6 text-lg' } as const;

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  className = '',
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZE; busy?: boolean }) {
  return (
    <button
      type="button"
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={`ui-t inline-flex items-center justify-center gap-2 rounded-md font-medium ${VARIANT[variant]} ${DISABLED} ${SIZE[size]} ${className}`}
      {...rest}
    />
  );
}

export function LinkButton({
  to,
  children,
  variant = 'primary',
  className = '',
  ...rest
}: { to: string; children: ReactNode; variant?: 'primary' | 'secondary'; className?: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>) {
  return (
    <Link to={to} className={`ui-t inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-medium ${VARIANT[variant]} ${className}`} {...rest}>
      {children}
    </Link>
  );
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  return (
    <div {...rest} className={`rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 ${className}`}>
      {children}
    </div>
  );
}

/** Accessible modal built on <dialog> (focus containment and restore, Esc to close, unique title id). */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useI18n();
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      const a = document.activeElement;
      opener.current = a instanceof HTMLElement && a !== document.body ? a : null;
      try {
        d.showModal();
      } catch {
        d.setAttribute('open', '');
      }
    }
    if (!open && d.open) {
      d.close();
      // return focus to the opener; if it is gone (e.g. a closed drop-down), to the main content instead of <body>
      const back = opener.current?.isConnected ? opener.current : document.getElementById('main');
      requestAnimationFrame(() => back?.focus());
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] backdrop:bg-black/45`}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="mb-3 flex items-start justify-between gap-4">
            <h2 id={titleId} className="font-serif text-xl font-bold">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label={t('ctl.close')} className="ui-t -mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-[var(--surface-2)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Radio group: native radios (arrow keys move within the group), a visible check mark on the chosen item. */
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
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-[var(--muted)]">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${options.length > 3 ? 7 : 8.5}rem), 1fr))` }}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <label
              key={o.value}
              className={`ui-t relative flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md border-2 px-3 py-2 text-center focus-within:outline-solid focus-within:outline-[3px] focus-within:outline-offset-[3px] focus-within:outline-[color:var(--focus)] ${
                on ? 'border-[var(--ui-accent-text)] bg-[var(--ui-accent-soft)] font-semibold text-[var(--text)]' : 'border-[var(--ui-control-border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <input type="radio" name={name} value={o.value} className="sr-only" checked={on} onChange={() => onChange(o.value)} />
              {on && (
                <svg viewBox="0 0 16 16" className="absolute right-1.5 top-1.5 h-4 w-4 text-[var(--ui-accent-text)]" aria-hidden="true">
                  <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span className="block">{o.label}</span>
              {o.desc && <span className="mt-1 block text-xs font-normal text-[var(--muted)]">{o.desc}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Switch: the whole 44 px row is the target; focus is drawn around the visible track. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span>{label}</span>
      <span className="relative inline-flex shrink-0 items-center">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="ui-t h-7 w-12 rounded-full border-2 border-[var(--ui-control-border)] bg-[var(--surface)] peer-checked:border-[var(--ui-primary-bg)] peer-checked:bg-[var(--ui-primary-bg)] peer-focus-visible:outline-solid peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-[3px] peer-focus-visible:outline-[color:var(--focus)]" />
        <span className="ui-t absolute left-1.5 h-4 w-4 rounded-full bg-[var(--ui-control-border)] peer-checked:translate-x-5 peer-checked:bg-[var(--ui-primary-fg)]" />
      </span>
    </label>
  );
}

/** Loading indicator with a readable name; the spinning ring stops when motion is reduced. */
export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--ui-accent-text)] motion-reduce:animate-none" aria-hidden="true" />
      {label ?? <span className="sr-only">{t('common.loadingLabel')}</span>}
    </span>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">{children}</h1>
      {sub && <p className="mt-2 text-base text-[var(--muted)]">{sub}</p>}
    </header>
  );
}

const ICON = {
  check: <path d="M4 10.5 8 14.5 16 5.5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  info: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 9v5M10 6h.01" />
    </g>
  ),
  warn: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2.5 18.5 17h-17z" />
      <path d="M10 8v4M10 14.5h.01" />
    </g>
  ),
  error: (
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="10" cy="10" r="8" />
      <path d="M7 7l6 6M13 7l-6 6" />
    </g>
  ),
};
const NOTICE = {
  success: { icon: ICON.check, cls: 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent-text)]', role: 'status' },
  info: { icon: ICON.info, cls: 'bg-[var(--ui-accent-soft)] text-[var(--ui-accent-text)]', role: 'status' },
  warning: { icon: ICON.warn, cls: 'bg-[var(--ui-alert-bg)] text-[var(--ui-alert-text)]', role: 'alert' },
  error: { icon: ICON.error, cls: 'bg-[var(--ui-alert-bg)] text-[var(--ui-alert-text)]', role: 'alert' },
} as const;

/** Status message: colour pair + line icon + specific text (never colour alone). */
export function Notice({ kind, children, className = '', actions }: { kind: keyof typeof NOTICE; children: ReactNode; className?: string; actions?: ReactNode }) {
  const n = NOTICE[kind];
  return (
    <div role={n.role} className={`rounded-md px-3 py-2 text-left font-medium ${n.cls} ${className}`}>
      <div className="flex items-start gap-2">
        <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
          {n.icon}
        </svg>
        <span className="min-w-0 flex-1">{children}</span>
      </div>
      {actions && <div className="mt-2 flex flex-wrap justify-end gap-2">{actions}</div>}
    </div>
  );
}
