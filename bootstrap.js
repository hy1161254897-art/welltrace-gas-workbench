(()=>{'use strict';
 const nativeFetch=window.fetch.bind(window),base=new URL('./',location.href),cache=new Map();
 const canonical=route=>{const u=new URL(route,base);u.searchParams.sort();return u.pathname+(u.searchParams.size?'?'+u.searchParams.toString():'');};
 const unzip=bytes=>new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 const fromBase64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 async function script(name){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL(name,base);s.onload=resolve;s.onerror=()=>reject(Error('页面资源加载失败，请刷新重试。'));document.head.append(s);});}
 async function start(){
  if(typeof DecompressionStream==='undefined')throw Error('请使用新版 Chrome、Edge、Firefox 或 Safari 浏览器打开。');
  const response=await nativeFetch(new URL('project-data.json.gz',base));if(!response.ok)throw Error('项目数据下载失败，请稍后刷新重试。');
  let bytes=await response.arrayBuffer();const signature=new Uint8Array(bytes);if(signature[0]===31&&signature[1]===139)bytes=await unzip(bytes);
  const entries=JSON.parse(new TextDecoder().decode(bytes));const data=new Map(entries.map(f=>[canonical(f.route),f]));
  window.fetch=async(input,options={})=>{
   if(typeof input!=='string'||!input.startsWith('/api/'))return nativeFetch(input,options);
   if(options.method&&options.method!=='GET')return new Response(JSON.stringify({error:'分享页面为只读快照，请在本地工作台修改。'}),{status:403,headers:{'Content-Type':'application/json'}});
   if(input==='/api/export/all.zip')return nativeFetch(new URL('well-curves-and-features.zip',base));
   const key=canonical(input),f=data.get(key);if(!f)return new Response(JSON.stringify({error:'当前快照未包含这项资料。'}),{status:404});
   if(!cache.has(key))cache.set(key,(async()=>{const b=fromBase64(f.body);return f.encoding==='gzip'?await unzip(b):b;})());
   return new Response(await cache.get(key),{headers:{'Content-Type':f.type,...(f.filename?{'Content-Disposition':'attachment; filename="'+f.filename+'"'}:{})}});
  };
  document.addEventListener('click',async e=>{const a=e.target.closest('a[href^="/api/"]');if(!a)return;e.preventDefault();try{const r=await window.fetch(a.getAttribute('href'));if(!r.ok)throw Error('下载失败');const url=URL.createObjectURL(await r.blob()),link=document.createElement('a');link.href=url;link.download=a.getAttribute('href').split('/').pop().split('?')[0];link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){if(typeof window.toast==='function')window.toast(e.message,true);}});
  for(const name of ['charts-client.js','app.js','research.js'])await script(name);
  await window.startWorkbench();document.getElementById('progress').hidden=true;
 }
 start().catch(e=>{document.getElementById('progressText').textContent=e.message;document.querySelector('.spinner')?.remove();});
})();
