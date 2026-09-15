// Run: node tests/utility-poles.cjs --menu-audio-only
module.exports = async ({ assert, game, evaluate, call, errors, resize }) => {
    await game(`audioOk=true;showScreen('menu');window.menuSounds=0;
        window.originalConnect=AudioNode.prototype.connect;
        AudioNode.prototype.connect=function(target,...args){
            if(target===menuGain)window.menuSounds++;
            return originalConnect.call(this,target,...args);
        };`);
    async function activate(id,input) {
        const p=await evaluate(`(()=>{const b=document.getElementById(${JSON.stringify(id)});b.scrollIntoView({block:'center'});b.focus();const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        if(input==='mouse') {
            await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
            await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
        } else if(input==='touch') {
            await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
            await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        } else {
            const key=input==='space'?' ':'Enter',code=input==='space'?32:13;
            await call('Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code,text:input==='space'?' ':'\r'});
            await call('Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code});
        }
        // Allow the first gesture to resume Web Audio before checking the scheduled sound.
        await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
    }
    const cases=[['menu','challengeBtn'],['menu','controlsBtn'],['menu','fxBtn'],['menu','guidesBtn'],
        ['menu','howBtn'],['howto','howCloseBtn'],['menu','playBtn'],['play','pauseBtn'],
        ['pause','resumeBtn'],['pause','restartBtn'],['pause','pauseHowBtn'],['pause','pauseControlsBtn'],
        ['pause','pauseFxBtn'],['pause','pauseGuidesBtn'],['aftermath','resultsBtn'],['end','againBtn'],['end','endMenuBtn']];
    for(const input of ['mouse','touch','enter','space']) {
        await resize(input==='touch'?360:1280,input==='touch'?800:720);
        await call('Emulation.setTouchEmulationEnabled',{enabled:input==='touch',maxTouchPoints:5});
        for(const [screen,id] of cases) {
            await game(`stopAmbience();userPaused=${screen==='pause'};save.controls='mouse';showScreen(${JSON.stringify(screen)});window.menuSounds=0;`);
            await activate(id,input);
            assert.equal(await evaluate('menuSounds'),1,input+' '+id+' plays once');
        }
    }
    await game(`stopAmbience();showScreen('menu');window.menuSounds=0;audioCtx.suspend();`);
    await activate('guidesBtn','mouse');
    assert.equal(await evaluate('menuSounds'),1,'suspended audio resumes on activation');
    assert(await game(`masterGain.gain.value<0.001&&menuGain.gain.value>0.7`),'menu sound does not unmute gameplay');
    for(const mode of ['mute','pause','disabled']) {
        await game(`showScreen('menu');window.menuSounds=0;`);
        if(mode==='mute') await game('sdkCallbacks.mute(false)');
        if(mode==='pause') await game('sdkCallbacks.pause()');
        if(mode==='disabled') await game("document.getElementById('guidesBtn').disabled=true");
        await activate('guidesBtn','mouse');
        assert.equal(await evaluate('menuSounds'),0,mode+' is silent');
        if(mode!=='disabled') assert.equal(await game('menuGain.gain.value'),0,mode+' mutes menu bus');
        await game("document.getElementById('guidesBtn').disabled=false;sdkCallbacks.mute(true);sdkCallbacks.resume();cancelAnimationFrame(animationFrameId);animationFrameId=0;");
    }
    await game('AudioNode.prototype.connect=originalConnect;stopAmbience();');
    assert.equal(errors.length,0,JSON.stringify(errors));
    console.log('PASS: all 17 menu/pause buttons on mouse, touch, Enter and Space; one sound per activation; suspended audio, mute, platform pause and disabled buttons');
};
