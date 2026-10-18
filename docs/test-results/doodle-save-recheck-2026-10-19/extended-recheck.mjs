import {readFile,writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('../../../',import.meta.url);
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const data=await readFile(new URL('shared/doodle/lessons.json',root),'utf8');
const modelURL=url(stripTypeScriptTypes((await readFile(new URL('shared/doodle/model.ts',root),'utf8')).replace("import data from './lessons.json';",'const data='+data+';')));
const m=await import(modelURL);
const storageJS=stripTypeScriptTypes(await readFile(new URL('src/doodle/storage.ts',root),'utf8')).replace('"../../shared/doodle/model"',JSON.stringify(modelURL));
let sequence=0;const fresh=()=>import(url(storageJS+'\n// isolated module '+(++sequence)));
const rows=[];const check=(name,pass,evidence={})=>rows.push({name,pass,...evidence});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stroke=(color='red',n=2)=>({t:'stroke',color,size:'m',pts:Array.from({length:n},(_,i)=>[i/(n+1),i%2?0.1:0.9])});
const drawing=color=>({...m.blankSave(),free:m.pushFree(m.empty(),stroke(color))});
function mem(init={}){const map=new Map(Object.entries(init));const e={map,fail:new Set(),noOp:new Set(),store:{getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(e.fail.has(k)||e.fail.has('backup')&&k.includes('.backup-'))throw Error('QuotaExceededError');if(!e.noOp.has(k))map.set(k,v)}}};return e;}
{
 const st=await fresh(),raw=JSON.stringify({schemaVersion:3,art:'original'}),e=mem({[st.KEY]:raw});e.fail.add('backup');
 let r=st.loadSave(e.store);const a=drawing('red');e.store.setItem(r.target,JSON.stringify(a));r=st.loadSave(e.store);
 check('D3-R1 continued backup failure preserves active alternate',r.target===st.ALT&&same(r.s,a)&&e.map.get(st.KEY)===raw);
 e.fail.clear();r=st.loadSave(e.store);
 check('D3-R1 recovered storage migrates and verifies complete drawing',r.target===st.KEY&&r.notice==='restored'&&same(r.s,a)&&same(JSON.parse(e.map.get(st.KEY)),a));
 check('D3-R1 original raw and alternate kept',e.map.get(st.backupKey(raw))===raw&&same(JSON.parse(e.map.get(st.ALT)),a)&&e.map.get(st.MOVED)===st.backupKey(e.map.get(st.ALT)));
 check('D3-R1 repeated mount keeps restored notice',st.loadSave(e.store).notice==='restored');
 const b={...r.s,surface:'grid',free:m.pushFree(r.s.free,stroke('orange'))};e.store.setItem(r.target,JSON.stringify(b));
 const newVisit=await fresh();r=newVisit.loadSave(e.store);
 check('D3-R1 second stroke + mode + fresh module reopening preserve latest',r.target===st.KEY&&same(r.s,b)&&r.notice===null,{operations:r.s.free.ops.length,surface:r.s.surface});
}
{
 const st=await fresh(),a=drawing('red'),b=drawing('blue'),araw=JSON.stringify(a),braw=JSON.stringify(b);
 const e=mem({[st.KEY]:braw,[st.ALT]:araw}),r=st.loadSave(e.store);
 check('D3-R1 newer valid main wins over unmoved alternate',same(r.s,b)&&e.map.get(st.KEY)===braw&&r.notice==='altKept');
 check('D3-R1 alternate remains downloadable byte-for-byte',r.oldRaw===araw&&e.map.get(st.ALT)===araw);
}
for(const failKind of ['throw-main','readback-mismatch','marker-only']){
 const st=await fresh(),raw='{',a=drawing('green'),araw=JSON.stringify(a),e=mem({[st.KEY]:raw,[st.ALT]:araw});
 if(failKind==='throw-main')e.fail.add(st.KEY);if(failKind==='readback-mismatch')e.noOp.add(st.KEY);if(failKind==='marker-only')e.fail.add(st.MOVED);
 const r=st.loadSave(e.store);
 check('D3-R1 migration '+failKind+' retains working drawing',same(r.s,a)&&r.target===(failKind==='marker-only'?st.KEY:st.ALT)&&e.map.get(st.ALT)===araw,{target:r.target,notice:r.notice});
 const extra={...r.s,free:m.pushFree(r.s.free,stroke('blue'))};e.store.setItem(r.target,JSON.stringify(extra));
 const next=await fresh();check('D3-R1 '+failKind+' next visit keeps edits',same(next.loadSave(e.store).s,extra));
}
{
 const st=await fresh(),a=drawing('purple'),e=mem({[st.ALT]:JSON.stringify(a)}),r=st.loadSave(e.store);
 check('D3-R1 only alternate present is restored',r.target===st.KEY&&same(r.s,a)&&same(JSON.parse(e.map.get(st.KEY)),a));
}
for(const points of [2000,2001,4999]){
 const st=await fresh(),ops=[{...stroke('blue',points),size:'l'}, {...stroke('white',3),erase:true,size:'s'}];
 const old={schemaVersion:1,free:{ops,n:1},grid:{ops:[{t:'cell',i:4,value:{color:'green',shape:'triangle'}}],n:1},done:['DC-L01'],level:'easy',mixedColors:['orange']};
 const raw=JSON.stringify(old),e=mem({[st.KEY]:raw}),r=st.loadSave(e.store);
 check('D4-R1 '+points+' legacy points and redo branch unchanged',r.notice===null&&same(r.s.free,old.free)&&same(r.s.grid,old.grid)&&same(r.s.done,old.done)&&e.map.get(st.KEY)===raw&&e.map.size===1);
 check('D4-R1 '+points+' redo and undo keep geometry and eraser',same(m.undo(m.redo(r.s.free)),old.free)&&same(m.visibleFree(m.redo(r.s.free)),ops));
 const modified={...r.s,surface:'grid',free:m.redo(r.s.free)};e.store.setItem(r.target,JSON.stringify(modified));const reopened=(await fresh()).loadSave(e.store);
 check('D4-R1 '+points+' save then fresh reopen preserves all data',reopened.notice===null&&same(reopened.s,modified));
}
{
 const st=await fresh(),old={...drawing('red'),free:{ops:[stroke('red',5000)],n:1}},raw=JSON.stringify(old),e=mem({[st.KEY]:raw}),r=st.loadSave(e.store);
 check('D4-R1 previously invalid 5000-point raw is preserved as backup',r.notice==='broken'&&e.map.get(st.backupKey(raw))===raw);
}
const result={sourceCommit:'7eae7f31c8c4050a8e2a50414ab6ad165695d931',date:'2026-10-19',method:'Fresh exact-source modules per independent fixture, isolated memory storage; no production browser storage injection',passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length,rows};
await writeFile(new URL('./extended-results.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;

