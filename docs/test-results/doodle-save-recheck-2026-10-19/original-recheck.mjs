import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const root=new URL('../../../',import.meta.url);
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const data=await readFile(new URL('shared/doodle/lessons.json',root),'utf8');
const modelTS=await readFile(new URL('shared/doodle/model.ts',root),'utf8');
const modelURL=url(stripTypeScriptTypes(modelTS.replace("import data from './lessons.json';",'const data='+data+';')));
const m=await import(modelURL);
const storageTS=await readFile(new URL('src/doodle/storage.ts',root),'utf8');
const storageURL=url(stripTypeScriptTypes(storageTS).replace('"../../shared/doodle/model"',JSON.stringify(modelURL)));
const st=await import(storageURL);
const stroke=n=>({t:'stroke',color:'red',size:'m',pts:Array.from({length:n},(_,i)=>[i/(n+1),i%2?0.1:0.9])});
const art=()=>({...m.blankSave(),free:m.pushFree(m.empty(),stroke(2))});
function memory(entries={},blocked=false){const map=new Map(Object.entries(entries));const env={map,blocked,allBlocked:false,store:{getItem:k=>map.get(k)??null,setItem:(k,v)=>{if(env.allBlocked||(env.blocked&&k.includes('.backup-')))throw Error('QuotaExceededError');map.set(k,v)}}};return env;}
const rows=[];const check=(name,pass,evidence={})=>rows.push({name,pass,...evidence});
for(const raw of ['{',JSON.stringify({schemaVersion:3,art:'original sentinel'})]){
 const e=memory({[st.KEY]:raw}); const r=st.loadSave(e.store);
 check('D3 backed up '+r.notice,r.oldRaw===raw&&e.map.get(st.backupKey(raw))===raw&&r.target===st.KEY,{notice:r.notice,target:r.target});
}
const raw=JSON.stringify({schemaVersion:3,art:'original sentinel'});
const e=memory({[st.KEY]:raw},true);const r=st.loadSave(e.store);e.store.setItem(r.target,JSON.stringify(art()));
const second=st.loadSave(e.store);
check('D3 backup failure preserves primary and resumes alternate',e.map.get(st.KEY)===raw&&second.target===st.ALT&&m.visibleFree(second.s.free).length===1,{target:second.target,visible:m.visibleFree(second.s.free).length});
e.blocked=false;const recovered=st.loadSave(e.store);
check('D3 backup becomes writable: continue the recovered drawing',m.visibleFree(recovered.s.free).length===1,{target:recovered.target,notice:recovered.notice,visible:m.visibleFree(recovered.s.free).length,alternateStillHasDrawing:m.visibleFree(JSON.parse(e.map.get(st.ALT)).free).length});
// The exact next normal save changes the paper mode, then persists to the returned target.
e.store.setItem(recovered.target,JSON.stringify({...recovered.s,surface:'grid'}));
check('D3 after a normal UI change and reopening: recovered drawing remains reachable',m.visibleFree(st.loadSave(e.store).s.free).length===1,{primaryVisible:m.visibleFree(st.loadSave(e.store).s.free).length,alternateStillHasDrawing:m.visibleFree(JSON.parse(e.map.get(st.ALT)).free).length});
const denied=st.loadSave({getItem(){throw Error('SecurityError')},setItem(){throw Error('must not write')}});
check('D3 unavailable storage disables writing',denied.target===null&&denied.notice==='noStorage');
const altBroken=memory({[st.KEY]:'{',[st.ALT]:'{'},true);const ab=st.loadSave(altBroken.store);
check('D3 neither file can be used: no write target',ab.target===null&&ab.notice==='brokenNoSave');
let h=m.empty();for(let i=0;i<2000;i++)h=m.pushFree(h,stroke(2));
const full={...m.blankSave(),free:h};
check('D4 2000 ops round trip',m.readSave(()=>JSON.stringify(full)).kind==='ok');
check('D4 operation 2001 safely refused',m.pushFree(h,stroke(2))===null&&h.n===2000);
let cleared=m.empty();for(let i=0;i<1000;i++)cleared=m.pushFree(cleared,stroke(2));cleared=m.pushFree(cleared,{t:'clear'});for(let i=0;i<999;i++)cleared=m.pushFree(cleared,stroke(2));
const compact=m.pushFree(cleared,stroke(2));check('D4 free compaction retains visible operations',JSON.stringify(m.visibleFree(compact))===JSON.stringify([...m.visibleFree(cleared),stroke(2)])&&m.validSave({...m.blankSave(),free:compact}));
let g=m.empty();for(let i=0;i<2000;i++)g=m.pushGrid(g,{t:'cell',i:i%9,value:{color:i%2?'blue':'red',shape:'circle'}});const before=m.gridCells(g);g=m.pushGrid(g,{t:'cell',i:4,value:{color:'green',shape:'triangle'}});before[4]={color:'green',shape:'triangle'};
check('D4 grid compaction preserves all cells',JSON.stringify(before)===JSON.stringify(m.gridCells(g))&&m.validSave({...m.blankSave(),grid:g}));
for(const n of [4999,5000]){const points=stroke(n).pts,parts=m.splitPoints(points);let hist=m.empty();for(const pts of parts)hist=m.pushFree(hist,{...stroke(2),pts});const restored=parts.flatMap((x,i)=>i?x.slice(1):x);check('D4 new '+n+' point stroke round trip with ordered geometry',JSON.stringify(points)===JSON.stringify(restored)&&m.readSave(()=>JSON.stringify({...m.blankSave(),free:hist})).kind==='ok',{segments:parts.map(x=>x.length)});}
// Previous released schema 1 accepted a stroke with any length from 1 through 4999.
for(const n of [2000,2001,4999]){const old={schemaVersion:1,free:{ops:[stroke(n)],n:1},grid:m.empty(),done:['DC-L01'],level:'easy',mixedColors:['orange']};const rawOld=JSON.stringify(old);const me=memory({[st.KEY]:rawOld});const got=st.loadSave(me.store);check('D1/D4 legacy valid schema 1 stroke '+n+' resumes',got.notice===null&&m.visibleFree(got.s.free).length>0,{previousSchemaValid:n<5000,notice:got.notice,visible:m.visibleFree(got.s.free).length,rawBackedUp:me.map.get(st.backupKey(rawOld))===rawOld});}
const s={...art(),surface:'grid',active:{...m.newRun(m.LESSONS[3].id),mixed:['tint_blue'],marks:{light_blue:1}}};const resumed=m.readSave(()=>JSON.stringify(s));check('D1 lesson 4 partial resume then finish',resumed.kind==='ok'&&m.lessonStep(m.LESSONS[3],resumed.save.active,'easy')==='apply'&&m.lessonStep(m.LESSONS[3],{...resumed.save.active,marks:{light_blue:1,blue:1}},'easy')==='done');
const result={sourceCommit:'7eae7f31c8c4050a8e2a50414ab6ad165695d931',method:'Exact source TypeScript modules, isolated in-memory storage. No browser storage injection.',passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length,rows};
await writeFile(new URL('./storage-boundary-results.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));

