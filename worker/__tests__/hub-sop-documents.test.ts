import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sqliteD1 } from '../../workers/transactions/__tests__/helpers/sqlite';
import { handleSopDocuments } from '../../../branding hub/worker/sop-documents';
const origin='https://hub.test';
describe('SOP original document lifecycle',()=>{
 it('keeps drafts/source private, publishes exact PDF, restores versions and enforces admin access',async()=>{
  const {sqlite,db}=sqliteD1();
  try {
   sqlite.exec(readFileSync('../branding hub/migrations/017_sop_documents.sql','utf8'));
   const objects=new Map<string,ArrayBuffer>();
   const bucket={put:async(key:string,data:ArrayBuffer)=>{objects.set(key,data)},get:async(key:string)=>objects.has(key)?{body:objects.get(key)}:null,head:async(key:string)=>objects.has(key)?{}:null,delete:async(keys:string[])=>{keys.forEach(key=>objects.delete(key))}};
   const call=(path:string,method='GET',role='admin',body?:BodyInit,requestOrigin=origin)=>handleSopDocuments(new Request(origin+'/api/sop-documents'+path,{method,body,headers:{Origin:requestOrigin}}),db as never,bucket as never,role==='anonymous'?null:{id:'fixture',role});
   const upload=async(version:string)=>{
    const form=new FormData();form.set('version',version);form.set('effective_date','2026-10-04');form.set('summary','Reviewed company SOP');
    form.set('pdf',new File(['%PDF-1.7 fixture '+version],'original.pdf'));form.set('source',new File(['PK fixture'],'original.pages'));
    const response=await call('','POST','admin',form);expect(response.status).toBe(201);return (await response.json()).id as string;
   };
   expect((await call('/current','GET','anonymous')).status).toBe(401);
   expect((await call('','GET','broker')).status).toBe(403);
   const a=await upload('1');
   expect((await call(`/${a}/pdf`,'GET','salesperson')).status).toBe(404);
   expect((await call('/current','GET','salesperson')).status).toBe(200);
   expect((await call(`/${a}/publish`,'POST','broker')).status).toBe(403);
   expect((await call(`/${a}/publish`,'POST','admin',undefined,'https://evil.test')).status).toBe(403);
   expect((await call(`/${a}/publish`,'POST')).status).toBe(200);
   expect(await (await call(`/${a}/pdf`,'GET','salesperson')).text()).toContain('fixture 1');
   expect((await call(`/${a}/source`,'GET','salesperson')).status).toBe(404);
   expect((await call(`/${a}/source`)).headers.get('content-disposition')).toContain('attachment');
   const b=await upload('2');await call(`/${b}/publish`,'POST');
   expect((await call(`/${a}/pdf`,'GET','salesperson')).status).toBe(404);
   await call(`/${a}/publish`,'POST');
   expect((await (await call('/current','GET','salesperson')).json()).document.id).toBe(a);
   expect(sqlite.prepare('SELECT count(*) AS n FROM sop_document_publications').get()?.n).toBe(3);
   objects.delete(`sop-originals/${b}/approved.pdf`);
   expect((await call(`/${b}/publish`,'POST')).status).toBe(409);
   const invalid=new FormData();invalid.set('version','3');invalid.set('effective_date','2026-10-04');invalid.set('summary','Fixture');invalid.set('pdf',new File(['not-pdf'],'bad.pdf'));invalid.set('source',new File(['PK'],'source.pages'));
   expect((await call('','POST','admin',invalid)).status).toBe(400);
  }finally{sqlite.close()}
 });
});
