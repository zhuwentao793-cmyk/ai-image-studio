import type { UpdateStatus } from '@shared/types'

interface Props {
  status: UpdateStatus
  onAction: (action: 'check' | 'download' | 'install') => void
}

export function UpdateBanner({ status, onAction }: Props): JSX.Element | null {
  const { state, message, progress } = status

  // 仅在有关注价值的状态时显示
  const visible =
    state === 'available' || state === 'downloading' || state === 'downloaded' || state === 'error'

  if (!visible) return null

  return (
    <div className={`update-banner ${state}`}>
      <span className="update-msg">
        {message}
        {state === 'downloading' && progress !== undefined ? `（${progress}%）` : ''}
      </span>
      <span className="update-actions">
        {state === 'available' && (
          <button className="btn primary small" onClick={() => onAction('download')}>
            立即下载
          </button>
        )}
        {state === 'downloaded' && (
          <button className="btn primary small" onClick={() => onAction('install')}>
            重启安装
          </button>
        )}
        {state === 'error' && (
          <button className="btn ghost small" onClick={() => onAction('check')}>
            重试
          </button>
        )}
      </span>
    </div>
  )
}
