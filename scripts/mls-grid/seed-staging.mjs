import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { publicProjection } from './client.mjs';
const directory=new URL('../../workers/property-search/fixtures/',import.meta.url);await mkdir(directory,{recursive:true});
const boroughs=[['Queens','Queens'],['Kings','Brooklyn'],['New York','Manhattan'],['Bronx','The Bronx'],['Richmond','Staten Island']];
const types=['Residential','Residential Lease','Residential Income','Commercial Sale','Commercial Lease','Land'];
const sql=[],quote=value=>value==null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'",files=[];
for(let i=0;i<60;i++) {
  const [county,city]=boroughs[i%5],type=types[Math.floor(i/10)],id='TEST-'+String(i+1).padStart(3,'0');
  const row={ListingKey:id,OriginatingSystemName:'synthetic',ListingId:id,MlgCanView:true,MlgCanUse:['IDX'],StandardStatus:'Active',PropertyType:type,PropertySubType:type==='Residential'?'Condominium':type,CountyOrParish:county,City:city,StateOrProvince:'NY',ListPrice:type.includes('Lease')?2500+i*75:500000+i*10000,BedroomsTotal:2+i%3,BathroomsFull:1+i%2,BuildingAreaTotal:900+i*20,BuildingAreaUnits:'Square Feet',YearBuilt:2000+i%20,UnparsedAddress:`${i+1} Fictional Test Lane`,InternetAddressDisplayYN:i!==9,PublicRemarks:'Fictional listing for private software testing. This is not an MLS record or a property offered for sale or rent. Illustrations are test diagrams, not property photographs.',ListOfficeName:'Synthetic staging office',ListAgentFullName:'Demo agent',ModificationTimestamp:'2026-10-08T00:00:00Z',OnMarketDate:'2026-10-08',LeaseAmountFrequency:type.includes('Lease')?'Monthly':undefined};
  const record=publicProjection(row);record.obtainedAt=new Date().toISOString();
  sql.push(`INSERT OR REPLACE INTO listings VALUES (${['synthetic',id,'Active',city,'NY',row.ListPrice,row.BedroomsTotal,type,row.UnparsedAddress.toLowerCase(),JSON.stringify(record)].map(quote).join(',')});`);
  for(let photo=0;photo<2;photo++) {
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="${photo?'#dfe6ed':'#e8eef2'}"/><path d="M330 490V280L600 135 870 280V490Z" fill="#fff" stroke="#728798" stroke-width="8"/><path d="M550 490V330H650V490" fill="#bccdd8"/><text x="600" y="590" text-anchor="middle" fill="#243746" font-family="Arial" font-size="36">${photo?'Second gallery test':'First gallery test'}</text><text x="600" y="650" text-anchor="middle" fill="#465a6b" font-family="Arial" font-size="28">Synthetic illustration · not a real property</text></svg>`;
    const file=createHash('sha256').update(svg).digest('hex');await writeFile(new URL(file,directory),svg);files.push(file);
    sql.push(`INSERT OR REPLACE INTO listing_media VALUES (${['synthetic',id,'illustration-'+photo,null,file,'image/svg+xml',photo,'Synthetic test illustration; not real property photography'].map(quote).join(',')});`);
  }
}
sql.push(`INSERT OR REPLACE INTO checkpoints VALUES ('synthetic',NULL,'2026-10-08T00:00:00Z',1,${quote(new Date().toISOString())});`);
await writeFile(new URL('seed.sql',directory),sql.join('\n')+'\n');await writeFile(new URL('media.json',directory),JSON.stringify([...new Set(files)]));
console.log(`Created 60 fictional listings with 120 gallery references to ${new Set(files).size} clearly labeled test illustrations. No MLS data or consumer records read.`);
