// Run: node tests/utility-poles.cjs --joystick-only
module.exports = async ({assert,game,evaluate,call,screenshot,errors}) => {
    const touch=(type,points=[])=>call('Input.dispatchTouchEvent',{type,touchPoints:points});
    const center=id=>game(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    for(const [w,h] of [[225,800],[360,800],[800,360],[851,393],[1024,768]]) {
        await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
        await call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
        for(const side of ['right','left']) {
            await game(`save.controls='touch';save.joystickSide=${JSON.stringify(side)};layout();startPlay();player.invuln=9999;lastBomb=1e9;spawnEvery=1e9;draw();`);
            const rects=await game(`(()=>{const r=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}};return {hud:r(hudEl),stick:r(joystickEl),jump:r(jumpBtn),pause:r(pauseBtn)}})()`);
            const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
            assert(rects.hud.x<=9 && rects.hud.y<=7,JSON.stringify(rects));
            assert(rects.stick.x>=0&&rects.stick.right<=w&&rects.stick.bottom<=h);
            assert(!overlap(rects.stick,rects.jump)&&!overlap(rects.stick,rects.pause)&&!overlap(rects.hud,rects.pause),JSON.stringify({w,h,side,rects}));
            assert(rects.jump.x<30,'jump stays left');
            const s=await center('joystick');
            const rad=rects.stick.w*0.3;
            await touch('touchStart',[{...s,id:1}]);
            await game('window.xBefore=player.x;update(1/30,0)');
            assert(await game('player.x===window.xBefore'),'neutral stick');
            await touch('touchMove',[{x:s.x+rad,y:s.y,id:1}]);
            assert(await game('joystick.x===1'));
            assert(await game('(()=>{const x=player.x;update(1/30,0);return Math.abs(player.x-x-worldW*.24/30)<.001})()'),'normal run speed');
            await touch('touchMove',[{x:s.x-rad,y:s.y-rad,id:1}]);
            assert(await game("joystick.x===-1&&!player.grounded&&jumpInput.sources.has('joystick')"),JSON.stringify({w,h,side,diag:await game('({stick:joystick,grounded:player.grounded,sources:[...jumpInput.sources],mode:activeControlMode()})')}));
            await game('for(let i=0;i<80;i++)update(1/60,0)');
            assert(await game('player.grounded'),'holding up does not auto-hop');
            await touch('touchMove',[{...s,id:1}]);
            await touch('touchMove',[{x:s.x,y:s.y-rad,id:1}]);
            assert(await game('!player.grounded'),'fresh upward push jumps again');
            await touch('touchEnd');
            assert(await game("joystick.id===null&&joystick.x===0&&!jumpInput.sources.has('joystick')"));
            await game('resetRun();showScreen("play");');
            const jump=await center('jumpBtn');
            await touch('touchStart',[{...s,id:1},{...jump,id:2}]);
            await touch('touchMove',[{x:s.x+rad,y:s.y,id:1},{...jump,id:2}]);
            assert(await game("joystick.x===1&&!player.grounded&&jumpInput.sources.has('jumpButton')"),'multitouch jump and stick');
            await touch('touchCancel');
            assert(await game('joystick.id===null&&jumpInput.sources.size===0'));
            await touch('touchStart',[{x:s.x+rad,y:s.y,id:1}]);
            await game('requestPause()');
            assert(await game('joystick.id===null&&joystick.x===0&&joystickEl.classList.contains("hidden")'));
            await touch('touchEnd');
            await game('requestResume();draw()');
            if((w===360||w===800)&&side==='right') await screenshot('joystick-'+w+'x'+h);
        }
    }
    assert(await game(`(()=>{applyLoadedSave({v:1,best:321,bestLevel:3,seenHowTo:true});const old=save.joystickSide==='right'&&save.best===321;showScreen('pause');document.getElementById('pauseStickSideBtn').click();const saved=JSON.parse(window.savedData);applyLoadedSave(saved);return old&&save.joystickSide==='left'&&saved.joystickSide==='left'&&save.best===321})()`),'save migration and side persistence');
    await game("save.controls='keyboard';syncControlsUI()");
    assert(await game('joystickEl.classList.contains("hidden")&&jumpBtn.classList.contains("hidden")'));
    assert.equal(errors.length,0,JSON.stringify(errors));
    console.log('PASS: both stick sides at 5 sizes, edge HUD, no overlapping controls, dead zone, movement speed, directional/held jump, multitouch, cancel/pause, save migration');
};
