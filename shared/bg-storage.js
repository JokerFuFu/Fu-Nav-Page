/* ============ 背景图本地存储（IndexedDB，仅本机，不随 chrome.storage 同步）============
 * 背景图体积可能到几 MB，不能塞进 chrome.storage.sync 的 config JSON（单项 8KB 限制），
 * 所以单独开一个 IndexedDB 库存 Blob，config 里只存一个 id 引用。
 */
const DB_NAME = 'fn_bg', DB_VER = 1, STORE = 'images';
let _dbP = null;
const _urlCache = new Map(); // id -> objectURL，避免重复创建/泄漏

function openDB(){
  if(_dbP) return _dbP;
  _dbP = new Promise((resolve, reject)=>{
    if(typeof indexedDB === 'undefined'){ reject(new Error('no-indexeddb')); return; }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore(STORE); };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
  return _dbP;
}

export async function putBgImage(blob){
  const db = await openDB();
  const id = 'bg_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  await new Promise((res,rej)=>{
    const tx = db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = res; tx.onerror = ()=>rej(tx.error);
  });
  return id;
}

export async function getBgImage(id){
  if(!id) return null;
  try{
    const db = await openDB();
    return await new Promise((res,rej)=>{
      const tx = db.transaction(STORE,'readonly');
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = ()=>res(r.result || null);
      r.onerror = ()=>rej(r.error);
    });
  }catch{ return null; }
}

export async function deleteBgImage(id){
  if(!id) return;
  try{
    const db = await openDB();
    await new Promise((res,rej)=>{
      const tx = db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = res; tx.onerror = ()=>rej(tx.error);
    });
  }catch{}
  if(_urlCache.has(id)){ URL.revokeObjectURL(_urlCache.get(id)); _urlCache.delete(id); }
}

export async function bgObjectURL(id){
  if(!id) return null;
  if(_urlCache.has(id)) return _urlCache.get(id);
  const blob = await getBgImage(id);
  if(!blob) return null;
  const u = URL.createObjectURL(blob);
  _urlCache.set(id, u);
  return u;
}
