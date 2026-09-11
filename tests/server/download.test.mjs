import { describe, expect, it } from 'vitest'
import { isSafeGitRef } from '../../server/git-ref.mjs'

describe('isSafeGitRef', () => {
  it.each([
    'main',
    'master',
    'feature/cards-sync',
    'release/v1.2.3',
    'hotfix_branch-1',
  ])('accepts valid ref %s', (ref) => {
    expect(isSafeGitRef(ref)).toBe(true)
  })

  it.each([
    '',
    '.',
    '..',
    '/main',
    'main/',
    'feature//cards',
    'feature/./cards',
    'feature/../cards',
    'feature..cards',
    'main?branch',
  ])('rejects unsafe ref %s', (ref) => {
    expect(isSafeGitRef(ref)).toBe(false)
  })
})
