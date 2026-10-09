import { authorized } from './access.mjs';
import { searchStore } from './store.mjs';
import { validateInquiry } from '../../../scripts/mls-grid/consumer.mjs';
import { DEFAULT_BRAND, brandCSS } from '../../../scripts/mls-grid/brand.mjs';
import { publicOrigin, renderPage, embedDemo } from '../../../scripts/mls-grid/pages.mjs';

const assets = new Set(['/app.mjs','/consumer.mjs','/brand.mjs','/brand-editor.mjs','/embed.mjs','/embed-loader.js','/style.css']);
const json = (status, body) => Response.json(body,{status});
async function bodyJSON(request) {
  if (!request.body) throw Error('Empty body');
  const reader = request.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 16384) throw Error('Request too large'); chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
function secure(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control','private, no-store');
  headers.set('X-Robots-Tag','noindex, nofollow');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','same-origin');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
  return new Response(response.body,{status:response.status,headers});
}

export async function handleRequest(request, env, {authorize = authorized} = {}) {
  try {
    if (!await authorize(request,env)) return secure(json(403,{error:'Private staging. Sign in through Cloudflare Access.'}));
    const url = new URL(request.url), origin = publicOrigin(env.PUBLIC_ORIGIN);
    if (url.origin !== origin) return secure(json(403,{error:'Unrecognized staging origin'}));
    if (env.APP_ENV !== 'staging' || env.DATASET !== 'synthetic') return secure(json(503,{error:'Staging configuration is incomplete'}));
    const store = searchStore(env.SEARCH_DB), brand = {...DEFAULT_BRAND,name:'Property search',descriptor:'Staging',tagline:'Synthetic inventory · private testing'};
    if (request.method === 'POST' && url.pathname === '/api/inquiries') {
      if (request.headers.get('Origin') !== origin || request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return secure(json(403,{error:'Request origin or content type rejected'}));
      let data; try {data = await bodyJSON(request);} catch {return secure(json(400,{error:'Invalid or oversized request'}));}
      const listing = await store.listing(String(data?.source || ''),String(data?.id || ''));
      if (!listing) return secure(json(404,{error:'This listing is no longer available.'}));
      if (data.kind === 'tour' && !['Active','Coming Soon','Active Under Contract'].includes(listing.StandardStatus)) return secure(json(400,{error:'Showing requests are unavailable for this status.'}));
      let inquiry; try {inquiry = validateInquiry(data);} catch(error) {return secure(json(400,{error:error.message}));}
      const id = crypto.randomUUID(), result = await store.saveInquiry(id,listing,inquiry);
      if (!result.meta.changes) return secure(json(404,{error:'This listing is no longer available.'}));
      return secure(json(201,{id,demo:true,message:'Demo request saved in private staging. No appointment was scheduled and no message or email was sent.'}));
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return secure(json(405,{error:'Method not allowed'}));
    let response;
    if (url.pathname === '/api/brand') response=json(200,{brand,demo:true,readOnly:true});
    else if (url.pathname === '/theme.css') response=new Response(brandCSS(brand),{headers:{'Content-Type':'text/css; charset=utf-8'}});
    else if (url.pathname === '/api/search') response=json(200,await store.search(Object.fromEntries(url.searchParams)));
    else if (url.pathname === '/embed-demo') response=new Response(embedDemo(brand,origin),{headers:{'Content-Type':'text/html; charset=utf-8'}});
    else if (assets.has(url.pathname)) response=await env.ASSETS.fetch(request);
    else {
      const api=url.pathname.match(/^\/api\/listing\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/),media=url.pathname.match(/^\/media\/([a-f0-9]{64})$/),route=url.pathname.match(/^\/listing\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/);
      if (api) {
        const listing=await store.listing(api[1],api[2]);response=listing?json(200,{environment:'demo',listing}):json(404,{error:'This listing is no longer available.'});
      } else if (media) {
        const record=await store.mediaFile(media[1]);if(!record)return secure(json(404,{error:'Photo unavailable'}));
        const variant=url.searchParams.get('variant');if(variant&&!['card','thumb','display'].includes(variant))return secure(json(400,{error:'Unknown image size'}));
        let object=variant?await env.SEARCH_MEDIA.get(`optimized/${record.file}-${variant}.webp`):null;
        const derived=Boolean(object);object??=await env.SEARCH_MEDIA.get(record.file);
        if(!object || !await store.mediaFile(media[1]))return secure(json(404,{error:'Photo unavailable'}));
        response=new Response(object.body,{headers:{'Content-Type':derived?'image/webp':record.type,'Content-Length':String(object.size)}});
      } else if (url.pathname==='/' || url.pathname==='/embed' || route) {
        const asset=await env.ASSETS.fetch(new Request(origin+'/_template.html'));if(!asset.ok)throw Error('Template missing');
        const listing=route?await store.listing(route[1],route[2]):null,unavailable=Boolean(route&&!listing);
        const results=route?null:await store.search({borough:'NYC',type:'Residential',status:'Active',...Object.fromEntries(url.searchParams)});
        let html=renderPage(await asset.text(),{brand,origin,listing,unavailable,embedded:url.pathname==='/embed',results,embedOrigins:[origin]});
        html=html.replace('Sample listings · preview only','Synthetic listings · private staging').replace('Demo listings from OneKey MLS, distributed by MLS GRID.','Fictional inventory for testing. These are not MLS listings or properties offered for sale.').replace('Demo requests stay here and are not delivered.','Demo requests stay in private staging and are not delivered.');
        response=new Response(html,{status:unavailable?404:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
      } else response=json(404,{error:'Not found'});
    }
    response=secure(response);
    return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
  } catch(error) {
    // Parameter errors are useful to consumers; internal failures never disclose DB/configuration details.
    if (/^(Invalid |Minimum price)/.test(error.message)) return secure(json(400,{error:error.message}));
    console.error(JSON.stringify({event:'search_staging_failure',path:new URL(request.url).pathname}));
    return secure(json(503,{error:'Search is temporarily unavailable. Try again.'}));
  }
}
