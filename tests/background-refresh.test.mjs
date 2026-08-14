import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineRefreshScheduler } from '../shared/background.js';

function fakeClock(start=1_000_000){
  let now=start, nextId=0;
  const timers=new Map(), cleared=[];
  return {
    now:()=>now,
    setTimer(fn,delay){ const id=++nextId; timers.set(id,{fn,delay}); return id; },
    clearTimer(id){ if(timers.delete(id))cleared.push(id); },
    active(){ return [...timers.entries()].map(([id,timer])=>({id,...timer})); },
    cleared,
    async fireNext(){
      const [id,timer]=timers.entries().next().value||[];
      assert.ok(timer,'expected an active refresh timer');
      timers.delete(id); now+=timer.delay;
      await timer.fn();
    },
  };
}

function onlineBackground(clock,overrides={}){
  return { enabled:true, mode:'online', refreshEvery:15, lastFetchAt:clock.now(), onlineSrc:{id:'bing'}, ...overrides };
}

test('online wallpaper refresh uses the selected interval and rearms after success', async()=>{
  const clock=fakeClock(), bg=onlineBackground(clock);
  const scheduler=createOnlineRefreshScheduler(clock);
  let refreshes=0;

  scheduler.sync({ onHome:true, background:bg, refresh:async()=>{
    refreshes++;
    bg.lastFetchAt=clock.now();
    return {ok:true};
  }});

  assert.equal(clock.active().length,1);
  assert.equal(clock.active()[0].delay,15*60_000);
  await clock.fireNext();
  assert.equal(refreshes,1);
  assert.equal(clock.active().length,1);
  assert.equal(clock.active()[0].delay,15*60_000);
});

test('an overdue online wallpaper refresh runs immediately', async()=>{
  const clock=fakeClock(), bg=onlineBackground(clock,{lastFetchAt:clock.now()-15*60_000-1});
  const scheduler=createOnlineRefreshScheduler(clock);
  let refreshes=0;
  scheduler.sync({onHome:true,background:bg,refresh:async()=>{ refreshes++; bg.lastFetchAt=clock.now(); return {ok:true}; }});

  assert.equal(clock.active()[0].delay,0);
  await clock.fireNext();
  assert.equal(refreshes,1);
});

test('a failed refresh keeps the user-selected interval instead of spinning', async()=>{
  const clock=fakeClock(), bg=onlineBackground(clock,{refreshEvery:60});
  const scheduler=createOnlineRefreshScheduler(clock);
  scheduler.sync({onHome:true,background:bg,refresh:async()=>({ok:false,reason:'offline'})});

  await clock.fireNext();
  assert.equal(clock.active().length,1);
  assert.equal(clock.active()[0].delay,60*60_000);
});

test('frequency changes replan immediately and disabled states cancel the timer', ()=>{
  const clock=fakeClock(), bg=onlineBackground(clock,{refreshEvery:60});
  const scheduler=createOnlineRefreshScheduler(clock);
  const refresh=async()=>({ok:true});
  scheduler.sync({onHome:true,background:bg,refresh});
  const firstTimer=clock.active()[0].id;

  bg.refreshEvery=15;
  scheduler.sync({onHome:true,background:bg,refresh});
  assert.ok(clock.cleared.includes(firstTimer));
  assert.equal(clock.active()[0].delay,15*60_000);

  for(const state of [
    {onHome:true, background:{...bg,refreshEvery:0}},
    {onHome:false,background:bg},
    {onHome:true, background:{...bg,enabled:false}},
    {onHome:true, background:{...bg,mode:'preset'}},
  ]){
    scheduler.sync({...state,refresh});
    assert.equal(clock.active().length,0);
  }
});
