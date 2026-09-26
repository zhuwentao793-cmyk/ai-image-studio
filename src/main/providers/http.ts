/** 极简 HTTP 客户端（Node 原生 fetch），统一超时与 JSON 处理 */

export interface HttpOptions {
  timeoutMs?: number
}

export async function httpGetJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 10000) })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} @ ${url}`)
  }
  return (await res.json()) as T
}

export async function httpPostJson<T>(
  url: string,
  body: unknown,
  opts: HttpOptions = {}
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120000)
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} @ ${url}`)
  }
  return (await res.json()) as T
}
