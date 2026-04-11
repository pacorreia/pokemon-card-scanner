/**
 * Thin wrapper around sonner's `toast` that mirrors error/warning calls to
 * the browser console so they appear in DevTools without needing to catch
 * every call site individually.
 */
import { toast as _toast } from 'sonner'
import { logger } from '@/lib/logger'

type ToastFn = typeof _toast

const error: typeof _toast.error = (message, options) => {
  logger.error('toast', message, ...(options ? [options] : []))
  return _toast.error(message, options)
}

const warning: typeof _toast.warning = (message, options) => {
  logger.warn('toast', message, ...(options ? [options] : []))
  return _toast.warning(message, options)
}

export const toast: ToastFn = Object.assign(
  (...args: Parameters<ToastFn>) => _toast(...args),
  _toast,
  { error, warning },
)
