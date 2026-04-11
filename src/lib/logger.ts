type LogLevel = 'DEBUG' | 'VERBOSE' | 'INFO' | 'WARNING' | 'ERROR'
type LogMethod = 'debug' | 'info' | 'warn' | 'error'
type LogLevelName = 'debug' | 'verbose' | 'info' | 'warning' | 'warn' | 'error'

interface ClientLogPayload {
  timestamp: string
  level: Exclude<LogLevelName, 'warn'>
  scope?: string
  message: string
  meta?: unknown
}

const LEVEL_VALUES: Record<LogLevelName, number> = {
  debug: 10,
  verbose: 15,
  info: 20,
  warning: 30,
  warn: 30,
  error: 40,
}

function normalizeLevel(level: unknown): LogLevelName {
  if (!level) return 'info'
  const normalized = String(level).trim().toLowerCase() as LogLevelName
  return Object.prototype.hasOwnProperty.call(LEVEL_VALUES, normalized) ? normalized : 'info'
}

const configuredLevel = normalizeLevel(import.meta.env.VITE_LOG_LEVEL)
const minLevelValue = LEVEL_VALUES[configuredLevel]
const CLIENT_LOGS_ENABLED = String(import.meta.env.VITE_CLIENT_LOG_TO_SERVER ?? 'true').toLowerCase() !== 'false'
const CLIENT_LOG_ENDPOINT = '/api/logs/client'
const CLIENT_LOG_TOKEN_ENDPOINT = '/api/logs/client-token'
const CLIENT_LOG_BATCH_SIZE = 20
const CLIENT_LOG_FLUSH_MS = 600
const MAX_MESSAGE_LENGTH = 4000
const CLIENT_LOG_TOKEN_REFRESH_SKEW_MS = 15_000

const clientLogQueue: ClientLogPayload[] = []
let clientLogFlushTimer: ReturnType<typeof setTimeout> | null = null
let isFlushingClientLogs = false
let clientLogTokenExpiresAt = 0
let inflightTokenRequest: Promise<boolean> | null = null

function shouldLog(level: LogLevelName): boolean {
  return LEVEL_VALUES[level] >= minLevelValue
}

function normalizeTransportLevel(level: LogLevelName): Exclude<LogLevelName, 'warn'> {
  return level === 'warn' ? 'warning' : level
}

async function requestClientLogToken(): Promise<boolean> {
  try {
    const res = await fetch(CLIENT_LOG_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: '{}',
    })
    if (!res.ok) return false

    const data = await res.json() as { ok?: boolean; expiresAt?: number }
    if (typeof data.expiresAt !== 'number') return false

    clientLogTokenExpiresAt = data.expiresAt
    return true
  } catch {
    return false
  }
}

async function ensureClientLogToken(forceRefresh = false): Promise<boolean> {
  if (!CLIENT_LOGS_ENABLED) return false
  const now = Date.now()
  if (!forceRefresh && now + CLIENT_LOG_TOKEN_REFRESH_SKEW_MS < clientLogTokenExpiresAt) {
    return true
  }

  if (!inflightTokenRequest) {
    inflightTokenRequest = requestClientLogToken().finally(() => {
      inflightTokenRequest = null
    })
  }
  return inflightTokenRequest
}

async function postClientLogBatch(batch: ClientLogPayload[], forceRefreshToken = false): Promise<boolean> {
  const ready = await ensureClientLogToken(forceRefreshToken)
  if (!ready) return false

  const res = await fetch(CLIENT_LOG_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    keepalive: true,
    body: JSON.stringify({ logs: batch }),
  })

  if (res.status === 401 || res.status === 403) {
    const refreshed = await ensureClientLogToken(true)
    if (!refreshed) return false
    const retry = await fetch(CLIENT_LOG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ logs: batch }),
    })
    return retry.ok
  }

  return res.ok
}

function stringifyArg(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`
  }
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function toClientPayload(levelName: LogLevelName, scope: string | undefined, args: unknown[]): ClientLogPayload {
  const [first, ...rest] = args
  const message = stringifyArg(first).slice(0, MAX_MESSAGE_LENGTH)
  const meta = rest.length > 0 ? rest : undefined
  return {
    timestamp: new Date().toISOString(),
    level: normalizeTransportLevel(levelName),
    scope,
    message,
    meta,
  }
}

function scheduleClientLogFlush(): void {
  if (clientLogFlushTimer || isFlushingClientLogs) return
  clientLogFlushTimer = setTimeout(() => {
    clientLogFlushTimer = null
    void flushClientLogs()
  }, CLIENT_LOG_FLUSH_MS)
}

async function flushClientLogs(): Promise<void> {
  if (isFlushingClientLogs || clientLogQueue.length === 0) return
  isFlushingClientLogs = true
  try {
    while (clientLogQueue.length > 0) {
      const batch = clientLogQueue.splice(0, CLIENT_LOG_BATCH_SIZE)
      const sent = await postClientLogBatch(batch)
      if (!sent) {
        clientLogQueue.unshift(...batch)
        break
      }
    }
  } catch {
    // Logging transport should never break app flow.
  } finally {
    isFlushingClientLogs = false
    if (clientLogQueue.length > 0) scheduleClientLogFlush()
  }
}

function enqueueClientLog(payload: ClientLogPayload): void {
  if (!CLIENT_LOGS_ENABLED) return
  clientLogQueue.push(payload)
  if (clientLogQueue.length >= CLIENT_LOG_BATCH_SIZE) {
    void flushClientLogs()
    return
  }
  scheduleClientLogFlush()
}

function formatPrefix(level: LogLevel, scope?: string): string {
  const timestamp = new Date().toISOString()
  if (scope) return `[${timestamp}] [${level}] [${scope}]`
  return `[${timestamp}] [${level}]`
}

function emit(method: LogMethod, levelLabel: LogLevel, levelName: LogLevelName, scope: string | undefined, args: unknown[]): void {
  if (!shouldLog(levelName)) return
  const prefix = formatPrefix(levelLabel, scope)
  const sink = typeof console[method] === 'function' ? console[method] : console.log
  sink(prefix, ...args)
  enqueueClientLog(toClientPayload(levelName, scope, args))
}

export const logger = {
  verbose(scope: string, ...args: unknown[]): void {
    emit('debug', 'VERBOSE', 'verbose', scope, args)
  },
  debug(scope: string, ...args: unknown[]): void {
    emit('debug', 'DEBUG', 'debug', scope, args)
  },
  info(scope: string, ...args: unknown[]): void {
    emit('info', 'INFO', 'info', scope, args)
  },
  warning(scope: string, ...args: unknown[]): void {
    emit('warn', 'WARNING', 'warning', scope, args)
  },
  warn(scope: string, ...args: unknown[]): void {
    emit('warn', 'WARNING', 'warning', scope, args)
  },
  error(scope: string, ...args: unknown[]): void {
    emit('error', 'ERROR', 'error', scope, args)
  },
}
