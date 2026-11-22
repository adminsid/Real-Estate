import { receiveInquiry } from './consumer-inquiries.mjs';
import { experienceRoute } from '../../../scripts/mls-grid/confidence.mjs';
import { imageObject, IMAGE_VARIANTS } from './image-variants.mjs';
import { copyrightNotice,idxNotice } from './display.mjs';
import { searchStore } from './store.mjs';
import { feedReady } from './sync.mjs';
import { requestEnrichment,enrichmentStatus } from './enrichment.mjs';
import { publishJobs } from './job-store.mjs';
import { DEFAULT_BRAND,brandCSS } from '../../../scripts/mls-grid/brand.mjs';
import { searchCheckpoints } from './search-checkpoints.mjs';
import { publicOrigin,renderPage,escapeHTML,listingPath } from '../../../scripts/mls-grid/pages.mjs';
const assets=new Set(['/listing-navigation.mjs','/interaction.css','/property-location.mjs','/search-intent.mjs','/open-houses.mjs','/search-choices.mjs','/search-hero.mjs','/search-hero.css','/search-start.mjs','/confidence.mjs','/confidence-ui.mjs','/guidance.mjs','/confidence.css','/location-model.mjs','/vendor/maplibre-4.7.1.js','/vendor/maplibre-worker-4.7.1.js','/vendor/maplibre-4.7.1.css','/vendor/MAPLIBRE-LICENSE.txt','/bottom-dock.mjs','/bottom-dock.css','/app.mjs','/search-updates.mjs','/listing-enrichment.mjs','/consumer.mjs','/search-filters.mjs','/discovery.mjs','/search-map.mjs','/nyc-boroughs.json','/discovery.css','/search-icon.svg','/brand.mjs','/brand-editor.mjs','/embed.mjs','/embed-loader.js','/style.css','/mls-grid.png','/onekey.png']);
const publicSearchPages=['/','/guide','/how-it-works'];
const publicPagesSitemap='/sitemap-pages.xml';
const sitemapXML=(tag,urls)=>{
  const entry=tag==='sitemapindex'?'sitemap':'url';
  const locations=urls.map(url=>`<${entry}><loc>${escapeHTML(url)}</loc></${entry}>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><${tag} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations}</${tag}>`,{headers:{'Content-Type':'application/xml'}});
};
export function productionHeaders(response,{privateReview=false,noindex=false}={}) {
  const headers=new Headers(response.headers);
  // Eligibility and freshness are checked on every read. No cached revoked listings or photos.
  headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self'; frame-src 'self'; object-src 'none'; frame-ancestors 'self' https://primeamericany.com https://www.primeamericany.com; base-uri 'none'; form-action 'self'");
  if(privateReview || noindex || response.status>=400)headers.set('X-Robots-Tag','noindex, nofollow');
  return new Response(response.body,{status:response.status,headers});
}
export async function handleProduction(request,env,{privateReview=false,now=Date.now(),schedule=work=>work}={}) {
  const wrap=response=>{const result=productionHeaders(response,{privateReview});if((response.status===200||response.status===304)&&/^\/media\/[a-f0-9]{64}$/.test(new URL(request.url).pathname))result.headers.set('Cache-Control','private, no-cache');if(response.ok&&assets.has(new URL(request.url).pathname)&&new URL(request.url).pathname.startsWith('/vendor/'))result.headers.set('Cache-Control','private, max-age=31536000, immutable');return result;};
  try {
    const url=new URL(request.url),origin=publicOrigin(env.PUBLIC_ORIGIN);
    if(url.origin!==origin)return wrap(Response.json({error:'Unrecognized origin'},{status:403}));
    const intake=url.pathname==='/api/inquiries';
    const enrich=url.pathname.match(/^\/api\/listing\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/enrich$/);
    if(!['GET','HEAD'].includes(request.method)&&!(request.method==='POST'&&(enrich||intake)))return wrap(Response.json({error:'Method not allowed.'},{status:405}));
    if(intake&&request.method==='POST'&&(request.headers.get('Origin')!==origin||request.headers.get('Content-Type')?.split(';')[0]!=='application/json'))return wrap(Response.json({error:'Request origin or content type rejected.'},{status:403}));
    if(enrich&&(request.method!=='POST'||request.headers.get('Origin')!==origin||request.headers.get('Content-Type')?.split(';')[0]!=='application/json'))return wrap(Response.json({error:'Request origin or method rejected.'},{status:403}));
    const releasing=env.PUBLIC_RELEASE_ENABLED==='true' && env.APPROVED_IDX_ORIGIN===origin && env.DISPLAY_REVIEW_COMPLETE==='true';
    if(!privateReview && releasing && !assets.has(url.pathname) && !['/theme.css','/api/brand','/robots.txt','/copyright'].includes(url.pathname)) {
      const mediaRead=url.pathname.startsWith('/media/');
      const limiter=mediaRead?env.PHOTO_RATE_LIMIT:env.SEARCH_RATE_LIMIT;
      if(!limiter)throw Error('Consumer rate controls missing');
      // Anonymous access: coarse network-level protection, with generous limits for shared networks.
      // Counters are regional/eventually consistent; this is abuse mitigation, never billing accounting.
      const {success}=await limiter.limit({key:'consumer:'+ (request.headers.get('CF-Connecting-IP') || 'unknown')});
      if(!success) {
        console.warn(JSON.stringify({event:'consumer_rate_limited',resource:mediaRead?'photo':'listing_search'}));
        return wrap(new Response(request.method==='HEAD'?null:'You are browsing faster than we can serve. Please try again in a minute.',{status:429,headers:{'Retry-After':'60','Content-Type':'text/plain; charset=utf-8'}}));
      }
    }
    if(!privateReview && (env.PUBLIC_RELEASE_ENABLED!=='true' || env.APPROVED_IDX_ORIGIN!==origin || env.DISPLAY_REVIEW_COMPLETE!=='true' || !await feedReady(env.SEARCH_DB,now))) {
      const response=new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Property search is getting ready</title><main><h1>Property search is getting ready.</h1><p>Our new search is being prepared. Please visit <a href="https://primeamericany.com">Prime America Real Estate</a> for now.</p></main></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Retry-After':'300'}});
      return wrap(new Response(request.method==='HEAD'?null:response.body,response));
    }
    const store=searchStore(env.SEARCH_DB,{production:true}),brand={...DEFAULT_BRAND,name:'Prime America Real Estate',descriptor:'NYC property search',tagline:'Clearing obstacles from your path to home.'};
    let response;
    if(intake){if(request.method!=='POST')response=Response.json({error:'Method not allowed.'},{status:405});else response=await receiveInquiry(request,env.SEARCH_DB,store,now);}
    else if(enrich){
      if(env.PHOTO_IMPORT_MODE!=='on-demand')return wrap(Response.json({error:'Listing refresh is unavailable.'},{status:503}));
      if(!await store.listing(enrich[1],enrich[2]))return wrap(Response.json({error:'This listing is no longer available.'},{status:404}));
      const enrichment=await requestEnrichment(env.SEARCH_DB,enrich[1],enrich[2],now);
      if(env.GALLERY_JOBS)await schedule(publishJobs(env,{now,limit:8}));
      response=Response.json({enrichment},{status:enrichment.state==='capacity_deferred'?429:['queued','waiting'].includes(enrichment.state)?202:200});
    }
    else if(url.pathname==='/api/search-updates')response=Response.json({checkpoints:await searchCheckpoints(env.SEARCH_DB)});
    else if(url.pathname==='/api/brand')response=Response.json({brand,demo:false,readOnly:true});
    else if(url.pathname==='/theme.css')response=new Response(brandCSS(brand),{headers:{'Content-Type':'text/css; charset=utf-8'}});
    else if(assets.has(url.pathname))response=await env.ASSETS.fetch(request);
    else if(url.pathname==='/robots.txt')response=new Response(privateReview?'User-agent: *\nDisallow: /\n':`User-agent: *\nDisallow: /api/\nDisallow: /ops/\nDisallow: /embed\nSitemap: ${origin}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain'}});
    else if(url.pathname===publicPagesSitemap)response=sitemapXML('urlset',publicSearchPages.map(path=>origin+path));
    else if(url.pathname==='/sitemap.xml') {
      const page=Number(url.searchParams.get('page') || 0);if(!Number.isInteger(page)||page<0||page>1000)throw Error('Invalid sitemap page');
      if(!url.searchParams.has('page')) {
        const count=await env.SEARCH_DB.prepare('SELECT COUNT(*) AS total FROM listings').first();
        const listingSitemaps=Array.from({length:Math.max(1,Math.ceil(count.total/1000))},(_,i)=>`${origin}/sitemap.xml?page=${i}`);
        response=sitemapXML('sitemapindex',[origin+publicPagesSitemap,...listingSitemaps]);
      } else {
        const rows=await env.SEARCH_DB.prepare('SELECT source,id FROM listings ORDER BY source,id LIMIT 1000 OFFSET ?').bind(page*1000).all();
        response=sitemapXML('urlset',rows.results.map(row=>origin+listingPath(row)));
      }
    } else if(url.pathname==='/copyright')response=new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Copyright notices · Prime America Real Estate</title><link rel="stylesheet" href="/style.css"><main><h1>Copyright and listing-data notices</h1><p>Send listing corrections or copyright notices to <a href="mailto:info@primeamericany.com">info@primeamericany.com</a>.</p>${copyrightNotice}<a href="/">Return to property search</a></main></html>`,{headers:{'Content-Type':'text/html; charset=utf-8'}});
    else if(url.pathname==='/api/search')response=Response.json(await store.search({borough:'NYC',type:'Residential',status:'Active',...Object.fromEntries(url.searchParams)},new Date(now)));
    else if(url.pathname==='/api/featured')response=Response.json(await store.featured(Object.fromEntries(url.searchParams),new Date(now)));
    else if(url.pathname==='/api/suggestions')response=Response.json({suggestions:await store.suggestions(Object.fromEntries(url.searchParams))});
    else if(url.pathname==='/api/discovery')response=Response.json(await store.discovery({borough:'NYC',type:'Residential',status:'Active',...Object.fromEntries(url.searchParams)},new Date(now)));
    else {
      const api=url.pathname.match(/^\/api\/listing\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/),route=url.pathname.match(/^\/listing\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/),media=url.pathname.match(/^\/media\/([a-f0-9]{64})$/);
      if(api) {
        const listing=await store.listing(api[1],api[2]);
        const enrichment=listing&&env.PHOTO_IMPORT_MODE==='on-demand'?await enrichmentStatus(env.SEARCH_DB,api[1],api[2],now):undefined;
        response=Response.json(listing?{environment:'production',listing,enrichment}:{error:'This listing is no longer available.'},{status:listing?200:404});
      } else if(media) {
        const record=await store.mediaFile(media[1]);if(!record)return wrap(new Response('Photo unavailable',{status:404}));
        const variant=url.searchParams.get('variant');if(variant&&!Object.hasOwn(IMAGE_VARIANTS,variant))throw Error('Invalid image size');
        const image=await imageObject(env,store,record,variant,{now});
        if(env.VARIANT_JOBS)await schedule(publishJobs(env,{now,limit:8}));
        if(!image||!await store.mediaFile(media[1]))return wrap(new Response('Photo unavailable',{status:404}));
        const etag='"'+record.file+'-'+image.representation+'"';
        if(request.headers.get('If-None-Match')===etag)response=new Response(null,{status:304,headers:{ETag:etag}});
        else response=new Response(image.object.body,{headers:{'Content-Type':image.type,'Content-Length':String(image.object.size),ETag:etag}});
      } else if(publicSearchPages.includes(url.pathname) || ['/your-search','/embed'].includes(url.pathname) || route) {
        const asset=await env.ASSETS.fetch(new Request(origin+'/_production.html'));if(!asset.ok)throw Error('Template missing');
        const listing=route?await store.listing(route[1],route[2]):null,unavailable=Boolean(route&&!listing);
        const page=experienceRoute(url.pathname,url.search);
        const results=route||page!=='results'?null:await store.search({borough:'NYC',type:'Residential',status:'Active',...Object.fromEntries(url.searchParams)},new Date(now));
        let html=renderPage(await asset.text(),{brand,origin,listing,unavailable,page,embedded:url.pathname==='/embed',results,embedOrigins:[origin,'https://primeamericany.com','https://www.primeamericany.com']});
        const checked=results?.checkpoints?.find(checkpoint=>checkpoint.source==='onekey2')?.updated_at || (await env.SEARCH_DB.prepare('SELECT last_complete FROM feed_state WHERE source=?').bind('onekey2').first())?.last_complete;
        html=html.replace('<p id="freshness"></p>',`<p>${idxNotice(checked)}</p><p id="freshness"></p>`).replace('</main>',`<details id="copyright-notice" class="disclosures"><summary>Copyright and DMCA notice</summary>${copyrightNotice}</details></main>`);
        html=html.replace('<body ', '<body data-environment="production" ');
        if(privateReview)html=html.replace('</main>','<details class="disclosures private-review-notice"><summary>Preview status</summary><p>Private live-data review. Import may be incomplete. Not approved for public display.</p></details></main>');
        else if(listing || (publicSearchPages.includes(url.pathname) && page!=='results'))html=html.replace('<meta name="robots" content="noindex,nofollow">','<meta name="robots" content="index,follow">');
        response=new Response(html,{status:unavailable?404:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
      } else response=Response.json({error:'Not found'},{status:404});
    }
    response=wrap(response);return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;
  } catch(error) {
    const invalid=/^(Invalid |Minimum price)/.test(error.message);
    console.error(JSON.stringify({event:'production_search_failure',kind:invalid?'parameters':'service'}));
    return wrap(Response.json({error:invalid?error.message:'Search is temporarily unavailable. Try again.'},{status:invalid?400:503}));
  }
}
