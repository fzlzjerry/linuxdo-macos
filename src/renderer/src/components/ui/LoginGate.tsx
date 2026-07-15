import type { ReactNode } from 'react'
import { EmptyState } from './states'
import { Button } from './Button'
import { useAuth } from '../../store/auth'

/** The shared "log in to see X" empty state used by gated pages. */
export function LoginGate({
  icon,
  title,
  description
}: {
  icon?: ReactNode
  title: string
  description?: string
}): JSX.Element {
  const auth = useAuth()
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description ?? '登录 linux.do 后即可查看此内容。'}
      action={
        <Button variant="primary" onClick={() => void auth.showLogin()}>
          登录 linux.do
        </Button>
      }
    />
  )
}
