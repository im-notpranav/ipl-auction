import React, { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, animate, motion } from 'motion/react';
import { X, Loader2, AlertCircle, CheckCircle2, Info, ChevronDown } from 'lucide-react';
import { AuctionStatus, Player } from '../types';
import { formatPrice } from '../utils/format';
import { showAvatarFallback } from '../data/playerImages';
import { teamLogoUrl } from '../data/franchises';

/*
  Shared building blocks for every screen.
  Shape rule: panels are rounded-2xl, controls rounded-xl, badges/chips rounded-full.
  Colour rule: orange = act, gold = money, green/red = bidding state only.
  Spacing rule: 4px grid. Panels pad 20px (p-5) on phones, 24px (p-6) from sm up.
  Elevation: flat panels (border only) < raised (shadow-lift) < overlays (shadow-pop).
  Touch rule: every control is at least 44px tall on touch screens.
*/

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

// Base display for controls, unless the caller sets its own (e.g. "hidden sm:inline-flex").
// Both classes would otherwise land on the element and the CSS order, not the caller, would win.
const displayOr = (className: string | undefined, fallback: string) =>
  className && /(^|\s)(hidden|block|flex|grid|inline-block)(\s|$)/.test(className) ? '' : fallback;

// ─── Buttons ────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ipl-orange text-night hover:bg-ipl-orange-hover shadow-[0_8px_24px_-12px_rgb(243_111_33/0.8)]',
  secondary: 'bg-pitch-2 text-ink border border-line hover:bg-pitch-3 hover:border-line-strong',
  ghost: 'text-ink-2 hover:text-ink hover:bg-pitch-2',
  success: 'bg-live text-night hover:brightness-110 shadow-[0_8px_24px_-12px_rgb(47_209_115/0.8)]',
  danger: 'bg-danger/10 text-danger border border-danger/40 hover:bg-danger/20',
};

// sm stays 44px tall on touch screens and tightens to 36px where a mouse is likely.
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-11 sm:h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-base gap-2',
  lg: 'h-12 px-5 text-lg gap-2',
  xl: 'h-16 px-6 text-2xl gap-2.5',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        displayOr(className, 'inline-flex'),
        'shrink-0 items-center justify-center whitespace-nowrap rounded-xl font-display font-bold uppercase tracking-wide select-none touch-manipulation',
        'transition-[background-color,border-color,color,transform,filter,box-shadow] duration-150 ease-out active:scale-[0.97]',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:active:scale-100',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-[1.1em] w-[1.1em] animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

