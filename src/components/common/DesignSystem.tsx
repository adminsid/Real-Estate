import React from 'react'
import clsx from 'clsx'

// ─── Button Component ───────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'success' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center font-semibold rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            // Variants
            'bg-brand-navy text-white hover:bg-brand-navy-light focus-visible:ring-brand-navy': variant === 'primary',
            'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus-visible:ring-gray-500': variant === 'secondary',
            'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600': variant === 'danger',
            'bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-500': variant === 'warning',
            'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600': variant === 'success',
            'text-gray-600 hover:bg-gray-50 focus-visible:ring-gray-500': variant === 'ghost',
            // Sizes
            'px-3 py-1.5 text-xs': size === 'sm',
            'px-4 py-2.5 text-sm shadow-sm': size === 'md',
            'px-6 py-3.5 text-base shadow-sm': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {isLoading ? (
          <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
        ) : null}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

// ─── Card Component ─────────────────────────────────────────────────────────
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
}

export function Card({ className, hoverable, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white rounded-2xl border border-gray-100 p-6 shadow-sm',
        hoverable && 'hover:shadow-md transition-shadow duration-200',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// ─── Badge Component ────────────────────────────────────────────────────────
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'gray' | 'gold'
}

export function Badge({ className, color = 'gray', children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border',
        {
          'bg-blue-50 text-blue-800 border-blue-100': color === 'blue',
          'bg-emerald-50 text-emerald-800 border-emerald-100': color === 'green',
          'bg-red-50 text-red-800 border-red-100': color === 'red',
          'bg-amber-50 text-amber-800 border-amber-100': color === 'yellow',
          'bg-purple-50 text-purple-800 border-purple-100': color === 'purple',
          'bg-gray-50 text-gray-800 border-gray-100': color === 'gray',
          'bg-amber-500/10 text-brand-gold border-brand-gold/20': color === 'gold',
        },
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

// ─── Input field Component ──────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-1.5 w-full">
        {label && <label className="block text-xs font-bold text-gray-500 uppercase">{label}</label>}
        <input
          ref={ref}
          className={clsx(
            'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy focus:border-transparent transition-all disabled:opacity-50 disabled:bg-gray-50',
            error && 'border-red-300 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
