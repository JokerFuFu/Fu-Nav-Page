export const HALF_LIFE_MS=7*864e5;
const GRID_KEYS=new Set(['6x2','8x2','6x3','8x3']);

export function readFavGrid(settings){
  const raw=(settings&&settings.favGrid)||{}, key=`${raw.cols}x${raw.rows}`;
  return GRID_KEYS.has(key)?{cols:Number(raw.cols),rows:Number(raw.rows)}:{cols:8,rows:2};
}

export function frecencyScore(item,now=Date.now()){
  if(!item || !(item.freq>0)) return 0;
  return item.freq*Math.pow(0.5,(now-(item.lastVisit||now))/HALF_LIFE_MS);
}

export function visitItem(item,now=Date.now()){
  if(!item) return;
  item.freq=frecencyScore(item,now)+1;
  item.lastVisit=now;
  item.clicks=(item.clicks||0)+1;
}

export function rankFavorites(all,favOrder,fallback,cap,now=Date.now()){
  const list=all||[], byId=new Map(list.map(x=>[x.item.id,x])), out=[], seen=new Set();
  const add=(entry,pinned)=>{ if(!entry || out.length>=cap || seen.has(entry.item.id) || entry.item.fav===false)return; out.push({...entry,pinned}); seen.add(entry.item.id); };
  (favOrder||[]).forEach(id=>{ const entry=byId.get(id); if(entry&&entry.item.fav===true)add(entry,true); });
  list.filter(x=>x.item.fav===true).forEach(x=>add(x,true));
  list.filter(x=>x.item.fav!==true&&x.item.fav!==false&&frecencyScore(x.item,now)>0)
    .sort((a,b)=>frecencyScore(b.item,now)-frecencyScore(a.item,now)||(b.item.lastVisit||0)-(a.item.lastVisit||0))
    .forEach(x=>add(x,false));
  (fallback||[]).forEach(x=>add(x,false));
  return out.slice(0,cap);
}
