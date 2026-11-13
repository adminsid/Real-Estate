// OneKey IDX mappings verified in MLS GRID on 2026-10-13.
export const NYC_BOUNDS=[-74.3,40.45,-73.65,40.95];
export const NYS_BOUNDS=[-79.8,40.45,-71.8,45.1];
export const areaSQL="COALESCE(NULLIF(TRIM(json_extract(public_json,'$.KEY_ManNYNeighborhood')),''),NULLIF(TRIM(json_extract(public_json,'$.PostalCity')),''),city)";
export const reportedArea=listing=>[listing.KEY_ManNYNeighborhood,listing.PostalCity,listing.City].find(value=>typeof value==='string'&&value.trim())?.trim()||'';
export function coordinatesInNY(latitude,longitude){return typeof latitude==='number'&&typeof longitude==='number'&&Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=NYS_BOUNDS[1]&&latitude<=NYS_BOUNDS[3]&&longitude>=NYS_BOUNDS[0]&&longitude<=NYS_BOUNDS[2];}
export function locationAddress(listing){
 if(listing.addressWithheld||listing.StateOrProvince!=='NY'||typeof listing.PostalCode!=='string'||!/^\d{5}(?:-\d{4})?$/.test(listing.PostalCode))return null;
 const number=listing.StreetNumber||listing.StreetNumberNumeric;
 if(!number||typeof listing.StreetName!=='string'||!listing.StreetName.trim())return null;
 const street=[number,listing.StreetDirPrefix,listing.StreetName,listing.StreetSuffix,listing.StreetDirSuffix].filter(value=>value!==undefined&&value!==null&&value!=='').join(' ').trim();
 const city=listing.PostalCity||listing.City;if(typeof city!=='string'||!city.trim())return null;
 const zip=listing.PostalCode.slice(0,5),key=JSON.stringify([street.toUpperCase(),city.trim().toUpperCase(),zip]);
 return {street,city:city.trim(),zip,key};
}
export const indexedCoordinateSQL="COALESCE(json_extract(public_json,'$.addressWithheld'),0)=0 AND typeof(latitude) IN ('integer','real') AND typeof(longitude) IN ('integer','real') AND latitude BETWEEN 40.45 AND 45.1 AND longitude BETWEEN -79.8 AND -71.8";
