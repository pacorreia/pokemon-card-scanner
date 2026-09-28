export function isSafeGitRef(ref) {
  if (typeof ref !== 'string') return false
  if (!/^[a-zA-Z0-9._/-]{1,100}$/.test(ref)) return false
  if (ref.startsWith('/') || ref.endsWith('/') || ref.includes('//') || ref.includes('..')) return false
  return ref.split('/').every(segment => segment && segment !== '.' && segment !== '..')
}
