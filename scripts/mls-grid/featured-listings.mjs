import { searchQuery } from './search-query.mjs';
// A bounded first-photo query: reuse every consumer filter, without result counts or galleries.
export function featuredQuery(params={},now=new Date(),indexed=false){
 const {where,values,sortExpression}=searchQuery({borough:'NYC',type:'Residential',...params,status:'Active',photosOnly:'1',sort:'priceDesc',limit:'12',offset:'0'},now,indexed);
 const ready=indexed?" AND EXISTS(SELECT 1 FROM listing_media m JOIN listing_components c ON c.source=m.source AND c.listing_id=m.listing_id WHERE m.source=listings.source AND m.listing_id=listings.id AND m.state='ready' AND c.manifest_version=c.core_version)":'';
 return {sql:`SELECT * FROM listings WHERE ${where}${ready} ORDER BY ${sortExpression},id,source LIMIT 12`,values};
}
export function featuredResult(listings){
 const fields=['source','id','ListingId','ListPrice','StandardStatus','PropertyType','LeaseAmountFrequency','addressWithheld','UnparsedAddress','StreetNumber','StreetDirPrefix','StreetName','StreetSuffix','StreetDirSuffix','UnitNumber','PostalCity','City','CountyOrParish','StateOrProvince','ListOfficeName','ListAgentFullName','AttributionContact','ListOfficePhone'];
 return {listings:listings.filter(listing=>listing.media?.length).slice(0,6).map(listing=>({...Object.fromEntries(fields.filter(key=>listing[key]!==undefined).map(key=>[key,listing[key]])),media:listing.media.slice(0,1).map(({url})=>({url}))}))};
}
