import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface shadow-card ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="border-b border-line px-5 py-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        {icon ? <span className="text-coral-deep">{icon}</span> : null}
        {title}
      </h2>
      {hint ? <p className="mt-1 text-sm text-ink-soft">{hint}</p> : null}
    </div>
  );
}


type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet';
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles =
    variant === 'primary'
      ? 'bg-coral-deep text-white hover:bg-coral-deeper disabled:bg-coral-deep/50'
      : 'border border-line bg-surface text-ink hover:bg-surface-muted';

  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed ${styles} ${className}`}
      {...props}
    />
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
};

export function Select({ label, id, className = '', children, ...props }: SelectProps) {
  const selectId = id ?? `select-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className={className}>
      <label htmlFor={selectId} className="block text-xs font-medium text-ink-soft">
        {label}
      </label>
      <select
        id={selectId}
        className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

export function Field({ label, hint, id, className = '', ...props }: FieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/70"
        {...props}
      />
      {hint ? <p className="mt-1.5 text-sm text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: number | string;
  note?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <dt className="flex items-center gap-1.5 text-sm text-ink-soft">
        {icon ? <span className="text-coral-deep">{icon}</span> : null}
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </dd>
      {note ? <p className="mt-1 text-sm text-ink-soft">{note}</p> : null}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
  const styles =
    tone === 'error' ? 'border-critical/30 bg-critical/5 text-critical' : 'border-line bg-blush text-ink';

  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-ink-soft" role="status" aria-live="polite">
      <span
        className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-coral"
        aria-hidden
      />
      {label}
    </p>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-lg font-semibold text-ink">{title}</h1>
      {description ? <p className="mt-1 text-sm text-ink-soft">{description}</p> : null}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'ok' | 'muted' | 'neutral';
  children: ReactNode;
}) {
  const styles =
    tone === 'ok'
      ? 'bg-positive/10 text-positive'
      : tone === 'muted'
        ? 'bg-surface-muted text-ink-soft'
        : 'bg-blush text-ink';

  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles}`}>{children}</span>;
}

export function Pager({
  offset,
  limit,
  total,
  busy = false,
  onOffset,
}: {
  offset: number;
  limit: number;
  total: number;
  busy?: boolean;
  onOffset: (offset: number) => void;
}) {
  if (total === 0) return null;

  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
      <Button variant="quiet" className="px-3 py-1.5" disabled={!hasPrev || busy} onClick={() => onOffset(Math.max(0, offset - limit))}>
        Previous
      </Button>
      <Button variant="quiet" className="px-3 py-1.5" disabled={!hasNext || busy} onClick={() => onOffset(offset + limit)}>
        Next
      </Button>
    </div>
  );
}
