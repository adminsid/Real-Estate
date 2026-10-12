import { searchQuery } from './search-query.mjs';
import { BOROUGH_COUNTIES, coordinateSQL } from './search-filters.mjs';

export const boroughExpression= "CASE "+Object.entries(BOROUGH_COUNTIES).map(([borough,counties])=>`WHEN json_extract(public_json,'$.CountyOrParish') IN (${counties.map(county=>`'${county}'`).join(',')}) THEN '${borough}'`).join(' ')+' END';
export function discoveryQueries(params={},now=new Date(),production=false) {
  const query=searchQuery(params,now,production),borough=production?'borough':boroughExpression;
  const options={...params};delete options.places;delete options.q;delete options.bounds;
  const places=searchQuery(options,now,production);
  return {
    areas:{sql:`SELECT ${borough} AS borough,COUNT(*) AS total,SUM(CASE WHEN ${coordinateSQL} THEN 1 ELSE 0 END) AS mapped FROM listings WHERE ${query.where} GROUP BY ${borough}`,values:query.values},
    points:{sql:`SELECT source,id,price,json_extract(public_json,'$.Latitude') AS latitude,json_extract(public_json,'$.Longitude') AS longitude FROM listings WHERE ${query.where} AND ${coordinateSQL} ORDER BY ${query.sortExpression},id,source LIMIT 2501`,values:query.values},
    places:{sql:`SELECT city,COUNT(*) AS total FROM listings WHERE ${places.where} AND city IS NOT NULL AND trim(city)!='' GROUP BY city ORDER BY city LIMIT 150`,values:places.values},
  };
}
export function discoveryResult(areas,points,places) {
  const total=areas.reduce((sum,area)=>sum+area.total,0),mapped=areas.reduce((sum,area)=>sum+(area.mapped||0),0);
  return {total,mapped,unmapped:total-mapped,capped:points.length>2500,areas:areas.filter(area=>area.borough),points:points.slice(0,2500),places};
}
