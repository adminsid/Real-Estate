// Refresh the already imported demo slice without persisting raw records or signed media URLs.
import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from './client.mjs';
import { openStore } from './store.mjs';
const path=resolve(process.env.MLS_GRID_DB || '.mls-grid-demo/listings.sqlite');
let lock,store;
try {
 lock=await open(`${path}.lock`,'wx',0o600);store=openStore(path);
 const client=createClient({token:process.env.MLS_GRID_ACCESS_TOKEN,source:'onekey2'});
 const total=store.search({source:'onekey2'}).total,ids=[];
 for(let offset=0;offset<total;offset+=24)ids.push(...store.search({source:'onekey2',offset}).listings.map(l=>'KEY'+l.ListingId));
 let updated=0;
 for(let start=0;start<ids.length;start+=20){
  const url=new URL(client.properties(ids.slice(start,start+20)));url.searchParams.delete('$expand');
  let next=url.href;const seen=new Set(),allowed=new Set(ids.slice(start,start+20));
  do {
    if(seen.has(next)||seen.size>=10)throw Error('Unexpected detail pagination cycle.');
    seen.add(next);const page=await client.page(next);
    if(page.rows.some(row=>!allowed.has(row.ListingId)))throw Error('Unexpected detail pagination records.');
    store.apply('onekey2',page,{checkpoint:false});updated+=page.rows.length;next=page.next;
  } while(next);
 }
 console.log(JSON.stringify({refreshed:updated,message:'Consumer projection refreshed. Source replication cursor retained.'}));
} catch (error) { console.error('Detail refresh stopped. '+(/^(MLS Grid returned HTTP \d+|Invalid MLS Grid record|Invalid media backfill identifiers|Unexpected detail pagination)/.test(error.message)?error.message:'Connection or local storage unavailable.')+' Existing source cursor retained.');process.exitCode=1; }
finally {store?.close();if(lock){await lock.close();await unlink(`${path}.lock`);}}
