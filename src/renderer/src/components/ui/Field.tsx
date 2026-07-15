import { cloneElement, useId } from 'react'
import type { ReactElement } from 'react'
import styles from './Field.module.css'

interface FieldProps {
  label: string
  /** Render the label for screen readers only (search boxes etc.). */
  hideLabel?: boolean
  hint?: string
  error?: string
  required?: boolean
  /** A single input / textarea / select. Gets id + aria wiring + .input styling. */
  children: ReactElement
  className?: string
}

/** Form-field wrapper: label, control, hint / inline error with aria wiring. */
export function Field({
  label,
  hideLabel,
  hint,
  error,
  required,
  children,
  className
}: FieldProps): JSX.Element {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-err` : undefined

  const control = cloneElement(children, {
    id,
    className: `${styles.input} ${(children.props as { className?: string }).className ?? ''}`,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [errorId, hintId].filter(Boolean).join(' ') || undefined,
    'aria-required': required || undefined
  })

  return (
    <div className={`${styles.field} ${className ?? ''}`}>
      <label htmlFor={id} className={hideLabel ? styles.srOnly : styles.label}>
        {label}
      </label>
      {control}
      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
