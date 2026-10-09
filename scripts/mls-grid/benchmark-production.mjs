// Reproducible SQL benchmark: synthetic inventory, local SQLite. Not an edge latency claim.
import {DatabaseSync} from 'node:sqlite';
import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {searchQuery} from './search-query.mjs';
const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../../workers/property-search/production-migrations/0001_replica.sql',import.meta.url),'utf8'));
const count=100000,boroughs=['Manhattan','Brooklyn','Queens','Bronx','Staten Island'];
const insert=db.prepare('INSERT INTO listings(source,id,status,city,state,price,beds,property_type,search_text,public_json,borough,missing_price,on_market_date,missing_date,below_original,has_photos) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
db.exec('BEGIN');
for(let i=0;i<count;i++) {
 const hash=(Math.imul(i+1,2654435761)>>>0),borough=boroughs[hash%5],type=['Residential','Residential Lease','Residential Income','Commercial Sale','Land'][Math.floor(hash/5)%5],price=100000+hash%3000000,date=`2026-10-${String(1+hash%9).padStart(2,'0')}`;
 insert.run('synthetic',`BENCH-${i}`,hash%4?'Active':'Pending',borough,'NY',price,hash%6,type,`${i} maple avenue ${borough.toLowerCase()} 11355`,JSON.stringify({id:`BENCH-${i}`,source:'synthetic',UnparsedAddress:`${i} Fictional Maple Avenue`,ListPrice:price,PropertyType:type,StandardStatus:'Active',ListOfficeName:'Synthetic test brokerage'}),borough,0,date,0,hash%2,hash%3===0?1:0);
}
db.exec('COMMIT');db.exec('ANALYZE');
const cases=[['NYC home prices',{borough:'NYC',type:'Residential',status:'Active'}],['Queens newest',{borough:'Queens',type:'Residential',status:'Active',sort:'newest'}],['Address / ZIP prefix',{q:'maple 11355',borough:'Queens',type:'Residential',status:'Active'}],['Price, beds, photos',{borough:'Brooklyn',type:'Residential',status:'Active',maxPrice:'900000',beds:'2',photosOnly:'1'}]];
const report={inventory:count,engine:'Local Node SQLite',node:process.version,scope:'Statistics + one 24-record page; excludes HTTP, D1 network, rendering, and photo transfer',results:[]};
for(const [name,params] of cases) {
 const q=searchQuery(params,new Date('2026-10-09T20:00:00Z'),true);
 const stats=db.prepare(`SELECT COUNT(*) AS total,SUM(has_photos),SUM(below_original),SUM(CASE WHEN ${q.recentCondition} THEN 1 ELSE 0 END) FROM listings WHERE ${q.where}`);
 const page=db.prepare(`SELECT public_json FROM listings WHERE ${q.where} ORDER BY ${q.sortExpression},id,source LIMIT 24`);
 const times=[];
 for(let i=0;i<32;i++){const start=performance.now();stats.get(...q.values);page.all(...q.values);if(i>1)times.push(performance.now()-start);}
 times.sort((a,b)=>a-b);
 const plan=db.prepare(`EXPLAIN QUERY PLAN SELECT public_json FROM listings WHERE ${q.where} ORDER BY ${q.sortExpression},id,source LIMIT 24`).all(...q.values).map(row=>row.detail);
 report.results.push({name,medianMs:Number(times[Math.floor(times.length/2)].toFixed(2)),p95Ms:Number(times[Math.floor(times.length*.95)].toFixed(2)),plan});
}
db.close();
await writeFile(new URL('../../docs/production-search-benchmark.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
