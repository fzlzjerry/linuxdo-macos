import { useNavigate } from 'react-router-dom'

/** Back navigation that can't strand the user: falls back to /latest when this
    is the first entry in the app's history (e.g. a deep link into a topic). */
export function useBackNav(): () => void {
  const navigate = useNavigate()
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/latest', { replace: true })
  }
}
