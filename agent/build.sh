#!/bin/zsh
# ============ Fu 导航 · 取数构建（提醒事项 / 日历 / AI 日报）============
# 产出 ~/.fu-nav/data.json，供 server.js 提供给扩展。原子写入避免读到半截。
# 首次运行需在「系统设置 → 隐私与安全性」授权 提醒事项 / 日历 / 自动化。
set -e
DIR="$HOME/.fu-nav"; mkdir -p "$DIR/log"
TMP="$DIR/data.tmp.json"; OUT="$DIR/data.json"

# ---- 1) 提醒事项（JXA，零依赖；未授权则空数组）----
REM=$(osascript -l JavaScript -e '
try{
  const R=Application("Reminders"); const out=[];
  for(const l of R.lists()){ const rs=l.reminders.whose({completed:false})();
    for(const r of rs) out.push({list:l.name(), name:r.name(), due:r.dueDate()?r.dueDate().toISOString():null, priority:r.priority()});
  }
  out.sort((a,b)=>(a.due||"9")<(b.due||"9")?-1:1);
  JSON.stringify(out.slice(0,40));
}catch(e){ "[]" }
' 2>/dev/null || echo "[]")

# ---- 2) 日历（优先 icalBuddy；无则留空）----
if command -v icalBuddy >/dev/null 2>&1; then
  CAL=$(icalBuddy -nc -npn -b '' -ps '|@|' -iep 'title,datetime,location' -po 'datetime,title,location' \
        -df '%Y-%m-%d' -tf '%H:%M' eventsToday+7 2>/dev/null | node "$DIR/parse-cal.js" 2>/dev/null || echo "[]")
else
  CAL="[]"
fi

# ---- 3) AI 日报（有 claude CLI 才生成；把提醒/日历喂进去做摘要）----
REPORT='""'
if command -v claude >/dev/null 2>&1; then
  PROMPT="你是我的日程助理。基于下面 JSON 的提醒事项和日历，用中文输出今日要点。只返回 JSON：{\"summary\":\"一句话概览\",\"top3\":[\"...\"],\"focus\":\"今天最该先做的一件事\"}。\n提醒：$REM\n日历：$CAL"
  RAW=$(claude -p "$PROMPT" --output-format json 2>/dev/null || echo '')
  # 取 result 字段里的 JSON 文本；失败则空
  REPORT=$(node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try{const o=JSON.parse(s); let t=o.result||o; if(typeof t!=="string")t=JSON.stringify(t);
        const m=t.match(/\{[\s\S]*\}/); process.stdout.write(JSON.stringify(m?m[0]:t)); }
      catch{ process.stdout.write("\"\"") }
    });' <<< "$RAW" 2>/dev/null || echo '""')
fi

# ---- 4) 硬件容量（本机磁盘；NAS 需另配 Synology API，见 README）----
RES=$(node -e '
const cp=require("child_process");
const gb=b=>b>=1073741824*1024?(b/1024/1073741824).toFixed(1)+"T":Math.round(b/1073741824)+"G";
function disk(p,name,icon){ try{ const l=cp.execSync("df -k "+p,{stdio:["ignore","pipe","ignore"]}).toString().trim().split(/\n/)[1].split(/\s+/);
  const tot=+l[1]*1024, used=+l[2]*1024; if(!tot)return null; return {name,icon,total:gb(tot),used:gb(used),percent:Math.round(used/tot*100)}; }catch{return null;} }
const r=[disk("/System/Volumes/Data","本机磁盘","hard-drive")].filter(Boolean);
// NAS 容量：若设了 NAS_DF（如通过 ssh 取到的 df 输出）可在此扩展；默认留空
process.stdout.write(JSON.stringify(r));
' 2>/dev/null || echo "[]")

# ---- 5) 合并原子写入 ----
node -e '
const [rem,cal,rep,res]=[process.argv[1],process.argv[2],process.argv[3],process.argv[5]];
const j=s=>{try{return JSON.parse(s)}catch{return null}};
let report=j(rep); if(typeof report==="string") report=j(report);
const data={ reminders:j(rem)||[], calendar:j(cal)||[], report:report||null, resources:j(res)||[], generatedAt:new Date().toISOString() };
require("fs").writeFileSync(process.argv[4], JSON.stringify(data));
' "$REM" "$CAL" "$REPORT" "$TMP" "$RES"
mv -f "$TMP" "$OUT"
echo "[$(date '+%H:%M:%S')] data.json 已更新：提醒 $(node -e 'console.log((JSON.parse(require("fs").readFileSync(process.argv[1])).reminders||[]).length)' "$OUT") 条"
