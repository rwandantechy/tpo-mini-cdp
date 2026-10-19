import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface shadow-card ${className}`}>{children}</div>
  );
}

export function CardHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="border-b border-line px-5 py-4">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
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

export function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
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
  return <p className="text-sm text-ink-soft">{label}</p>;
}
