// Run: node tests/mobile-ui.cjs. Reuses the loopback-only Chrome/SDK fixture.
module.exports = async function ({ assert, game, evaluate, call, screenshot, errors, source }) {
    assert(!source.includes('tutorialHint') && !source.includes('advanceTutorial'), 'automatic tutorial is removed, not just hidden');
    async function viewport(width, height, touch, insets = [0,0,0,0]) {
        await call('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 5 });
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch });
        await game(`['top','right','bottom','left'].forEach((side,i)=>document.body.style.setProperty('--safe-'+side,${JSON.stringify(insets)}[i]+'px'));
            save.controls='auto';lastControlInput=${JSON.stringify(touch?'touch':'mouse')};layout();syncControlsUI();`);
    }
    const sizes = [[225,800],[360,800],[393,851],[800,360],[851,393],[800,400],[600,800],[720,720],[1024,768],[1920,540]];
    let cases = 0;
    for (const [w,h] of sizes) {
        const safe = w > h ? [0,0,16,24] : [24,0,20,0];
        await viewport(w,h,true,safe);
        await game("startPlay();player.invuln=9999;lastBomb=1e9;spawnEvery=1e9;");
        for (let level = 1; level <= 5; level++) {
            const result = await game(`(() => {
                level=${level};player.lives=6;score=9876543;draw();
                setBanner('Level '+level+' — '+LEVEL_NAMES[level-1],2);
                const bounds=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
                const hud=bounds(hudEl),notice=bounds(bannerEl),jump=bounds(jumpBtn),pause=bounds(pauseBtn);
                return {compact:document.body.dataset.ui==='compact',hud,notice,jump,pause,
                    fits:[hudEl,hudLeft,document.getElementById('hudRight')].every(e=>e.scrollWidth<=e.clientWidth+1),
                    tutorial:!!document.getElementById('tutorialHint'),
                    middle:document.elementFromPoint(worldW/2,worldH/2).id,
                    text:hudLeft.textContent,
                    touch:!jumpBtn.classList.contains('hidden')&&!pauseBtn.classList.contains('hidden')};
            })()`);
            assert(result.compact && result.fits && !result.tutorial && result.touch,JSON.stringify({w,h,level,result}));
            assert.equal(result.middle,'gameCanvas');
            assert(result.hud.x>=safe[3] && result.hud.right<=w-safe[1] && result.hud.y>=safe[0],JSON.stringify(result));
            assert(result.notice.y>=result.hud.bottom && result.notice.bottom<h*0.45,JSON.stringify({w,h,result}));
            for(const button of [result.jump,result.pause]) {
                assert(button.w>=48 && button.h>=48 && button.h<=56 && button.x>=safe[3] && button.right<=w-safe[1]+1 && button.bottom<=h-safe[2]+1,JSON.stringify({w,h,button}));
            }
            cases++;
        }
        await game("resetRun();showScreen('play');setBanner('Level 1 — '+LEVEL_NAMES[0],2);draw();");
        if(w===360 || (w===800&&h===400)) await screenshot('mobile-ui-'+w+'x'+h);
        for (const seen of [false,true]) {
            for (const version of [1,2]) {
                assert(await game(`(() => {
                    applyLoadedSave(JSON.stringify({v:${version},best:12345,bestLevel:4,seenHowTo:${seen},controls:'touch',effects:'reduced'}));
                    startPlay();player.invuln=9999;lastBomb=1e9;spawnEvery=1e9;enemyWaves=[];giantBombWaves=[];airdropSpawned=true;
                    for(let i=0;i<150;i++)update(1/60,0);
                    return !document.getElementById('tutorialHint')&&bannerEl.classList.contains('hidden')&&save.best===12345&&save.bestLevel===4&&save.seenHowTo===${seen};
                })()`));
            }
        }
        await game("requestPause();document.getElementById('pauseHowBtn').click();");
        assert.equal(await evaluate('document.body.dataset.screen'),'howto');
        assert(await game("document.getElementById('howControls').textContent.includes('Drag to move')"));
        await game("document.getElementById('howCloseBtn').click();requestResume();");
        assert.equal(await evaluate('document.body.dataset.screen'),'play');
    }
    // Exact original desktop styling and positions remain on a normal mouse/keyboard display.
    for (const [w,h] of [[1280,720],[1920,1080],[3840,2160]]) {
        await viewport(w,h,false);
        const result = await game(`(() => {
            resetRun();showScreen('play');setBanner('Level 1 — '+LEVEL_NAMES[0],2);draw();
            const left=hudLeft.getBoundingClientRect(),mid=hudMid.getBoundingClientRect();
            return {mode:document.body.dataset.ui,border:getComputedStyle(hudLeft).borderTopWidth,
                left:left.x,top:left.y,height:left.height,center:mid.x+mid.width/2,
                jumpHidden:jumpBtn.classList.contains('hidden'),banner:getComputedStyle(bannerEl).position};
        })()`);
        assert.deepEqual([result.mode,result.border,result.left,result.top,result.height,result.jumpHidden,result.banner],['desktop','3px',10,10,40,true,'fixed']);
        assert(Math.abs(result.center-w/2)<1,JSON.stringify(result));
        if(w===1280) await screenshot('desktop-ui-1280x720');
        await game("noteControlInput('keyboard');");
        assert(await game("pauseBtn.classList.contains('hidden')&&jumpBtn.classList.contains('hidden')"));
    }
    // Rotate during a held multi-touch jump; gameplay and scenery survive the reflow.
    await viewport(360,800,true);
    await game("resetRun();showScreen('play');window.oldScore=score=123;window.poleSeed=utility.poles[1].seed;toppleUtilityPole(utility.poles[1]);");
    const jump = await game('(()=>{const r=jumpBtn.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:240,y:550,id:1},{...jump,id:2}]});
    assert(await game('!player.grounded&&pointer.down&&jumpInput.sources.size>0'));
    await game('update(1/30,0)');
    await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await viewport(800,360,true);
    assert(await game("!player.grounded&&score>=window.oldScore&&utility.poles[1].seed===window.poleSeed&&utility.poles[1].stage==='base'&&jumpInput.sources.size===0"));
    await game("requestPause();document.getElementById('restartBtn').click();");
    assert(await game("screen==='play'&&player.grounded&&level===1&&!document.getElementById('tutorialHint')"));
    assert.equal(errors.length,0,JSON.stringify(errors));
    assert(!await evaluate('sdkCalls.includes("error")'));
    console.log('PASS: '+cases+' mobile HUD layouts, safe areas, timeout notices, fresh/legacy saves, manual help, desktop styling, multitouch, rotation, restart');
};

if (require.main === module) {
    const { spawnSync } = require('node:child_process');
    const path = require('node:path');
    const result = spawnSync(process.execPath,[path.join(__dirname,'utility-poles.cjs'),'--ui-only'],{stdio:'inherit',windowsHide:true});
    if(result.error) console.error(result.error);
    process.exitCode = result.status == null ? 1 : result.status;
}
