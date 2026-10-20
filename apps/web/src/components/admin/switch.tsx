import { cn } from '@/lib/utils';

/** Compact on/off toggle (role="switch"), used for active flags in admin tables. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  className,
  size = 'md',
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const track = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9';
  const thumb = size === 'sm' ? 'size-3 data-[on=true]:translate-x-3' : 'size-4 data-[on=true]:translate-x-4';
  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange?.(!checked);
      }}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50',
        track,
        checked ? 'bg-primary' : 'bg-border-strong',
        !label && className,
      )}
    >
      <span data-on={checked} className={cn('block rounded-full bg-white shadow-sm transition-transform', thumb)} />
    </button>
  );
  if (!label) return button;
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-[13px]', disabled && 'cursor-not-allowed opacity-60', className)}>
      {button}
      <span>{label}</span>
    </label>
  );
}
