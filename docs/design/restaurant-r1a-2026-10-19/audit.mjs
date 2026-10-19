import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
const root=path.resolve(process.argv[2] ?? process.cwd());
const output=path.resolve(process.argv[3] ?? '/tmp/restaurant-r1a-results.json');
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
test('default first two customers: shared eggs, cash and no premature rent',()=>{
 let s=buy(); assert.equal(s.cash,383); assert.equal(E.available(s).egg,6);
 s=cook(s,'tomato_egg_rice'); assert.equal(s.cash,383);assert.equal(E.available(s).egg,5);
 s=act(s,{t:'serve',order:0,dish:'tomato_egg_rice'});assert.equal(s.cash,415);
 s=cook(s,'vegetable_egg_rice');assert.equal(E.available(s).egg,4);
 s=act(s,{t:'serve',order:1,dish:'vegetable_egg_rice'});
 assert.equal(s.cash,450);assert.equal(s.revenue,67);assert.equal(s.cogs,39);assert.equal(s.results.length,0);
 assert.deepEqual(E.available(s),{rice:4,egg:4,tomato:2,vegetable:2,bread:0,cheese:0,packaging:4});
});
test('three complete-day fixtures retain expected economy',()=>{
 const cases=[
 [['tomato_egg_rice','vegetable_egg_rice'],117,201,117,34,534,0,6],
 [['tomato_egg_rice'],99,96,57,-11,447,42,3],
 [['tomato_egg_rice','cheese_egg_toast'],147,156,99,7,459,48,5]];
 for(const [menu,purchase,revenue,cogs,result,cash,inventory,sold] of cases){
 const s=play(buy(E.newGuided({menu}))),r=s.results[0];
 assert.deepEqual([s.purchases,s.revenue,s.cogs,r.result,s.cash,r.inventoryValue,r.soldCount],[purchase,revenue,cogs,result,cash,inventory,sold]);
 assert.equal(r.wasteCooked+r.wasteRaw,0);
 }
});
test('wrong ingredients / unaccepted dish leave money and inventory unchanged',()=>{
 const s=buy(), wrong=E.apply(s,{id:'wrong',t:'cook',dish:'tomato_egg_rice',items:['rice','egg','vegetable']});
 assert.equal(wrong.error,'wrong_items');assert.deepEqual(wrong.s,s);
 const cooked=cook(s,'vegetable_egg_rice'), served=E.apply(cooked,{id:'wrongserve',t:'serve',order:0,dish:'vegetable_egg_rice'});
 assert.equal(served.error,'not_accepted');assert.deepEqual(served.s,cooked);
});
test('action resend does not double purchase, consume or pay',()=>{
 let s=E.newGuided();s=act(s,{t:'toBuy'});const ops=[
 {id:'p',t:'purchase',packs:Object.fromEntries(E.buyRows(s).map(x=>[x.item,x.suggested]))},
 {id:'c',t:'cook',dish:'tomato_egg_rice',items:['rice','egg','tomato']},
 {id:'v',t:'serve',order:0,dish:'tomato_egg_rice'}];
 for(const op of ops){s=E.apply(s,op).s;const dup=E.apply(s,op);assert.equal(dup.duplicate,true);assert.deepEqual(dup.s,s);}
});
test('valid saved pan, ready plate and paid guest survive new controller',()=>{
 const m=new Memory();let c=ctl(m);c.v={...C.blankV3(),state:buy()};c.update({draft:{dish:'tomato_egg_rice',items:['rice']}});
 assert.equal(c.saveState,'saved');let d=ctl(m);assert.deepEqual(d.v,c.v);
 now+=1000;d.dispatch({t:'cook',dish:'tomato_egg_rice',items:['rice','egg','tomato']},null,()=>({draft:{dish:'tomato_egg_rice',items:[]},cooks:1}));
 let e=ctl(m);assert.deepEqual(e.v,d.v);e.dispatch({t:'serve',order:0,dish:'tomato_egg_rice'});let f=ctl(m);assert.equal(f.v.state.cash,415);assert.equal(f.v.state.orders[0].status,'sold');
});
test('rapid duplicate controller dispatch consumes only once',()=>{
 const m=new Memory(),c=ctl(m);c.v={...C.blankV3(),state:buy()};
 const op={t:'cook',dish:'tomato_egg_rice',items:['rice','egg','tomato']};
 c.dispatch(op);c.dispatch(op);assert.equal(c.v.state.servings.length,1);assert.equal(E.available(c.v.state).egg,5);
});
test('malformed save copied before replacing; old classic untouched',()=>{
 const m=new Memory();m.data.set(C.V3_KEY,'broken-r1a');m.data.set(C.CLASSIC_KEY,'classic-progress');
 const c=ctl(m);assert.equal(c.notice,'broken');assert.equal(m.getItem(S.backupKey('broken-r1a',C.V3_KEY)),'broken-r1a');c.update({cooks:1});assert.equal(c.saveState,'saved');assert.equal(m.getItem(C.CLASSIC_KEY),'classic-progress');
});
test('future schema preserved in backup',()=>{
 const m=new Memory();const raw=JSON.stringify({...C.blankV3(),schemaVersion:4});m.data.set(C.V3_KEY,raw);const c=ctl(m);
 assert.equal(c.notice,'brokenFuture');assert.equal(m.getItem(S.backupKey(raw,C.V3_KEY)),raw);
});
test('backup quota failure saves to alternate, never overwrites unreadable original',()=>{
 const m=new Memory();m.data.set(C.V3_KEY,'broken-quota');m.failBackup=true;const c=ctl(m);
 assert.equal(c.target,C.V3_KEY+'.recovered');c.update({cooks:1});assert.equal(c.saveState,'saved');assert.equal(m.getItem(C.V3_KEY),'broken-quota');assert.equal(ctl(m).v.cooks,1);
});
test('unreadable alternate + failed backup disables save',()=>{
 const m=new Memory();m.data.set(C.V3_KEY,'broken-noalt');m.data.set(C.V3_KEY+'.recovered','broken-alt');m.failBackup=true;
 const c=ctl(m);assert.equal(c.target,null);c.update({cooks:1});assert.equal(c.saveState,'failed');assert.equal(m.getItem(C.V3_KEY),'broken-noalt');assert.equal(m.getItem(C.V3_KEY+'.recovered'),'broken-alt');
});
test('quota error never reports saved',()=>{
 const m=new Memory(),c=ctl(m);m.failAll=true;c.update({cooks:1});assert.equal(c.saveState,'failed');
});
test('readback mismatch never reports saved',()=>{
 const m=new Memory(),c=ctl(m);m.silent=true;c.update({cooks:1});assert.equal(c.saveState,'failed');assert.equal(m.getItem(C.V3_KEY),null);
});
test('storage unavailable does not crash or claim saved',()=>{
 const m=new Memory();m.failRead=true;const c=ctl(m);assert.equal(c.notice,'noStorage');c.update({cooks:1});assert.equal(c.saveState,'failed');
});
test('newer alternate safely promoted without losing old raw',()=>{
 const m=new Memory(),raw='old-promotion';m.data.set(C.V3_KEY,raw);m.data.set(C.V3_KEY+'.recovered',JSON.stringify({...C.blankV3(),cooks:7}));
 const c=ctl(m);assert.equal(c.notice,'restored');assert.equal(c.v.cooks,7);assert.equal(m.getItem(S.backupKey(raw,C.V3_KEY)),raw);assert.equal(JSON.parse(m.getItem(C.V3_KEY)).cooks,7);
});
test('valid main wins over stale alternate',()=>{
 const m=new Memory();m.data.set(C.V3_KEY,JSON.stringify({...C.blankV3(),cooks:8}));m.data.set(C.V3_KEY+'.recovered',JSON.stringify({...C.blankV3(),cooks:2}));
 const c=ctl(m);assert.equal(c.v.cooks,8);assert.equal(c.notice,'altKept');
});
test('two tabs: stale pan update must not undo another tab\'s cooked meal',()=>{
 const m=new Memory();m.data.set(C.V3_KEY,JSON.stringify({...C.blankV3(),state:buy()}));
 const a=ctl(m),b=ctl(m);b.dispatch({t:'cook',dish:'tomato_egg_rice',items:['rice','egg','tomato']});
 assert.equal(E.available(b.v.state).egg,5);now+=1000;
 a.update({draft:{dish:'tomato_egg_rice',items:['rice']}});
 const persisted=JSON.parse(m.getItem(C.V3_KEY));
 assert.equal(persisted.state.servings.length,1,'another tab cooked a meal; stale draft update erased it');
 assert.equal(E.available(persisted.state).egg,5);
});
test('two tabs: stale pan update must not undo another tab\'s payment',()=>{
 const m=new Memory();m.data.set(C.V3_KEY,JSON.stringify({...C.blankV3(),state:cook(buy(),'tomato_egg_rice')}));
 const a=ctl(m),b=ctl(m);b.dispatch({t:'serve',order:0,dish:'tomato_egg_rice'});
 assert.equal(b.v.state.cash,415);now+=1000;a.update({draft:{dish:'tomato_egg_rice',items:['rice']}});
 const p=JSON.parse(m.getItem(C.V3_KEY));assert.equal(p.state.cash,415,'stale pan restored wallet to 383 after a valid payment');
 assert.equal(p.state.orders[0].status,'sold');assert.equal(p.state.servings.length,0);
});
Date.now=realNow;
const out={baseline:'baa2043dcd2b67788dfd8237c9e98ee24f094b16', sourceRoot:root,method:'Exact source TypeScript stripped; memory storage and stubbed DOM, no production storage mutation',passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length,rows};
fs.writeFileSync(output,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
process.exitCode=out.failed?1:0;

