import { describe,it,expect,vi } from 'vitest'
import { sqliteD1 } from '../../../workers/transactions/__tests__/helpers/sqlite'
import { signJWT } from '../crypto'
import { getSession } from '../auth'
import handler from '../../index'
describe('live session authorization',()=>{
 it('uses current roles and rejects revoked or transferred memberships',async()=>{
  const {db,sqlite}=sqliteD1();sqlite.exec("CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT,role TEXT,is_active INTEGER);INSERT INTO users VALUES('agent','tenant','salesperson',1)")
  const secret='synthetic-test-secret';const token=await signJWT({userId:'agent',tenantId:'tenant',role:'admin'},secret)
  const request=new Request('https://workspace.test/api/stats',{headers:{Cookie:'re_session='+token}})
  expect((await getSession(request,secret,db))?.role).toBe('salesperson')
  sqlite.exec("UPDATE users SET is_active=0")
  expect(await getSession(request,secret,db)).toBeNull()
  sqlite.exec("UPDATE users SET is_active=1,tenant_id='other'")
  expect(await getSession(request,secret,db)).toBeNull()
 })
 it('rejects a raw document key belonging to another tenant before reading storage',async()=>{
  const {db,sqlite}=sqliteD1();sqlite.exec("CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT,role TEXT,is_active INTEGER);INSERT INTO users VALUES('agent','tenant','admin',1);CREATE TABLE documents(id TEXT,file_key TEXT,tenant_id TEXT,is_folder INTEGER);INSERT INTO documents VALUES('document','known-key','other',0)")
  const secret='synthetic-test-secret';const token=await signJWT({userId:'agent',tenantId:'tenant',role:'admin'},secret)
  const get=vi.fn()
  const response=await handler.fetch(new Request('https://workspace.test/api/documents/download?key=known-key',{headers:{Cookie:'re_session='+token}}),{DB:db,JWT_SECRET:secret,ASSETS_BUCKET:{get}} as any,{} as any)
  expect(response.status).toBe(404);expect(get).not.toHaveBeenCalled()
 })
 it('rejects a cross-site cookie mutation before touching data',async()=>{
  const response=await handler.fetch(new Request('https://workspace.test/api/showings',{method:'POST',headers:{Cookie:'re_session=synthetic',Origin:'https://untrusted.test'},body:'{}'}),{} as any,{} as any)
  expect(response.status).toBe(403)
 })
})
