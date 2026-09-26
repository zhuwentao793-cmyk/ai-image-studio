/** 自检入口：在真实 Electron 运行时驱动一次完整生成管线（mock），用于验证 */
import { app } from 'electron'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MockProvider } from './providers/mock'
import { defaultConfig, ensureOutputDir } from './config'
import { addHistory, getHistory } from './store'
import type { GenerationRequest } from '../shared/types'

app.whenReady().then(async () => {
  try {
    const cfg = defaultConfig()
    cfg.provider = 'mock'
    cfg.outputDir = join(tmpdir(), 'ai-studio-self-test')
    ensureOutputDir(cfg.outputDir)

    const req: GenerationRequest = {
      prompt: 'a self test landscape',
      negativePrompt: '',
      width: 160,
      height: 120,
      steps: 4,
      cfgScale: 7,
      sampler: 'DPM++ 2M Karras',
      seed: 42,
      batchSize: 2
    }

    const logs: string[] = []
    const provider = new MockProvider()
    const result = await provider.generate(cfg, req, (p) => logs.push(`${p.stage}:${p.message}`))

    addHistory({
      id: result.taskId,
      createdAt: new Date().toISOString(),
      prompt: req.prompt,
      negativePrompt: req.negativePrompt,
      params: { width: req.width, height: req.height, steps: req.steps, cfgScale: req.cfgScale, sampler: req.sampler, seed: result.seed, batchSize: req.batchSize },
      provider: 'mock',
      model: result.model,
      imagePaths: result.imagePaths
    })

    const report = {
      imageCount: result.imagePaths.length,
      files: result.imagePaths,
      historyCount: getHistory().length,
      progress: logs
    }
    writeFileSync(join(tmpdir(), 'ai-studio-self-test', 'report.json'), JSON.stringify(report, null, 2))
    console.log('SELF_TEST_OK', JSON.stringify(report))
    app.exit(0)
  } catch (err) {
    console.error('SELF_TEST_FAIL', err)
    app.exit(1)
  }
})
