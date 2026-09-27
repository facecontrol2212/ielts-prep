'use client'

import { forwardRef } from 'react'

import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-fg',
          'placeholder:text-muted disabled:opacity-50',
          className,
        )}
        {...props}
      />
    )
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-border bg-surface p-3 text-sm text-fg',
        'placeholder:text-muted disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
})

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-fg', className)} {...props} />
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  )
}
