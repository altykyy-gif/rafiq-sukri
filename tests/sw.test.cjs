const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..');
const scope='https://patient.github.io/rafiq-diabetes/';
const handlers={},stores=new Map(),other='rafiq-offline:https://patient.github.io/other/:1';
stores.set(other,new Map());stores.set('rafiq-offline:'+scope+':0.9.0',new Map());
let claimed=false,skipped=false,networkCalls=0,forceFailure=false;
const normalize=(req,ignoreSearch=false)=>{const u=new URL(typeof req==='string'?req:req.url);if(ignoreSearch)u.search='';u.hash='';return u.href};
const caches={
 async open(name){if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return{
  async addAll(requests){const pending=[];for(const r of requests){const url=normalize(r);const local=decodeURIComponent(new URL(url).pathname.slice(new URL(scope).pathname.length));const target=path.join(ROOT,local||'index.html');assert.ok(target.startsWith(ROOT));assert.ok(fs.existsSync(target),target);if(forceFailure&&url.includes('cairo-bold'))throw new Error('network failed');pending.push([url,new Response(fs.readFileSync(target))]);}for(const [u,r]of pending)map.set(u,r)},
  async match(req,opts={}){const key=normalize(req,opts.ignoreSearch);const entry=[...map.entries()].find(([k])=>normalize(k,opts.ignoreSearch)===key)?.[1];return entry?.clone()},
 };},async keys(){return [...stores.keys()]},async delete(name){return stores.delete(name)}
};
const self={registration:{scope},location:new URL(scope),clients:{async claim(){claimed=true}},skipWaiting(){skipped=true},addEventListener:(type,fn)=>handlers[type]=fn};
vm.runInNewContext(fs.readFileSync(path.join(ROOT,'sw.js'),'utf8'),{self,caches,Request,Response,URL,fetch:async()=>{networkCalls++;throw new Error('offline')}});
async function lifecycle(type,extra={}){let p;handlers[type]({...extra,waitUntil:v=>p=v});await p;}
async function response(url,mode='cors'){let p;handlers.fetch({request:{url,method:'GET',mode},respondWith:r=>p=r});return p?await p:null;}
async function run(){
 await lifecycle('install');assert.equal(skipped,false);console.log('PASS all offline files exist and cache atomically; updates do not force reload');
 await lifecycle('activate');assert.ok(claimed);assert.ok(stores.has(other));assert.ok(!stores.has('rafiq-offline:'+scope+':0.9.0'));console.log('PASS activation cleans only this repository cache');
 for(const f of ['index.html','app.js','core.js','storage.js','content.js','styles.css','assets/cairo-regular.woff2','assets/hero.svg','assets/plate.svg','assets/icon-512.png','research/'+encodeURIComponent('ورقة_العمل_المبدئية.pdf')]){const r=await response(scope+f);assert.ok(r.ok,f);assert.ok((await r.arrayBuffer()).byteLength>0);}
 assert.equal(networkCalls,0);console.log('PASS complete application, fonts, artwork, icons and research PDF available with network blocked');
 const css=await response(scope+'styles.css?ref=1');assert.ok((await css.text()).includes(':root'));console.log('PASS query strings do not break cached application assets');
 const page=await response(scope+'saved/path','navigate');assert.ok((await page.text()).includes('رفيق السكري'));console.log('PASS offline navigation falls back to the application shell within scope');
 assert.equal(await response('https://www.cdc.gov/diabetes/'),null);assert.equal(await response('https://patient.github.io/unrelated/'),null);console.log('PASS external references and unrelated GitHub projects are not intercepted');
 const missing=await response(scope+'missing-image.png');assert.equal(missing.status,503);console.log('PASS missing offline files return explicit unavailable status, not fake success');
 let status;await lifecycle('message',{data:{type:'CACHE_STATUS'},ports:[{postMessage:v=>status=v}]});assert.equal(status.ready,true);console.log('PASS ready indicator verifies every pre-cached file');
 handlers.message({data:{type:'SKIP_WAITING'}});assert.ok(skipped);console.log('PASS version activation requires explicit update message');
 forceFailure=true;await assert.rejects(()=>lifecycle('install'));assert.ok(stores.has(other));assert.ok(![...stores.keys()].some(k=>k.startsWith('rafiq-offline:'+scope+':1.0.0')));console.log('PASS partial install failure never claims offline readiness');
 console.log('\n10 service-worker checks passed.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
