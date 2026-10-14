import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { replica } from '../src/replica.mjs'
export function databaseFixture() {
 const sqlite=new DatabaseSync(':memory:')
 sqlite.exec(readFileSync(new URL('../production-migrations/0001_replica.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../production-migrations/0002_locations.sql',import.meta.url),'utf8'))
 sqlite.exec(readFileSync(new URL('../production-migrations/0003_feed_monitor.sql',import.meta.url),'utf8'))
 sqlite.exec(readFileSync(new URL('../production-migrations/0004_image_variants.sql',import.meta.url),'utf8'))
 function prepare(sql:string) {
  let values: (string|number|null)[]=[]
  return {
   bind(...next: (string|number|null)[]){if(next.length>100)throw Error('D1 parameter limit');values=next;return this},
   async first(){return sqlite.prepare(sql).get(...values)||null},
   async all(){return {results:sqlite.prepare(sql).all(...values)}},
   async run(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}}},
  }
 }
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]) {
  sqlite.exec('BEGIN');try {const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}
 }}
 return {sqlite,db,repo:replica(db)}
}
