// Run: node tests/utility-poles.cjs --feedback-only
module.exports = async ({assert,game,evaluate,call,screenshot,errors,resize}) => {
    const quiet = `save.challenge='normal';resetRun();showScreen('play');save.controls='keyboard';clearInput();
        spawnEvery=1e9;lastBomb=0;enemyWaves=[];giantBombWaves=[];airdropSpawned=true;extraAirdropSpawned=true;`;
    for (const [w,h] of [[225,800],[360,800],[800,360],[720,720],[1280,720],[2560,720],[3840,2160]]) {
        await resize(w,h);
        for (const reduced of [false,true]) {
            const result=await game(`(()=>{
                ${quiet} save.effects=${JSON.stringify(reduced?'reduced':'full')};
                const shot=(gap)=>bullets.push({x:player.x-20,y:player.y-3-gap,w:8,h:3,vx:worldW,vy:0});
                shot(2);for(let i=0;i<30;i++)update(1/60,0);
                const popups=()=>scorePopups.filter(p=>p.closeCall);
                const close=popups().length===1,still=!!popups()[0]?.still===${reduced};
                const points=Math.abs(score-runTime*10)<0.001;
                shot(2);for(let i=0;i<30;i++)update(1/60,0);const grouped=popups().length===1&&popups()[0].count===2&&popups()[0].text==='CLOSE CALL ×2';
                scorePopups=[];bullets=[];
                shot(40);for(let i=0;i<30;i++)update(1/60,0);const far=popups().length===0;
                player.invuln=10;shot(2);for(let i=0;i<30;i++)update(1/60,0);const invulnerable=popups().length===0;
                player.invuln=0;bullets=[];
                const r=bombBlastRadius(false),cy=player.y+player.h/2;
                explode(player.x+player.w/2+r+player.w*0.2+2,cy,false,false);explosions[0].t=0.05;
                for(let i=0;i<4;i++)update(1/60,0);const blast=popups().length===1;
                scorePopups=[];explosions=[];
                explode(player.x+player.w/2+r+player.w*0.2+2,cy,false,false);explosions[0].t=0;
                bullets=[{x:player.x+2,y:player.y+10,w:8,h:3,vx:0,vy:0}];
                update(1/60,0);const damageWins=popups().length===0&&player.lives===2;
                return {close,still,points,grouped,far,invulnerable,blast,damageWins};
            })()`);
            assert(Object.values(result).every(Boolean),JSON.stringify({w,h,reduced,result}));
        }
    }
    console.log('PASS: near misses at 7 sizes in full/reduced effects, no scoring, grouped counts without cooldown, distant/invulnerable filtering and damage priority');

    for(const [w,h] of [[360,800],[800,360],[1280,720]]) {
        await resize(w,h);
        const result=await game(`(()=>{
            ${quiet}
            const count=()=>scorePopups.find(p=>p.closeCall)?.count||0;
            const clear=()=>{scorePopups=[];nearMissPending=0;bullets=[];explosions=[];};
            const shot=(direction,gap)=>bullets.push({x:direction>0?player.x-30:player.x+player.w+30,y:player.y-3-gap,w:8,h:3,vx:direction*worldW*8,vy:0});
            shot(1,nearMissMargin()-1);shot(-1,nearMissMargin()-1);
            for(let i=0;i<12;i++)update(1/60,0);
            const simultaneous=count()===2;
            for(let i=0;i<10;i++)update(1/60,0);const noDuplicates=count()===2;
            clear();
            // A terrain-blocked bullet must resolve its previously observed close approach.
            bullets=[{x:player.x+player.w+5,y:groundAt(player.x+player.w+5),w:8,h:3,vx:100,vy:0,nearMiss:true}];
            update(1/60,0);const wall=count()===1&&bullets.length===0;
            clear();
            const bombCases=[];
            for(const giant of [false,true]){
                player.y=groundAt(player.x)-player.h*4;player.vy=0;player.grounded=false;
                const b={x:player.x+player.w+2,y:player.y+player.h+10,w:20,h:giant?50:25};
                trackRectNearMiss(b,b.x,player.y-b.h-10,player.x,player.y);
                explode(b.x+b.w/2,groundAt(b.x),true,giant,b);const blast=explosions.at(-1);blast.t=0;
                update(1/60,0);const before=count();queueNearMiss(blast);showNearMiss();
                bombCases.push(before===1&&count()===1);clear();
            }
            player.y=bodyFloor(player);player.vy=0;player.grounded=true;
            spawnEnemy(true);const en=enemies[0];en.speed=0;en.fireEvery=999;
            en.x=player.x;en.y=player.y+player.h+2;
            trackRectNearMiss(en,en.x,en.y,player.x,player.y);
            en.x=player.x+player.w*3;en.y=bodyFloor(en);update(1/60,0);
            const soldier=count()===1;
            for(let i=0;i<10;i++)update(1/60,0);const noSoldierRepeat=count()===1;
            // Coalescing stays bounded even for a large simultaneous burst.
            clear();for(let i=0;i<50;i++)queueNearMiss({nearMiss:true});showNearMiss();
            const burst=count()===50&&scorePopups.filter(p=>p.closeCall).length===1&&scorePopups.length<=MAX_SCORE_POPUPS;
            return {simultaneous,noDuplicates,wall,bombs:bombCases.every(Boolean),soldier,noSoldierRepeat,burst};
        })()`);
        assert(Object.values(result).every(Boolean),JSON.stringify({w,h,result}));
    }
    console.log('PASS: rapid/opposing bullets, wider detection band, blocked bullets, falling regular/giant bombs, soldier near contact and bounded grouping');

    await resize(1280,720);
    for(const cause of ['bomb','giant_bomb','blast','giant_blast','bullet','soldier']) {
        const result=await game(`(()=>{
            ${quiet}player.lives=1;runTime=222.25;level=4;
            const cause=${JSON.stringify(cause)};
            if(cause==='bomb'||cause==='giant_bomb'){
                spawnBomb(cause==='giant_bomb');bombs[0].x=player.x;bombs[0].y=player.y;bombs[0].speed=0;
            }else if(cause==='blast'||cause==='giant_blast'){
                explode(player.x+player.w/2,player.y+player.h/2,false,cause==='giant_blast');
            }else if(cause==='bullet'){
                bullets=[{x:player.x+2,y:player.y+10,w:8,h:3,vx:0,vy:0}];
            }else{
                spawnEnemy(true);enemies[0].x=player.x;enemies[0].y=bodyFloor(enemies[0]);
            }
            // A pickup in the same frame cannot revive a dead player or alter their results.
            spawnAirdrop();airdrops[0].x=player.x;airdrops[0].y=player.y;airdrops[0].speed=0;
            update(1/60,0);
            const text=document.getElementById('deathRecap').textContent;
            const dead=ended&&!victory&&screen==='end'&&deathRecap.cause===cause;
            const recap=text.includes('Level 4')&&text.includes('3:42 survived')&&!text.includes('Run ended');
            const stable=airdropsCaught===0&&player.lives<=0;
            const noMedal=!save.challengeMedals.normal;
            return {dead,recap,stable,noMedal,text};
        })()`);
        assert(result.dead&&result.recap&&result.stable&&result.noMedal,JSON.stringify({cause,result}));
    }
    await screenshot('death-recap-1280x720');
    console.log('PASS: all 6 fatal collision sources, exact run time/level, no post-death pickup or medal');

    assert(await game(`(()=>{
        applyLoadedSave({v:2,best:9000,challenge:'impossible',challengeBests:{impossible:1234},controls:'touch',joystickSide:'left'});
        const legacy=CHALLENGE_IDS.every(id=>!save.challengeMedals[id])&&save.best===9000&&save.challengeBests.impossible===1234;
        for(const id of CHALLENGE_IDS){
            save.challenge=id;resetRun();finish(true);
            const complete=CHALLENGE_IDS.every(id=>save.challengeMedals[id]);
            const badge=document.querySelector('#medalShelf .challenge-medal:last-child');
            if(badge.textContent!=='100%'||badge.classList.contains('earned')!==complete)return false;
            if(document.getElementById('endMedal').textContent.includes('100%')!==complete)return false;
            const scoreOnce=score;finish(true);if(score!==scoreOnce)return false;
        }
        const all=CHALLENGE_IDS.every(id=>save.challengeMedals[id]===true);
        const raw=window.savedData;applyLoadedSave(raw);showScreen('menu');
        const restored=CHALLENGE_IDS.every(id=>save.challengeMedals[id]===true)&&document.querySelectorAll('.challenge-medal.earned').length===5;
        resetRun();const persistent=CHALLENGE_IDS.every(id=>save.challengeMedals[id]===true);
        return legacy&&all&&restored&&persistent;
    })()`));
    for(const reduced of [false,true]) {
        const result=await game(`(()=>{
            ${quiet}save.effects=${JSON.stringify(reduced?'reduced':'full')};level=5;timeLeft=0.001;
            update(1/60,0);const grace=awaitingVictory&&!ended&&screen==='play';
            for(let i=0;i<299;i++)update(1/60,0);const lethal=!ended;
            update(1/60,0);update(1/60,0);
            const quiet=ended&&victory&&screen==='aftermath'&&document.activeElement.id==='resultsBtn';
            const snapshot=JSON.stringify([runTime,score,terrainDepth,player.x,player.y,enemies,bombs]);
            update(0.5,0);const remains=screen==='aftermath';
            const left=victoryRevealLeft;sdkCallbacks.pause();update(10,0);const paused=victoryRevealLeft===left;
            sdkCallbacks.resume();cancelAnimationFrame(animationFrameId);animationFrameId=0;
            update(1.4,0);const results=screen==='end';
            const fade=${reduced} ? screens.end.style.opacity==='1' : resultsFadeLeft>0;
            update(0.7,0);const visible=screens.end.style.opacity==='1';
            const frozen=snapshot===JSON.stringify([runTime,score,terrainDepth,player.x,player.y,enemies,bombs]);
            return {grace,lethal,quiet,remains,paused,results,fade,visible,frozen};
        })()`);
        assert(Object.values(result).every(Boolean),JSON.stringify({reduced,result}));
    }
    assert(await game(`(()=>{${quiet}level=5;timeLeft=0.001;player.lives=1;update(1/60,0);hitPlayer(1,player.x,'bullet');return ended&&!victory&&screen==='end'&&victoryRevealLeft===0;})()`));

    // Native keyboard, mouse and touch can skip the non-lethal pause after winning.
    for (const input of ['keyboard','mouse','touch']) {
        await resize(input==='touch'?360:1280,input==='touch'?800:720);
        await game(`${quiet}finish(true);draw();`);
        if(input==='keyboard'){
            await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',windowsVirtualKeyCode:13,text:'\r'});
            await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',windowsVirtualKeyCode:13});
        }else{
            const p=await evaluate(`(()=>{const r=document.getElementById('resultsBtn').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
            if(input==='mouse'){
                await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
                await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
            }else{
                await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
                await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
                await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
            }
        }
        assert.equal(await game('screen'),'end',input+' skips aftermath');
        await game('update(1,0);draw();');await screenshot('victory-'+input);
    }
    const gain=await game(`(()=>{
        const oldAudio=audioCtx,oldMaster=masterGain,oldOk=audioOk;const calls=[];
        try {
            audioCtx={currentTime:0};audioOk=true;
            masterGain={gain:{cancelScheduledValues(){},setTargetAtTime(v,t,c){calls.push([v,c]);},setValueAtTime(v){calls.push([v,0]);}}};
            screen='aftermath';setAudioActive(false);audioOk=false;setAudioActive(false,true);
            return calls[0][0]===0.0001&&calls[0][1]===0.3&&calls[1][0]===0.0001&&calls[1][1]===0;
        }finally{audioCtx=oldAudio;masterGain=oldMaster;audioOk=oldOk;screen='end';}
    })()`);
    assert(gain,'aftermath fades through the master gain; mute stays immediate');
    console.log('PASS: medals/migration, lethal grace, frozen/skippable aftermath, pause/resume, reduced fade, keyboard/mouse/touch skip and master-gain fade/mute');
    assert.equal(errors.length,0,JSON.stringify(errors));
};
