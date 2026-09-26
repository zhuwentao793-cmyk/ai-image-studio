/** 极简 HTTP 客户端（Node 原生 fetch），统一超时与 JSON 处理 */

export interface HttpOptions {
  timeoutMs?: number
  headers?: Record<string, string>
}

export async function httpGetJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const res = await fetch(url, {
    headers: opts.headers,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10000)
  })
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
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120000)
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} @ ${url}`)
  }
  return (await res.json()) as T
}

/** 带自定义请求头的 POST，并允许读取非 2xx 的响应体（用于 Seedream 这类返回错误 JSON 的 API） */
export async function httpPostJsonAuth<T>(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs = 300000
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  })
  let data: T
  try {
    data = (await res.json()) as T
  } catch {
    data = {} as T
  }
  return { status: res.status, data }
}
