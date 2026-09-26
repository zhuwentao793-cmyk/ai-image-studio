import { useState } from 'react'
import type { AppConfig, ControlNetCfg, GenerationProgress, GenMode, ProviderId } from '@shared/types'

const PROVIDERS: { id: ProviderId; label: string; cloud?: boolean }[] = [
  { id: 'sdwebui', label: 'Stable Diffusion WebUI' },
  { id: 'comfyui', label: 'ComfyUI' },
  { id: 'seedream', label: '豆包 Seedream（云端）', cloud: true },
  { id: 'mock', label: '演示模式（无需显卡）' }
]

const MODES: { id: GenMode; label: string }[] = [
  { id: 'txt2img', label: '文生图' },
  { id: 'img2img', label: '图生图' },
  { id: 'upscale', label: '放大' }
]

const UPSCALERS = ['Lanczos', 'Nearest', '4x-UltraSharp', 'ESRGAN_4x', 'R-ESRGAN 4x+', 'Real-ESRGAN 4x+ Anime6B']

const SAMPLERS = [
  'DPM++ 2M Karras',
  'DPM++ 2M',
  'Euler a',
  'Euler',
  'DPM++ SDE Karras',
  'DDIM',
  'UniPC'
]

interface RequestPayload {
  prompt: string
  negativePrompt: string
  width: number
  height: number
  steps: number
  cfgScale: number
  sampler: string
  seed: number
  batchSize: number
  mode?: GenMode
  initImage?: string
  denoise?: number
  upscaleFactor?: number
  upscaler?: string
  controlnet?: ControlNetCfg
}

interface Props {
  config: AppConfig
  onChange: (partial: Partial<AppConfig>) => void
  onGenerate: (req: RequestPayload) => void
  onTest: () => void
  busy: boolean
  progress: GenerationProgress | null
}

export function ParamsPanel({ config, onChange, onGenerate, onTest, busy, progress }: Props): JSX.Element {
  const [prompt, setPrompt] = useState('a beautiful landscape, masterpiece, highly detailed')
  const [negativePrompt, setNegativePrompt] = useState(
    'lowres, bad anatomy, bad hands, extra fingers, blurry'
  )
  const [mode, setMode] = useState<GenMode>('txt2img')
  const [initImage, setInitImage] = useState<string>('')
  const [denoise, setDenoise] = useState(0.6)
  const [upscaleFactor, setUpscaleFactor] = useState(2)
  const [upscaler, setUpscaler] = useState('Lanczos')
  const [cn, setCn] = useState<ControlNetCfg>({ enabled: false, model: '', strength: 0.8, module: 'canny' })

  const isCloud = config.provider === 'seedream'
  const needsLocalBackend = config.provider === 'sdwebui' || config.provider === 'comfyui'
  const isSd = config.provider === 'sdwebui'
  const useSourceImage = mode === 'img2img' || mode === 'upscale'

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

  const canGenerate =
    !busy && prompt.trim().length > 0 && (mode !== 'img2img' || !!initImage) && (mode !== 'upscale' || !!initImage)

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

        {isCloud && (
          <>
            <label className="field">
              <span className="field-label">方舟 API Key</span>
              <input
                type="password"
                value={config.seedreamApiKey}
                onChange={(e) => onChange({ seedreamApiKey: e.target.value })}
                placeholder="申请：ark.volcengine.com"
              />
            </label>
            <label className="field">
              <span className="field-label">Seedream 模型</span>
              <input
                value={config.seedreamModel}
                onChange={(e) => onChange({ seedreamModel: e.target.value })}
                placeholder="doubao-seedream-5-0-lite-260128"
              />
            </label>
            <button className="btn ghost" onClick={onTest} disabled={busy}>
              校验配置
            </button>
          </>
        )}

        {needsLocalBackend && (
          <>
            <label className="field">
              <span className="field-label">API 地址</span>
              <input
                value={config.apiBaseUrl}
                onChange={(e) => onChange({ apiBaseUrl: e.target.value })}
                placeholder="http://127.0.0.1:7860"
              />
            </label>
            {config.provider === 'comfyui' && (
              <label className="field">
                <span className="field-label">基础模型</span>
                <input
                  value={config.comfyModel}
                  onChange={(e) => onChange({ comfyModel: e.target.value })}
                  placeholder="v1-5-pruned-emaonly.safetensors"
                />
              </label>
            )}
            <button className="btn ghost" onClick={onTest} disabled={busy}>
              测试连接
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2>生成模式</h2>
        <div className="provider-grid">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`provider ${mode === m.id ? 'active' : ''}`}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        {useSourceImage && (
          <label className="field">
            <span className="field-label">{mode === 'upscale' ? '源图（放大对象）' : '源图（图生图）'}</span>
            <div className="dir-row">
              <input value={initImage} readOnly placeholder="点击选择本地图片" />
              <button
                className="btn ghost"
                onClick={async () => {
                  const file = await window.api.pickImage()
                  if (file) setInitImage(file)
                }}
              >
                选择
              </button>
            </div>
          </label>
        )}

        {mode === 'img2img' && (
          <label className="field">
            <span className="field-label">重绘强度（denoise {denoise.toFixed(2)}）</span>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={denoise}
              onChange={(e) => setDenoise(Number(e.target.value))}
            />
          </label>
        )}

        {mode === 'upscale' && (
          <>
            <label className="field">
              <span className="field-label">放大倍数</span>
              <input
                type="number"
                min={1}
                max={8}
                step={0.5}
                value={upscaleFactor}
                onChange={(e) => setUpscaleFactor(Number(e.target.value) || 2)}
              />
            </label>
            {isSd && (
              <label className="field">
                <span className="field-label">Upscaler</span>
                <select value={upscaler} onChange={(e) => setUpscaler(e.target.value)}>
                  {UPSCALERS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        {isSd && mode !== 'upscale' && (
          <label className="field">
            <span className="field-label">
              <input
                type="checkbox"
                checked={cn.enabled}
                onChange={(e) => setCn({ ...cn, enabled: e.target.checked })}
                style={{ width: 'auto', marginRight: 6 }}
              />
              ControlNet（需后端安装扩展）
            </span>
            {cn.enabled && (
              <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                <input
                  value={cn.model}
                  onChange={(e) => setCn({ ...cn, model: e.target.value })}
                  placeholder="模型名，如 control_v11p_sd15_canny"
                />
                <div className="grid2">
                  <input
                    value={cn.module}
                    onChange={(e) => setCn({ ...cn, module: e.target.value })}
                    placeholder="模块 canny/pose/depth"
                  />
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={2}
                    value={cn.strength}
                    onChange={(e) => setCn({ ...cn, strength: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            )}
          </label>
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
        {!isCloud && (
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
        )}
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
            batchSize: config.batchSize,
            mode,
            initImage: useSourceImage ? initImage : undefined,
            denoise: mode === 'img2img' ? denoise : undefined,
            upscaleFactor: mode === 'upscale' ? upscaleFactor : undefined,
            upscaler: mode === 'upscale' && isSd ? upscaler : undefined,
            controlnet: isSd && cn.enabled ? cn : undefined
          })
        }
      >
        {busy ? '生成中…' : `生成${MODES.find((m) => m.id === mode)?.label ?? ''}`}
      </button>
    </div>
  )
}
