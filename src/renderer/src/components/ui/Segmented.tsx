import styles from './Segmented.module.css'

interface Option<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'sm'
}: Props<T>): JSX.Element {
  return (
    <div className={`${styles.group} ${styles[size]}`} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={opt.value === value}
          className={`${styles.seg} ${opt.value === value ? styles.active : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
