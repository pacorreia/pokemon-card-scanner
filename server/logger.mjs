const LEVEL_VALUES = {
  debug: 10,
  verbose: 15,
  info: 20,
  warning: 30,
  warn: 30,
  error: 40,
}

export function normalizeLevel(level) {
  if (!level) return 'info'
  const normalized = String(level).trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(LEVEL_VALUES, normalized) ? normalized : 'info'
}

const configuredLevel = normalizeLevel(process.env.LOG_LEVEL)
const minLevelValue = LEVEL_VALUES[configuredLevel]

function shouldLog(level) {
  return LEVEL_VALUES[level] >= minLevelValue
}

function formatPrefix(level, scope) {
  const timestamp = new Date().toISOString()
  if (scope) return `[${timestamp}] [${level}] [${scope}]`
  return `[${timestamp}] [${level}]`
}

function emit(method, levelName, levelValue, scope, args) {
  if (!shouldLog(levelValue)) return
  const prefix = formatPrefix(levelName, scope)
  const sink = typeof console[method] === 'function' ? console[method] : console.log
  sink(prefix, ...args)
}

export const logger = {
  verbose(scope, ...args) {
    emit('debug', 'VERBOSE', 'verbose', scope, args)
  },
  debug(scope, ...args) {
    emit('debug', 'DEBUG', 'debug', scope, args)
  },
  info(scope, ...args) {
    emit('info', 'INFO', 'info', scope, args)
  },
  warning(scope, ...args) {
    emit('warn', 'WARNING', 'warning', scope, args)
  },
  warn(scope, ...args) {
    emit('warn', 'WARNING', 'warning', scope, args)
  },
  error(scope, ...args) {
    emit('error', 'ERROR', 'error', scope, args)
  },
}
