// Run with node tests/utility-poles.cjs --terrain-only.
module.exports = async ({ assert, game, resize, screenshot, errors }) => {
    const quiet = `resetRun();showScreen('play');clearInput();save.controls='keyboard';
        player.invuln=9999;spawnEvery=1e9;lastBomb=0;enemyWaves=[];giantBombWaves=[];airdropSpawned=true;`;
    for (const [w,h] of [[225,800],[360,800],[800,360],[720,720],[1280,720],[2560,720],[3840,2160]]) {
        await resize(w,h);
        const checks = await game(`(() => {
            ${quiet}
            const x=worldW/2;
            dentGround(x,false);const small=terrainDepthAt(0.5);
            terrainDepth.fill(0);dentGround(x,true);const giant=terrainDepthAt(0.5);
            const ratio=Math.abs(giant/small-3)<0.00001;
            const tiny=small<=0.014001;
            for(let i=0;i<1000;i++)dentGround(x,true);
            const early=terrainDepthAt(0.5)<=0.140001;
            runTime=239;for(let i=0;i<1000;i++)dentGround(x,true);
            const beforeFive=terrainDepthAt(0.5)<0.5;
            runTime=285;for(let i=0;i<1000;i++)dentGround(x,true);
            const cap=Math.abs(terrainDepthAt(0.5)-0.65)<0.00001&&Math.max(...terrainDepth)<=0.650001;
            const visible=groundAt(x)+6<worldH-10;
            const sides=terrainSpeed(worldW*0.4,1)>1&&terrainSpeed(worldW*0.6,1)<1;
            const bounded=Array.from({length:257},(_,i)=>terrainSpeed(i*worldW/256,1)).every(v=>v>=0.85&&v<=1.1);
            player.x=x-player.w/2;player.y=worldH-groundH-player.h+6;player.grounded=true;
            update(1/60,0);const falls=player.y>worldH-groundH-player.h+6&&!player.grounded;
            for(let i=0;i<120;i++)update(1/60,0);
            const grounded=player.grounded&&Math.abs(player.y-bodyFloor(player))<0.001;
            requestJump();const jumped=player.vy<0&&!player.grounded;
            for(let i=0;i<240;i++)update(1/60,0);
            const landed=player.grounded&&Math.abs(player.y-bodyFloor(player))<0.001;
            // Full-width traversal: slopes must not trap the player or exceed the speed bounds.
            player.x=0;player.y=bodyFloor(player);player.grounded=true;keys.right=true;
            for(let i=0;i<360;i++)update(1/60,0);
            keys.right=false;const exits=player.x>=worldW-player.w-1&&player.grounded;
            return {ratio,tiny,early,beforeFive,cap,visible,sides,bounded,falls,grounded,jumped,landed,exits};
        })()`);
        assert(Object.values(checks).every(Boolean), JSON.stringify({w,h,checks}));

        const interactions = await game(`(() => {
            ${quiet}
            runTime=285;for(let i=0;i<100;i++)dentGround(worldW/2,true);
            player.x=worldW/2-player.w/2;player.y=bodyFloor(player);player.grounded=true;
            // An incoming level shot passes over a deeply sheltered player.
            player.invuln=0;const lives=player.lives;
            bullets=[{x:player.x-player.w,y:worldH-groundH-player.h*0.55,w:8,h:3,vx:worldW,vy:0}];
            for(let i=0;i<12;i++)update(1/60,0);
            const cover=player.lives===lives;
            player.invuln=9999;
            // A shot into the far wall is stopped, even when it traverses many cells in one frame.
            bullets=[{x:worldW/2,y:groundAt(worldW/2)-player.h*0.15,w:4,h:2,vx:worldW*20,vy:0}];
            update(1/60,0);const wall=bullets.length===0;
            // Grounded soldier and visible aiming direction use the same terrain as the player.
            spawnEnemy(true);const en=enemies[0];en.x=worldW*0.33;en.y=bodyFloor(en);en.speed=0;en.fireEvery=999;
            for(let i=0;i<90;i++)update(1/60,0);
            const aimDown=en.aim>0&&en.aim<=0.28;
            enemyShoot(en);const angled=bullets[bullets.length-1].vy>0;
            en.x=worldW/2-en.w/2;en.y=worldH-groundH-en.h+6;en.grounded=false;
            player.x=worldW*0.85;player.y=bodyFloor(player);
            for(let i=0;i<180;i++)update(1/60,0);
            const enemyLands=en.grounded&&Math.abs(en.y-bodyFloor(en))<0.001;
            const aimUp=en.aim<0;
            enemies=[];bullets=[];
            // Ground impact uses the current crater floor, not the original surface.
            spawnBomb(true);const bomb=bombs[0];bomb.x=worldW/2-bomb.w/2;bomb.targetX=worldW/2;
            const impactY=groundAt(worldW/2);bomb.y=impactY-bomb.h-1;bomb.speed=120;
            update(1/60,0);const impact=!bombs.includes(bomb)&&Math.abs(explosions[0].y-impactY)<0.001;
            spawnAirdrop();const drop=airdrops[0];drop.x=worldW/2-drop.w/2;drop.y=groundAt(worldW/2)-drop.h-1;drop.speed=120;
            update(1/60,0);const dropLands=airdrops.includes(drop)&&Math.abs(drop.y+drop.h-groundAt(worldW/2))<0.001;
            const caughtBefore=airdropsCaught;player.x=drop.x;player.y=bodyFloor(player);
            update(1/60,0);const collected=airdropsCaught===caughtBefore+1;
            spawnAirdrop();const missed=airdrops[0];missed.x=0;missed.y=groundAt(0)-missed.h;
            player.x=worldW-player.w;player.y=bodyFloor(player);
            for(let i=0;i<250;i++)update(1/60,0);
            const expires=!airdrops.includes(missed);
            return {cover,wall,aimDown,angled,enemyLands,aimUp,impact,dropLands,collected,expires};
        })()`);
        assert(Object.values(interactions).every(Boolean), JSON.stringify({w,h,interactions}));
    }
    console.log('PASS: terrain depth, traversal, gravity/jump, angled fire, cover, swept ground collision, bomb/airdrop contact at 7 sizes');

    await resize(360,800);
    await game(`${quiet}runTime=285;for(let i=0;i<100;i++)dentGround(worldW*0.4,true);
        player.x=worldW*0.4-player.w/2;player.y=bodyFloor(player);player.grounded=true;
        spawnEnemy(false);enemies[0].x=worldW*0.7;enemies[0].y=bodyFloor(enemies[0]);
        spawnBomb(false);spawnAirdrop();
        window.savedTerrain=JSON.stringify(Array.from(terrainDepth));
        window.liveObjects=[enemies[0],bombs[0],airdrops[0]];`);
    for(const [w,h] of [[800,360],[1280,720],[360,800]]) {
        await resize(w,h);
        assert(await game(`window.savedTerrain===JSON.stringify(Array.from(terrainDepth))&&Math.abs(player.y-bodyFloor(player))<0.001&&window.liveObjects.every((o,i)=>[enemies,bombs,airdrops][i].includes(o))`));
    }
    assert(await game(`(() => {
        const same=()=>window.savedTerrain===JSON.stringify(Array.from(terrainDepth));
        bombs=[];enemies=[];airdrops=[];timeLeft=0.001;update(1/60,0);const levelPersists=level===2&&same();
        showScreen('pause');update(1,0);const paused=same();
        showScreen('play');sdkCallbacks.pause();update(1,0);const platform=same();
        sdkCallbacks.resume();cancelAnimationFrame(animationFrameId);animationFrameId=0;
        level=5;timeLeft=0.001;update(1/60,0);const grace=awaitingVictory&&!ended;
        spawnBomb(false);const b=bombs[0];b.x=worldW*0.1;b.y=groundAt(b.x+b.w/2)-b.h-1;b.speed=120;
        update(1/60,0);const liveGrace=!same()&&!ended;
        for(let i=0;i<305;i++)update(1/60,0);const won=ended&&victory;
        const after=JSON.stringify(Array.from(terrainDepth));update(1,0);const frozen=after===JSON.stringify(Array.from(terrainDepth));
        resetRun();const reset=terrainDepth.every(d=>d===0);
        return levelPersists&&paused&&platform&&grace&&liveGrace&&won&&frozen&&reset;
    })()`));
    console.log('PASS: normalized terrain/object persistence through rotation, level transitions, pause/platform, final grace, victory freeze and reset');

    for (const [w,h] of [[360,800],[1280,720]]) {
        await resize(w,h);
        const poles = await game(`(() => {
            ${quiet}
            runTime=285;for(let i=0;i<50;i++)dentGround(worldW*0.4,true);
            for(const p of utility.poles)toppleUtilityPole(p,undefined,'base');
            for(let i=0;i<1800;i++)updateUtilityPoles(1/120,false);
            const supports=utility.poles.every(p=>utilityLowestPoint(p)<0.002);
            const cables=utility.wires.every(w=>w.nodes.every(n=>n.y<=groundAt(n.x)+3.1));
            const intactMaterial=utility.poles.every(p=>Math.abs(p.parts.reduce((s,q)=>s+q.hi-q.lo,0)-1)<0.00001);
            draw();return {supports,cables,intactMaterial};
        })()`);
        assert(Object.values(poles).every(Boolean),JSON.stringify({w,h,poles}));
        await game(`player.x=worldW*0.4-player.w/2;player.y=bodyFloor(player);player.invuln=0;
            level=5;backgroundFrom=4;backgroundTo=4;backgroundBlend=1;draw();`);
        await screenshot('crater-cover-'+w+'x'+h);
    }
    console.log('PASS: collapsed poles and broken wires remain supported on crater terrain');
    if (process.argv.includes('--terrain-smoke')) return;

    // Seeded five-wave runs: no soldier/player intercepts, so every bomb reaches the ground.
    const balance=[];
    for(const [w,h] of [[360,800],[800,360],[1280,720]]) {
        await resize(w,h);
        for(let seed=1;seed<=6;seed++) {
            const result=await game(`(() => {
                const random=Math.random;let seed=${seed};Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
                try {
                    resetRun();showScreen('play');clearInput();save.effects='reduced';player.invuln=9999;
                    const max=[];
                    for(let i=0;i<300*30;i++) {
                        enemies=[];update(1/30,i*1000/30);
                        if(i%1800===1799)max.push(Math.max(...terrainDepth));
                    }
                    player.invuln=0;draw();return {max,min:Math.min(...terrainDepth),finite:terrainDepth.every(Number.isFinite),count:terrainDepth.length};
                } finally {Math.random=random;}
            })()`);
            assert(result.finite&&result.count===257&&result.max.length===5,JSON.stringify(result));
            assert(result.max[0]<0.17&&result.max[3]<0.51&&result.max[4]<=0.650001,JSON.stringify(result));
            assert(result.max[4]-result.min>0.05,'terrain should retain relief instead of flattening');
            balance.push({w,h,seed,max:result.max.map(v=>+v.toFixed(3))});
        }
        await screenshot('terrain-level5-'+w+'x'+h);
    }
    console.log('PASS: 18 seeded full runs (all bombs hit terrain), max depths in player heights: '+JSON.stringify(balance));
    assert.equal(errors.length,0,JSON.stringify(errors));
};
