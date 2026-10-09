import { describe, expect, it, vi } from 'vitest'
import handler from '../index'
import { signJWT } from '../lib/crypto'
import { sqliteD1 } from '../../workers/transactions/__tests__/helpers/sqlite'

async function setup() {
  const { sqlite, db } = sqliteD1()
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT,role TEXT,is_active INTEGER,avatar_url TEXT,updated_at TEXT);
    INSERT INTO users VALUES('agent','tenant','salesperson',1,NULL,NULL),('other','tenant','salesperson',1,NULL,NULL);`)
  const put = vi.fn(async () => ({}))
  const env = { DB: db, JWT_SECRET: 'test', ASSETS_BUCKET: { put } }
  const cookie = await signJWT({userId:'agent',tenantId:'tenant',role:'salesperson'}, 'test')
  const upload = (file: File, authenticated = true) => {
    const body = new FormData(); body.append('file', file)
    return handler.fetch(new Request('https://workspace.test/api/auth/avatar', {
      method: 'POST', headers: authenticated ? {Cookie: `re_session=${cookie}`} : {}, body,
    }), env as never, {waitUntil: vi.fn()} as never)
  }
  return {sqlite, put, upload}
}

describe('profile photo upload', () => {
  it('saves the authenticated user photo with a retrievable URL', async () => {
    const {sqlite, put, upload} = await setup()
    try {
      const response = await upload(new File(['image'], 'portrait.png', {type:'image/png'}))
      expect(response.status).toBe(200)
      const {data} = await response.json() as {data:{key:string;avatarUrl:string}}
      expect(data.key).toMatch(/^tenant\/avatars\/agent\/.+\.png$/)
      expect(data.avatarUrl).toBe(`/api/auth/avatar/${encodeURIComponent(data.key)}`)
      expect(put).toHaveBeenCalledOnce()
      expect(sqlite.prepare('SELECT avatar_url FROM users WHERE id=?').get('agent')).toEqual({avatar_url:data.key})
      expect(sqlite.prepare('SELECT avatar_url FROM users WHERE id=?').get('other')).toEqual({avatar_url:null})
    } finally {sqlite.close()}
  })
  it('rejects invalid, oversized and unauthenticated uploads before storage', async () => {
    const {sqlite, put, upload} = await setup()
    try {
      expect((await upload(new File(['<svg/>'],'avatar.svg',{type:'image/svg+xml'}))).status).toBe(400)
      expect((await upload(new File([new Uint8Array(5*1024*1024+1)],'large.png',{type:'image/png'}))).status).toBe(400)
      expect((await upload(new File(['image'],'avatar.png',{type:'image/png'}),false)).status).toBe(401)
      expect(put).not.toHaveBeenCalled()
    } finally {sqlite.close()}
  })
})
