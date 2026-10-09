import { describe,it,expect } from 'vitest'
import { sqliteD1 } from '../../workers/transactions/__tests__/helpers/sqlite'
import { saveOfflineNote } from '../lib/offline-notes'
import { readFileSync } from 'node:fs'
describe('offline note receipt',()=>{
 it('rechecks account identity, deduplicates receipt and retains conflicts',async()=>{
  const {db,sqlite}=sqliteD1();sqlite.exec('CREATE TABLE tenants(id TEXT PRIMARY KEY);CREATE TABLE users(id TEXT PRIMARY KEY);')
  sqlite.exec(readFileSync('worker/db/migrations/053_personal_offline_notes.sql','utf8'))
  sqlite.exec("INSERT INTO tenants VALUES ('tenant-a');INSERT INTO users VALUES ('agent-a');")
  const note={commandId:'note-a',tenantId:'tenant-a',actorId:'agent-a',expectedVersion:0,occurredAt:'2026-09-05T12:00:00Z',text:'Synthetic private note'}
  expect((await saveOfflineNote(db,'tenant-b','agent-a',note)).status).toBe(403)
  expect((await saveOfflineNote(db,'tenant-a','agent-b',note)).status).toBe(403)
  expect(await (await saveOfflineNote(db,'tenant-a','agent-a',note)).json()).toMatchObject({id:'note-a',state:'server_saved'})
  expect((await saveOfflineNote(db,'tenant-a','agent-a',note)).status).toBe(200)
  expect((await saveOfflineNote(db,'tenant-a','agent-a',{...note,text:'Changed payload'})).status).toBe(409)
  expect(sqlite.prepare('SELECT COUNT(*) n FROM personal_notes').get()?.n).toBe(1)
 })
})
