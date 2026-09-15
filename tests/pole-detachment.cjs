// Run: node tests/utility-poles.cjs --detachment-only
module.exports = async ({ assert, game, errors, resize, screenshot }) => {
    for(const [w,h] of [[360,800],[800,360],[1280,720]]) for(const reduced of [false,true]) {
        await resize(w,h);
        const result=await game(`(()=>{
            startPlay();save.effects=${JSON.stringify(reduced?'reduced':'full')};
            const p=utility.poles[1],height=player.h*UTILITY_HEIGHT;
            p.baseBreak=0.2;p.middleBreak=0.55;p.deadline=Infinity;
            const x=p.nx*worldW,y=groundAt(x)+3-height*0.7,r=height*0.15;
            const hit=()=>damageUtilityPoles(x,y,r,true);
            const lives=player.lives,points=score;
            hit();const first=p.directGiantHits===1&&p.parts.length===2&&p.parts[1].crackDamage===0&&!p.parts.some(q=>q.detached);
            hit();const second=p.directGiantHits===2&&p.parts.length===2&&p.parts[1].detached;
            const cut=p.parts[1],before={x:cut.x,y:cut.y};
            for(let i=0;i<1200;i++)updateUtilityPoles(1/120,false);
            const moved=Math.hypot(cut.x-before.x,cut.y-before.y)>0.01;
            const finite=p.parts.every(q=>[q.x,q.y,q.angle].every(Number.isFinite));
            const supported=utilityLowestPoint(p)<0.003;
            const cables=utility.wires.filter(w=>w.left===p.id||w.right===p.id).every(w=>w.broken>=0);
            const conserved=Math.abs(p.parts.reduce((sum,q)=>sum+q.hi-q.lo,0)-1)<0.00001;
            const gameplay=player.lives===lives&&score===points&&enemies.length===0&&bombs.length===0;
            window.detachmentSnapshot=JSON.stringify(p.parts.map(q=>[q.lo,q.hi,q.detached,q.crackOrder,q.crackDamage]));
            return {first,second,moved,finite,supported,cables,conserved,gameplay,depth:utilityLowestPoint(p)};
        })()`);
        assert(Object.entries(result).filter(([key])=>key!=='depth').every(([,value])=>value),JSON.stringify({w,h,reduced,result}));
        if(w===1280&&!reduced) await screenshot('detached-second-hit');
        await resize(h,w);
        assert(await game(`detachmentSnapshot===JSON.stringify(utility.poles[1].parts.map(q=>[q.lo,q.hi,q.detached,q.crackOrder,q.crackDamage]))`),'resize preserves cracks and detachment');
        assert(await game(`(()=>{const p=utility.poles[1],before=JSON.stringify(p.parts);platformPaused=true;updateUtilityPoles(1,false);platformPaused=false;const paused=before===JSON.stringify(p.parts);resetRun();return paused&&utility.poles.every(p=>p.directGiantHits===0&&p.parts.length===1&&!p.parts[0].detached);})()`),'pause and restart');
    }
    await resize(1280,720);
    for(const distance of [0.4,0.7,0.9,0.99]) {
        const indirect=await game(`(()=>{
            startPlay();const p=utility.poles[1],h=player.h*UTILITY_HEIGHT,x=p.nx*worldW,y=groundAt(x)+3-h*0.7,r=h*0.1;
            damageUtilityPoles(x,y,r,true);
            const expected=Math.ceil(1/(0.3+(1-${distance})*0.9));
            let early=false;
            for(let i=1;i<=expected;i++){
                damageUtilityPoles(x+r*${distance},y,r,true);
                if(i<expected&&p.parts.some(q=>q.detached))early=true;
            }
            return {expected,early,direct:p.directGiantHits,detached:p.parts.filter(q=>q.detached).map(q=>q.crackOrder)};
        })()`);
        assert(!indirect.early&&indirect.direct===1&&indirect.detached.length===1&&indirect.detached[0]===1,JSON.stringify({distance,indirect}));
        console.log('PASS: '+indirect.expected+' indirect giant hits after cracking at '+distance+' blast radii');
    }
    const aging=await game(`(()=>{
        startPlay();const p=utility.poles[1],h=player.h*UTILITY_HEIGHT,x=p.nx*worldW,y=groundAt(x)+3-h*0.7,r=h*0.1;
        damageUtilityPoles(x,y,r,true);
        for(let i=0;i<10;i++)damageUtilityPoles(x,y,r,false);
        const regular=p.directGiantHits===1&&p.parts[1].crackDamage===0&&!p.parts.some(q=>q.detached);
        damageUtilityPoles(x+r*0.8,y,r,true);
        const fresh=p.parts.length===3&&p.parts[1].crackDamage===0&&!p.parts.some(q=>q.detached);
        damageUtilityPoles(x,y,r,true);
        const oldest=p.parts[2].detached&&!p.parts[1].detached;
        resetRun();const single=utility.poles[1];const gx=single.nx*worldW,gy=groundAt(gx)+3;
        for(let i=0;i<2;i++)damageUtilityPoles(gx,gy,r,true);
        const base=single.directGiantHits===2&&single.parts[1].detached;
        return {regular,fresh,oldest,base};
    })()`);
    assert(Object.values(aging).every(Boolean),JSON.stringify(aging));
    assert(await game(`(()=>{
        startPlay();const p=utility.poles[1],h=player.h*UTILITY_HEIGHT,x=p.nx*worldW,r=h*0.1;
        const y=groundAt(x)+3-h*0.7;
        damageUtilityPoles(x,y,r,true);
        damageUtilityPoles(x+r*0.8,y,r,true);
        damageUtilityPoles(x,y,r,true);
        const crown=p.parts[2],pose=[crown.x,crown.y,crown.angle];
        damageUtilityPoles(x,groundAt(x),r,true);
        const independent=p.parts[1].detached&&crown.detached&&pose.every((v,i)=>v===[crown.x,crown.y,crown.angle][i]);
        for(let i=0;i<terrainDepth.length;i++)terrainDepth[i]=0.2+0.15*Math.sin(i*0.08);
        terrainRevision++;
        for(let i=0;i<2400;i++)updateUtilityPoles(1/120,false);
        return independent&&utilityLowestPoint(p)<0.003&&p.parts.length===3&&p.parts.every(q=>[q.x,q.y,q.angle].every(Number.isFinite));
    })()`),'successive detached sections remain independent and settle on uneven terrain');
    assert.equal(errors.length,0,JSON.stringify(errors));
    console.log('PASS: second direct giant hit, accumulated indirect damage, oldest-crack priority and no same-hit detachment; falling pieces, cables, ground, resize, pause, restart and gameplay isolation at 3 sizes in full/reduced FX');
};
