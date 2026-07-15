import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import styles from './ErrorBoundary.module.css'

interface Props {
  children: ReactNode
  /** What failed, for the fallback copy (e.g. "帖子" / "页面"). */
  label?: string
}

interface State {
  error: Error | null
}

/** Contains render crashes: a single bad post (or page) degrades to an inline
    strip instead of white-screening the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className={styles.fallback} role="alert">
          <AlertTriangle size={14} aria-hidden />
          <span className={styles.msg}>
            {this.props.label ?? '内容'}渲染出错：{this.state.error.message}
          </span>
          <button
            type="button"
            className={styles.retry}
            onClick={() => this.setState({ error: null })}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
