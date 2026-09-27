// driver mínimo do Chrome DevTools Protocol (tempo real)
import { spawn } from 'node:child_process';
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new','--disable-gpu','--remote-debugging-port=9333','--autoplay-policy=no-user-gesture-required','--user-data-dir=/tmp/cdp-prof','--incognito','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let targets;for(let i=0;i<40;i++){try{targets=await (await fetch('http://localhost:9333/json')).json();if(targets.length)break}catch{}await sleep(250)}
const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pend=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}))});
await send('Page.enable');await send('Page.navigate',{url:(process.argv[2]||'/tests/e2e-publish.html').startsWith('http')?process.argv[2]+'?t='+Date.now():'http://localhost:8765'+(process.argv[2]||'/tests/e2e-publish.html')+'?t='+Date.now()});await sleep(1500);
const r=await send('Runtime.evaluate',{expression:'window.__run()',awaitPromise:true,returnByValue:true,timeout:120000});
console.log(r.result?.result?.value ?? JSON.stringify(r));
// segunda fase opcional: recarrega a página e checa o que veio do servidor
const has=await send('Runtime.evaluate',{expression:'typeof window.__after==="function"',returnByValue:true});
if(has.result?.result?.value){
  await send('Page.reload',{ignoreCache:true});await sleep(2500);
  const a=await send('Runtime.evaluate',{expression:'window.__after()',awaitPromise:true,returnByValue:true,timeout:60000});
  console.log(a.result?.result?.value ?? JSON.stringify(a));
}
chrome.kill();process.exit(0);