// Icon-only control: always named for screen readers; 44px on touch, 40px on desktop.
export function IconButton({ label, active, className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        displayOr(className, 'inline-flex'),
        'h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-[background-color,border-color,color,transform] duration-150 active:scale-95 touch-manipulation sm:h-10 sm:w-10',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'border-ipl-orange/60 bg-ipl-orange/10 text-ipl-orange hover:bg-ipl-orange/15' : 'border-line bg-pitch text-ink-2 hover:border-line-strong hover:bg-pitch-2 hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ─── Surfaces ───────────────────────────────────────────────────────────────

export function Panel({ className, children, raised = false, ...rest }: React.HTMLAttributes<HTMLElement> & { raised?: boolean }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-pitch/85', raised && 'shadow-lift', className)} {...rest}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, icon, action, description }: { title: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide text-ink">
          {icon && <span className="shrink-0 text-ipl-orange">{icon}</span>}
          <span className="min-w-0 truncate">{title}</span>
        </h2>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// Section heading used on full pages: small orange eyebrow over a condensed italic title.
export function SectionTitle({ eyebrow, title, children, as: Tag = 'h2', className }: { eyebrow?: string; title: React.ReactNode; children?: React.ReactNode; as?: 'h1' | 'h2' | 'h3'; className?: string }) {
  return (
    <div className={className}>
      {eyebrow && <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-ipl-orange">{eyebrow}</p>}
      <Tag className={cx('pb-1 font-display font-extrabold uppercase italic leading-[1.02] tracking-tight text-ink', Tag === 'h1' ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl', eyebrow && 'mt-2')}>
        {title}
      </Tag>
      {children && <p className="mt-2 max-w-[65ch] text-ink-2">{children}</p>}
    </div>
  );
}

// Loading placeholder shaped like the content it stands in for.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-lg bg-pitch-3/80', className)} />;
}

// Keyboard hint chip. Hidden below lg, where a keyboard is unlikely.
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cx('hidden rounded border border-current/30 px-1.5 font-sans text-xs font-semibold opacity-70 lg:inline', className)}>{children}</kbd>;
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-pitch-2 text-ink-3 [&>svg]:h-7 [&>svg]:w-7">{icon}</div>}
      <p className="font-display text-xl font-bold uppercase tracking-wide text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-2">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Feedback ───────────────────────────────────────────────────────────────

type NoticeTone = 'error' | 'success' | 'info';

const NOTICE_STYLES: Record<NoticeTone, { className: string; Icon: typeof Info }> = {
  error: { className: 'border-danger/40 bg-danger/10 text-[#ffb3b7]', Icon: AlertCircle },
  success: { className: 'border-live/40 bg-live/10 text-[#a8f0c6]', Icon: CheckCircle2 },
  info: { className: 'border-line-strong bg-pitch-2 text-ink-2', Icon: Info },
};

export function Notice({ tone = 'info', children, className }: { tone?: NoticeTone; children: React.ReactNode; className?: string }) {
  const { className: toneClass, Icon } = NOTICE_STYLES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm', toneClass, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

const TOAST_STYLES: Record<NoticeTone, { className: string; Icon: typeof Info }> = {
  error: { className: 'border-danger/50 bg-[#2a0f1a] text-[#ffc2c5]', Icon: AlertCircle },
  success: { className: 'border-live/50 bg-[#0c2a1d] text-[#b4f3cf]', Icon: CheckCircle2 },
  info: { className: 'border-line-strong bg-pitch-2 text-ink', Icon: Info },
};

// Floating message for full-screen views (projector, phone paddle). Announced politely and
// never steals focus. `tone` defaults to error so existing callers keep their look.
export function Toast({ message, className, tone = 'error', icon }: { message: string | null; className?: string; tone?: NoticeTone; icon?: React.ReactNode }) {
  const { className: toneClass, Icon } = TOAST_STYLES[tone];
  return (
    <div aria-live="polite" className={cx('pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4', className)}>
      <AnimatePresence>
        {message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.14 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={cx('pointer-events-auto flex max-w-lg items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-pop', toneClass)}
          >
            {icon ?? <Icon className="h-4 w-4 shrink-0" aria-hidden />}
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Forms ──────────────────────────────────────────────────────────────────

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  // React 19 passes ref as a plain prop; it lands on the <input> via ...rest.
  ref?: React.Ref<HTMLInputElement>;
}

const FIELD_BASE =
  'h-11 w-full rounded-xl border bg-night px-3.5 text-base text-ink placeholder:text-ink-3 outline-none transition-[border-color,box-shadow] duration-150 hover:border-line-strong focus:border-ipl-orange focus:ring-2 focus:ring-ipl-orange/25 disabled:cursor-not-allowed disabled:opacity-50';

function FieldLabel({ htmlFor, label, required }: { htmlFor: string; label: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
      {label}
      {required && <span className="ml-0.5 text-ipl-orange" aria-hidden>*</span>}
    </label>
  );
}

function FieldMessage({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error) return <p id={`${id}-error`} role="alert" className="text-sm text-danger">{error}</p>;
  if (hint) return <p id={`${id}-hint`} className="text-sm text-ink-3">{hint}</p>;
  return null;
}

export function TextField({ label, hint, error, id, className, required, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={inputId} label={label} required={required} />
      <input
        id={inputId}
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy}
        className={cx(FIELD_BASE, error ? 'border-danger' : 'border-line', className)}
        {...rest}
      />
      <FieldMessage id={inputId} error={error} hint={hint} />
    </div>
  );
}

interface SelectProps<T extends string> extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
  error?: string;
  // Keep the label for screen readers only (e.g. in a compact filter bar).
  hideLabel?: boolean;
}

// Native select styled like TextField: keeps the platform picker on phones.
export function Select<T extends string>({ label, value, options, onChange, hint, error, hideLabel, id, className, ...rest }: SelectProps<T>) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {hideLabel ? (
        <label htmlFor={selectId} className="sr-only">{label}</label>
      ) : (
        <FieldLabel htmlFor={selectId} label={label} />
      )}
      <div className="relative">
        <select
          id={selectId}
          value={value}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          onChange={(e) => onChange(e.target.value as T)}
          className={cx(FIELD_BASE, 'cursor-pointer appearance-none pr-10', error ? 'border-danger' : 'border-line', className)}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
      </div>
      <FieldMessage id={selectId} error={error} hint={hint} />
    </div>
  );
}

interface ChoiceGroupProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}

// Segmented single-choice control (radio group semantics; arrow keys move the choice).
export function ChoiceGroup<T extends string | number>({ label, value, options, onChange, hint }: ChoiceGroupProps<T>) {
  const labelId = useId();
  const pillId = useId();
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') onChange(options[(i + 1) % options.length].value);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') onChange(options[(i - 1 + options.length) % options.length].value);
    else return;
    e.preventDefault();
  };
  return (
    <div className="flex flex-col gap-1.5" onKeyDown={onKeyDown}>
      <span id={labelId} className="text-sm font-semibold text-ink">{label}</span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-1 rounded-xl border border-line bg-night p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              className={cx(
                'relative h-11 rounded-lg px-1 font-display text-base font-bold tracking-wide transition-colors duration-150 touch-manipulation sm:h-10',
                selected ? 'text-night' : 'text-ink-2 hover:bg-pitch-2 hover:text-ink',
              )}
            >
              {/* The pill slides to the new choice, so the change reads as one move. */}
              {selected && (
                <motion.span
                  layoutId={pillId}
                  className="absolute inset-0 rounded-lg bg-ipl-orange shadow-[0_4px_14px_-6px_rgb(243_111_33/0.8)]"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                  aria-hidden
                />
              )}
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </div>
      {hint && <p className="text-sm text-ink-3">{hint}</p>}
    </div>
  );
}

