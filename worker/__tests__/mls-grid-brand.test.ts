import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { DEFAULT_BRAND, BRAND_PRESETS, validateBrand, brandCSS, contrast } from '../../scripts/mls-grid/brand.mjs'
import { renderPage, publicOrigin, listingPath } from '../../scripts/mls-grid/pages.mjs'
import { publicProjection } from '../../scripts/mls-grid/client.mjs'

describe('Portable search branding and public pages', () => {
 it('accepts every preset while maintaining readable button and page colors', () => {
  for (const kit of Object.values(BRAND_PRESETS)) {
   const brand = validateBrand(kit)
   expect(contrast(brand.accent, '#ffffff')).toBeGreaterThanOrEqual(4.5)
   expect(contrast('#60675f', brand.background)).toBeGreaterThanOrEqual(4.5)
   expect(validateBrand(JSON.parse(JSON.stringify(brand)))).toEqual(brand)
  }
  expect(contrast('#ffffff','#000000')).toBeCloseTo(21)
 })
 it('rejects unreadable colors, CSS injection, unsupported options, and invalid text', () => {
  for (const kit of [{accent:'#ffffff'}, {background:'#111111'}, {accent:'#315c49;}body{display:none}'}, {font:'url(https://foreign.example)'}, {name:''}, {name:'x'.repeat(41)}, {tagline:'line\nbreak'}, {html:'<script>'}, [], null]) expect(()=>validateBrand(kit)).toThrow()
  expect(validateBrand({name:'A < B & C'}).name).toBe('A < B & C')
 })
 it('separates signature colors from adaptive colors without importing arbitrary CSS', () => {
  const brand = validateBrand({accent:'#303d50',colorMode:'signature',font:'modern',corners:'crisp',photos:'compact'})
  const css = brandCSS(brand)
  expect(css).toContain('body[data-experience="rental"]{--accent:#303d50;')
  expect(css).toContain('--brand-radius:3px')
  expect(brandCSS(DEFAULT_BRAND)).toContain('body[data-experience="rental"]{--accent:#365979;')
 })
 it('accepts only exact public origins and uses stable listing paths', () => {
  expect(publicOrigin('https://homes.example/')).toBe('https://homes.example')
  expect(publicOrigin('http://127.0.0.1:8137')).toBe('http://127.0.0.1:8137')
  for (const origin of ['javascript:alert(1)','http://foreign.example','https://name:password@example.com','https://homes.example/path','https://homes.example?brand=x','https://homes.example/#x']) expect(()=>publicOrigin(origin)).toThrow()
  expect(listingPath({source:'onekey2',id:'KEY1'})).toBe('/listing/onekey2/KEY1')
 })
 const template = '<title>Demo</title><body><section id="search-page"></section><section id="listing-page" hidden><div id="listing-content"></div></section></body>'
 const listing = {source:'onekey2',id:'KEY1',ListingId:'123',PropertyType:'Residential',StandardStatus:'Active',ListPrice:500000,UnparsedAddress:'A < B & "C"',PublicRemarks:'Bright home <script>alert(1)</script>',ListOfficeName:'Broker & Co',media:[{url:'/media/'+'a'.repeat(64)}]}
 it('renders listing content, one canonical URL, and share metadata in the initial HTML', () => {
  const html = renderPage(template,{brand:DEFAULT_BRAND,origin:'https://homes.example',listing})
  expect(html).toContain('https://homes.example/listing/onekey2/KEY1')
  expect(html.match(/rel="canonical"/g)).toHaveLength(1)
  expect(html).toContain('property="og:image"')
  expect(html).toContain('MLS #123')
  expect(html).toContain('Bright home &lt;script&gt;')
  expect(html).not.toContain('<script>alert')
  expect(html).toContain('A &lt; B &amp; &quot;C&quot;')
  expect(html).not.toContain('id="listing-page" hidden')
 })
 it('does not restore source-withheld addresses, private fields, or unavailable-page metadata', () => {
  const projected=publicProjection({ListingKey:'KEY1',ListingId:'KEY123',OriginatingSystemName:'onekey2',MlgCanView:true,MlgCanUse:['IDX'],InternetAddressDisplayYN:false,UnparsedAddress:'Secret Street',PublicRemarks:'Secret Street',OwnerName:'Secret Owner',ShowingInstructions:'Secret Code'})
  const html=renderPage(template,{brand:DEFAULT_BRAND,origin:'https://homes.example',listing:projected})
  expect(html).toContain('Address withheld')
  expect(html).not.toContain('Secret')
  expect(html).not.toContain('og:image')
  const unavailable=renderPage(template,{brand:DEFAULT_BRAND,origin:'https://homes.example',unavailable:true})
  expect(unavailable).not.toContain('rel="canonical"')
  expect(unavailable).not.toContain('og:url')
 })
 it('allows only the mounted service iframe to resize the host and reconnects after delayed readiness', async () => {
  const listeners={}, frameListeners={}, peer={postMessage:vi.fn()}, frame={contentWindow:peer,height:'',addEventListener:(name,listener)=>{frameListeners[name]=listener}}
  const container={dataset:{query:'borough=Queens&photosOnly=1'},append:vi.fn()}
  const document={currentScript:{src:'https://search.example/embed-loader.js'},querySelectorAll:()=>[container],createElement:()=>frame}
  const window={addEventListener:(name,listener)=>{listeners[name]=listener}}
  runInNewContext(await readFile(new URL('../../scripts/mls-grid/embed-loader.js',import.meta.url),'utf8'),{document,window,URL,URLSearchParams})
  expect(container.append).toHaveBeenCalledWith(frame)
  expect(frame.src).toBe('https://search.example/embed?borough=Queens&photosOnly=1')
  expect(frame.height).toBe('1100')
  const message={origin:'https://search.example',source:peer,data:{type:'property-search:resize',height:2400}}
  for(const event of [{...message,origin:'https://foreign.example'},{...message,source:{}},{...message,data:{type:'property-search:resize',height:'2400'}},{...message,data:{type:'property-search:resize',height:Infinity}},{...message,data:{type:'property-search:resize',height:999999}}])listeners.message(event)
  expect(frame.height).toBe('1100')
  listeners.message(message);expect(frame.height).toBe('2400')
  listeners.message({...message,data:{type:'property-search:resize',height:700}});expect(frame.height).toBe('700')
  listeners.message({...message,data:{type:'property-search:ready'}})
  expect(peer.postMessage).toHaveBeenCalledWith({type:'property-search:connect'},'https://search.example')
  frameListeners.load();expect(peer.postMessage).toHaveBeenCalledTimes(2)
 })
})
