import { describe, expect, it } from 'vitest'
import { avatarUrl } from './avatar'

describe('saved profile photos', () => {
  it('preserves existing external and application photo URLs', () => {
    expect(avatarUrl('https://images.example.com/agent.jpg')).toBe('https://images.example.com/agent.jpg')
    expect(avatarUrl('/api/auth/avatar/tenant%2Favatars%2Fagent%2Fphoto.png')).toBe('/api/auth/avatar/tenant%2Favatars%2Fagent%2Fphoto.png')
  })
  it('resolves stored upload keys without double encoding URLs', () => {
    const url = avatarUrl('tenant/avatars/agent/photo.png')
    expect(url).toBe('/api/auth/avatar/tenant%2Favatars%2Fagent%2Fphoto.png')
    expect(avatarUrl(url)).toBe(url)
  })
  it('falls back for absent or unsupported sources', () => {
    for (const value of [null, undefined, '', ' ', 'javascript:alert(1)', '//example.com/image.jpg']) expect(avatarUrl(value)).toBeUndefined()
  })
})
