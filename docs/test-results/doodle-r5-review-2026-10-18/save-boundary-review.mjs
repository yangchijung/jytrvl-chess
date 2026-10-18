// Diagnostic reproducer. Initial review baseline: 95b0de12491e569a5b27d879d023bb3cfb52d087.
// Run from any directory with Node 24; reads the checkout files, not browser storage.
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const dir = new URL('../../../shared/doodle/', import.meta.url);
const data = JSON.parse(fs.readFileSync(new URL('lessons.json', dir), 'utf8'));
const modelSource = fs.readFileSync(new URL('model.ts', dir), 'utf8').replace("import data from './lessons.json';", 'const data = ' + JSON.stringify(data) + ';');
const m = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(modelSource)).toString('base64'));
const pages = fs.readFileSync(new URL('../../../src/doodle/pages.tsx', import.meta.url), 'utf8');
const start = pages.indexOf('function loadSave()');
const end = pages.indexOf('// ------------------------------------------------------------------ small pieces', start);
const loader = stripTypeScriptTypes(pages.slice(start, end));
function inspectLoad(raw, backupThrows=false) {
  const entries = new Map([['jy.doodle.v1',raw]]);
  const localStorage = {getItem:(k)=>entries.get(k)??null,setItem:(k,v)=>{if(backupThrows && k.includes('.backup-'))throw new Error('QuotaExceededError');entries.set(k,v);}};
  const ctx = {localStorage,KEY:'jy.doodle.v1',blankSave:m.blankSave,validSave:m.validSave};
  const result = vm.runInNewContext(loader+'; loadSave()',ctx);
  const beforeNextSave = {broken:result.broken,returnedOps:result.s.free.ops.length,backupKeys:[...entries.keys()].filter(k=>k.includes('.backup-'))};
  result.s.free=m.push(result.s.free,{t:'stroke',color:'red',size:'m',pts:[[.1,.1],[.2,.2]]});
  localStorage.setItem('jy.doodle.v1',JSON.stringify(result.s));
  return {...beforeNextSave,originalPreservedAfterNextSave:[...entries.values()].includes(raw)};
}
let s=m.blankSave();
const op={t:'stroke',color:'red',size:'m',pts:[[.1,.1],[.2,.2]]};
for(let i=0;i<2000;i++)s.free=m.push(s.free,op);
const at2000=m.validSave(JSON.parse(JSON.stringify(s)));
s.free=m.push(s.free,op);
const at2001=m.validSave(JSON.parse(JSON.stringify(s)));
const long=m.blankSave();long.free=m.push(long.free,{...op,pts:Array.from({length:5000},(_,i)=>[i%2?.1:.9,.5])});
const result={
 sourceReferenceAtInitialReview:'95b0de12491e569a5b27d879d023bb3cfb52d087',
 method:'Copied exact model.ts and loadSave function; Node type stripping only, isolated in-memory storage; not a production-browser storage mutation.',
 malformedJSON:inspectLoad('{'),
 backupWriteFailure:inspectLoad(JSON.stringify({schemaVersion:999,art:'sentinel'}),true),
 ownWrites:{operations2000Valid:at2000,operations2001Valid:at2001,operations2001:s.free.ops.length,singleStroke5000PointsValid:m.validSave(JSON.parse(JSON.stringify(long)))}
};
fs.writeFileSync(new URL('./save-boundary-review.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));

