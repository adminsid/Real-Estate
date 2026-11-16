import { areaSQL, coordinatesInNY, indexedCoordinateSQL, NYS_BOUNDS } from './location-model.mjs';
// The same filter contract is used by SQLite, D1 and the browser. Missing is never false.
export const FEATURE_FILTERS = {
  laundry: {label:'In-unit laundry', fields:['LaundryFeatures'], values:['In Unit']},
  elevator: {label:'Elevator', fields:['AssociationAmenities','InteriorFeatures','AccessibilityFeatures'], values:['Elevator','Elevator(s)','Accessible Elevator Installed']},
  outdoor: {label:'Outdoor space', fields:['ExteriorFeatures','AssociationAmenities'], values:['Balcony','Terrace','Patio','Garden','Roof Deck','RoofDeck']},
  cats: {label:'Cats allowed', fields:['PetsAllowed'], values:['Cats OK','CatsOK']},
  dogs: {label:'Dogs allowed', fields:['PetsAllowed'], values:['Dogs OK','DogsOK']},
  entrance: {label:'Accessible entrance reported', fields:['AccessibilityFeatures'], values:['Accessible Entrance','Accessible Approach with Ramp']},
};
export const SUBTYPES = {
  condo:['Condominium'], coop:['Stock Cooperative','Cooperative'], house:['Single Family Residence'],
  multifamily:['Multi Family','Duplex','Triplex','Quadruplex'], office:['Office'], retail:['Retail'],
  industrial:['Industrial','Warehouse'], mixed:['Mixed Use'], apartment:['Apartment'],
};
export const BOROUGH_NAMES = ['Manhattan','Brooklyn','Queens','Bronx','Staten Island'];
export const BOROUGH_COUNTIES = {
  Manhattan:['New York','New York County','New York (Manhattan)','Manhattan'],
  Brooklyn:['Kings','Kings County','Kings (Brooklyn)','Brooklyn'],Queens:['Queens','Queens County'],
  Bronx:['Bronx','Bronx County'], 'Staten Island':['Richmond','Richmond County','Richmond (Staten Island)','Staten Island'],
};
export function featureList(value) {
  const items=String(value || '').split(',').filter(Boolean);
  if(items.length>6 || new Set(items).size!==items.length || items.some(key=>!Object.hasOwn(FEATURE_FILTERS,key)))throw Error('Invalid amenities');
  return items;
}
export function parsePlaces(value) {
  if(!value)return [];
  if(typeof value!=='string'||value.length>600)throw Error('Invalid places');
  let places;try{places=JSON.parse(value);}catch{throw Error('Invalid places');}
  if(!Array.isArray(places)||places.length>8||places.some(place=>typeof place!=='string'||!place.trim()||place.length>70))throw Error('Invalid places');
  return [...new Set(places)];
}
export function featureSQL(key) {
  const feature=FEATURE_FILTERS[key];
  return '('+feature.fields.map(field=>`EXISTS (SELECT 1 FROM json_each(CASE json_type(public_json,'$.${field}') WHEN 'array' THEN json_extract(public_json,'$.${field}') WHEN 'text' THEN json_array(json_extract(public_json,'$.${field}')) ELSE '[]' END) feature WHERE lower(feature.value) IN (${feature.values.map(value=>`'${value.toLowerCase()}'`).join(',')}))`).join(' OR ')+')';
}
export function reportedFeatures(listing) {
  return Object.entries(FEATURE_FILTERS).filter(([,feature])=>feature.fields.some(field=>{
    const supplied=Array.isArray(listing[field])?listing[field]:[listing[field]];
    return supplied.some(value=>typeof value==='string'&&feature.values.some(allowed=>allowed.toLowerCase()===value.toLowerCase()));
  })).map(([key])=>key);
}
export function locationCoordinates(listing) {
  const lat=listing.mapLocation?.latitude??listing.Latitude,lon=listing.mapLocation?.longitude??listing.Longitude;
  return !listing.addressWithheld && coordinatesInNY(lat,lon) ? [lon,lat] : null;
}
export const coordinateSQL = "COALESCE(json_extract(public_json,'$.addressWithheld'),0)=0 AND json_type(public_json,'$.Latitude') IN ('integer','real') AND json_type(public_json,'$.Longitude') IN ('integer','real') AND json_extract(public_json,'$.Latitude') BETWEEN 40.45 AND 45.1 AND json_extract(public_json,'$.Longitude') BETWEEN -79.8 AND -71.8";
export function advancedConditions(params,conditions,values,indexed=false) {
  const numeric=(key,field,operator,max=1e10)=>{
    if(params[key]===undefined||params[key]==='')return;
    const number=Number(params[key]);if(!Number.isFinite(number)||number<0||number>max)throw Error('Invalid '+key);
    conditions.push(`json_type(public_json,'$.${field}') IN ('integer','real') AND json_extract(public_json,'$.${field}')${operator}?`);values.push(number);
  };
  if(params.bedsExact!==undefined&&params.bedsExact!==''){
    const number=Number(params.bedsExact);if(!Number.isInteger(number)||number<0||number>20)throw Error('Invalid exact bedrooms');
    conditions.push('beds=?');values.push(number);
  }
  numeric('baths','BathroomsTotalInteger','>=',100);
  numeric('minArea','LivingArea','>=');
  if(params.minArea)conditions.push("json_extract(public_json,'$.LivingAreaUnits')='Square Feet'");
  numeric('minBuildingArea','BuildingAreaTotal','>=');
  if(params.minBuildingArea)conditions.push("json_extract(public_json,'$.BuildingAreaUnits')='Square Feet'");
  numeric('minLot','LotSizeSquareFeet','>=');numeric('minUnits','NumberOfUnitsTotal','>=',100000);
  numeric('maxTax','TaxAnnualAmount','<=');
  if(params.maxFee!==undefined&&params.maxFee!==''){
    const max=Number(params.maxFee);if(!Number.isFinite(max)||max<0||max>1e7)throw Error('Invalid building fee');
    // Only compare explicit monthly charges. Unknown frequency/additional fees are not a zero.
    conditions.push("json_type(public_json,'$.AssociationFee') IN ('integer','real') AND lower(json_extract(public_json,'$.AssociationFeeFrequency'))='monthly' AND json_extract(public_json,'$.AssociationFee')<=?");values.push(max);
  }
  if(params.subtype){if(!Object.hasOwn(SUBTYPES,params.subtype))throw Error('Invalid subtype');conditions.push(`json_extract(public_json,'$.PropertySubType') IN (${SUBTYPES[params.subtype].map(()=>'?').join(',')})`);values.push(...SUBTYPES[params.subtype]);}
  const places=parsePlaces(params.places);if(places.length){conditions.push(`city IN (${places.map(()=>'?').join(',')})`);values.push(...places);}
  const areas=parsePlaces(params.areas);if(areas.length){conditions.push(`${areaSQL} IN (${areas.map(()=>'?').join(',')})`);values.push(...areas);}
  if(params.availableBy){const date=String(params.availableBy),instant=Date.parse(date+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(instant)||new Date(instant).toISOString().slice(0,10)!==date)throw Error('Invalid availability date');conditions.push("json_type(public_json,'$.AvailabilityDate')='text' AND substr(json_extract(public_json,'$.AvailabilityDate'),1,10)=date(substr(json_extract(public_json,'$.AvailabilityDate'),1,10)) AND substr(json_extract(public_json,'$.AvailabilityDate'),1,10)<=?");values.push(date);}
  if(params.parking==='1')conditions.push("((json_type(public_json,'$.ParkingTotal') IN ('integer','real') AND json_extract(public_json,'$.ParkingTotal')>=1) OR (json_type(public_json,'$.GarageSpaces') IN ('integer','real') AND json_extract(public_json,'$.GarageSpaces')>=1))");
  for(const key of featureList(params.required))conditions.push(featureSQL(key));
  featureList(params.preferred);
  if(params.bounds){
    const bounds=String(params.bounds).split(',').map(Number);
    if(bounds.length!==4||bounds.some(value=>!Number.isFinite(value))||bounds[0]<NYS_BOUNDS[0]||bounds[2]>NYS_BOUNDS[2]||bounds[1]<NYS_BOUNDS[1]||bounds[3]>NYS_BOUNDS[3]||bounds[0]>=bounds[2]||bounds[1]>=bounds[3])throw Error('Invalid map bounds');
    conditions.push(indexed?indexedCoordinateSQL:coordinateSQL,indexed?"longitude BETWEEN ? AND ? AND latitude BETWEEN ? AND ?":"json_extract(public_json,'$.Longitude') BETWEEN ? AND ? AND json_extract(public_json,'$.Latitude') BETWEEN ? AND ?");values.push(bounds[0],bounds[2],bounds[1],bounds[3]);
  }
}
