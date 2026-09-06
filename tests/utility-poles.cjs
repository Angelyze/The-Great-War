// Dependency-free browser regression checks. Run: node tests/utility-poles.cjs
// Uses installed Chrome (or CHROME_PATH), a loopback server, and a temporary profile.
// SDK and test access are injected into the served copy only, never the shipped game.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
assert(Buffer.byteLength(source) < 512 * 1024, 'single-file size');
const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'great-war-poles-'));
const fixture = `<script>window.sdkCalls=[]; window.sdkCallbacks={}; window.ytgame={IN_PLAYABLES_ENV:true,
 game:{firstFrameReady(){sdkCalls.push('firstFrameReady')},gameReady(){sdkCalls.push('gameReady')},loadData:async()=>'',saveData:async()=>{}},
 system:{isAudioEnabled(){return false},onAudioEnabledChange(f){sdkCallbacks.mute=f},onPause(f){sdkCallbacks.pause=f},onResume(f){sdkCallbacks.resume=f}},
 engagement:{sendScore(){}},health:{logError(){sdkCalls.push('error')},logWarning(){}},
};</script>`;
const html = source.replace(/<script src="https:\/\/www.youtube.com\/game_api\/v1"><\/script>/, fixture)
    .replace('        boot();', '        window.__test = code => eval(code);\n        boot();');
