/* ============ 天气：open-meteo + ipapi（免key/CORS，localStorage 缓存）============ */
const WMO = {
  0:['晴','sun','moon'],1:['大致晴','cloud-sun','cloud-moon'],2:['局部多云','cloud-sun','cloud-moon'],3:['阴','cloud','cloud'],
  45:['雾','cloud-fog','cloud-fog'],48:['雾凇','cloud-fog','cloud-fog'],
  51:['小毛毛雨','cloud-drizzle','cloud-drizzle'],53:['毛毛雨','cloud-drizzle','cloud-drizzle'],55:['大毛毛雨','cloud-rain','cloud-rain'],
  56:['冻毛雨','cloud-rain','cloud-rain'],57:['冻毛雨','cloud-rain','cloud-rain'],
  61:['小雨','cloud-sun-rain','cloud-moon-rain'],63:['中雨','cloud-rain','cloud-rain'],65:['大雨','cloud-rain-wind','cloud-rain-wind'],
  66:['冻雨','cloud-rain','cloud-rain'],67:['冻雨','cloud-rain','cloud-rain'],
  71:['小雪','cloud-snow','cloud-snow'],73:['中雪','snowflake','snowflake'],75:['大雪','snowflake','snowflake'],77:['米雪','cloud-snow','cloud-snow'],
  80:['小阵雨','cloud-sun-rain','cloud-moon-rain'],81:['阵雨','cloud-rain','cloud-rain'],82:['强阵雨','cloud-lightning','cloud-lightning'],
  85:['小阵雪','cloud-snow','cloud-snow'],86:['阵雪','snowflake','snowflake'],
  95:['雷暴','cloud-lightning','cloud-lightning'],96:['雷暴冰雹','cloud-lightning','cloud-lightning'],99:['雷暴冰雹','cloud-lightning','cloud-lightning'],
};
export function wmo(code, isDay){ const e=WMO[code]||WMO[3]; return { text:e[0], icon:isDay?e[1]:e[2] }; }

const CACHE_KEY='fn_weather', LOC_KEY='fn_geo', TTL=20*60*1000;
const j = s => { try{return JSON.parse(s);}catch{return null;} };

async function geo(){
  const c=j(localStorage.getItem(LOC_KEY));
  if(c && c.lat) return c;
  // 用本身支持 CORS(Access-Control-Allow-Origin:*) 的定位源，扩展里直接可用、不依赖 host 授权。
  // 不用 ipapi.co —— 它会限流(429)且不稳。
  const srcs=[
    ['https://ipwho.is/',                   d=>(d && d.success!==false && d.latitude)?{lat:+d.latitude, lon:+d.longitude, city:d.city||''}:null],
    ['https://get.geojs.io/v1/ip/geo.json', d=>(d && d.latitude)?{lat:+d.latitude, lon:+d.longitude, city:d.city||''}:null],
  ];
  for(const [url,pick] of srcs){
    try{ const r=await fetch(url); if(!r.ok) continue; const loc=pick(await r.json());
      if(loc && loc.lat){ localStorage.setItem(LOC_KEY, JSON.stringify(loc)); return loc; } }catch{}
  }
  return null;
}

export async function getWeather(force){
  const cached=j(localStorage.getItem(CACHE_KEY));
  if(!force && cached && (Date.now()-cached.ts)<TTL) return cached.data;
  const loc = (cached && cached.data && cached.data.lat) ? cached.data : await geo();
  if(!loc || !loc.lat) return cached ? cached.data : null;
  const u=`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}`
    +`&current=temperature_2m,apparent_temperature,is_day,weather_code,relative_humidity_2m,wind_speed_10m`
    +`&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`;
  try{
    const r=await fetch(u); const d=await r.json(); const c=d.current;
    const data={
      lat:loc.lat, lon:loc.lon, city:loc.city,
      temp:Math.round(c.temperature_2m), feels:Math.round(c.apparent_temperature),
      code:c.weather_code, isDay:!!c.is_day, humidity:c.relative_humidity_2m, wind:c.wind_speed_10m,
      hi:Math.round(d.daily.temperature_2m_max[0]), lo:Math.round(d.daily.temperature_2m_min[0]),
      daily:(d.daily.time||[]).slice(0,5).map((t,i)=>({date:t, code:d.daily.weather_code[i], hi:Math.round(d.daily.temperature_2m_max[i]), lo:Math.round(d.daily.temperature_2m_min[i])})),
      ...wmo(c.weather_code, c.is_day),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify({ts:Date.now(), data}));
    return data;
  }catch{ return cached ? cached.data : null; }
}

/* 点天气卡 = 刷新：清缓存让下次按 IP 重新定位 + 重新取天气。
   （不用 navigator.geolocation —— 会触发 Chrome 的 geolocation 权限警告，且 IP 定位已够用） */
export function preciseLocate(){
  try{ localStorage.removeItem(LOC_KEY); localStorage.removeItem(CACHE_KEY); }catch{}
  return Promise.resolve(true);
}
