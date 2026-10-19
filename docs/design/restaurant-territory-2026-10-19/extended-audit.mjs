import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
const root=path.resolve(process.argv[2] ?? process.cwd());
const output=path.resolve(process.argv[3] ?? 'extended-results.json');
const cache=new Map();
function url(rel) {
 if(cache.has(rel)) return cache.get(rel);
 let p=path.join(root,rel), text=fs.readFileSync(p,'utf8');
 if(rel.endsWith('.json')) text='export default '+text+';';
 else text=stripTypeScriptTypes(text,{mode:'strip'});
 text=text.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,q,s)=> {
  let next=path.normalize(path.join(path.dirname(rel),s));
  if(!path.extname(next)) next+='.ts';
  return 'from '+JSON.stringify(url(next));
 });
 const out='data:text/javascript;base64,'+Buffer.from(text).toString('base64'); cache.set(rel,out); return out;
}
const E=await import(url('shared/restaurant/engine.ts'));
const C=await import(url('src/restaurant/v3.ts'));
const S=await import(url('src/doodle/storage.ts'));
let n=0,now=100000; const realNow=Date.now; Date.now=()=>now;
class Memory {
 data=new Map(); failBackup=false; failAll=false; failRead=false; silent=false;
 getItem(k){if(this.failRead)throw Error('blocked'); return this.data.get(k)??null;}
 setItem(k,v){if(this.failAll||(this.failBackup&&k.includes('.backup-')))throw Error('quota');if(!this.silent)this.data.set(k,v);}
}
function env(m){globalThis.localStorage=m;globalThis.window={localStorage:m,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:true})};globalThis.document={documentElement:{hasAttribute:()=>false}};}
function act(s,op){const r=E.apply(s,{...op,id:'audit-'+n++});assert.equal(r.error,undefined);return r.s;}
function buy(s=E.newGuided()){s=act(s,{t:'toBuy'});return act(s,{t:'purchase',packs:Object.fromEntries(E.buyRows(s).map(x=>[x.item,x.suggested]))});}
function cook(s,d){return act(s,{t:'cook',dish:d,items:E.panItems(d)});}
function play(s){while(s.phase==='serve'){const order=E.currentOrders(s).find(i=>s.orders[i].status==='pending');const ready=E.suitable(s,order);const can=E.cookable(s,order);if(!ready.length&&can.length)s=cook(s,can[0]);s=act(s,{t:'serve',order,dish:E.suitable(s,order)[0]??null});}return s;}
const rows=[]; function test(name,f){try{f();rows.push({name,pass:true})}catch(e){rows.push({name,pass:false,error:e.message});}}
function ctl(m){env(m);now+=1000;return new C.V3Controller(m);}

Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
const F=await import(url('shared/territory/flow.ts'));
const Classic=await import(url('src/restaurant/game.ts'));
const seeded=(s=buy())=>{const m=new Memory();m.data.set(C.V3_KEY,JSON.stringify({...C.blankV3(),state:s}));return m;};
const persisted=m=>JSON.parse(m.getItem(C.V3_KEY));
test('S1: delayed event stale draft does not erase cooked meal',()=>{
 const m=seeded(),a=ctl(m),b=ctl(m);b.dispatch({t:'cook',dish:'tomato_egg_rice',items:['rice','egg','tomato']});
 a.update({draft:{dish:'tomato_egg_rice',items:['rice']}});
 assert.equal(a.conflict,true);assert.equal(persisted(m).state.servings.length,1);assert.equal(E.available(persisted(m).state).egg,5);
});
test('S2: no Web Locks, interleaved read/write must preserve cooked meal',()=>{
 const m=seeded(),a=ctl(m),b=ctl(m),original=m.getItem.bind(m);let armed=true;
 m.getItem=k=>{const value=original(k);if(armed&&k===C.V3_KEY){armed=false;b.dispatch({t:'cook',dish:'tomato_egg_rice',items:['rice','egg','tomato']});}return value;};
 a.update({draft:{dish:'tomato_egg_rice',items:['rice']}});
 assert.equal(persisted(m).state.servings.length,1,'without Web Locks, B commits between A read and write; A erases meal');
});
test('S3: delayed older storage event must not roll back a newer local payment',()=>{
 const m=seeded(),a=ctl(m),b=ctl(m);
 b.dispatch({t:'cook',dish:'tomato_egg_rice',items:['rice','egg','tomato']});const older=m.getItem(C.V3_KEY);
 a.update({draft:{dish:'tomato_egg_rice',items:['rice']}});assert.equal(a.conflict,true);
 now+=1000;a.dispatch({t:'serve',order:0,dish:'tomato_egg_rice'});assert.equal(a.v.state.cash,415);
 a.onStorage({key:C.V3_KEY,newValue:older}); // queued event from B arrives after A adopted and paid
 assert.equal(persisted(m).state.cash,415);assert.equal(a.v.state.cash,415,'disk is 415 but late storage event restores UI to 383');
});
test('S4: Web Locks serializes same-base changes and rejects stale update',()=>{
 const m=seeded(),a=ctl(m),b=ctl(m);const q=[];
 navigator.locks={request:(_name,fn)=>{q.push(fn);return Promise.resolve();}};
 b.dispatch({t:'cook',dish:'tomato_egg_rice',items:['rice','egg','tomato']});a.update({draft:{dish:'tomato_egg_rice',items:['rice']}});
 assert.equal(q.length,2);q.shift()();q.shift()();
 assert.equal(persisted(m).state.servings.length,1);assert.equal(a.conflict,true);delete navigator.locks;
});
delete navigator.locks;
test('S5: restarting completed day keeps summary and leaves classic raw untouched',()=>{
 const m=seeded(act(play(buy()),{t:'decor',buy:true}));m.data.set(C.CLASSIC_KEY,'old classic raw');
 const c=ctl(m);c.restart();const p=persisted(m);
 assert.equal(p.state.cash,500);assert.deepEqual(p.history,[{soldCount:6,result:34,cashClose:414,decor:120}]);assert.equal(m.getItem(C.CLASSIC_KEY),'old classic raw');
});
test('S6: classic backup failure preserves original and uses alternate',()=>{
 const m=new Memory();m.data.set(Classic.KEY,'broken-classic-r');m.failBackup=true;env(m);const c=new Classic.RestaurantController();c.dispatch({t:'toBuy'});
 assert.equal(m.getItem(Classic.KEY),'broken-classic-r');assert.equal(c.saveState,'saved');assert.ok(m.getItem(Classic.KEY+'.recovered'));
});
function solo(seed=1){const g=new F.FlowGame({width:40,height:40,durationTicks:0,seed});g.addPlayer('a','A',false);g.start();return g;}
test('T1: 30,45,120 degrees follow actual headings at equal speed',()=>{
 for(const deg of [0,30,45,120]){const g=solo(),a=deg*Math.PI/180;g.flow[0].heading=a;g.setTarget(0,a);const x=g.flow[0].fx,y=g.flow[0].fy;
 for(let i=0;i<6;i++)g.step();const dx=g.flow[0].fx-x,dy=g.flow[0].fy-y;
 assert.ok(Math.abs(F.wrapAngle(Math.atan2(dy,dx)-a))<1e-9);assert.ok(Math.abs(Math.hypot(dx,dy)-3)<1e-9);}
});
test('T2: reverse target rotates at most 13.5 degrees per step',()=>{
 const g=solo();g.flow[0].heading=0;g.setTarget(0,Math.PI);g.step();assert.ok(Math.abs(Math.abs(g.flow[0].heading)-13.5*Math.PI/180)<1e-9);
});
test('T3: invalid angle is ignored without moving player',()=>{
 const g=solo(),x=g.flow[0].fx;assert.equal(g.setTarget(0,NaN),false);assert.equal(g.setTarget(0,Infinity),false);assert.equal(g.setTarget(99,1),false);assert.equal(g.flow[0].fx,x);
});
test('T4: diagonal loop returns home and captures territory',()=>{
 const g=solo(3),p=g.players[0],f=g.flow[0],home={x:f.fx,y:f.fy},land=p.land,a=Math.atan2(20-f.fy,20-f.fx);f.heading=a;g.setTarget(0,a);
 for(let k=0;k<8&&p.alive;k++){g.setTarget(0,a+k*Math.PI/4);for(let j=0;j<9&&p.alive;j++)g.step();}
 for(let j=0;j<200&&p.trail.length&&p.alive;j++){g.setTarget(0,Math.atan2(home.y-f.fy,home.x-f.fx));g.step();}
 assert.equal(p.alive,true);assert.equal(p.trail.length,0);assert.ok(p.land>land+40);
});
test('T5: self-cross and wall terminate correctly',()=>{
 const g=solo(5),p=g.players[0],f=g.flow[0],a=Math.atan2(20-f.fy,20-f.fx);f.heading=a;g.setTarget(0,a);for(let j=0;j<16;j++)g.step();
 for(const [da,n] of [[Math.PI/2,10],[Math.PI,12],[3*Math.PI/2,30]]){g.setTarget(0,a+da);for(let j=0;j<n&&p.alive;j++)g.step();}
 assert.equal(p.reason,'self');const wall=solo();wall.flow[0].heading=-Math.PI/2;wall.setTarget(0,-Math.PI/2);for(let j=0;j<200&&wall.players[0].alive;j++)wall.step();assert.equal(wall.players[0].reason,'wall');
});
test('T6: repeated seeded input sequence gives identical result',()=>{
 const run=()=>{const g=new F.FlowGame({width:40,height:40,durationTicks:0,seed:7});g.addPlayer('a','A',false);g.addPlayer('b','B',false);g.start();for(let i=0;i<400&&!g.result;i++){g.setTarget(0,.3+Math.sin(i/9));g.setTarget(1,2.1+Math.cos(i/7));g.step();}return {tick:g.tick,p:g.players,owner:Array.from(g.owner)};};assert.deepEqual(run(),run());
});
Date.now=realNow;
const out={source:process.argv[4] ?? 'working-tree',baseline:'83d0cca05c10dede67d6e049b40cefcea94d7361',method:'isolated exact source with memory storage, queued Web Locks and controlled cross-context interleaving',passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length,rows};
fs.writeFileSync(output,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));process.exitCode=out.failed?1:0;
