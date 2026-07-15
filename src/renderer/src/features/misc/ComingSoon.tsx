import { Hammer } from 'lucide-react'
import { Toolbar } from '../../components/window/Toolbar'
import { PageScaffold } from '../../components/window/PageScaffold'
import { EmptyState } from '../../components/ui/states'

export function ComingSoon({ title }: { title: string }): JSX.Element {
  return (
    <PageScaffold toolbar={<Toolbar title={title} />}>
      <EmptyState
        icon={<Hammer size={26} strokeWidth={1.6} />}
        title={`${title}正在开发中`}
        description="这个功能会在后续里程碑中上线。"
      />
    </PageScaffold>
  )
}
