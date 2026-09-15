import type { ComponentPropsWithoutRef, PropsWithChildren, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'brand' | 'danger' | 'text';
export type ControlSize = 'sm' | 'md' | 'lg';

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  leadingIcon,
  trailingIcon,
  ...props
}: ButtonProps) {
  const classes = ['eg-button', className].filter(Boolean).join(' ');

  return (
    <button
      {...props}
      className={classes}
      data-size={size}
      data-variant={variant}
      disabled={disabled || loading}
    >
      {loading ? <span className="eg-button__spinner" aria-hidden="true" /> : leadingIcon}
      <span>{children}</span>
      {!loading && trailingIcon}
    </button>
  );
}

export type FieldProps = PropsWithChildren<{
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
}>;

export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  const classes = ['eg-field', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {label && (
        <label className="eg-field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="eg-field__required" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? <span className="eg-field__error" role="alert">{error}</span> : hint && <span className="eg-field__hint">{hint}</span>}
    </div>
  );
}

export type InputProps = ComponentPropsWithoutRef<'input'> & { invalid?: boolean };

export function Input({ className, invalid, ...props }: InputProps) {
  const classes = ['eg-control', className].filter(Boolean).join(' ');
  return <input {...props} className={classes} aria-invalid={invalid || undefined} />;
}

export type TextareaProps = ComponentPropsWithoutRef<'textarea'> & { invalid?: boolean };

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  const classes = ['eg-control', className].filter(Boolean).join(' ');
  return <textarea {...props} className={classes} aria-invalid={invalid || undefined} />;
}

export type SelectProps = ComponentPropsWithoutRef<'select'> & { invalid?: boolean };

export function Select({ className, invalid, ...props }: SelectProps) {
  const classes = ['eg-control', className].filter(Boolean).join(' ');
  return <select {...props} className={classes} aria-invalid={invalid || undefined} />;
}

export type CardProps = PropsWithChildren<{
  padding?: 'sm' | 'md' | 'lg';
  className?: string;
}>;

export function Card({ children, padding = 'md', className }: CardProps) {
  const classes = ['eg-card', className].filter(Boolean).join(' ');
  return <div className={classes} data-padding={padding}>{children}</div>;
}

export type BadgeProps = PropsWithChildren<{
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
}>;

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  const classes = ['eg-badge', className].filter(Boolean).join(' ');
  return <span className={classes} data-tone={tone}>{children}</span>;
}

export type SwitchProps = Omit<ComponentPropsWithoutRef<'input'>, 'type'> & {
  label?: ReactNode;
};

export function Switch({ id, label, className, ...props }: SwitchProps) {
  const classes = ['eg-switch', className].filter(Boolean).join(' ');
  return (
    <label className={classes}>
      <input {...props} className="eg-switch__control" id={id} type="checkbox" />
      <span className="eg-switch__track" aria-hidden="true" />
      {label && <span className="eg-switch__label">{label}</span>}
    </label>
  );
}
