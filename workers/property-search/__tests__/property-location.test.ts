import {describe,it,expect} from 'vitest'
import {distanceMeters,nearbyFeatures} from '../../../scripts/mls-grid/property-location.mjs'
import {cleanResultContext} from '../../../scripts/mls-grid/listing-navigation.mjs'
const point=(name:string,category:string,coordinates=[-73.9,40.7])=>({properties:{name,class:category},geometry:{type:'Point',coordinates}})
describe('Property location context',()=>{
 it('measures straight-line distance and only groups nearby named points',()=>{expect(distanceMeters([-73.9,40.7],[-73.9,40.71])).toBeCloseTo(1111.95,0);const groups=nearbyFeatures([point('Station','Railway'),point('Station','railway',[-73.9,40.705]),point('Local shop','shop'),point('Distant shop','shop',[-74,41]),point('Invalid','shop',[800,40.7]),point('','shop'),point('Unknown','housing')],[-73.9,40.7]);expect(groups.transit).toHaveLength(1);expect(groups.transit[0].meters).toBe(0);expect(groups.amenities.map(x=>x.name)).toEqual(['Local shop']);expect(nearbyFeatures([],[-73.9,40.7])).toEqual({transit:[],amenities:[]});})
 it('bounds the list and validates private result navigation context',()=>{expect(nearbyFeatures(Array.from({length:50},(_,i)=>point('Place '+i,'shop')),[-73.9,40.7]).amenities).toHaveLength(6);const context={query:'?borough=Queens',keys:['onekey2:TEST1'],limit:24,offset:0,total:100};expect(cleanResultContext(context)).toEqual(context);for(const patch of [{query:'https://bad.invalid'},{keys:['../bad']},{offset:-1},{limit:100},{keys:Array(97).fill('onekey2:TEST1')}])expect(cleanResultContext({...context,...patch})).toBeNull();})
})
