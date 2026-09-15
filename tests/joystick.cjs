// Run: node tests/utility-poles.cjs --joystick-only
module.exports = async ({assert,game,evaluate,call,screenshot,errors}) => {
    // Chromium may coalesce touch moves until the next compositor frame.
    const touch=async(type,points=[])=>{
        await call('Input.dispatchTouchEvent',{type,touchPoints:points});
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    };
    const center=id=>game(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    for(const [w,h] of [[225,800],[360,800],[800,360],[851,393],[1024,768]]) {
        await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
        await call('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:true});
        for(const side of ['right','left']) {
            await game(`save.controls='touch';save.joystickSide=${JSON.stringify(side)};layout();startPlay();player.invuln=9999;lastBomb=1e9;spawnEvery=1e9;draw();`);
            const rects=await game(`(()=>{const r=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}};return {hud:r(hudEl),stick:r(joystickEl),jump:r(jumpBtn),pause:r(pauseBtn)}})()`);
            const overlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
            const shortLandscape=w>h&&h<=500;
            assert(rects.hud.x===(shortLandscape?7:10) && rects.hud.y===(shortLandscape?6:10),JSON.stringify({w,h,rects}));
            assert((side==='right'?w-rects.stick.right:rects.stick.x)===8&&h-rects.stick.bottom===8,'equal joystick edge margins');
            assert((side==='right'?rects.jump.x:w-rects.jump.right)===8&&h-rects.jump.bottom===8,'matching opposite-side jump margins');
            assert(rects.stick.x>=0&&rects.stick.right<=w&&rects.stick.bottom<=h);
            assert(!overlap(rects.stick,rects.jump)&&!overlap(rects.stick,rects.pause)&&!overlap(rects.hud,rects.pause),JSON.stringify({w,h,side,rects}));
            assert(!overlap(rects.jump,rects.pause),'jump does not overlap pause');
            const s=await center('joystick');
            const rad=rects.stick.w*0.3;
            await game('window.xBefore=player.x');
            await touch('touchStart',[{x:w*0.5,y:h*0.5,id:9}]);
            await touch('touchMove',[{x:w*0.75,y:h*0.3,id:9}]);
            await game('update(1/30,0)');
            assert(await game('player.x===window.xBefore&&player.grounded&&!pointer.down'),'playfield touches do not steer or jump');
            await touch('touchEnd');
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
            await touch('touchStart',[{x:s.x+rad,y:s.y,id:1}]);
            await game('sdkCallbacks.pause()');
            assert(await game('joystick.id===null&&joystick.x===0&&jumpInput.sources.size===0'));
            await touch('touchEnd');
            await game('sdkCallbacks.resume();cancelAnimationFrame(animationFrameId);animationFrameId=0;');
            await touch('touchStart',[{x:s.x+rad,y:s.y,id:1}]);
            await game('layout()');
            assert(await game('joystick.id===null&&joystick.x===0'),'resize clears stick');
            await touch('touchEnd');
            if((w===360||w===800)&&side==='right') await screenshot('joystick-'+w+'x'+h);
        }
    }
    assert(await game(`(()=>{
        applyLoadedSave({v:1,best:321,bestLevel:3,seenHowTo:true});
        const old=save.joystickSide==='right'&&save.best===321;
        for(const screenName of ['menu','pause']) {
            showScreen(screenName);save.controls='auto';syncControlsUI();
            const button=document.getElementById(screenName==='menu'?'controlsBtn':'pauseControlsBtn');
            for(const label of ['MOUSE','KEYBOARD','TOUCH RIGHT','TOUCH LEFT','AUTO']) {
                button.click();
                if(!controlButtons.every(b=>b.textContent==='Controls: '+label))return false;
            }
        }
        save.controls='touch';save.joystickSide='right';syncControlsUI();
        document.getElementById('pauseControlsBtn').click();
        const saved=JSON.parse(window.savedData);applyLoadedSave(saved);
        return old&&save.controls==='touch'&&save.joystickSide==='left'&&saved.joystickSide==='left'&&save.best===321&&!document.getElementById('stickSideBtn')&&!document.getElementById('pauseStickSideBtn');
    })()`),'combined controls cycle, legacy saves and side persistence');
    await game("save.controls='keyboard';syncControlsUI()");
    assert(await game('joystickEl.classList.contains("hidden")&&jumpBtn.classList.contains("hidden")'));
    assert.equal(errors.length,0,JSON.stringify(errors));
    console.log('PASS: both stick sides at 5 sizes, edge HUD, no overlapping controls, dead zone, movement speed, directional/held jump, multitouch, cancel/pause, save migration');
};
