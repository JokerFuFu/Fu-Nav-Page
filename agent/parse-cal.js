#!/usr/bin/env node
/* 把 icalBuddy 的 "时间|@|标题|@|地点" 行解析为 JSON 数组 */
let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
  const out=[];
  for(const line of s.split(/\r?\n/)){
    if(!line.trim()) continue;
    const parts=line.split('|@|').map(x=>x.trim());
    // 形如 "2026-06-29 at 14:00 - 15:00 | 标题 | 地点"
    out.push({ when: parts[0]||'', title: parts[1]||parts[0]||'', location: parts[2]||'' });
  }
  process.stdout.write(JSON.stringify(out.slice(0,30)));
});
