import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppConfig, GenerationProgress, HistoryEntry } from '@shared/types'
import { ParamsPanel } from './components/ParamsPanel'
import { Gallery } from './components/Gallery'

export default function App(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<{ ok: boolean; message: string } | null>(null)

  const progressUnsub = useRef<(() => void) | null>(null)

  useEffect(() => {
    let mounted = true
    window.api.getConfig().then((cfg) => mounted && setConfig(cfg))
    window.api.history().then((h) => mounted && setHistory(h))
    progressUnsub.current = window.api.onProgress((p) => setProgress(p))
    return () => {
      mounted = false
      progressUnsub.current?.()
    }
  }, [])

  const updateConfig = useCallback((partial: Partial<AppConfig>) => {
    setConfig((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...partial }
      window.api.setConfig(partial)
      return next
    })
  }, [])

  const testConnection = useCallback(async () => {
    if (!config) return
    const res = await window.api.testConnection(config)
    setConnection({ ok: res.ok, message: res.message })
  }, [config])

  const handleGenerate = useCallback(
    async (req: {
      prompt: string
      negativePrompt: string
      width: number
      height: number
      steps: number
      cfgScale: number
      sampler: string
      seed: number
      batchSize: number
    }) => {
      if (!config || busy) return
      setBusy(true)
      setError(null)
      setProgress({ stage: 'connecting', message: '开始生成…', percent: 0 })
      const out = await window.api.generate(config, req)
      if (out.error) {
        setError(out.error)
        setProgress(null)
      } else {
        setProgress({ stage: 'done', message: '完成', percent: 100 })
        const h = await window.api.history()
        setHistory(h)
      }
      setBusy(false)
    },
    [config, busy]
  )

  const clearHistory = useCallback(async () => {
    setHistory(await window.api.clearHistory())
  }, [])

  if (!config) {
    return <div className="loading">加载中…</div>
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-dot" />
          <h1>AI 图像工作室</h1>
        </div>
        <div className="header-status">
          {connection && (
            <span className={`conn ${connection.ok ? 'ok' : 'bad'}`}>{connection.message}</span>
          )}
          {busy && <span className="busy">生成中…</span>}
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar">
          <ParamsPanel
            config={config}
            onChange={updateConfig}
            onGenerate={handleGenerate}
            onTest={testConnection}
            busy={busy}
            progress={progress}
          />
        </aside>

        <main className="main">
          {error && <div className="error-banner">{error}</div>}
          <Gallery history={history} onClear={clearHistory} />
        </main>
      </div>
    </div>
  )
}
