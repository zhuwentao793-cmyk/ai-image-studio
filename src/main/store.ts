import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { HistoryEntry } from '../shared/types'
import { userDataFile } from './config'

let cache: HistoryEntry[] | null = null

function load(): HistoryEntry[] {
  if (cache) return cache
  const file = userDataFile('history.json')
  try {
    if (existsSync(file)) {
      cache = JSON.parse(readFileSync(file, 'utf-8')) as HistoryEntry[]
      return cache
    }
  } catch (e) {
    console.error('[history] 读取失败', e)
  }
  cache = []
  return cache
}

function persist(): void {
  const file = userDataFile('history.json')
  try {
    writeFileSync(file, JSON.stringify(cache, null, 2), 'utf-8')
  } catch (e) {
    console.error('[history] 保存失败', e)
  }
}

/** 追加一条历史记录，最多保留 200 条 */
export function addHistory(entry: HistoryEntry): HistoryEntry[] {
  const list = load()
  list.unshift(entry)
  if (list.length > 200) list.length = 200
  persist()
  return list
}

export function getHistory(): HistoryEntry[] {
  return load()
}

export function clearHistory(): HistoryEntry[] {
  cache = []
  persist()
  return cache
}
