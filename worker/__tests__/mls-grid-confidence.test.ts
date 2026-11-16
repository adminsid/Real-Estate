import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { JOURNEY_KEY, cleanJourney, createJourney, experienceRoute, startSearch } from '../../scripts/mls-grid/confidence.mjs'
import { relevantGuidance } from '../../scripts/mls-grid/guidance.mjs'
import { renderPage } from '../../scripts/mls-grid/pages.mjs'
import { DEFAULT_BRAND } from '../../scripts/mls-grid/brand.mjs'

describe('Consumer-owned search planning',()=>{
 it('retains only bounded planning fields, never cached listing facts, credentials or documents',()=>{
  const state=cleanJourney({stage:'viewing',token:'secret',entries:{'onekey2:KEY1':{reason:'r'.repeat(500),questions:'q'.repeat(900),ListPrice:123,UnparsedAddress:'Secret address',documents:['private'],checks:{role:true,signed:true},viewing:{date:'2026-12-01',time:'10:00',state:'email-draft',recipient:'secret@example.com'}},'bad/path':{reason:'no'}}})
  expect(state.stage).toBe('viewing');expect(state.entries['onekey2:KEY1'].reason).toHaveLength(400);expect(state.entries['onekey2:KEY1'].questions).toHaveLength(800)
  expect(state.entries['onekey2:KEY1'].checks).toEqual({role:true});expect(Object.keys(state.entries)).toEqual(['onekey2:KEY1'])
  const serialized=JSON.stringify(state);for(const prohibited of ['Secret address','ListPrice','documents','token','recipient','signed'])expect(serialized).not.toContain(prohibited)
 })
 it('never treats a draft or consumer reminder as delivered, signed or confirmed',()=>{
  for(const state of ['sent','delivered','confirmed','signed'])expect(cleanJourney({entries:{'onekey2:K':{viewing:{date:'2026-12-01',time:'10:00',state}}}}).entries['onekey2:K'].viewing).toBeUndefined()
 })
 it('preserves notes across reloads, removes one property and clears planning without changing saved-property preferences',()=>{
  const values=new Map([['prime-america-search-v1','{"saved":["onekey2:KEY1"]}']]),storage={getItem:(key:string)=>values.get(key),setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}
  const first=createJourney(storage);expect(first.update('onekey2:KEY1',{reason:'Layout',checks:{costs:true}})).toBe(true)
  expect(createJourney(storage).get().entries['onekey2:KEY1'].reason).toBe('Layout')
  first.remove('onekey2:KEY1');expect(createJourney(storage).get().entries).toEqual({})
  first.update('onekey2:KEY1',{questions:'Taxes?'});first.clear();expect(values.has(JOURNEY_KEY)).toBe(false);expect(values.get('prime-america-search-v1')).toContain('KEY1')
 })
 it('remains usable in memory when browser storage is blocked and reports the failed persistence',()=>{
  const journey=createJourney({getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}})
  expect(journey.update('onekey2:KEY1',{reason:'Garden'})).toBe(false);expect(journey.get().entries['onekey2:KEY1'].reason).toBe('Garden')
  const snapshot=journey.get();snapshot.entries['onekey2:KEY1'].reason='changed';expect(journey.get().entries['onekey2:KEY1'].reason).toBe('Garden')
 })
 it('merges planning edits from separate tabs instead of overwriting another property’s notes',()=>{
  const values=new Map(),storage={getItem:(key:string)=>values.get(key),setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}
  const first=createJourney(storage),second=createJourney(storage);first.update('onekey2:A',{reason:'Layout'});second.update('onekey2:B',{reason:'Garden'})
  expect(first.get().entries['onekey2:B'].reason).toBe('Garden');expect(second.get().entries['onekey2:A'].reason).toBe('Layout')
  first.clear();expect(second.get().entries).toEqual({})
 })
 it('keeps sharing queries free from planning data and handles exact borough intent',()=>{
  const queens=new URL(startSearch({query:' queens ',type:'Residential Lease'}),'https://homes.example')
  expect(queens.searchParams.get('borough')).toBe('Queens');expect(queens.searchParams.has('q')).toBe(false);expect(queens.searchParams.get('sort')).toBe('newest')
  const address=new URL(startSearch({query:'123 Test Street',type:'unknown',borough:'unknown'}),'https://homes.example')
  expect(address.searchParams.get('q')).toBe('123 Test Street');expect(address.searchParams.get('type')).toBe('Residential');expect(address.searchParams.get('borough')).toBe('NYC')
  expect(experienceRoute('/','')).toBe('start');expect(experienceRoute('/','?borough=Queens')).toBe('results');expect(experienceRoute('/embed','')).toBe('results');expect(experienceRoute('/your-search')).toBe('journey')
 })
 it('scopes residential seller-condition guidance away from rental and commercial transactions',()=>{
  expect(relevantGuidance({PropertyType:'Residential'}).map(item=>item.id)).toContain('condition')
  expect(relevantGuidance({PropertyType:'Residential Lease'}).map(item=>item.id)).toContain('rental-fees')
  for(const type of ['Commercial Sale','Commercial Lease','Land'])expect(relevantGuidance({PropertyType:type}).map(item=>item.id)).not.toContain('condition')
 })
})

describe('Search experience server-rendered pages',()=>{
 const template=readFileSync(new URL('../../scripts/mls-grid/preview.html',import.meta.url),'utf8')
 function page(kind:string){return renderPage(template,{brand:DEFAULT_BRAND,origin:'https://homes.example',page:kind})}
 it('renders a usable search start page without putting results above it',()=>{
  const html=page('start');expect(html).toContain('id="start-page" class="start-page">');expect(html).toContain('<section id="search-page" hidden>');expect(html).toContain('id="start-query"');expect(html).toContain('NYS Housing &amp; Anti-Discrimination Notice')
 })
 it('renders rights and transparency content without JavaScript and uses distinct canonical pages',()=>{
  const guide=page('guide');expect(guide).toContain('https://homes.example/guide');expect(guide).toContain('What is an agency disclosure?');expect(guide).toContain('property-condition-disclosure-statement-eff-7125')
  const trust=page('trust');expect(trust).toContain('https://homes.example/how-it-works');expect(trust).toContain('cannot verify delivery');expect(trust).toContain('does not substitute a paid buyer-agent placement')
 })
 it('keeps browser-owned workspace empty on the server and noindex',()=>{
  const html=page('journey');expect(html).toContain('id="journey-page">');expect(html).toContain('noindex,nofollow');expect(html).toContain('id="journey-properties" class="journey-properties" aria-label="Your saved properties"></div>')
 })
})