export function Switch({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string; disabled?: boolean }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={cx('flex min-h-11 items-center justify-between gap-4', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
        {hint && <p id={hintId} className="text-sm text-ink-3">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? hintId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 touch-manipulation disabled:cursor-not-allowed',
          checked ? 'border-ipl-orange bg-ipl-orange' : 'border-line-strong bg-pitch-2 hover:bg-pitch-3',
        )}
      >
        <span className={cx('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-ink shadow transition-transform duration-200 ease-out', checked ? 'translate-x-5' : 'translate-x-0')} />
      </button>
    </div>
  );
}

// ─── Overlays ───────────────────────────────────────────────────────────────

// True on phone-width screens, where dialogs and drawers become bottom sheets.
export function useIsPhone() {
  const query = '(max-width: 639px)';
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const sync = () => setMatch(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return match;
}

// Grab-handle look on bottom sheets. Esc, the close button and the backdrop close them.
function SheetHandle() {
  return <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />;
}

function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Callers pass inline arrows; keep the latest in a ref so the effect below runs
  // only on open/close (re-running it on every render would keep stealing focus).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    // Move focus into the dialog: first field if there is one, else the dialog itself.
    requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement>('input, select, textarea') ?? panelRef.current;
      target?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);
  return panelRef;
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const panelRef = useOverlay(open, onClose);
  const phone = useIsPhone();
  const titleId = useId();
  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-[#02040c]/75 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={phone ? { y: '100%' } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={phone ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={phone ? { y: '100%', transition: { duration: 0.22, ease: 'easeIn' } } : { opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={cx('relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line-strong bg-pitch shadow-pop outline-none sm:rounded-2xl', width)}
          >
            <SheetHandle />
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 pb-4 pt-3 sm:px-6 sm:pt-5">
              <div className="min-w-0">
                <h2 id={titleId} className="font-display text-2xl font-bold uppercase tracking-wide text-ink">{title}</h2>
                {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
              </div>
              <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1 border-transparent bg-transparent">
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
            {footer && (
              <div className="flex flex-wrap justify-end gap-3 border-t border-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 max-sm:[&>*]:flex-1">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

// Side panel on desktop, bottom sheet on phones.
export function Drawer({ open, onClose, title, children, footer }: DrawerProps) {
  const panelRef = useOverlay(open, onClose);
  const titleId = useId();
  const phone = useIsPhone();
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
          <motion.div
            className="absolute inset-0 bg-[#02040c]/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={phone ? { y: '100%' } : { x: '100%' }}
            animate={phone ? { y: 0 } : { x: 0 }}
            exit={phone ? { y: '100%', transition: { duration: 0.22, ease: 'easeIn' } } : { x: '100%', transition: { duration: 0.22, ease: 'easeIn' } }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
            className="relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl border-t border-line-strong bg-pitch shadow-pop outline-none sm:h-full sm:max-h-none sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0"
          >
            <SheetHandle />
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 pb-3 pt-2 sm:py-4">
              <h2 id={titleId} className="min-w-0 truncate font-display text-xl font-bold uppercase tracking-wide text-ink">{title}</h2>
              <IconButton label="Close" onClick={onClose} className="border-transparent bg-transparent">
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
            {footer && <div className="border-t border-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Auction vocabulary ─────────────────────────────────────────────────────

const STATUS_LABELS: Record<AuctionStatus, { label: string; className: string; live?: boolean }> = {
  LOBBY: { label: 'Lobby', className: 'border-line-strong bg-pitch-2 text-ink-2' },
  READY: { label: 'Ready', className: 'border-line-strong bg-pitch-2 text-ink-2' },
  PLAYER_PRESENTED: { label: 'On stage', className: 'border-line-strong bg-pitch-2 text-ink-2' },
  BIDDING: { label: 'Live', className: 'border-live/40 bg-live/10 text-live', live: true },
  PAUSED: { label: 'Paused', className: 'border-ipl-gold/40 bg-ipl-gold/10 text-ipl-gold' },
  SOLD: { label: 'Sold', className: 'border-live/40 bg-live/10 text-live' },
  UNSOLD: { label: 'Unsold', className: 'border-danger/40 bg-danger/10 text-danger' },
  COMPLETED: { label: 'Completed', className: 'border-line-strong bg-pitch-2 text-ink-2' },
};

export function StatusBadge({ status, className }: { status: AuctionStatus | string; className?: string }) {
  const meta = STATUS_LABELS[status as AuctionStatus] ?? { label: status, className: 'border-line bg-pitch-2 text-ink-2' };
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-display text-sm font-bold uppercase tracking-wider', meta.className, className)}>
      {meta.live && (
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
        </span>
      )}
      {meta.label}
    </span>
  );
}

type TeamIdentity = { name?: string; shortName: string; color?: string; logoUrl?: string };

// A team's crest: the franchise logo when the team plays as one, otherwise a
// monogram disc in the team colour so custom teams still have a mark.
export function TeamLogo({ team, size = 32, className }: { team: TeamIdentity; size?: number; className?: string }) {
  const src = teamLogoUrl(team);
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={cx('shrink-0 object-contain drop-shadow-[0_2px_4px_rgb(0_0_0/0.35)]', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const color = team.color || '#8390bd';
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-display font-extrabold italic leading-none text-night', className)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * (team.shortName.length > 3 ? 0.3 : 0.38))), background: `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 55%, #0b1437))` }}
      aria-hidden
    >
      {team.shortName.slice(0, 4)}
    </span>
  );
}

// Team identity chip: crest (or colour dot for custom teams) and short name.
export function TeamTag({ shortName, color, name, logoUrl, className }: TeamIdentity & { className?: string }) {
  const hasCrest = !!teamLogoUrl({ name, shortName, logoUrl });
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-pitch-2 py-0.5 font-display text-sm font-bold tracking-wider text-ink', hasCrest ? 'pl-1 pr-2.5' : 'px-2.5', className)}>
      {hasCrest ? (
        <TeamLogo team={{ name, shortName, color, logoUrl }} size={18} />
      ) : (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color || '#8390bd' }} aria-hidden />
      )}
      {shortName}
    </span>
  );
}

export function Price({ value, className }: { value: number; className?: string }) {
  return <span className={cx('whitespace-nowrap font-display font-bold tabular text-ipl-gold', className)}>{formatPrice(value)}</span>;
}

export function PlayerPhoto({ player, className, eager }: { player: Pick<Player, 'name' | 'role' | 'imageUrl'>; className?: string; eager?: boolean }) {
  return (
    <img
      src={player.imageUrl}
      alt={player.name}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={(e) => showAvatarFallback(e.currentTarget, player)}
      className={cx('object-cover object-top', className)}
    />
  );
}

// Brand crest. Echoes the IPL logo's language (deep blue shield, orange-to-gold
// sweeping arc) with our own subject, the auctioneer's gavel. Original artwork.
export function BrandMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const shield = 'M32 2 60 9.5V36c0 17.5-12.6 28.3-28 34C16.6 64.3 4 53.5 4 36V9.5Z';
  return (
    <svg viewBox="0 0 64 72" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-shield`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#3563d8" />
          <stop offset="0.55" stopColor="#19398a" />
          <stop offset="1" stopColor="#0a1c5c" />
        </linearGradient>
        <linearGradient id={`${id}-arc`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#f36f21" />
          <stop offset="1" stopColor="#f2c14e" />
        </linearGradient>
      </defs>
      <path d={shield} fill={`url(#${id}-shield)`} />
      <path d={shield} fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.5" />
      <path d="M5.5 47C19 34.5 38 29 59 31.5v6C40 35.5 22 40.5 9.5 56Z" fill={`url(#${id}-arc)`} />
      <g fill="#fff" transform="rotate(-38 31 25)">
        <rect x="19" y="14" width="24" height="10" rx="2.5" />
        <rect x="16.5" y="15.5" width="3" height="7" rx="1.2" />
        <rect x="42.5" y="15.5" width="3" height="7" rx="1.2" />
        <rect x="29.3" y="23" width="3.4" height="20" rx="1.7" />
      </g>
      <circle cx="47" cy="52" r="3.6" fill="#f2c14e" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className="h-10 w-9 shrink-0 drop-shadow-[0_4px_10px_rgb(243_111_33/0.25)]" />
      {!compact && (
        <span className="flex flex-col text-left leading-none">
          <span className="font-display text-xl font-extrabold uppercase italic tracking-wide text-ink">
            Auction <span className="text-ipl-orange">Arena</span>
          </span>
          <span className="mt-1 font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-ink-3">IPL auction room</span>
        </span>
      )}
    </span>
  );
}

// ─── Motion helpers ─────────────────────────────────────────────────────────

// Counts from the previous value to the new one. Snaps when reduced motion is on.
export function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  duration = 0.8,
  className,
  style,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const formatRef = useRef(format);
  formatRef.current = format;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      node.textContent = formatRef.current(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = formatRef.current(v);
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration]);
  return (
    <span ref={ref} className={className} style={style}>
      {format(value)}
    </span>
  );
}

// A small "+₹20 Lakhs" chip that rises off a number when it changes, so the viewer sees
// by how much it moved, not just that it moved. Changing resetKey (e.g. a new lot)
// re-bases silently. Only changes matching `sign` pop.
export function DeltaPop({
  value,
  resetKey,
  format,
  sign = 'positive',
  className,
}: {
  value: number;
  resetKey?: string | number | null;
  format: (delta: number) => string;
  sign?: 'positive' | 'negative';
  className?: string;
}) {
  const prev = useRef({ value, resetKey });
  const [pops, setPops] = useState<{ id: number; delta: number }[]>([]);
  useEffect(() => {
    const last = prev.current;
    prev.current = { value, resetKey };
    if (last.resetKey !== resetKey) return;
    const delta = Math.round((value - last.value) * 100) / 100;
    if (sign === 'positive' ? delta <= 0 : delta >= 0) return;
    setPops((p) => [...p.slice(-1), { id: performance.now(), delta }]);
  }, [value, resetKey, sign]);
  return (
    <span className={cx('pointer-events-none absolute', className)} aria-hidden>
      <AnimatePresence>
        {pops.map((p) => (
          <motion.span
            key={p.id}
            className={cx(
              'absolute right-0 top-0 whitespace-nowrap rounded-full px-2.5 py-0.5 font-display text-base font-bold tabular',
              sign === 'positive' ? 'bg-ipl-gold/15 text-ipl-gold' : 'bg-danger/15 text-danger',
            )}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: [0, 1, 1, 0], y: -18, scale: 1 }}
            transition={{ duration: 1.3, times: [0, 0.12, 0.7, 1], ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => setPops((ps) => ps.filter((x) => x.id !== p.id))}
          >
            {format(p.delta)}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

// Tabs with an indicator that slides between options.
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: { key: T; label: React.ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  label: string;
  className?: string;
}) {
  const layoutId = useId();
  return (
    <div role="tablist" aria-label={label} className={cx('flex flex-wrap gap-1', className)}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={cx(
              'relative h-10 rounded-lg px-4 font-display text-base font-bold uppercase tracking-wide transition-colors',
              active ? 'text-night' : 'text-ink-2 hover:text-ink',
            )}
          >
            {active && (
              <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg bg-ipl-orange" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Player ratings ─────────────────────────────────────────────────────────

// Gold = elite, orange = strong, blue = solid, grey = fringe. Always paired with the number.
export const ratingColor = (r: number) =>
  r >= 85 ? 'var(--color-ipl-gold)' : r >= 72 ? 'var(--color-ipl-orange)' : r >= 58 ? 'var(--color-ipl-blue-bright)' : 'var(--color-ink-3)';

export function RatingRing({ value, size = 88, label = 'Rating', className }: { value: number; size?: number; label?: string; className?: string }) {
  const stroke = Math.max(5, Math.round(size / 12));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(99, value)) / 99;
  return (
    <div className={cx('relative shrink-0', className)} style={{ width: size, height: size }} role="img" aria-label={`${label} ${value} out of 99`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-pitch-3)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ratingColor(value)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <CountUp value={value} className="font-display font-extrabold leading-none tabular text-ink" style={{ fontSize: Math.round(size * 0.36) }} />
        <span className="font-display font-semibold uppercase tracking-widest text-ink-3" style={{ fontSize: Math.max(9, Math.round(size / 9)) }}>
          {label}
        </span>
      </div>
    </div>
  );
}

export function StatMeter({ label, value, note, delay = 0 }: { label: string; value: number; note?: string; delay?: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-sm font-bold uppercase tracking-wider text-ink-2">{label}</span>
        <span className="flex items-baseline gap-2">
          {note && <span className="text-xs text-ink-3">{note}</span>}
          <span className="font-display text-lg font-bold tabular text-ink">{value}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-pitch-3" role="meter" aria-label={`${label} rating`} aria-valuenow={value} aria-valuemin={40} aria-valuemax={99}>
        <motion.div
          className="h-full origin-left rounded-full"
          style={{ backgroundColor: ratingColor(value), width: `${Math.max(4, ((value - 40) / 59) * 100)}%` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}
