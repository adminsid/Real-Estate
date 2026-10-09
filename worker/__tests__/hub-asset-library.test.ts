import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sqliteD1 } from '../../workers/transactions/__tests__/helpers/sqlite';
import { handleLibrary,librarySnapshot,canReadLibraryMedia } from '../../../branding hub/worker/asset-library';
import { matchesFilters,emptyFilters } from '../../../branding hub/src/lib/asset-library';
const origin='https://hub.test';const admin={id:'admin',email:'admin@example.com',role:'admin'};const broker={id:'broker',email:'broker@example.com',role:'broker'};const agent={id:'agent',email:'agent@example.com',role:'agent'};
function setup(){const {sqlite,db}=sqliteD1();for(const f of ['003_assets_table.sql','009_assets_updates.sql'])sqlite.exec(readFileSync('../branding hub/migrations/'+f,'utf8'));for(const [id,category,visibility] of [['a','Agent Marketing','agent'],['b','3rd Party Resources','agent'],['c','Agent Marketing','admin']])sqlite.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,id,'Open house reference','Document','All',`/storage/${id}.pdf`,null,null,'Admin','2026-10-04',category,visibility);sqlite.exec(readFileSync('../branding hub/migrations/018_asset_collections.sql','utf8'));const call=(body:unknown,user:typeof admin|null=admin,requestOrigin=origin)=>handleLibrary(new Request(origin+'/api/library',{method:'POST',headers:{Origin:requestOrigin},body:JSON.stringify(body)}),db,user);return{sqlite,db,call}}
describe('Asset collections',()=>{
 it('migrates without publishing and protects private metadata, originals and previews',async()=>{const {sqlite,db,call}=setup();try{
  expect((await librarySnapshot(db,null)).collections).toHaveLength(5);expect((await librarySnapshot(db,null)).assets).toHaveLength(0);
  expect((await librarySnapshot(db,agent)).assets.map(a=>a.id)).toEqual(['a']);
  expect((await librarySnapshot(db,admin)).assets).toHaveLength(3);
  expect(await canReadLibraryMedia(db,agent,'b.pdf')).toBe(false);expect(await canReadLibraryMedia(db,null,'a.pdf')).toBe(false);expect(await canReadLibraryMedia(db,agent,'a.pdf')).toBe(true);
  expect((await call({op:'member',id:'external-resources',email:agent.email},agent)).status).toBe(403);
  expect((await call({op:'member',id:'external-resources',email:agent.email},broker)).status).toBe(200);
  expect((await librarySnapshot(db,agent)).assets.map(a=>a.id)).toContain('b');expect(await canReadLibraryMedia(db,agent,'b.pdf')).toBe(true);
  await call({op:'member',id:'external-resources',email:agent.email,remove:true});expect(await canReadLibraryMedia(db,agent,'b.pdf')).toBe(false);
  expect(await canReadLibraryMedia(db,admin,'sop-originals/secret/source.pages')).toBe(false);
  expect((await call({op:'member',id:'external-resources',email:agent.email},admin,'https://evil.test')).status).toBe(403);
 }finally{sqlite.close()}});
 it('requires explicit admin publication, blocks broker edits of public masters, and removes public file access on archive',async()=>{const {sqlite,db,call}=setup();try{
  const b={op:'asset',id:'a',title:'Approved media',description:'Company guide',type:'Document',url:'/storage/a.pdf',thumbnailUrl:'/storage/abc.png',canvaLink:'',action:'download',tags:['Open House'],visibility:'agent',memberships:[{collection_id:'public-media',section_id:null}]};
  expect((await call(b,broker)).status).toBe(403);expect((await call(b)).status).toBe(403);
  expect((await call({...b,confirmPublic:true})).status).toBe(200);
  expect((await librarySnapshot(db,null)).assets.map(a=>a.id)).toEqual(['a']);expect(await canReadLibraryMedia(db,null,'abc.png')).toBe(true);
  expect((await call({...b,confirmPublic:true,title:'Changed'},broker)).status).toBe(403);
  expect((await call({...b,confirmPublic:true,url:'/storage/sop-originals/secret.pdf'})).status).toBe(400);
  expect((await call({...b,confirmPublic:true,url:'javascript:alert(1)'})).status).toBe(400);
  await call({...b,confirmPublic:true,archived:true});expect(await canReadLibraryMedia(db,null,'a.pdf')).toBe(false);expect((await librarySnapshot(db,null)).assets).toHaveLength(0);
  expect(sqlite.prepare('SELECT count(*) AS n FROM assets').get()?.n).toBe(3);
 }finally{sqlite.close()}});
 it('keeps section and pin scope, dynamically matches tags, and validates template configuration',async()=>{const {sqlite,db,call}=setup();try{
  const b={op:'asset',id:'a',title:'Open house flyer',description:'Invitation',type:'Template',url:'/storage/a.png',thumbnailUrl:'',canvaLink:'',action:'customize',tags:['Open House'],visibility:'agent',memberships:[{collection_id:'prime-america',section_id:'pa-flyers'}]};
  expect((await call(b)).status).toBe(400);expect((await call({...b,template:{layout:'square',heading:'Open House'}})).status).toBe(200);
  expect((await call({...b,template:{layout:'square',heading:'Open House'},memberships:[{collection_id:'external-resources',section_id:'pa-flyers'}]})).status).toBe(400);
  const filters={...emptyFilters,tags:['open house']};expect((await call({op:'pin',id:'open-house',title:'Open House',collection_id:'prime-america',position:0,filters},broker)).status).toBe(200);
  const d=await librarySnapshot(db,agent);expect(matchesFilters(d.assets[0],d.pins[0].filters)).toBe(true);expect((await librarySnapshot(db,null)).pins).toHaveLength(0);
  await call({op:'section',id:'pa-flyers',collection_id:'prime-america',remove:true});expect((await librarySnapshot(db,agent)).items.find(i=>i.asset_id==='a')?.section_id).toBeNull();expect((await librarySnapshot(db,agent)).assets).toHaveLength(1);
  expect((await call({op:'event',id:'b',event:'download'},agent)).status).toBe(404);
  expect((await call({op:'event',id:'a',event:'template_export'},agent)).status).toBe(200);
  expect((await librarySnapshot(db,broker)).usage[0].count).toBe(1);expect((await librarySnapshot(db,agent)).usage).toHaveLength(0);
 }finally{sqlite.close()}});
 it('does not expose unapproved assets when a team collection becomes public',async()=>{const {sqlite,db,call}=setup();try{
  expect((await call({op:'collection',id:'prime-america',title:'Prime',description:'',position:0,access:'public'})).status).toBe(400);
  await call({op:'collection',id:'prime-america',title:'Prime',description:'',position:0,access:'public',confirmPublic:true});
  expect((await librarySnapshot(db,null)).assets).toHaveLength(0);expect(await canReadLibraryMedia(db,null,'a.pdf')).toBe(false);
 }finally{sqlite.close()}});
});
