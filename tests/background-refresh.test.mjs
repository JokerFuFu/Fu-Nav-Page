import test from 'node:test';
import assert from 'node:assert/strict';

const planner = await import('../shared/wallpaper-refresh.js').catch(()=>null);

function onlineBackground(overrides={}){
  return { enabled:true, mode:'online', refreshEvery:15, lastFetchAt:1_000_000, onlineSrc:{id:'bing'}, ...overrides };
}

test('durable wallpaper planner exposes one stable alarm identity', ()=>{
  assert.ok(planner,'durable wallpaper planner module is missing');
  assert.equal(planner.WALLPAPER_REFRESH_ALARM,'fu-nav-wallpaper-refresh');
});

test('online wallpaper plan uses the selected interval from the latest successful fetch', ()=>{
  assert.ok(planner,'durable wallpaper planner module is missing');
  const bg=onlineBackground(), now=1_300_000;
  assert.deepEqual(planner.wallpaperRefreshPlan(bg,now),{
    enabled:true,
    due:false,
    dueAt:1_900_000,
    delay:600_000,
  });
});

test('an overdue wallpaper is due immediately', ()=>{
  assert.ok(planner,'durable wallpaper planner module is missing');
  const bg=onlineBackground({refreshEvery:1,lastFetchAt:1_000_000});
  assert.deepEqual(planner.wallpaperRefreshPlan(bg,1_060_001),{
    enabled:true,
    due:true,
    dueAt:1_060_000,
    delay:0,
  });
});

test('a failed attempt advances the same user interval instead of spinning', ()=>{
  assert.ok(planner,'durable wallpaper planner module is missing');
  const bg=onlineBackground({refreshEvery:60,lastFetchAt:1_000_000});
  const state={sourceKey:'bing',lastFetchAt:0,lastAttemptAt:2_000_000};
  assert.deepEqual(planner.wallpaperRefreshPlan(bg,2_100_000,state),{
    enabled:true,
    due:false,
    dueAt:5_600_000,
    delay:3_500_000,
  });
});

test('manual, disabled and non-online backgrounds create no durable plan', ()=>{
  assert.ok(planner,'durable wallpaper planner module is missing');
  for(const bg of [
    onlineBackground({refreshEvery:0}),
    onlineBackground({enabled:false}),
    onlineBackground({mode:'preset'}),
    null,
  ]){
    assert.deepEqual(planner.wallpaperRefreshPlan(bg,2_000_000),{
      enabled:false,
      due:false,
      dueAt:null,
      delay:null,
    });
  }
});

test('a delayed download can commit only to the same still-enabled online source', ()=>{
  assert.ok(planner,'durable wallpaper planner module is missing');
  const original=onlineBackground({onlineImageId:'bg_a',onlineSrc:{id:'custom',url:'https://img.example/a'}});
  const expected=planner.wallpaperRefreshSnapshot(original);
  assert.equal(planner.canCommitWallpaperRefresh({...original},expected),true);
  assert.equal(planner.canCommitWallpaperRefresh({...original,onlineImageId:'bg_newer'},expected),false);
  assert.equal(planner.canCommitWallpaperRefresh({...original,onlineSrc:{id:'custom',url:'https://img.example/b'}},expected),false);
  assert.equal(planner.canCommitWallpaperRefresh({...original,mode:'preset'},expected),false);
  assert.equal(planner.canCommitWallpaperRefresh({...original,refreshEvery:0},expected),false);
});

test('durable runtime state advances the plan only for the current source', ()=>{
  const bg=onlineBackground({refreshEvery:15,lastFetchAt:1_000_000,onlineSrc:{id:'bing'}});
  const currentState={sourceKey:'bing',lastFetchAt:2_000_000,lastAttemptAt:0,onlineImageId:'bg_runtime'};
  assert.deepEqual(planner.wallpaperRefreshPlan(bg,2_100_000,currentState),{
    enabled:true,due:false,dueAt:2_900_000,delay:800_000,
  });
  const staleState={...currentState,sourceKey:'ycy'};
  assert.deepEqual(planner.wallpaperRefreshPlan(bg,2_100_000,staleState),{
    enabled:true,due:true,dueAt:1_900_000,delay:0,
  });
});