const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
const errors = [];
let chrome, ws;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        '--remote-debugging-port=0', '--user-data-dir=' + path.join(artifactDir, 'profile'),
        '--window-size=1280,720', 'about:blank'
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => {
        let log = '';
        const timer = setTimeout(() => reject(new Error('Chrome startup timeout: ' + log)), 15000);
        chrome.on('error', reject);
        chrome.stderr.on('data', chunk => {
            log += chunk;
            const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
            if (m) { clearTimeout(timer); resolve(m[1]); }
        });
    });
    ws = new WebSocket(endpoint); await once(ws, 'open');
    let nextId = 0;
    const pending = new Map();
    ws.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const p = pending.get(message.id); if (!p) return;
            pending.delete(message.id);
            message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result);
        }
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    });
    function send(method, params = {}, sessionId) {
        return new Promise((resolve, reject) => {
            const id = ++nextId; pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => send(method, params, sessionId);
    await call('Runtime.enable'); await call('Page.enable');
    async function evaluate(expression) {
        const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result.value;
    }
    const game = code => evaluate('window.__test(' + JSON.stringify(code) + ')');
    await call('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port });
    for (let i = 0; i < 100; i++) {
        if (await evaluate('!!window.__test && document.body.dataset.screen === "menu"')) break;
        await delay(50);
    }
    assert.equal(await evaluate('document.body.dataset.screen'), 'menu');
    assert.deepEqual(await evaluate('sdkCalls.slice(0,2)'), ['firstFrameReady', 'gameReady']);
    await game('cancelAnimationFrame(animationFrameId); animationFrameId=0; save.seenHowTo=true;');
    const sizes = [[225,800],[360,800],[800,360],[450,800],[600,800],[720,720],[1280,720],[1680,720],[1920,540],[3840,2160]];
    let checks = 0;
    async function resize(w, h) {
        await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
        await game('layout()');
    }
    async function screenshot(name) {
        await game('draw()');
        const { data } = await call('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(artifactDir, name + '.png'), Buffer.from(data, 'base64'));
    }
    for (const [w, h] of (process.argv.includes('--stages-only') ? [] : sizes)) {
        await resize(w, h);
        const result = await game(`(() => {
            resetRun(); showScreen('play');
            const exactHeight = player.h * UTILITY_HEIGHT === player.h * 2.5;
            const intact = utility.poles.every(p => p.state === 'standing' && p.angle === 0 && p.cosmetic === 0);
            for(let i=0;i<180;i++) updateUtilityPoles(1/60,false);
            draw();
            return { exactHeight, intact, poles:utility.poles.length, wires:utility.wires.length,
                nodes:utility.wires.reduce((n,w)=>n+w.nodes.length,0),
                top:worldH-groundH+3-player.h*2.5,
                finite:utility.wires.every(w=>w.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y))),
                grounded:utility.wires.every(w=>w.nodes.every(n=>n.y<=worldH-groundH+3.1)) };
        })()`);
        assert(result.exactHeight && result.intact && result.finite && result.grounded && result.top >= 0, JSON.stringify({w,h,result}));
        assert.equal(result.poles,4); assert.equal(result.wires,10); assert.equal(result.nodes,130);
        checks++;
        if ((w===360&&h===800)||(w===1280&&h===720)) await screenshot('intact-'+w+'x'+h);

        const damage = await game(`(() => {
            const x=utility.poles[1].nx*worldW, y=worldH-groundH;
            for(let i=0;i<100;i++) damageUtilityPoles(x,y,bombBlastRadius(false),false);
            const cosmeticOnly=utility.poles.every(p=>p.structural===0&&p.state==='standing')&&utility.wires.every(w=>w.broken===-1&&w.damage===0);
            const scarred=utility.poles[1].cosmetic>0;
            damageUtilityPoles(-worldW*2,-worldH*2,bombBlastRadius(true),true);
            const distantSafe=utility.poles.every(p=>p.structural===0);
            explode(x,y,true,true);
            const directFall=utility.poles[1].state==='falling';
            for(let i=0;i<600;i++) updateUtilityPoles(1/120,true);
            const settled=utility.poles[1].state==='fallen';
            const grounded=utility.wires.every(w=>w.nodes.every(n=>n.y<=worldH-groundH+3.1));
            return {cosmeticOnly,scarred,distantSafe,directFall,settled,grounded};
        })()`);
        assert(Object.values(damage).every(Boolean), JSON.stringify({w,h,damage})); checks++;

        for (const reduced of [false,true]) {
            const progression = await game(`(() => {
                resetRun(); save.effects=${JSON.stringify(reduced?'reduced':'full')};
                let early=0;
                for(let i=0;i<300*30;i++) {
                    runTime=i/30;
                    updateUtilityPoles(1/30,true);
                    if(i===59*30) early=utility.poles.filter(p=>p.state!=='standing').length;
                }
                draw();
                return {early,fallen:utility.poles.filter(p=>p.state==='fallen').length,
                    broken:utility.wires.filter(w=>w.broken>=0).length,
                    ground:utility.wires.every(w=>w.nodes.every(n=>n.y<=worldH-groundH+3.1)),
                    bounded:particles.length<=MAX_PARTICLES&&utility.wires.every(w=>w.nodes.length===13),
                    resting:utility.poles.filter(p=>p.state==='fallen').every(p=>Math.abs(utilityLowestPoint(p,p.angle))<0.001)};
            })()`);
            assert.equal(progression.early,0);
            assert.equal(progression.fallen,3,JSON.stringify({w,h,reduced,progression}));
            assert(progression.broken>0 && progression.ground && progression.bounded && progression.resting,JSON.stringify({w,h,reduced,progression}));
            checks++;
            if (!reduced && ((w===360&&h===800)||(w===1280&&h===720))) {
                await game('level=5; backgroundFrom=4;backgroundTo=4;backgroundBlend=1;buildSceneryCache();');
                await screenshot('ruined-'+w+'x'+h);
            }
        }
    }
    console.log('PASS: '+checks+' viewport/damage/progression cases');

    // Destruction stages preserve every original section, including when struck mid-fall.
    for (const [w,h] of [[225,800],[360,800],[800,360],[1280,720],[3840,2160]]) {
        await resize(w,h);
        for (const reduced of [false,true]) {
            const stages = await game(`(() => {
                resetRun();showScreen('play');save.effects=${JSON.stringify(reduced?'reduced':'full')};
                const p=utility.poles[1],x=p.nx*worldW,y=worldH-groundH,r=bombBlastRadius(true);
                const edgeLines=utility.wires.filter(w=>w.left===-1&&w.nodes[0].x<0).length===2&&utility.wires.filter(w=>w.right===4&&w.nodes[12].x>worldW).length===2;
                damageUtilityPoles(x+r*0.55,y,r,true);
                const middle=p.stage==='middle'&&p.parts.length===2;
                for(let i=0;i<100;i++)damageUtilityPoles(x,y,bombBlastRadius(false),false);
                const normalsSafe=p.stage==='middle'&&p.parts.length===2;
                for(let i=0;i<45;i++)updateUtilityPoles(1/120,true);
                const upper=p.parts[1],pose=[upper.x,upper.y,upper.angle];
                damageUtilityPoles(x+r*0.55,y,r,true);
                const base=p.stage==='base'&&p.parts.length===3;
                const preserved=p.parts[2]===upper&&pose.every((v,i)=>Math.abs(v-[upper.x,upper.y,upper.angle][i])<0.0001);
                for(let i=0;i<600;i++)updateUtilityPoles(1/120,true);
                damageUtilityPoles(x,y,r,true);
                const released=p.stage==='ground'&&p.parts.every(part=>part.mobile);
                for(let i=0;i<900;i++)updateUtilityPoles(1/120,true);
                // Crossarms/transformers can prop a grounded shaft slightly above horizontal.
                const flat=p.state==='fallen'&&p.parts.every(part=>Math.max(-part.y,-part.y+Math.cos(part.angle)*(part.hi-part.lo))<0.18);
                const material=Math.abs(p.parts.reduce((sum,part)=>sum+part.hi-part.lo,0)-1)<0.00001;
                const ground=utilityLowestPoint(p)<=0.001&&utility.wires.every(w=>w.nodes.every(n=>n.y<=worldH-groundH+3.1));
                const bounded=utility.poles.every(p=>p.parts.length<=3)&&utility.wires.length===10;
                draw();
                return {edgeLines,middle,normalsSafe,base,preserved,released,flat,material,ground,bounded,parts:p.parts.map(q=>[q.lo,q.hi,q.angle,q.x,q.y,q.settled])};
            })()`);
            for(const key of ['edgeLines','middle','normalsSafe','base','preserved','released','flat','material','ground','bounded']) assert(stages[key],JSON.stringify({w,h,reduced,key,stages}));
        }
    }
    await resize(1280,720);
    await game(`resetRun();showScreen('play');
        toppleUtilityPole(utility.poles[0],undefined,'middle');
        toppleUtilityPole(utility.poles[1],undefined,'base');
        toppleUtilityPole(utility.poles[2],undefined,'middle');toppleUtilityPole(utility.poles[2],undefined,'base');toppleUtilityPole(utility.poles[2],undefined,'ground');
        for(let i=0;i<1200;i++)updateUtilityPoles(1/120,false);level=3;backgroundFrom=2;backgroundTo=2;backgroundBlend=1;draw();`);
    await screenshot('fracture-stages-1280x720');
    console.log('PASS: offscreen spans and middle/base/ground stages at 5 sizes in full/reduced modes');

    // Preserve identity, deadlines, angles and broken attachments through a live reflow.
    await resize(360,800);
    await game(`resetRun();save.effects='full';toppleUtilityPole(utility.poles[1]);for(let i=0;i<50;i++)updateUtilityPoles(1/120,true);
        toppleUtilityPole(utility.poles[2],undefined,'middle');toppleUtilityPole(utility.poles[2],undefined,'base');
        breakUtilityWire(utility.wires[2],5);window.beforePoles=utility.poles.map(p=>[p.seed,p.state,p.angle,p.deadline,p.stage,p.parts]);window.beforeBreaks=utility.wires.map(w=>w.broken);
        window.beforePoles=JSON.stringify(window.beforePoles);`);
    await resize(1280,720);
    assert(await game(`window.beforePoles===JSON.stringify(utility.poles.map(p=>[p.seed,p.state,p.angle,p.deadline,p.stage,p.parts])) && JSON.stringify(window.beforeBreaks)===JSON.stringify(utility.wires.map(w=>w.broken))`));
    assert(await game(`utility.wires.every(w=>Math.hypot(w.nodes[0].x-w.a.x,w.nodes[0].y-w.a.y)<0.001&&Math.hypot(w.nodes[12].x-w.b.x,w.nodes[12].y-w.b.y)<0.001)`));
    await game('for(let i=0;i<600;i++)updateUtilityPoles(1/120,true)');
    assert.equal(await game('utility.poles[1].state'),'fallen');

    assert(await game(`(() => {
        const snapshot=()=>JSON.stringify([utility.time,utility.poles.map(p=>[p.angle,p.state]),utility.wires.map(w=>w.nodes)]);
        showScreen('pause');const a=snapshot();update(1/30,0);const paused=a===snapshot();
        showScreen('play');sdkCallbacks.pause();const b=snapshot();updateUtilityPoles(1/30,true);const platform=b===snapshot();
        sdkCallbacks.resume();cancelAnimationFrame(animationFrameId);animationFrameId=0;
        ended=true;const c=snapshot();update(1/30,0);const end=c===snapshot();
        resetRun();return paused&&platform&&end&&utility.poles.every(p=>p.state==='standing')&&utility.wires.every(w=>w.broken===-1);
    })()`));

    assert(await game(`(() => {
        resetRun();showScreen('play');player.invuln=9999;spawnEvery=1e9;lastBomb=1e9;
        spawnEnemy(true);const en=enemies[0];en.x=-10000;const fireEvery=en.fireEvery, bulletSpeed=en.bulletSpeed;
        spawnBomb(false);const bomb=bombs[0];bomb.y=-bomb.h;spawnAirdrop();const drop=airdrops[0];
        toppleUtilityPole(utility.poles[2]);const pole=utility.poles[2];timeLeft=0.001;
        update(1/60,0);
        return level===2&&enemies.includes(en)&&bombs.includes(bomb)&&airdrops.includes(drop)&&en.fireEvery===fireEvery&&en.bulletSpeed===bulletSpeed&&utility.poles[2]===pole&&pole.state==='falling';
    })()`));

    assert(await game(`(() => {
        resetRun();showScreen('play');level=5;timeLeft=0.001;spawnEvery=1e9;lastBomb=1e9;player.invuln=9999;
        spawnBomb(false);const bomb=bombs[0];bomb.x=worldW-bomb.w;const y=bomb.y;
        update(1/60,0);const grace=awaitingVictory&&!ended&&bombs.includes(bomb)&&bomb.y>y;
        enemyWaves=[{at:0,sides:[true],spawned:false}];giantBombWaves=[{at:0,spawned:false}];airdropSpawned=false;airdropAt=0;
        for(let i=0;i<290;i++)update(1/60,i*16);
        const waiting=!ended&&enemies.length===0&&airdrops.length===0&&!giantBombWaves[0].spawned;
        for(let i=0;i<15;i++)update(1/60,i*16);
        const won=ended&&victory;
        resetRun();showScreen('play');level=5;timeLeft=0.001;update(1/60,0);player.lives=1;player.invuln=0;hitPlayer(1,player.x);
        return grace&&waiting&&won&&ended&&!victory;
    })()`));

    await resize(1280,720);
    assert(await game(`(() => {
        resetRun();showScreen('play');save.effects='full';
        const w=utility.wires[2],n=w.nodes[6];
        for(let i=0;i<100;i++)damageUtilityPoles(n.x,n.y,bombBlastRadius(false),false);
        const regular=w.broken===-1&&w.damage===0&&w.cosmetic>0;
        damageUtilityPoles(n.x,n.y,bombBlastRadius(true),true);
        const length=w.lengths.reduce((sum,l,j)=>sum+(j===w.broken?0:l),0);
        const sameCut=w.broken>=0&&w.nodes[w.broken].x===w.nodes[w.broken+1].x&&w.nodes[w.broken].y===w.nodes[w.broken+1].y;
        return regular&&sameCut&&Math.abs(length-w.restLength)<0.001;
    })()`));
    const motion = await game(`(() => {
        const measure=(mode)=>{
            resetRun();save.effects=mode;
            for(let i=0;i<1200;i++)updateUtilityPoles(1/120,false);
            let distance=0;
            for(let i=0;i<480;i++){
                const n=utility.wires[2].nodes[6],x=n.x,y=n.y;
                updateUtilityPoles(1/120,false);distance+=Math.hypot(n.x-x,n.y-y);
            }
            return distance;
        };
        return {full:measure('full'),reduced:measure('reduced')};
    })()`);
    assert(motion.full>0.01 && motion.reduced<motion.full, JSON.stringify(motion));
    console.log('Cable movement over 4 seconds: '+JSON.stringify(motion));
    const performance = await game(`(() => {
        resetRun();save.effects='full';draw();
        const cache=utility.poles.map(p=>p.cache);
        const started=performance.now();
        for(let i=0;i<600;i++){updateUtilityPoles(1/60,false);drawUtilityPoles();}
        const elapsed=performance.now()-started;
        return {msPerFrame:elapsed/600,cacheStable:utility.poles.every((p,i)=>p.cache===cache[i]),nodes:utility.wires.reduce((n,w)=>n+w.nodes.length,0)};
    })()`);
    assert(performance.cacheStable && performance.nodes===130);
    console.log('Desktop headless utility update/draw: '+performance.msPerFrame.toFixed(3)+' ms/frame (not a mobile benchmark)');

    // Real browser input dispatch: scenery must not intercept gameplay controls.
    await game("resetRun();showScreen('play');save.controls='keyboard';syncControlsUI();window.inputStart=player.x;");
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await game('update(1/30,0)');
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    assert(await game('player.x>window.inputStart'));
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert(await game('!player.grounded'));
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await game("resetRun();showScreen('play');save.controls='mouse';syncControlsUI();");
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x:900,y:350,button:'left',clickCount:1});
    assert(await game('!player.grounded&&pointer.down'));
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:900,y:350,button:'left',clickCount:1});
    await resize(360,800);
    await game("resetRun();showScreen('play');save.controls='touch';syncControlsUI();");
    const jump = await game('(()=>{const r=jumpBtn.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:600,id:1},{...jump,id:2}]});
    assert(await game('!player.grounded&&pointer.down'));
    await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(errors.length,0,JSON.stringify(errors));
    assert(!await evaluate('sdkCalls.includes("error")'));
    console.log('PASS: resize, attachments, pause/platform/end, restart, level persistence, final grace, death, cable cuts, reduced motion, bounded caches, keyboard/mouse/multitouch');
    console.log('Single-file size: '+Buffer.byteLength(source)+' bytes');
    console.log('Screenshots: '+artifactDir);
})().catch(error => { console.error(error);console.error('Artifacts: '+artifactDir);process.exitCode=1; }).finally(() => {
    if(ws)ws.close();if(chrome)chrome.kill();server.close();
});
