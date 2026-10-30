import { BOROUGH_NAMES } from './search-filters.mjs';
import { NYC_BOUNDS,NYS_BOUNDS } from './location-model.mjs';
const button=(text,callback)=>{const node=document.createElement('button');node.type='button';node.className='secondary';node.textContent=text;node.addEventListener('click',callback);return node;};
let libraryPromise;
function loadLibrary(){
 if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{
  const css=document.createElement('link');css.rel='stylesheet';css.href='/vendor/maplibre-4.7.1.css';document.head.append(css);
  const script=document.createElement('script');script.src='/vendor/maplibre-4.7.1.js';script.onload=()=>{window.maplibregl.setWorkerUrl('/vendor/maplibre-worker-4.7.1.js');resolve(window.maplibregl);};script.onerror=()=>{libraryPromise=null;script.remove();reject(Error('Map library unavailable'));};document.head.append(script);
 });return libraryPromise;
}
export function createSearchMap({selectBorough,selectListing,searchBounds,clearBounds}){
 const container=document.querySelector('#search-map'),status=document.querySelector('#map-status'),areaButtons=document.querySelector('#map-areas'),searchButton=document.querySelector('#map-search-area');
 let map,data,selected='NYC',loading,highlighted,generation=0;
 const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 const scopeBounds=()=>selected==='NYS'?NYS_BOUNDS:NYC_BOUNDS;
 function reset(){const b=scopeBounds();map?.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:24,duration:0});}
 const controls=document.querySelector('#map-controls');
 controls.append(button('+',()=>map?.zoomIn({duration:reduced()?0:150})),button('−',()=>map?.zoomOut({duration:reduced()?0:150})),...[[ '←',-100,0],['↑',0,-100],['↓',0,100],['→',100,0]].map(([text,x,y])=>button(text,()=>map?.panBy([x,y],{duration:reduced()?0:100}))),button('Reset area',()=>{clearBounds();reset();}),button('Search NYS',()=>selectBorough('NYS')));
 ['Zoom in','Zoom out','Move map west','Move map north','Move map south','Move map east','Reset map area','Search New York State'].forEach((label,index)=>controls.children[index].setAttribute('aria-label',label));
 searchButton.addEventListener('click',()=>{if(!map)return;const b=map.getBounds(),ny=NYS_BOUNDS;const bounds=[Math.max(ny[0],b.getWest()),Math.max(ny[1],b.getSouth()),Math.min(ny[2],b.getEast()),Math.min(ny[3],b.getNorth())];if(bounds[0]>=bounds[2]||bounds[1]>=bounds[3]){status.textContent='Move the map into New York State to search this area.';return;}searchBounds(bounds.map(n=>n.toFixed(5)).join(','));});
 async function load(){
  if(map){map.resize();return;}if(loading)return loading;
  loading=(async()=>{const L=await loadLibrary();map=new L.Map({container,style:'https://tiles.openfreemap.org/styles/liberty',center:[-73.94,40.74],zoom:10,attributionControl:true,cooperativeGestures:true,maxBounds:[[NYS_BOUNDS[0],NYS_BOUNDS[1]],[NYS_BOUNDS[2],NYS_BOUNDS[3]]],fadeDuration:reduced()?0:150});
   await new Promise((resolve,reject)=>{map.once('load',resolve);map.once('error',event=>{if(!map.isStyleLoaded())reject(event.error);});});
   map.addSource('properties',{type:'geojson',data:{type:'FeatureCollection',features:[]},cluster:true,clusterRadius:55,clusterMaxZoom:17,generateId:false});
   map.addLayer({id:'clusters',type:'circle',source:'properties',filter:['has','point_count'],paint:{'circle-color':'#315f4c','circle-radius':['step',['get','point_count'],19,25,24,100,30],'circle-stroke-color':'#fff','circle-stroke-width':2}});
   map.addLayer({id:'cluster-count',type:'symbol',source:'properties',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-font':['Noto Sans Regular'],'text-size':13},paint:{'text-color':'#fff'}});
   map.addLayer({id:'properties',type:'circle',source:'properties',filter:['!',['has','point_count']],paint:{'circle-color':['case',['boolean',['feature-state','selected'],false],'#8b6935','#315f4c'],'circle-radius':8,'circle-stroke-color':'#fff','circle-stroke-width':2}});
   map.on('click','properties',event=>{const feature=event.features[0],point=data?.points.find(point=>`${point.source}:${point.id}`===feature.properties.key);if(point)selectListing(point);});
   map.on('click','clusters',async event=>{const version=generation,feature=event.features[0],source=map.getSource('properties'),id=feature.properties.cluster_id;try{const zoom=await source.getClusterExpansionZoom(id);if(version!==generation)return;if(zoom<=18&&map.getZoom()<18)map.easeTo({center:feature.geometry.coordinates,zoom,duration:reduced()?0:200});else{const leaves=await source.getClusterLeaves(id,50,0),panel=document.querySelector('#map-selected');if(version!==generation)return;const title=document.createElement('p');title.textContent='Choose a property at this location';panel.replaceChildren(title,...leaves.map(leaf=>button(`${leaf.properties.price? '$'+Number(leaf.properties.price).toLocaleString():'Price not reported'} · ${leaf.properties.area||leaf.properties.id}`,()=>{const point=data.points.find(point=>point.id===leaf.properties.id&&point.source===leaf.properties.source);if(point)selectListing(point);})));}}catch{status.textContent='Refresh your search to update these locations.';}});
   for(const layer of ['properties','clusters']){map.on('mouseenter',layer,()=>{map.getCanvas().style.cursor='pointer';});map.on('mouseleave',layer,()=>{map.getCanvas().style.cursor='';});}
   new ResizeObserver(()=>{if(container.getBoundingClientRect().width)map.resize();}).observe(container);reset();render();
  })().catch(error=>{map?.remove();map=null;loading=null;status.textContent='Street map unavailable. Listings and area filters still work.';throw error;});return loading;
 }
 function render(){if(!data)return;
  document.querySelector('#map-pane .map-heading strong').textContent=selected==='NYS'?'Explore New York State':'Explore NYC';
  const counts=new Map(data.areas.map(area=>[area.borough,area.total]));areaButtons.replaceChildren(...BOROUGH_NAMES.map(borough=>{const node=button(`${borough==='Bronx'?'The Bronx':borough} · ${(counts.get(borough)||0).toLocaleString()}`,()=>selectBorough(borough));node.setAttribute('aria-pressed',String(selected===borough));return node;}));
  if(map?.getSource('properties'))map.getSource('properties').setData({type:'FeatureCollection',features:data.points.map(point=>({type:'Feature',id:`${point.source}:${point.id}`,properties:{key:`${point.source}:${point.id}`,id:point.id,source:point.source,price:point.price,area:point.area},geometry:{type:'Point',coordinates:[point.longitude,point.latitude]}}))});
  searchButton.disabled=!data.mapped;
  status.textContent=data.mapped?`${data.mapped.toLocaleString()} matching properties have map locations; ${data.unmapped.toLocaleString()} have no verified map location.${data.capped?' Showing up to 2,500 map properties. Narrow your search for more.':''} Address-derived locations are approximate; confirm before visiting.`:'Street and neighborhood labels are available. Property locations are being prepared from public addresses; unverified locations stay out of the map.';
 }
 return {load,update(next,borough){generation++;const oldScope=selected==='NYS';data=next;selected=borough;if(map&&oldScope!==(borough==='NYS'))reset();render();},highlight(id){if(!map?.getSource('properties'))return;if(highlighted)map.setFeatureState({source:'properties',id:highlighted},{selected:false});highlighted=id;map.setFeatureState({source:'properties',id},{selected:true});}};
}
