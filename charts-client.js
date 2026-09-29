(function(root){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function nice(x){if(x<=0)return 1;const p=10**Math.floor(Math.log10(x));return [1,2,2.5,5,10].find(n=>n*p>=x)*p;}
function svgChart(well,records,feature,source='',start='',end='',smooth=0){
 const ordinal=s=>Date.parse(s+'T00:00:00Z')/86400000,iso=n=>new Date(n*86400000).toISOString().slice(0,10),rs=records.filter(r=>(!start||r.date>=start)&&(!end||r.date<=end)),L=96,R=1128,top=102,panel=183;
 const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="980" viewBox="0 0 1200 980" role="img" aria-label="${esc(well)} 生产曲线" style="font-family:Microsoft YaHei,Arial,sans-serif">`,'<rect width="1200" height="980" fill="#ffffff"/>',`<text x="38" y="42" fill="#123b3a" font-size="24" font-weight="700">${esc(well)} · 生产历史曲线</text>`,`<text x="38" y="70" fill="#657b7b" font-size="13">${esc(source.slice(0,72))} ｜ ${esc(feature.label)} ｜ 形态筛选结果，需结合井史复核</text>`];
 if(!rs.length)return out.join('')+'<text x="400" y="240" font-size="22" fill="#708383">所选日期范围没有记录</text></svg>';
 const d0=ordinal(rs[0].date),span=Math.max(1,ordinal(rs.at(-1).date)-d0),xval=d=>L+(ordinal(d)-d0)/span*(R-L);
 const specs=[['日产气 / 万 m³·d⁻¹',[['gas','日产气','#168778',.0001]]],['井口压力 / MPa',[['tubing','油压','#c88c36',1],['casing','套压','#577ca9',1]]],['日产水 / m³·d⁻¹',[['water','日产水','#447fc2',1]]],['水气比 / m³·(万 m³)⁻¹',[['wgr','水气比','#a471ad',1]]]];
 const value=(r,k)=>k==='wgr'?(r.water!=null&&r.gas>0?r.water/r.gas*10000:null):r[k];
 specs.forEach(([title,series],idx)=>{
  const ytop=top+idx*panel,ybot=ytop+130,values=series.flatMap(([key,n,c,f])=>rs.filter(r=>value(r,key)!=null).map(r=>value(r,key)*f)),max=values.reduce((m,v)=>Math.max(m,v),0),ymax=max>0?nice(max*1.06):1;
  out.push(`<text x="38" y="${ytop-12}" fill="#294b4a" font-size="14" font-weight="600">${title}</text>`);
  for(let t=0;t<5;t++){const y=ybot-130*t/4,v=Number((ymax*t/4).toPrecision(4));out.push(`<line x1="${L}" x2="${R}" y1="${y}" y2="${y}" stroke="#e9efed"/><text x="${L-12}" y="${y+4}" text-anchor="end" fill="#859391" font-size="11">${v}</text>`);}
  for(let j=0;j<5;j++)out.push(`<text x="${L+(R-L)*j/4}" y="${ybot+20}" text-anchor="middle" fill="#859391" font-size="10">${iso(d0+Math.round(span*j/4))}</text>`);
  if(!values.length)out.push(`<text x="550" y="${ytop+64}" fill="#9baba7" font-size="15">没有有效数据</text>`);
  series.forEach(([key,name,color,fac],si)=>{
   let current=[],prev=null;const paths=[];
   for(const r of rs){const v=value(r,key),d=ordinal(r.date);if(v==null||(prev!=null&&d-prev>1)){if(current.length)paths.push(current);current=[];}if(v!=null)current.push([xval(r.date),ybot-v*fac/ymax*130]);prev=d;}if(current.length)paths.push(current);
   for(const seg of paths){if(seg.length===1)out.push(`<circle cx="${seg[0][0].toFixed(2)}" cy="${seg[0][1].toFixed(2)}" r="1.5" fill="${color}"/>`);else out.push(`<polyline points="${seg.map(([x,y])=>x.toFixed(2)+','+y.toFixed(2)).join(' ')}" fill="none" stroke="${color}" stroke-width="1.25" stroke-linejoin="round" opacity="${smooth&&key==='gas'?.42:.86}"/>`);}
   if(smooth&&key==='gas'){
    let buf=[],sm=[],previous=null;const push=()=>{if(sm.length>1)out.push(`<polyline points="${sm.join(' ')}" fill="none" stroke="${color}" stroke-width="2.2"/>`);};
    for(const r of rs){const d=ordinal(r.date),v=r.gas;if(v==null||(previous!=null&&d-previous>1)){push();sm=[];buf=[];}if(v!=null){buf.push(v);buf=buf.slice(-smooth);sm.push(xval(r.date).toFixed(2)+','+(ybot-buf.reduce((a,b)=>a+b,0)/buf.length*fac/ymax*130).toFixed(2));}previous=d;}push();
   }
   const lx=850+si*115;out.push(`<line x1="${lx}" x2="${lx+22}" y1="${ytop-15}" y2="${ytop-15}" stroke="${color}" stroke-width="2"/><text x="${lx+30}" y="${ytop-11}" font-size="11" fill="#657b7b">${name}</text>`);
  });
 });
 if(smooth)out.push(`<text x="38" y="870" fill="#6e8580" font-size="12">产气深色线：连续日记录的 ${smooth} 日移动均值；遇缺日或缺值中断。分类仍使用原始值。</text>`);
 out.push(`<text x="38" y="897" fill="#6e8580" font-size="12">有效日记录 ${rs.length.toLocaleString()} ｜ 时间 ${rs[0].date} — ${rs.at(-1).date} ｜ 日期缺口、缺值留空；零值保留。</text>`,'<text x="38" y="922" fill="#6e8580" font-size="12">水气比由同日产水 / 产气 × 10000 计算；产气为零时不计算。井口压力不能代替地层压差。</text>','<text x="38" y="947" fill="#6e8580" font-size="12">分类特征按本井末日向前取窗；显示日期范围与平滑设置只影响绘图。</text></svg>');return out.join('');
}
root.svgChart=svgChart;if(typeof module!=='undefined')module.exports=svgChart;
})(typeof self!=='undefined'?self:globalThis);
