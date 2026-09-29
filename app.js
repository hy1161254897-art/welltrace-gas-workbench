'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,selected=null,wellData=null,importInfo=null,svgText='',sortKey='well',sortAsc=true,chartVersion=0,wellVersion=0,watching=false;
const fields={well:'井号',date:'日期 *',gas:'日产气 *',water:'日产水',tubing:'油压',casing:'套压',hours:'生产时数',note:'备注',layer:'层位',mode:'生产方式',reservoir:'地层压力（可选）',flowing:'井底流压（可选）',cumulative:'累计产气（可选）'};
const defaults={window:90,decline:10,cv:.35,zero:.20,change:40,min_hours:20};
function fmt(v,n=2){return v==null?'—':Number(v).toLocaleString('zh-CN',{maximumFractionDigits:n,minimumFractionDigits:n});}
function badgeClass(label){return /递减|波动/.test(label)?'warn':/间歇/.test(label)?'red':/待/.test(label)?'blue':'';}
function badge(label){return `<span class="badge ${badgeClass(label)}">${esc(label)}</span>`;}
let toastTimer;
function toast(text,error=false){$('toast').textContent=text;$('toast').style.background=error?'#92543e':'#284f3d';$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?9000:4200);}
async function api(url,body){const r=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(r.status===401){location.reload();throw Error('访问已过期，请重新登录。');}const data=await r.json();if(!r.ok)throw Error(data.error||'请求失败');return data;}
function act(fn){return async (...args)=>{try{await fn(...args);}catch(e){toast(e.message,true);}};}
function showView(view){for(const v of ['curves','features','quality','diagnosis','templates','evidence','methods'])$(v+'View').hidden=v!==view;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===view));}
async function loadSummary(){
 state=await api('/api/summary');$('welcome').hidden=true;$('workspace').hidden=false;
 const s=state.summary;const reviewCount=Object.values(state.reviews).filter(x=>x.label||x.note).length;
 $('sourceLine').textContent=state.source+'　·　'+s.start+' — '+s.end;$('sourceLine').title=state.source_path;
 const stats=[['已导入气井',s.wells,'口井，自动按井号拆分','◫'],['有效日记录',s.records,'原表日期可识别、去重后的记录','≋'],['曲线形态',Object.keys(s.classes).length,'种初筛形态，规则见方法说明','⌁'],['已人工复核',reviewCount,'口井，展示已保存的复核结果','✓']];
 $('stats').innerHTML=stats.map(([label,value,small,icon])=>`<div class="stat"><label>${label}</label><strong>${Number(value).toLocaleString()}</strong><small>${small}</small><span class="staticon">${icon}</span></div>`).join('');
 $('rangeHint').textContent=`特征窗口：各井末次记录前 ${state.settings.window} 日 · 不同井末日可能不同`;
 const oldFilter=$('classFilter').value;$('classFilter').innerHTML='<option value="">全部形态分类</option>'+state.classes.map(c=>`<option value="${esc(c)}">${esc(c)} · ${s.classes[c]||0}</option>`).join('');$('classFilter').value=oldFilter;
 $('reviewClass').innerHTML='<option value="">暂不指定人工分类</option>'+state.classes.map(c=>`<option>${esc(c)}</option>`).join('');
 if(!selected||!state.features.some(x=>x.well===selected))selected=state.features[0]?.well;
 renderList();renderTable();renderQuality();fillRules();if(window.loadResearch)await window.loadResearch();if(selected)await selectWell(selected);
}
function filtered(){const search=$('wellSearch').value.trim().toLowerCase(),label=$('classFilter').value;return state.features.filter(x=>(!search||(x.well+' '+x.layer).toLowerCase().includes(search))&&(!label||x.label===label));}
function renderList(){
 if(!state)return;const rows=filtered();$('wellCount').textContent=rows.length+' / '+state.summary.wells;
 $('wellList').innerHTML=rows.length?rows.map(r=>`<button class="wellitem ${r.well===selected?'active':''}" data-well="${esc(r.well)}"><div><b>${esc(r.well)}</b>${badge(r.label)}</div><small>${esc(r.layer||'层位未提供')}　${fmt(r.mean30==null?null:r.mean30/10000,2)} 万方/天</small></button>`).join(''):'<div class="empty">没有符合条件的井</div>';
}
async function selectWell(w){
 selected=w;const version=++wellVersion;renderList();const result=await api('/api/well?id='+encodeURIComponent(w));if(version!==wellVersion)return;wellData=result;
 const f=wellData.feature;$('wellTitle').textContent=w;$('wellLabel').className='badge '+badgeClass(f.label);$('wellLabel').textContent=f.label;
 $('wellMeta').textContent=`${f.layer||'层位未提供'}　·　${f.start} — ${f.end}　·　${f.days.toLocaleString()} 条日记录`;
 const metrics=[['近 30 日记录均产气',f.mean30==null?null:f.mean30/10000,'万方/天'],['近窗月等效递减率',f.decline30,'%'],['去趋势残差 CV',f.cv,''],['近窗零产记录比例',f.zero_ratio==null?null:f.zero_ratio*100,'%']];
 $('wellMetrics').innerHTML=metrics.map(([label,value,unit])=>`<div class="wellmetric"><label>${label}</label><strong>${fmt(value)}</strong><small>${unit}</small></div>`).join('');
 $('classReason').textContent=f.reason+`；趋势拟合 ${f.fit_days} 个样本${f.hours_filter?'（已按生产时数过滤）':'（未提供时数，不过滤）'}。负递减率表示回升。`;
 $('changes').innerHTML=f.changes.length?'<span class="smallnote">全历史疑似变点：</span>'+f.changes.map(x=>`<span class="changechip">${x.date}　${x.change_pct>0?'+':''}${fmt(x.change_pct,0)}%</span>`).join(''):'<span class="smallnote">未检出达到当前阈值的疑似变点。</span>';
 $('reviewClass').value=wellData.review.label||'';$('reviewNote').value=wellData.review.note||'';
 $('chartStart').value=f.start;$('chartEnd').value=f.end;await renderChart();if(window.loadWellResearch)await window.loadWellResearch(w);
}
async function renderChart(){
 if(!selected)return;const start=$('chartStart').value,end=$('chartEnd').value;
 if(start&&end&&start>end)throw Error('起始日期不能晚于结束日期。');
 const version=++chartVersion;$('chart').style.opacity='.45';
 const txt=window.svgChart(selected,wellData.records,wellData.feature,state.source,start,end,Number($('smooth').value));if(version!==chartVersion)return;svgText=txt;$('chart').innerHTML=txt;$('chart').style.opacity='1';
 $('hoverReadout').textContent='将鼠标移到曲线上，查看对应日期的日记录。日期范围与均线只影响绘图，不改变特征。';
}
$('chart').addEventListener('mousemove',e=>{
 if(!wellData)return;const svg=$('chart').querySelector('svg');if(!svg)return;const box=svg.getBoundingClientRect();const vx=(e.clientX-box.left)/box.width*1200;if(vx<96||vx>1128)return;
 const rows=wellData.records.filter(r=>(!$('chartStart').value||r.date>=$('chartStart').value)&&(!$('chartEnd').value||r.date<=$('chartEnd').value));if(!rows.length)return;
 const first=Date.parse(rows[0].date),last=Date.parse(rows[rows.length-1].date);const date=new Date(first+Math.round((last-first)/86400000*(vx-96)/1032)*86400000).toISOString().slice(0,10);const r=rows.find(r=>r.date===date);
 $('hoverReadout').textContent=r?`${date} ｜ 气 ${fmt(r.gas,0)} m³/天 ｜ 水 ${fmt(r.water)} m³/天 ｜ 油压 ${fmt(r.tubing)} MPa ｜ 套压 ${fmt(r.casing)} MPa ｜ 生产 ${fmt(r.hours,1)} h${r.note?' ｜ '+r.note:''}`:date+' ｜ 该日没有记录';
});
const tableCols=[['well','井号'],['label','规则分类'],['review_label','人工复核'],['layer','层位'],['mean30','近30日均产气<br>万方/天'],['decline30','月等效递减<br>%'],['cv','残差 CV'],['zero_ratio','零产比例<br>%'],['wgr_recent','水气比中位数<br>方/万方'],['missing_dates','缺日期<br>天'],['end','末次记录']];
function renderTable(){if(!state)return;const rows=state.features.map(x=>({...x,review_label:state.reviews[x.well]?.label||''})).sort((a,b)=>{const x=a[sortKey],y=b[sortKey];if(x==null)return y==null?0:1;if(y==null)return -1;const cmp=typeof x==='number'?x-y:String(x).localeCompare(String(y),'zh-CN',{numeric:true});return sortAsc?cmp:-cmp;});
 $('featuresTable').innerHTML='<thead><tr>'+tableCols.map(([k,t])=>`<th data-sort="${k}">${t}${sortKey===k?(sortAsc?' ↑':' ↓'):''}</th>`).join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+tableCols.map(([k])=>{let v=r[k];if(k==='well')return `<td><button data-well="${esc(v)}">${esc(v)}</button></td>`;if(k==='label')return '<td>'+badge(v)+'</td>';if(k==='mean30')v=fmt(v==null?null:v/10000);else if(k==='zero_ratio')v=fmt(v==null?null:v*100,1);else if(['decline30','cv','wgr_recent'].includes(k))v=fmt(v);return '<td>'+esc(v||v===0?v:'—')+'</td>';}).join('')+'</tr>').join('')+'</tbody>';
}
function renderQuality(){const s=state.summary;const issueEntries=Object.entries(state.counts).filter(([k])=>k!=='source_rows');$('qualityContent').innerHTML=`<div class="qualitycards"><div>原表非空数据行<strong>${state.counts.source_rows.toLocaleString()}</strong></div><div>全井合计缺记录日期<strong>${s.missing_dates.toLocaleString()}</strong></div><div>日记录中产气缺值<strong>${s.missing_gas.toLocaleString()}</strong></div></div><table><thead><tr><th>问题与处理</th><th>记录数</th></tr></thead><tbody>${issueEntries.map(([k,v])=>`<tr><td>${esc(k)}</td><td>${v.toLocaleString()}</td></tr>`).join('')||'<tr><td colspan="2">未发现解析冲突或非法数值；缺失统计仍应核对。</td></tr>'}</tbody></table><div class="qualitynotes"><p>缺记录日期按各井首末日之间的日历跨度计算，未自动认定为停产。产气为零与缺失值分别处理；产气为零时水气比留空。</p><p>完全重复日记录去重；同井同日数值或备注冲突时，该日数值隔离，不参加拟合。问题 CSV 保留原表行号（最多 20,000 条明细）。</p><p>所有曲线采用原始日数据，未按生产小时强制折算。趋势样本按设置中的时数门槛筛选，零产比例使用窗口内有效产气日记录。油压、套压仅作井口动态对照。</p><p>每日产气数值之和仅作为“观测日产气之和”导出。仅当日报产气代表当日实际产量时才可解释为观测累计产气；缺日、缺值未补算，不能代替 EUR 或地质储量。</p><p>来源：${esc(state.source)}；导入时间：${esc(state.imported_at)}。</p></div>`;}
async function watchJob(){if(watching)return;watching=true;$('progress').hidden=false;try{for(;;){const s=await api('/api/status');$('progressText').textContent=s.job.message;if(s.job.state!=='running'){if(s.job.state==='error')throw Error(s.job.message);if(s.has_data)await loadSummary();break;}await new Promise(r=>setTimeout(r,1200));}}finally{watching=false;$('progress').hidden=true;}}
function fillRules(){for(const [k,v] of Object.entries(state?.settings||defaults))$('rule_'+k).value=k==='zero'?Math.round(v*100):v;}
function showImport(){$('importDialog').showModal();}
async function showPreview(info){importInfo=info;$('importName').textContent=info.name;$('mappingPanel').hidden=false;$('sheetSelect').innerHTML=info.sheets.map((s,i)=>`<option value="${i}">${esc(s.name)}</option>`).join('')+(info.sheets.length>1?'<option value="all">全部表：分别自动识别字段</option>':'');renderMapping();}
function renderMapping(){const all=$('sheetSelect').value==='all';const s=importInfo.sheets[all?0:Number($('sheetSelect').value)];$('headerRow').value=s.header_row;$('gasUnit').value=s.gas_unit;
 $('mappingFields').innerHTML=Object.entries(fields).map(([k,title])=>`<label>${title}<select id="map_${k}" ${all?'disabled':''}><option value="">${k==='well'?'使用工作表名':'不导入此列'}</option>${s.headers.map((h,i)=>`<option value="${i}" ${s.mapping[k]===i?'selected':''}>${i+1}. ${esc(h||'(空列)')}</option>`).join('')}</select></label>`).join('');
 $('headerRow').disabled=all;$('gasUnit').disabled=all;$('cumulativeUnit').disabled=all;$('cumulativeUnit').value=s.mapping.cumulative!==undefined&&s.headers[s.mapping.cumulative].includes('万')?'wan':'m3';
 $('samplePreview').innerHTML=all?'<p class="smallnote">全部工作表将逐一识别；遇到无法识别日期或日产气列的表会停止并提示。各表日产气单位由表头是否含“万”识别，请先核对原表表头。压力单位统一使用上方设置。</p>':'<table><thead><tr>'+s.headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+s.sample.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
}
async function upload(file){if(!file)return;if(!/\.(xlsx|xlsm|csv)$/i.test(file.name))throw Error('请选择 .xlsx、.xlsm 或 .csv 文件。');if(file.size>100*1024*1024)throw Error('文件超过 100 MB，请拆分后导入。');$('mappingPanel').hidden=true;toast('正在读取表头…');const r=await fetch('/api/upload',{method:'POST',headers:{'X-Filename':encodeURIComponent(file.name)},body:file});const info=await r.json();if(!r.ok)throw Error(info.error);await showPreview(info);}
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
for(const id of ['openImport','welcomeImport'])$(id).addEventListener('click',showImport);
$('openRules').addEventListener('click',()=>{fillRules();$('rulesDialog').showModal();});
$('wellSearch').addEventListener('input',renderList);$('classFilter').addEventListener('change',renderList);
document.addEventListener('click',act(async e=>{const b=e.target.closest('[data-well]');if(b){showView('curves');await selectWell(b.dataset.well);}const th=e.target.closest('[data-sort]');if(th){sortAsc=sortKey===th.dataset.sort?!sortAsc:true;sortKey=th.dataset.sort;renderTable();}}));
$('applyRange').addEventListener('click',act(renderChart));$('smooth').addEventListener('change',act(renderChart));
$('resetRange').addEventListener('click',act(async()=>{if(!wellData)return;$('chartStart').value=wellData.feature.start;$('chartEnd').value=wellData.feature.end;await renderChart();}));
$('saveSvg').addEventListener('click',()=>{if(svgText)download(new Blob([svgText],{type:'image/svg+xml'}),selected+'_production.svg');});
$('savePng').addEventListener('click',act(async()=>{if(!svgText)return;const blob=new Blob([svgText],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);try{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=2400;c.height=1960;c.getContext('2d').drawImage(img,0,0,2400,1960);const png=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!png)throw Error('PNG 导出失败');download(png,selected+'_production.png');toast('PNG 图片已生成。');}finally{URL.revokeObjectURL(url);}}));
$('batchExport').addEventListener('click',act(async()=>{const b=$('batchExport');b.disabled=true;b.textContent='正在打包全部井图…';try{const r=await fetch('/api/export/all.zip');if(!r.ok)throw Error('导出失败，请稍后重试');download(await r.blob(),'well_curves_and_features.zip');toast('已生成全部井的 SVG 曲线、特征 CSV、质量清单及规则说明。');}finally{b.disabled=false;b.textContent='↓ 全部井图与特征 ZIP';}}));
$('saveReview').addEventListener('click',act(async()=>{const review={well:selected,label:$('reviewClass').value,note:$('reviewNote').value};await api('/api/review',review);state.reviews[selected]=review;wellData.review=review;renderTable();const count=Object.values(state.reviews).filter(x=>x.label||x.note).length;$('stats').lastElementChild.querySelector('strong').textContent=count;toast('复核结果已保存在本机。');}));
$('saveRules').addEventListener('click',act(async()=>{if(!state)throw Error('请先导入生产数据。');const s={};for(const k of Object.keys(defaults))s[k]=Number($('rule_'+k).value)/(k==='zero'?100:1);await api('/api/settings',s);$('rulesDialog').close();await watchJob();toast('已按新规则更新全部井特征。');}));
$('sheetSelect').addEventListener('change',renderMapping);
$('fileInput').addEventListener('change',act(e=>upload(e.target.files[0])));
$('dropzone').addEventListener('dragover',e=>{e.preventDefault();$('dropzone').classList.add('dragging');});$('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('dragging'));
$('dropzone').addEventListener('drop',act(async e=>{e.preventDefault();$('dropzone').classList.remove('dragging');await upload(e.dataTransfer.files[0]);}));
$('parsePaste').addEventListener('click',act(async()=>{const text=$('pasteText').value;if(!text.trim())throw Error('请先粘贴含表头的数据。');await showPreview(await api('/api/paste',{text}));}));
$('startImport').addEventListener('click',act(async()=>{const all=$('sheetSelect').value==='all';const s=importInfo.sheets[all?0:Number($('sheetSelect').value)];const mapping={};for(const k of Object.keys(fields)){const v=$('map_'+k).value;if(v!=='')mapping[k]=Number(v);}if(!all&&(mapping.date===undefined||mapping.gas===undefined))throw Error('必须指定日期列和日产气列。');const body={token:importInfo.token,display_name:importInfo.name,sheet:all?'__all__':s.name,header_row:Number($('headerRow').value),mapping,gas_unit:$('gasUnit').value,pressure_unit:$('pressureUnit').value,cumulative_unit:$('cumulativeUnit').value,volume_mode:$('importVolumeMode').value,settings:state?.settings||defaults};await api('/api/import',body);$('importDialog').close();await watchJob();toast('导入完成，所有井已绘图并提取特征。');}));
async function init(){const s=await api('/api/status');$('presets').innerHTML=s.presets.map(p=>`<button data-preset="${esc(p.id)}">读取项目文件：${esc(p.name)}</button>`).join('');$('presets').addEventListener('click',act(async e=>{const b=e.target.closest('[data-preset]');if(!b)return;b.disabled=true;try{await showPreview(await api('/api/preview?token='+encodeURIComponent(b.dataset.preset)));}finally{b.disabled=false;}}));if(s.job.state==='running')await watchJob();else if(s.has_data)await loadSummary();else $('welcome').hidden=false;fillRules();}
window.startWorkbench=init;
