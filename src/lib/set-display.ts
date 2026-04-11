export function getFriendlySetName(name: string | undefined, series?: string): string {
  if (!name) return 'Unknown Set'
  if (name === '151') {
    return series || 'Scarlet & Violet'
  }
  return name
}
