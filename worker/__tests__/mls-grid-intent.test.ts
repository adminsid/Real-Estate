import { describe,expect,it } from 'vitest'
import { interpretSearch,searchURL,cleanRecent,rememberSearch } from '../../scripts/mls-grid/search-intent.mjs'
import { suggestionQuery,publicSuggestions } from '../../scripts/mls-grid/suggestions.mjs'
describe('Explicit search interpretation',()=>{
 it('extracts bedrooms, location and budget without leaving the sentence as a keyword query',()=>{
  const result=interpretSearch('2 bedrooms in Queens under $800,000')
  expect(result.params).toEqual({type:'Residential',borough:'Queens',status:'Active',beds:'2',maxPrice:'800000'});expect(result.chips.map(chip=>chip.label)).toContain('Up to $800,000')
 })
 it('resolves a source-reported area separately from the generic city field',()=>{
  const result=interpretSearch('2 bedrooms in Maspeth under 800k',{areas:[{value:'Maspeth',borough:'Queens'}]})
  expect(result.params.areas).toBe('["Maspeth"]');expect(result.params.borough).toBe('Queens');expect(result.params.q).toBeUndefined()
 })
 it('handles studios, exact bedrooms, baths and explicit transaction type',()=>{
  expect(interpretSearch('rent studio in Brooklyn under 3k').params).toMatchObject({type:'Residential Lease',bedsExact:'0',borough:'Brooklyn',maxPrice:'3000'})
  expect(interpretSearch('exactly 2 bedrooms and 2 baths in Queens').params).toMatchObject({bedsExact:'2',baths:'2'})
  expect(interpretSearch('commercial lease in Queens under 5k').params.type).toBe('Commercial Lease');expect(interpretSearch('land in Queens under 500k').params.type).toBe('Land')
 })
 it('does not consume a town initial as a multiplier or mistake street names for borough filters',()=>{
  expect(interpretSearch('under 800 Maspeth').params).toMatchObject({maxPrice:'800',q:'Maspeth'})
  expect(interpretSearch('123 Queens Boulevard').params).toMatchObject({borough:'NYC',q:'123 Queens Boulevard'});expect(interpretSearch('Queens Village').params.q).toBe('Queens Village');expect(interpretSearch('Manhattan Beach').params.borough).toBe('NYC')
  expect(interpretSearch('under 1.2 million in Queens').params.maxPrice).toBe('1200000')
  expect(interpretSearch('MLS #KEY123').params.q).toBe('KEY123')
 })
 it('keeps unknown requirements as keywords and flags a reversed budget instead of widening it',()=>{
  expect(interpretSearch('2 beds in Queens rooftop observatory').params.q).toContain('rooftop observatory')
  const result=interpretSearch('between 800k and 400k in Queens');expect(result.warnings).toHaveLength(1);expect(result.params.maxPrice).toBe('400000')
 })
 it('blocks unsupported or contradictory limits rather than dropping a constraint silently',()=>{
  for(const query of ['under 100000000001 in Queens','under 500k under 800k','not 2 bedrooms in Queens','no more than 2 bedrooms in Queens'])expect(interpretSearch(query).warnings.length).toBeGreaterThan(0)
  expect(interpretSearch('at least 2 bedrooms in Queens').params).toMatchObject({beds:'2',borough:'Queens'})
 })
 it('keeps recent-search links on this service and excludes private data or executable URLs',()=>{
  expect(cleanRecent([{label:'bad',href:'javascript:alert(1)'},{label:'bad',href:'/?notes=private'},{label:'good',href:searchURL({borough:'Queens',maxPrice:'800000'})}])).toHaveLength(1)
  const storage={getItem:()=>null,setItem(){throw Error()}};expect(rememberSearch(storage,{label:'Queens',href:'/?borough=Queens'})).toBe(false)
 })
 it('preserves an explicit all-property selection rather than resetting it to homes for sale',()=>{
  const parsed=interpretSearch('Maspeth',{type:''});expect(parsed.params.type).toBe('');expect(new URL(searchURL(parsed.params),'https://homes.example').searchParams.get('type')).toBe('')
 })
 it('deduplicates recent searches with the same filters in a different parameter order',()=>{
  let stored='[]';const storage={getItem:()=>stored,setItem:(_key:string,value:string)=>{stored=value}}
  rememberSearch(storage,{label:'First',href:'/?borough=Queens&type=Residential'});rememberSearch(storage,{label:'Latest',href:'/?type=Residential&borough=Queens'})
  expect(JSON.parse(stored)).toHaveLength(1);expect(JSON.parse(stored)[0].label).toBe('Latest')
 })
})
describe('Bounded local suggestions',()=>{
 const record=(extra={})=>({public_json:JSON.stringify({PostalCity:'Maspeth',City:'New York',CountyOrParish:'Queens',PostalCode:'11378',UnparsedAddress:'12 Queens Boulevard',ListingId:'KEY123',OwnerName:'Hidden owner',ShowingInstructions:'Hidden code',...extra})})
 it('uses the existing FTS index with bound terms and limits candidate work',()=>{
  const query=suggestionQuery({q:'Maspeth" OR *'},true);expect(query.sql).toContain('listing_search MATCH ?');expect(query.sql).toContain('LIMIT 80');expect(query.sql).not.toContain('Maspeth')
  expect(suggestionQuery({q:'a'},true)).toBeNull()
 })
 it('labels areas, addresses, ZIPs and MLS IDs without exposing withheld addresses or private fields',()=>{
  const area=publicSuggestions([record()],'mas');expect(area).toEqual([{kind:'area',value:'Maspeth',label:'Maspeth',borough:'Queens'}])
  expect(publicSuggestions([record({addressWithheld:true})],'Queens')).toEqual([])
  expect(publicSuggestions([record()],'113')).toEqual([{kind:'zip',value:'11378',label:'11378'}])
  expect(publicSuggestions([record()],'KEY')).toEqual([{kind:'mls',value:'KEY123',label:'MLS #KEY123'}])
  expect(JSON.stringify(publicSuggestions([record()],'Queens'))).not.toMatch(/Hidden owner|Hidden code/)
 })
})
