// Run: node tests/utility-poles.cjs --challenges-only
module.exports = async ({assert,game,evaluate,call,screenshot,errors,resize}) => {
    for(const [w,h] of [[225,800],[360,800],[800,360],[720,720],[1280,720],[2560,720],[3840,2160]]) {
        await resize(w,h);
        await game(`save.challenge='normal';showScreen('menu');`);
        for(const name of ['One Life','Air Raid','Impossible','Normal']) {
            const result=await game(`(()=>{
                const button=document.getElementById('challengeBtn');button.click();
                const p=document.getElementById('playBtn').getBoundingClientRect(),b=button.getBoundingClientRect();
                return {name:CHALLENGES[save.challenge].name,below:b.top>=p.bottom,inside:b.left>=0&&b.right<=worldW,label:button.textContent};
            })()`);
            assert.equal(result.name,name);assert(result.below&&result.inside,JSON.stringify({w,h,result}));
        }
        if(w===360||w===800||w===1280) await screenshot('challenge-menu-'+w+'x'+h);
    }
    await resize(1280,720);
    await game("save.challenge='normal';showScreen('menu');document.getElementById('challengeBtn').focus();");
    for(const [key,code,text,name] of [['Enter',13,'\r','one_life'],[' ',32,' ','air_raid']]) {
        await call('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code,text});
        await call('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code});
        assert.equal(await game('save.challenge'),name);
    }
    assert(await game(`(()=>{
        applyLoadedSave({v:2,best:4321,bestLevel:4,seenHowTo:true,effects:'reduced',controls:'touch',joystickSide:'left',bombGuides:false});
        const legacy=save.challenge==='normal'&&save.best===4321&&Object.values(save.challengeBests).every(v=>v===0)&&save.joystickSide==='left'&&save.seenHowTo;
        save.challenge='impossible';save.challengeBests.impossible=7654;persistSave();const raw=window.savedData;
        applyLoadedSave(raw);const roundTrip=save.challenge==='impossible'&&save.challengeBests.impossible===7654&&save.best===4321;
        applyLoadedSave({challenge:'bad',challengeBests:{one_life:-42,air_raid:'no',impossible:Infinity}});
        return legacy&&roundTrip&&save.challenge==='normal'&&Object.values(save.challengeBests).every(v=>v===0);
    })()`));
    for(const id of ['normal','one_life','air_raid','impossible']) {
        const rules=await game(`(()=>{
            save.challenge=${JSON.stringify(id)};startPlay();
            const initial=player.lives;
            const levels=[];
            for(level=1;level<=5;level++){
                configureAirdrops();configureGiantBombs();configureEnemyWaves();
                levels.push({enemies:enemyWaves.reduce((n,w)=>n+w.sides.length,0),giants:giantBombWaves.length,drops:Number.isFinite(extraAirdropAt)?2:1,
                    inTime:enemyWaves.concat(giantBombWaves).every(w=>w.at>0&&w.at<60)});
            }
            level=1;resetRun();showScreen('play');player.invuln=999;spawnEvery=1e9;enemyWaves=[];giantBombWaves=[];airdropSpawned=true;extraAirdropSpawned=true;
            const lives=player.lives;spawnAirdrop();Object.assign(airdrops[0],{x:player.x,y:player.y,speed:0});update(1/60,0);
            const healed=player.lives-lives;const pickup=airdropsCaught===1&&score>=120;
            requestPause();document.getElementById('challengeBtn').click();const locked=runChallenge===${JSON.stringify(id)}&&save.challenge===runChallenge;
            document.getElementById('restartBtn').click();const restart=runChallenge===${JSON.stringify(id)}&&player.lives===initial;
            player.invuln=0;player.lives=1;hitPlayer(1,player.x);const dead=ended&&!victory;
            document.getElementById('againBtn').click();const replay=runChallenge===${JSON.stringify(id)}&&player.lives===initial;
            return {initial,levels,healed,pickup,locked,restart,dead,replay};
        })()`);
        assert.equal(rules.initial,id==='one_life'?1:3);assert.equal(rules.healed,id==='one_life'?0:1);
        for(let l=0;l<5;l++) {
            const base=[2,2,2,3,5][l];
            assert.equal(rules.levels[l].enemies,id==='air_raid'?0:id==='impossible'?base*2:base);
            assert.equal(rules.levels[l].giants,(l===4?2:1)+(['air_raid','impossible'].includes(id)?1:0));
            assert.equal(rules.levels[l].drops,id==='impossible'?2:1);assert(rules.levels[l].inTime);
        }
        assert(['pickup','locked','restart','dead','replay'].every(k=>rules[k]),JSON.stringify({id,rules}));
    }
    assert(await game(`(()=>{
        const original=ytgame.engagement.sendScore,submitted=[];ytgame.engagement.sendScore=data=>submitted.push(data.value);
        try {
            save.best=111;save.challengeBests={one_life:0,air_raid:0,impossible:0};
            for(const id of CHALLENGE_IDS.slice(1)){save.challenge=id;resetRun();score=222;finish(false);}
            const isolated=save.best===111&&submitted.length===0&&Object.values(save.challengeBests).every(n=>n===222);
            save.challenge='normal';resetRun();score=333;finish(false);
            return isolated&&save.best===333&&submitted.length===1&&submitted[0]===333&&document.getElementById('endChallenge').textContent==='Normal';
        }finally{ytgame.engagement.sendScore=original;}
    })()`));
    console.log('PASS: 7 responsive menus, legacy saves, 20 wave configurations, pickups, locked run rules, restart/replay, separate records and Normal-only platform score');

    const rates=await game(`(()=>{
        const original=spawnBomb;let count=0;spawnBomb=giant=>{if(!giant)count++;};
        const results=[];
        try{
            for(const id of CHALLENGE_IDS)for(let stage=1;stage<=5;stage++)for(const fps of [30,60,120]){
                save.challenge=id;resetRun();showScreen('play');save.effects='reduced';
                level=stage;spawnEvery=Math.max(380,950-(stage-1)*140);lastBomb=0;
                enemyWaves=[];giantBombWaves=[];airdropSpawned=true;extraAirdropSpawned=true;count=0;
                for(let i=0;i<fps*20;i++)update(1/fps,0);
                const multiplier=['air_raid','impossible'].includes(id)?1.4:1;
                const expected=20000/(spawnEvery/multiplier);
                results.push({id,stage,fps,actual:count,expected,configured:runRules().bombRate===multiplier,remainder:lastBomb>=0&&lastBomb<spawnEvery/multiplier+0.001});
            }
            return results;
        }finally{spawnBomb=original;}
    })()`);
    assert(rates.every(r=>r.configured&&r.remainder&&Math.abs(r.actual-Math.floor(r.expected))<=1),JSON.stringify(rates));
    console.log('PASS: exact configured bomb rate and retained fractional timing in all 5 levels, all 4 modes at 30/60/120 FPS');

    const totals={};
    for(const id of ['normal','one_life','air_raid','impossible']) {
        totals[id]=await game(`(()=>{
            const oldEnemy=spawnEnemy,oldDrop=spawnAirdrop,oldBomb=spawnBomb;
            const counts={soldiers:0,drops:0,giants:0,bombs:0};
            spawnEnemy=(...args)=>{counts.soldiers++;return oldEnemy(...args);};
            spawnAirdrop=(...args)=>{counts.drops++;return oldDrop(...args);};
            spawnBomb=(giant)=>{counts[giant?'giants':'bombs']++;return oldBomb(giant);};
            try {
                save.challenge=${JSON.stringify(id)};startPlay();save.effects='reduced';player.invuln=9999;
                let graceCounts,graceSeen=false;
                for(let i=0;i<310*30&&!ended;i++){
                    update(1/30,i*1000/30);
                    if(awaitingVictory&&!graceSeen){graceSeen=true;graceCounts=JSON.stringify(counts);}
                }
                return {...counts,won:ended&&victory,noGraceSpawns:graceCounts===JSON.stringify(counts),duration:runTime,terrain:Math.max(...terrainDepth)};
            }finally{spawnEnemy=oldEnemy;spawnAirdrop=oldDrop;spawnBomb=oldBomb;}
        })()`);
        const c=totals[id];
        assert.equal(c.soldiers,id==='air_raid'?0:id==='impossible'?28:14);
        assert.equal(c.drops,id==='impossible'?10:5);
        assert.equal(c.giants,['air_raid','impossible'].includes(id)?11:6);
        assert(c.won&&c.noGraceSpawns&&c.duration>=305&&c.duration<306&&c.terrain<=0.650001,JSON.stringify({id,c}));
    }
    assert(totals.air_raid.bombs/totals.normal.bombs>1.39&&totals.air_raid.bombs/totals.normal.bombs<1.41);
    assert.equal(totals.impossible.bombs,totals.air_raid.bombs);
    assert.equal(totals.one_life.bombs,totals.normal.bombs);
    console.log('PASS: full five-level runs, 40% higher bombing frequency and final grace: '+JSON.stringify(totals));
    assert.equal(errors.length,0,JSON.stringify(errors));
};
