import { useEffect, useMemo, useState } from 'react'
import type { AppConfig, GenerationProgress, ProviderId } from '@shared/types'

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'sdwebui', label: 'Stable Diffusion WebUI' },
  { id: 'comfyui', label: 'ComfyUI' },
  { id: 'mock', label: '演示模式（无需显卡）' }
]

const SAMPLERS = [
  'DPM++ 2M Karras',
  'DPM++ 2M',
  'Euler a',
  'Euler',
  'DPM++ SDE Karras',
  'DDIM',
  'UniPC'
]

interface Props {
  config: AppConfig
  onChange: (partial: Partial<AppConfig>) => void
  onGenerate: (req: {
    prompt: string
    negativePrompt: string
    width: number
    height: number
    steps: number
    cfgScale: number
    sampler: string
    seed: number
    batchSize: number
  }) => void
  onTest: () => void
  busy: boolean
  progress: GenerationProgress | null
}

export function ParamsPanel({ config, onChange, onGenerate, onTest, busy, progress }: Props): JSX.Element {
  const [prompt, setPrompt] = useState('a beautiful landscape, masterpiece, highly detailed')
  const [negativePrompt, setNegativePrompt] = useState(
    'lowres, bad anatomy, bad hands, extra fingers, blurry'
  )

  const needsBackend = config.provider !== 'mock'

  const setNum = (key: 'width' | 'height' | 'steps' | 'cfgScale' | 'seed' | 'batchSize') => (
    v: number
  ): void => onChange({ [key]: v })

  const input = (label: string, value: number, onChangeV: (v: number) => void, step = 1): JSX.Element => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChangeV(Number(e.target.value) || 0)}
      />
    </label>
  )

  const canGenerate = !busy && prompt.trim().length > 0

  return (
    <div className="params">
      <section className="card">
        <h2>生成后端</h2>
        <div className="provider-grid">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              className={`provider ${config.provider === p.id ? 'active' : ''}`}
              onClick={() => onChange({ provider: p.id })}
              title={p.label}
            >
              {p.label}
            </button>
          ))}
        </div>

        {needsBackend && (
          <>
            <label className="field">
              <span className="field-label">API 地址</span>
              <input
                value={config.apiBaseUrl}
                onChange={(e) => onChange({ apiBaseUrl: e.target.value })}
                placeholder="http://127.0.0.1:7860"
              />
            </label>
            <button className="btn ghost" onClick={onTest} disabled={busy}>
              测试连接
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2>提示词</h2>
        <label className="field">
          <span className="field-label">正向提示词</span>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
        </label>
        <label className="field">
          <span className="field-label">负向提示词</span>
          <textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} rows={3} />
        </label>
      </section>

      <section className="card">
        <h2>生成参数</h2>
        <div className="grid2">
          {input('宽度', config.width, setNum('width'), 8)}
          {input('高度', config.height, setNum('height'), 8)}
          {input('步数', config.steps, setNum('steps'))}
          {input('CFG', config.cfgScale, setNum('cfgScale'), 0.5)}
          {input('种子', config.seed, setNum('seed'))}
          {input('数量', config.batchSize, setNum('batchSize'))}
        </div>
        <label className="field">
          <span className="field-label">采样器</span>
          <select value={config.sampler} onChange={(e) => onChange({ sampler: e.target.value })}>
            {SAMPLERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">输出目录</span>
          <div className="dir-row">
            <input
              value={config.outputDir}
              onChange={(e) => onChange({ outputDir: e.target.value })}
              readOnly
            />
            <button
              className="btn ghost"
              onClick={async () => {
                const dir = await window.api.pickDirectory()
                if (dir) onChange({ outputDir: dir })
              }}
            >
              选择
            </button>
          </div>
        </label>
      </section>

      {progress && (
        <div className="progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress.percent ?? 0}%` }} />
          </div>
          <span className="progress-text">{progress.message}</span>
        </div>
      )}

      <button
        className="btn primary generate"
        disabled={!canGenerate}
        onClick={() =>
          onGenerate({
            prompt,
            negativePrompt,
            width: config.width,
            height: config.height,
            steps: config.steps,
            cfgScale: config.cfgScale,
            sampler: config.sampler,
            seed: config.seed,
            batchSize: config.batchSize
          })
        }
      >
        {busy ? '生成中…' : '生成图像'}
      </button>
    </div>
  )
}
