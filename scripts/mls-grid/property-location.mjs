import { loadLibrary } from './search-map.mjs';
import { locationCoordinates } from './search-filters.mjs';
export function distanceMeters(a,b){const rad=n=>n*Math.PI/180,dlat=rad(b[1]-a[1]),dlon=rad(b[0]-a[0]),h=Math.sin(dlat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function nearbyFeatures(features,origin){const groups={transit:[],amenities:[]},seen=new Map();
 for(const feature of features.slice(0,2500)){
  const p=feature.properties||{},coords=feature.geometry?.coordinates;if(feature.geometry?.type!=='Point'||!Array.isArray(coords)||coords.length<2||!coords.slice(0,2).every(Number.isFinite)||Math.abs(coords[0])>180||Math.abs(coords[1])>90)continue;
  const name=p['name:en']||p.name;if(typeof name!=='string'||!name.trim())continue;
  const category=String(p.class||'')+' '+String(p.subclass||'');const normalized=category.toLowerCase(),transit=/\b(?:station|railway|subway|tram_stop|bus_stop|bus_station|public_transport|railway_station)\b/.test(normalized),amenity=/\b(?:shop|supermarket|grocery|bakery|restaurant|cafe|park|library|pharmacy|hospital|clinic|sports|museum)\b/.test(normalized);if(!transit&&!amenity)continue;
  const meters=distanceMeters(origin,coords);if(!Number.isFinite(meters)||meters>1800)continue;
  const key=(transit?'transit:':'amenity:')+name.toLowerCase(),item={name:name.slice(0,160),meters,category:transit?'Transit':String(p.subclass||p.class||'Amenity').replaceAll('_',' ')};
  if(!seen.has(key)||seen.get(key).meters>meters)seen.set(key,item);
 }
 for(const [key,item]of seen)groups[key.startsWith('transit:')?'transit':'amenities'].push(item);
 for(const group of Object.values(groups))group.sort((a,b)=>a.meters-b.meters).splice(6);
 return groups;
}
export function mountPropertyMap(container,listing){let map,disposed=false,timer;const coords=locationCoordinates(listing),status=container.parentElement.querySelector('[data-map-status]'),transit=container.parentElement.querySelector('[data-nearby-transit]'),amenities=container.parentElement.querySelector('[data-nearby-amenities]');
 const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
 function fill(target,items){target.replaceChildren(...(items.length?items.map(item=>{const li=text('li',item.name),distance=item.meters<1000?`${Math.round(item.meters/10)*10} m`:`${(item.meters/1000).toFixed(1)} km`;li.append(text('span',`${item.category} · about ${distance} in a straight line`));return li;}):[text('li','No named locations available in the loaded map data. This is not a complete local directory.')]));}
 function refresh(){if(disposed||!map?.isStyleLoaded())return;const data=nearbyFeatures(map.queryRenderedFeatures(),coords);fill(transit,data.transit);fill(amenities,data.amenities);status.textContent='Location shown. Nearby places come from features currently loaded around this property; zoom in for more map detail.';}
 if(!coords){status.textContent='A verified map position is not available. Confirm the address and location with our team.';return ()=>{};}
 status.textContent='Loading the property location…';
 void loadLibrary().then(L=>{if(disposed)return;map=new L.Map({container,style:'https://tiles.openfreemap.org/styles/liberty',center:coords,zoom:15,cooperativeGestures:true,attributionControl:true});map.addControl(new L.NavigationControl({showCompass:false}),'top-right');map.on('load',()=>{if(disposed)return;const marker=document.createElement('div');marker.className='active-property-pin';marker.textContent='This property';new L.Marker({element:marker}).setLngLat(coords).addTo(map);refresh();});map.on('idle',()=>{clearTimeout(timer);timer=setTimeout(refresh,150);});map.on('error',()=>{if(!map.isStyleLoaded())status.textContent='The map could not load. Use the directions link or ask our team to confirm the location.';});}).catch(()=>{status.textContent='The map could not load. Directions and the reported location remain available.';});
 return ()=>{disposed=true;clearTimeout(timer);map?.remove();};
}
