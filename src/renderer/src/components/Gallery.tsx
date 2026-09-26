import { useState } from 'react'
import type { HistoryEntry } from '@shared/types'

interface Props {
  history: HistoryEntry[]
  onClear: () => void
}

function fileToUrl(file: string): string {
  // 本地文件路径转为可显示的 file:// URL
  return 'file://' + encodeURI(file)
}

export function Gallery({ history, onClear }: Props): JSX.Element {
  const [selected, setSelected] = useState<HistoryEntry | null>(null)

  const allImages = history.flatMap((h) =>
    h.imagePaths.map((p, i) => ({ entry: h, path: p, key: `${h.id}_${i}` }))
  )

  return (
    <div className="gallery-wrap">
      <div className="gallery-head">
        <h2>生成记录（{history.length}）</h2>
        {history.length > 0 && (
          <button className="btn ghost" onClick={onClear}>
            清空
          </button>
        )}
      </div>

      {allImages.length === 0 ? (
        <div className="empty">
          <p>还没有生成图像。</p>
          <p className="hint">在左侧填写提示词，点击「生成图像」开始（没有显卡也可先用「演示模式」体验）。</p>
        </div>
      ) : (
        <div className="grid">
          {allImages.map(({ entry, path, key }) => (
            <div key={key} className="tile" onClick={() => setSelected(entry)}>
              <img src={fileToUrl(path)} alt={entry.prompt} loading="lazy" />
              <div className="tile-meta">
                <span className="tile-prompt">{entry.prompt}</span>
                <span className="tile-params">
                  {entry.params.width}×{entry.params.height} · seed {entry.params.seed}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="lightbox" onClick={() => setSelected(null)}>
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-imgs">
              {selected.imagePaths.map((p, i) => (
                <img key={i} src={fileToUrl(p)} alt={selected.prompt} />
              ))}
            </div>
            <div className="lightbox-meta">
              <div>
                <strong>提示词：</strong>
                {selected.prompt || '（空）'}
              </div>
              {selected.negativePrompt && (
                <div>
                  <strong>负向：</strong>
                  {selected.negativePrompt}
                </div>
              )}
              <div className="lightbox-actions">
                {selected.imagePaths.map((p, i) => (
                  <button key={i} className="btn ghost" onClick={() => window.api.openImage(p)}>
                    打开图片 {i + 1}
                  </button>
                ))}
                <button
                  className="btn ghost"
                  onClick={() => window.api.openOutputDir(selected.imagePaths[0]?.split('/').slice(0, -1).join('/') ?? '')}
                >
                  打开目录
                </button>
                <button className="btn ghost" onClick={() => setSelected(null)}>
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
