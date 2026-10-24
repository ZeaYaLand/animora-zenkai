(function () {
"use strict";
const $=id=>document.getElementById(id), p=new URLSearchParams(location.search);
let sources=[],active=-1,frame=$("engineFrame"),attempt=0,lastError=0;
function url(raw){try{const u=new URL(String(raw||"").trim(),location.href);return /^https?:$/.test(u.protocol)?u.href:""}catch(_){return""}}
function parse(raw){try{const x=JSON.parse(raw||"[]");return Array.isArray(x)?x:x&&typeof x==="object"?[x]:[]}catch(_){return[]}}
function source(item,i,provider){
 if(typeof item==="string")item={url:item};if(!item||typeof item!=="object")return null;
 const embed=url(item.iframeUrl||item.embedUrl||"");
 const direct=item.videoUrl||item.url||item.src||item.href||item.externalUrl||"";
 const u=url(direct||embed);if(!u)return null;
 const type=String(item.type||item.format||(String(item.provider||"").toUpperCase()==="HLS"?"hls":"")).toLowerCase();
 const kind=String(item.kind||item.mode||(!direct&&embed||/iframe|embed/i.test(type)?"iframe":"")).toLowerCase();
 return {url:u,type,kind,label:String(item.label||item.name||item.provider||provider||("Источник "+(i+1))),poster:url(item.poster||item.thumbnail||p.get("poster")||"")};
}
function dedupe(list){const seen=new Set();return list.filter(Boolean).filter(s=>!seen.has(s.url)&&seen.add(s.url))}
function directSources(){const out=[],direct=p.get("src")||p.get("url")||p.get("videoUrl")||p.get("file");if(direct)out.push(source({url:direct,type:p.get("type"),label:p.get("provider")||"Переданный источник"},0));for(const k of ["sources","fallbacks","alternatives"])for(const x of parse(p.get(k)))out.push(source(x,out.length));return dedupe(out)}
function identity(){const explicit=p.get("slug")||p.get("anime")||p.get("animeSlug"),id=p.get("animeId")||p.get("id"),title=p.get("title")||p.get("name"),slug=explicit||(id&&!/^\d+$/.test(id.trim())?id:"")||title,ep=p.get("episode")||p.get("ep")||p.get("episodeNumber");return slug&&ep?{slug:slug.trim(),ep:ep.trim()}:null}
function apiRows(payload){
 if(Array.isArray(payload))return payload;
 if(!payload||typeof payload!=="object")return[];
 for(const key of ["data","items","results","releases","list","entries"])if(Array.isArray(payload[key]))return payload[key];
 if(payload.data&&typeof payload.data==="object")for(const key of ["items","results","releases","list","entries"])if(Array.isArray(payload.data[key]))return payload.data[key];
 return payload.release&&typeof payload.release==="object"?[payload.release]:payload.id||payload.alias?[payload]:[];
}
function titleKey(value){return String(value||"").toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-z0-9а-яё]+/gi," ").trim()}
function releaseNames(item){const n=item&&item.names;return [item?.name,item?.title,item?.names?.ru,item?.names?.en,item?.names?.alternative,item?.alias,item?.code].filter(Boolean)}
function episodeNumber(item){
 for(const key of ["episode","number","ordinal","position","sortOrder","sort_order","episodeNumber","episode_number"]){
  const n=Number(item?.[key]);if(Number.isFinite(n)&&n>0&&n<10000)return n;
 }
 return null;
}
function matchingEpisodeNodes(release,wanted){
 const found=[],seen=new Set();
 function walk(node,depth){
  if(!node||typeof node!=="object"||depth>9||seen.has(node))return;seen.add(node);
  if(!Array.isArray(node)&&episodeNumber(node)===wanted){
   const hasMedia=JSON.stringify(node).match(/m3u8|hls|stream|video|player/i);
   if(hasMedia)found.push(node);
  }
  if(Array.isArray(node)){for(const x of node)walk(x,depth+1);return}
  for(const [key,val] of Object.entries(node)){
   if(val&&typeof val==="object"){walk(val,depth+1);continue}
   if(typeof val==="string"&&/^\\d+(?:\\.\\d+)?$/.test(key)&&Number(key)===wanted&&val.length>10){found.push({episode:wanted,url:val})}
  }
 }
 walk(release,0);return found;
}
function mediaUrls(node){
 const found=[],seen=new Set();
 function walk(value,key="",depth=0){
  if(depth>9||value==null)return;
  if(typeof value==="string"){
   const u=url(value);
   if(u&&(/\\.m3u8(?:$|[?#])/i.test(u)||/\\.mp4(?:$|[?#])/i.test(u))&&(/hls|url|src|video|stream|720|1080|480|fhd|hd|sd|m3u8|mp4/i.test(key)||/\\.(m3u8|mp4)(?:$|[?#])/i.test(u))&&!seen.has(u)){seen.add(u);found.push({url:u,type:/m3u8/i.test(u)?"hls":"mp4",label:key||"Видео"})}
   return;
  }
  if(Array.isArray(value)){value.forEach((v,i)=>walk(v,String(i),depth+1));return}
  if(typeof value==="object")for(const [k,v] of Object.entries(value))walk(v,k,depth+1);
 }
 walk(node);return found;
}
async function aniLibertySources(id){
 const title=p.get("title")||p.get("name")||id.slug,queries=[title,id.slug].filter((v,i,a)=>v&&a.indexOf(v)===i);
 for(const query of queries){
  try{
   const search=new URL("/api/aniliberty/app/search/releases",location.origin);search.searchParams.set("query",query);search.searchParams.set("limit","20");
   const sr=await fetch(search.href,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"});
   if(!sr.ok)continue;const searchPayload=await sr.json(),rows=apiRows(searchPayload);
   if(!rows.length)continue;
   const wanted=titleKey(title),slugKey=titleKey(id.slug);
   rows.sort((a,b)=>{
    const score=x=>{const names=releaseNames(x).map(titleKey);return (names.some(n=>n===wanted)?6:0)+(names.some(n=>n===slugKey)?5:0)+(names.some(n=>n.includes(wanted)||wanted.includes(n))?2:0)};
    return score(b)-score(a);
   });
   for(const row of rows.slice(0,8)){
    const alias=row.alias||row.code||row.slug||row.id||row.releaseId||row.release_id;
    if(alias==null)continue;
    let release=row;
    const detail=new URL("/api/aniliberty/anime/releases/"+encodeURIComponent(String(alias)),location.origin);
    try{const dr=await fetch(detail.href,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"});if(dr.ok){const dp=await dr.json();release=dp?.data||dp?.release||dp}}catch(_){}
    const epNodes=matchingEpisodeNodes(release,Number(id.ep));
    for(const node of epNodes){
     const media=mediaUrls(node);
     const team=release?.team?.voice||release?.team?.voices||release?.voice||[];
     const teamLabel=Array.isArray(team)?team.map(x=>typeof x==="string"?x:x?.name||x?.title).filter(Boolean).slice(0,2).join(", "):String(team||"");
     for(const item of media) {
      const quality=item.label&&/^\\d+$/.test(item.label)?" · "+item.label+"p":"";
      const dub=teamLabel?" · "+teamLabel:"";
      const normalized=source({...item,label:"AniLiberty · русская озвучка"+dub+quality,provider:"AniLiberty"},0,"AniLiberty");
      if(normalized) return [normalized];
     }
    }
   }
  }catch(e){console.warn("[ANIMORA Player] AniLiberty lookup failed",e)}
 }
 return[];
}
async function apiSources(){
 const id=identity();if(!id)return[];const asked=(p.get("api")||p.get("sourceApi")||"").toLowerCase(),providers=asked?[asked]:["aniliberty","animeav1","tioanime"],out=[];
 for(const provider of providers){if(provider==="aniliberty"){out.push(...await aniLibertySources(id));if(asked&&out.length)break;continue}if(!/^[a-z0-9-]+$/.test(provider))continue;const endpoint=new URL("/api/"+provider+"/sources",location.origin);endpoint.searchParams.set("slug",id.slug);endpoint.searchParams.set("episode",id.ep);if(p.get("variant"))endpoint.searchParams.set("variant",p.get("variant"));if(p.get("refresh"))endpoint.searchParams.set("refresh",p.get("refresh"));
  try{const r=await fetch(endpoint.href,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"});if(!r.ok){console.warn("[ANIMORA Player] "+provider+" returned HTTP "+r.status);continue}const data=await r.json(),rows=Array.isArray(data.sources)?data.sources:Array.isArray(data.data)?data.data:Array.isArray(data.results)?data.results:[];out.push(...rows.map((x,i)=>source(x,i,provider)));if(asked&&data.ok&&out.length)break}catch(e){console.warn("[ANIMORA Player] API failed:",provider,e)}
 }
 return dedupe(out);
}
function loading(text,title){$("loading").hidden=false;$("error").hidden=true;$("loadingText").textContent=text||"Проверяем доступность видео";$("loadingTitle").textContent=title||"Подключаем источник…"}
function error(text){$("loading").hidden=true;$("error").hidden=false;$("errorText").textContent=text}
function isEmbed(s){return /iframe|embed/i.test(s.kind)||/\/embed\/|\/player\/|\.html(?:$|[?#])/i.test(s.url)}
function engineUrl(s){const u=new URL("/player/v2-engine.html",location.origin);u.searchParams.set("src",s.url);u.searchParams.set("title",p.get("title")||p.get("name")||"Просмотр аниме");u.searchParams.set("episode",p.get("episode")||p.get("ep")||"");u.searchParams.set("type",s.type||(/\.m3u8(?:$|[?#])/i.test(s.url)?"m3u8":""));u.searchParams.set("sources",String(sources.length));if(s.poster)u.searchParams.set("poster",s.poster);for(const k of ["subtitle","tracks","returnTo","hasNext","start","fit"])if(p.get(k))u.searchParams.set(k,p.get(k));return u.href}
function start(index){
 if(!sources.length)return;active=Math.max(0,Math.min(index,sources.length-1));const my=++attempt,s=sources[active];$("sourceSelect").value=String(active);
 loading("Источник "+(active+1)+" из "+sources.length+": "+s.label,isEmbed(s)?"Открываем внешний плеер…":"Запускаем видеоплеер…");
 const old=frame,next=old.cloneNode(false);next.id="engineFrame";old.replaceWith(next);frame=next;
 const embed=$("embedFrame");embed.hidden=true;embed.removeAttribute("src");frame.hidden=isEmbed(s);
 if(isEmbed(s)){embed.hidden=false;embed.src=s.url;$("loading").hidden=true;return}
 frame.src=engineUrl(s);
 window.setTimeout(()=>{if(my!==attempt||$("error").hidden===false)return;if(!$("loading").hidden)fail("Плеер не подтвердил запуск за отведённое время.")},16000);
}
function fail(reason){
 const now=Date.now();if(now-lastError<700)return;lastError=now;
 if(active>=0&&active+1<sources.length){console.warn("[ANIMORA Player] source failed, trying fallback:",reason);start(active+1)}
 else error("Источник не запустился. "+(sources.length>1?"Выберите другой источник в списке.":"Для этой серии не найден другой доступный источник."));
}
function fillSelect(){const sel=$("sourceSelect");sel.replaceChildren();sources.forEach((s,i)=>{const o=document.createElement("option");o.value=String(i);o.textContent=s.label;sel.appendChild(o)});sel.disabled=sources.length<2}
window.addEventListener("message",ev=>{
 if(ev.origin!==location.origin||ev.source!==frame.contentWindow)return;
 let m=ev.data;if(typeof m==="string"){try{m=JSON.parse(m)}catch(_){return}}if(!m||!m.vcmd)return;
 if(["play","playing","ready","progress"].includes(m.vcmd)){$("loading").hidden=true;$("error").hidden=true;return}
 if(m.vcmd==="error")fail(m.val||"ошибка воспроизведения");
 if(m.vcmd==="back"){const ret=p.get("returnTo");location.href=ret&&ret.startsWith("/")&&!ret.startsWith("//")?ret:"/";}
});
$("title").textContent=p.get("title")||p.get("name")||"Просмотр аниме";
const ep=p.get("episode")||p.get("ep");$("episode").textContent=ep?"Серия "+ep:"";
$("back").addEventListener("click",()=>{const ret=p.get("returnTo");if(ret&&ret.startsWith("/")&&!ret.startsWith("//"))location.href=ret;else if(history.length>1)history.back();else location.href="/"});
$("retry").addEventListener("click",()=>start(Math.max(0,active)));
$("sourceSelect").addEventListener("change",()=>start(Number($("sourceSelect").value)));
async function initialise(){loading("Ищем доступные русские озвучки и источники серии…");const direct=directSources();if(direct.length){sources=direct;const id=identity();if(id){const russian=await aniLibertySources(id);sources=dedupe([...russian,...direct])}}else sources=await apiSources();fillSelect();if(!sources.length){error("ANIMORA не получила источники серии. Попробуйте обновить список или выбрать другую серию.");$("diagnostic").hidden=false;$("diagnostic").textContent="Проверены AniLiberty, AnimeAV1 и TioAnime. Доступность озвучки зависит от наличия релиза и рабочего видеопотока у источника.";return}start(0)}
initialise().catch(e=>{console.error("[ANIMORA Player] init failed",e);error("Ошибка при получении источников. Нажмите «Повторить источник».")});
})();