export const WALLPAPER_REFRESH_ALARM='fu-nav-wallpaper-refresh';
export const WALLPAPER_REFRESH_STATE='fn_wallpaper_refresh_v1';

export function wallpaperRefreshIntervalMs(background){
  const minutes=Number(background&&background.refreshEvery);
  return Number.isFinite(minutes)&&minutes>0 ? minutes*60000 : 0;
}

export function wallpaperRefreshPlan(background,now=Date.now(),runtimeState=null){
  const interval=wallpaperRefreshIntervalMs(background);
  if(!background||!background.enabled||background.mode!=='online'||interval<=0){
    return {enabled:false,due:false,dueAt:null,delay:null};
  }
  const stateMatches=runtimeState&&runtimeState.sourceKey===wallpaperSourceKey(background.onlineSrc);
  const lastFetch=Math.max(Number(background.lastFetchAt)||0,stateMatches?(Number(runtimeState.lastFetchAt)||0):0);
  const lastAttempt=stateMatches?(Number(runtimeState.lastAttemptAt)||0):0;
  const dueAt=Math.max(lastFetch,lastAttempt)+interval;
  return {
    enabled:true,
    due:now>=dueAt,
    dueAt,
    delay:Math.max(0,dueAt-now),
  };
}

export function wallpaperSourceKey(source){
  const id=typeof source==='string'?source:(source&&source.id)||'';
  return id==='custom' ? `custom:${String(source&&source.url||'').trim()}` : id;
}

export function wallpaperRefreshSnapshot(background){
  return {
    sourceKey:wallpaperSourceKey(background&&background.onlineSrc),
    onlineImageId:String(background&&background.onlineImageId||''),
  };
}

export function canCommitWallpaperRefresh(background,snapshot){
  return wallpaperRefreshPlan(background).enabled
    && wallpaperSourceKey(background.onlineSrc)===snapshot.sourceKey
    && String(background.onlineImageId||'')===snapshot.onlineImageId;
}

function extensionStorage(){ return typeof chrome!=='undefined'&&chrome.storage&&chrome.storage.local; }

export async function loadWallpaperRefreshState(){
  if(extensionStorage())return await new Promise((resolve,reject)=>chrome.storage.local.get([WALLPAPER_REFRESH_STATE],value=>{
    const error=chrome.runtime?.lastError;
    if(error)reject(new Error(error.message)); else resolve(value[WALLPAPER_REFRESH_STATE]||null);
  }));
  try{return JSON.parse(localStorage.getItem(WALLPAPER_REFRESH_STATE)||'null');}catch{return null;}
}

export async function saveWallpaperRefreshState(state){
  if(extensionStorage())return await new Promise((resolve,reject)=>chrome.storage.local.set({[WALLPAPER_REFRESH_STATE]:state},()=>{
    const error=chrome.runtime?.lastError;
    if(error)reject(new Error(error.message)); else resolve(state);
  }));
  localStorage.setItem(WALLPAPER_REFRESH_STATE,JSON.stringify(state));
  return state;
}

export async function clearWallpaperRefreshState(){
  const previous=await loadWallpaperRefreshState();
  if(extensionStorage())await new Promise((resolve,reject)=>chrome.storage.local.remove(WALLPAPER_REFRESH_STATE,()=>{
    const error=chrome.runtime?.lastError;
    if(error)reject(new Error(error.message)); else resolve();
  }));
  else localStorage.removeItem(WALLPAPER_REFRESH_STATE);
  return previous;
}
