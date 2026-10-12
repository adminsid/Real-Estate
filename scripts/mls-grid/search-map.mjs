import { BOROUGH_NAMES } from './search-filters.mjs';
const ns='http://www.w3.org/2000/svg';
const centers={Manhattan:[-73.976,40.782],Brooklyn:[-73.964,40.649],Queens:[-73.826,40.72],Bronx:[-73.87,40.859],'Staten Island':[-74.145,40.587]};
const extent=[-74.29,40.45,-73.65,40.95];
const project=([lon,lat])=>[(lon-extent[0])/0.64*800,(extent[3]-lat)/0.5*800];
function svgNode(name,attributes={}){const node=document.createElementNS(ns,name);for(const[key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node;}
function button(text,callback){const node=document.createElement('button');node.type='button';node.className='secondary';node.textContent=text;node.addEventListener('click',callback);return node;}
export function createSearchMap({selectBorough,selectListing,searchBounds,clearBounds}) {
  const container=document.querySelector('#search-map'),status=document.querySelector('#map-status'),areaButtons=document.querySelector('#map-areas');
  const svg=svgNode('svg',{viewBox:'0 0 800 800',role:'img','aria-label':'New York City borough map. Use the borough buttons to choose an area.'});
  const shapes=svgNode('g',{class:'borough-shapes'}),labels=svgNode('g',{class:'borough-labels'}),points=svgNode('g',{class:'property-points'});
  svg.append(shapes,labels,points);container.prepend(svg);
  let geometry,zoom=1,center=[400,400],data,selected='NYC';
  const searchButton=document.querySelector('#map-search-area');
  function view(){const size=800/zoom;svg.setAttribute('viewBox',`${center[0]-size/2} ${center[1]-size/2} ${size} ${size}`);searchButton.disabled=!data?.mapped;}
  function pan(dx,dy){center=[Math.max(0,Math.min(800,center[0]+dx/zoom)),Math.max(0,Math.min(800,center[1]+dy/zoom))];view();}
  document.querySelector('#map-controls').append(button('+',()=>{zoom=Math.min(8,zoom*1.5);render();}),button('−',()=>{zoom=Math.max(1,zoom/1.5);render();}),button('←',()=>pan(-100,0)),button('↑',()=>pan(0,-100)),button('↓',()=>pan(0,100)),button('→',()=>pan(100,0)),button('All NYC',()=>{zoom=1;center=[400,400];clearBounds();render();}));
  ['Zoom in','Zoom out','Move map west','Move map north','Move map south','Move map east','Reset map to NYC'].forEach((label,index)=>document.querySelector('#map-controls').children[index].setAttribute('aria-label',label));
  searchButton.addEventListener('click',()=>{
    const size=800/zoom,left=center[0]-size/2,top=center[1]-size/2;
    searchBounds([Math.max(extent[0],extent[0]+left/800*0.64),Math.max(extent[1],extent[3]-(top+size)/800*0.5),Math.min(extent[2],extent[0]+(left+size)/800*0.64),Math.min(extent[3],extent[3]-top/800*0.5)].map(value=>value.toFixed(5)).join(','));
  });
  async function load(){if(geometry)return;const response=await fetch('/nyc-boroughs.json');if(!response.ok)throw Error('Map unavailable');geometry=await response.json();for(const feature of geometry.features){const path=svgNode('path',{d:feature.polygons.map(p=>p.map(r=>r.map((coordinate,index)=>`${index?'L':'M'}${project(coordinate).join(',')}`).join(' ')+'Z').join(' ')).join(' '),class:'borough-shape','data-borough':feature.name});path.addEventListener('click',()=>selectBorough(feature.name));shapes.append(path);}render();}
  function render(){if(!data)return;
    labels.replaceChildren();points.replaceChildren();areaButtons.replaceChildren();
    const counts=new Map(data.areas.map(area=>[area.borough,area.total]));
    for(const borough of BOROUGH_NAMES){const count=counts.get(borough)||0,node=button(`${borough==='Bronx'?'The Bronx':borough} · ${count.toLocaleString()}`,()=>selectBorough(borough));node.setAttribute('aria-pressed',String(selected===borough));areaButtons.append(node);const [x,y]=project(centers[borough]);const label=svgNode('text',{x,y,class:'borough-name'});label.textContent=borough;const total=svgNode('text',{x,y:y+23,class:'borough-count'});total.textContent=`${count.toLocaleString()} matches`;labels.append(label,total);}
    for(const path of shapes.children)path.classList.toggle('selected',path.dataset.borough===selected);
    // Cluster the entire permitted coordinate set, independently of result pagination.
    const cells=new Map();for(const point of data.points){const [x,y]=project([point.longitude,point.latitude]),key=`${Math.floor(x/(32/zoom))}:${Math.floor(y/(32/zoom))}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(point);}
    for(const group of cells.values()){const [x,y]=project([group[0].longitude,group[0].latitude]),mark=svgNode('g',{class:'map-marker'}),dot=svgNode('circle',{cx:x,cy:y,r:group.length===1?7:15}),text=svgNode('text',{x,y:y+4});mark.dataset.keys=group.map(point=>`${point.source}:${point.id}`).join(',');if(group.length>1)text.textContent=group.length;mark.append(dot,text);mark.addEventListener('click',()=>{if(group.length===1)selectListing(group[0]);else{center=[x,y];zoom=Math.min(8,zoom*2);render();}});points.append(mark);}
    status.textContent=data.mapped?`${data.mapped.toLocaleString()} matches have published map locations. ${data.unmapped.toLocaleString()} remain in the list without a map location.${data.capped?' Map limited to 2,500 properties; narrow your search.':''}`:'Explore by borough. Exact property locations were not supplied in this import; all matches remain in the list.';
    view();
  }
  return {load,update(next,borough){data=next;selected=borough;render();},highlight(id){for(const mark of points.children)mark.classList.toggle('selected',mark.dataset.keys.split(',').includes(id));}};
}
