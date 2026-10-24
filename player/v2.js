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
function identity(){const explicit=p.get("slug")||p.get("anime")||p.get("animeSlug"),id=p.get("animeId")||p.get("id"),title=p.get("title")||p.get("name"),slug=explicit||(id&&!/^\d+$/.test(id.trim())?id:"")||title,ep=p.get("episode")||p.get("ep")||p.get("episodeNumber");return slug&&ep?{slug:slug.trim(),ep:ep.trim()}:null}
function apiRows(payload){
 if(Array.isArray(payload))return payload;
 if(!payload||typeof payload!=="object")return[];
 for(const key of ["data","items","results","releases","list","entries"])if(Array.isArray(payload[key]))return payload[key];
 if(payload.data&&typeof payload.data==="object")for(const key of ["items","results","releases","list","entries"])if(Array.isArray(payload.data[key]))return payload.data[key];
 return payload.release&&typeof payload.release==="object"?[payload.release]:payload.id||payload.alias?[payload]:[];
}
function titleKey(value){return String(value||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9а-яё]+/gi," ").trim()}
function releaseNames(item){const n=item&&item.name,ns=item&&item.names;return [typeof n==="string"?n:n?.main,n?.english,n?.alternative,typeof item?.title==="string"?item.title:item?.title?.main,ns?.ru,ns?.en,ns?.alternative,item?.alias,item?.code].filter(v=>typeof v==="string"&&v.trim())}
function episodeNumber(item){
 for(const key of ["episode","number","ordinal","position","sortOrder","sort_order","episodeNumber","episode_number"]){
  const raw=item?.[key],n=Number(raw&&typeof raw==="object"?(raw.ordinal??raw.number??raw.episode):raw);if(Number.isFinite(n)&&n>0&&n<10000)return n;
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
   if(/^\d+(?:\.\d+)?$/.test(key)&&Number(key)===wanted&&val&&typeof val==="object"){found.push(val);walk(val,depth+1);continue}
   if(val&&typeof val==="object"){walk(val,depth+1);continue}
   if(typeof val==="string"&&/^\d+(?:\.\d+)?$/.test(key)&&Number(key)===wanted&&val.length>10){found.push({episode:wanted,url:val})}
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
   if(u&&(/\.m3u8(?:$|[?#])/i.test(u)||/\.mp4(?:$|[?#])/i.test(u))&&(/hls|url|src|video|stream|720|1080|480|fhd|hd|sd|m3u8|mp4/i.test(key)||/\.(m3u8|mp4)(?:$|[?#])/i.test(u))&&!seen.has(u)){seen.add(u);found.push({url:u,type:/m3u8/i.test(u)?"hls":"mp4",label:key||"Видео"})}
   return;
  }
  if(Array.isArray(value)){value.forEach((v,i)=>walk(v,String(i),depth+1));return}
  if(typeof value==="object")for(const [k,v] of Object.entries(value))walk(v,k,depth+1);
 }
 walk(node);return found;
}
async function aniLibertySources(id){
 const title=p.get("title")||p.get("name")||id.slug,queries=[title,id.slug].filter((v,i,a)=>v&&a.indexOf(v)===i),out=[];
 for(const query of queries){
  try{
   const search=new URL("/api/aniliberty/app/search/releases",location.origin);search.searchParams.set("query",query);search.searchParams.set("limit","30");
   const sr=await fetch(search.href,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"});
   if(!sr.ok)continue;const searchPayload=await sr.json(),rows=apiRows(searchPayload);
   if(!rows.length)continue;
   const wanted=titleKey(title),slugKey=titleKey(id.slug);
   const score=x=>{
    const names=releaseNames(x).map(titleKey).filter(Boolean);
    return (names.some(n=>n===wanted)?6:0)+(names.some(n=>n===slugKey)?5:0)
     +(names.some(n=>n.length>3&&wanted.length>3&&(n.includes(wanted)||wanted.includes(n))?true:false)?2:0)
     +(names.some(n=>n.length>3&&slugKey.length>3&&(n.includes(slugKey)||slugKey.includes(n))?true:false)?1:0);
   };
   rows.sort((a,b)=>score(b)-score(a));
   const relevant=rows.filter(row=>score(row)>=2).slice(0,30);
   for(const row of relevant){
    const alias=row.alias||row.code||row.slug||row.id||row.releaseId||row.release_id;
    if(alias==null)continue;
    let release=row;
    const detail=new URL("/api/aniliberty/anime/releases/"+encodeURIComponent(String(alias)),location.origin);
    try{const dr=await fetch(detail.href,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"});if(dr.ok){const dp=await dr.json();release=dp?.data?.release||dp?.data||dp?.release||dp}}catch(_){}
    const epNodes=matchingEpisodeNodes(release,Number(id.ep));
    const voiceValues=[];
    for(const candidate of [release,...epNodes]){
     if(!candidate||typeof candidate!=="object")continue;
     const values=[
      candidate?.team?.voice,candidate?.team?.voices,candidate?.team?.voiceover,
      candidate?.team?.voiceovers,candidate?.voice,candidate?.voices,
      candidate?.voiceover,candidate?.voiceovers,candidate?.dub,candidate?.dubbing
     ];
     for(const raw of values){
      for(const item of (Array.isArray(raw)?raw:[raw])){
       const name=typeof item==="string"?item:item?.name||item?.title||item?.nickname||item?.label||"";
       if(typeof name==="string"&&name.trim())voiceValues.push(name.trim());
      }
     }
    }
    const teamLabel=[...new Set(voiceValues)].slice(0,6).join(", ");
    // Only show verified Russian-dub releases; do not invent a voice team.
    if(!teamLabel)continue;
    for(const node of epNodes){
     const media=mediaUrls(node);
     for(const item of media) {
      const qualityMatch=String(item.label||"").match(/(?:^|[^0-9])(1080|720|480|360)(?:p|[^0-9]|$)/i);
      const quality=qualityMatch?" · "+qualityMatch[1]+"p":"";
      const normalized=source({...item,label:"AniLiberty · "+teamLabel+quality,provider:"AniLiberty",voice:teamLabel,language:"ru"},0,"AniLiberty");
      if(normalized) out.push(normalized);
     }
    }
   }
  }catch(e){console.warn("[ANIMORA Player] AniLiberty lookup failed",e)}
 }
 return dedupe(out);
}
async function animeVostSources(id){
 const title=p.get("title")||p.get("name")||id.slug;
 const queries=[title,id.slug].filter((v,i,a)=>v&&a.indexOf(v)===i),out=[];
 const wanted=titleKey(title),slugKey=titleKey(id.slug);
 const score=row=>{
  const names=releaseNames(row).map(titleKey).filter(Boolean);
  return (names.some(n=>n===wanted)?6:0)+(names.some(n=>n===slugKey)?5:0)
   +(names.some(n=>n.length>3&&wanted.length>3&&(n.includes(wanted)||wanted.includes(n)))?2:0)
   +(names.some(n=>n.length>3&&slugKey.length>3&&(n.includes(slugKey)||slugKey.includes(n)))?1:0);
 };
 const seen=new Set();
 for(const query of queries){
  try{
   const search=new URL("/api/animevost/search",location.origin);
   search.searchParams.set("query",query);
   const response=await fetch(search.href,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"});
   if(!response.ok)continue;
   const rows=apiRows(await response.json()).sort((a,b)=>score(b)-score(a));
   for(const row of rows.filter(x=>score(x)>=2).slice(0,5)){
    const titleId=String(row.id??row.anime_id??row.animeId??"").trim();
    if(!/^\d{1,12}$/.test(titleId)||seen.has(titleId))continue;
    seen.add(titleId);
    const playlistUrl=new URL("/api/animevost/playlist",location.origin);
    playlistUrl.searchParams.set("id",titleId);
    const pr=await fetch(playlistUrl.href,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"});
    if(!pr.ok)continue;
    const items=apiRows(await pr.json());
    for(const item of items){
     const name=String(item?.name||item?.title||"");
     const match=name.match(/^\s*(\d{1,4})(?:\.\d+)?(?:\D|$)/);
     if(!match||Number(match[1])!==Number(id.ep))continue;
     const candidates=[["hd",item?.hd],["sd",item?.sd],["url",item?.url],["videoUrl",item?.videoUrl]];
     for(const [quality,value] of candidates){
      const raw=String(value||"").trim();
      let parsed;try{parsed=new URL(raw)}catch(_){continue}
      if(!/^https?:$/.test(parsed.protocol)||!(/\.m3u8(?:$|[?#])|\.mp4(?:$|[?#])/i.test(parsed.href)))continue;
      const ext=/\.m3u8(?:$|[?#])/i.test(parsed.href)?"hls":"mp4";
      const normalized=source({url:parsed.href,type:ext,label:"AnimeVost · русская озвучка"+(quality==="hd"?" · HD":quality==="sd"?" · SD":""),provider:"AnimeVost",language:"ru"},0,"AnimeVost");
      if(normalized)out.push(normalized);
     }
    }
   }
  }catch(e){console.warn("[ANIMORA Player] AnimeVost lookup failed",e)}
 }
 return dedupe(out);
}
async function animeGoSources(id){
 const title=p.get("title")||p.get("name")||id.slug;
 const queries=[title,id.slug].filter((v,i,a)=>v&&a.indexOf(v)===i),out=[],seen=new Set();
 const wanted=titleKey(title),slugKey=titleKey(id.slug);
 const score=row=>{
  const names=[row?.title,row?.slug].map(titleKey).filter(Boolean);
  return (names.some(n=>n===wanted)?6:0)+(names.some(n=>n===slugKey)?5:0)
   +(names.some(n=>n.length>3&&wanted.length>3&&(n.includes(wanted)||wanted.includes(n)))?2:0)
   +(names.some(n=>n.length>3&&slugKey.length>3&&(n.includes(slugKey)||slugKey.includes(n)))?1:0);
 };
 for(const query of queries){
  try{
   const search=new URL("/api/animego/search",location.origin);search.searchParams.set("query",query);
   const sr=await fetch(search.href,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"});
   if(!sr.ok)continue;
   const payload=await sr.json(),rows=apiRows(payload).sort((a,b)=>score(b)-score(a));
   for(const row of rows.filter(x=>score(x)>=2).slice(0,3)){
    const idValue=String(row.id||"").trim();if(!/^\\d{1,12}$/.test(idValue))continue;
    const key=idValue+":"+Number(id.ep);if(seen.has(key))continue;seen.add(key);
    const url=new URL("/api/animego/players",location.origin);url.searchParams.set("id",idValue);url.searchParams.set("episode",String(Number(id.ep)));
    const pr=await fetch(url.href,{headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"});
    if(!pr.ok)continue;const pp=await pr.json();
    for(const item of apiRows(pp)){
     const embed=urlSafe(item.url);if(!embed)continue;
     const provider=String(item.provider||"AnimeGO");
     const label=String(item.label||"Русская озвучка").trim();
     const normalized=source({url:embed,kind:"iframe",label:"AnimeGO · "+label+" · "+provider,provider,language:"ru"},0,"AnimeGO");
     if(normalized)out.push(normalized);
    }
   }
  }catch(e){console.warn("[ANIMORA Player] AnimeGO lookup failed",e)}
 }
 return dedupe(out);
}
function urlSafe(value){try{const u=new URL(String(value||"").trim());return /^https?:$/.test(u.protocol)?u.href:""}catch(_){return""}}
async function apiSources(){
 // Playback is restricted to the configured Russian-language providers.
 // Legacy URL parameters cannot enable a foreign provider.
 const id=identity();
 if(!id)return[];
 try{return dedupe([...(await aniLibertySources(id)),...(await animeVostSources(id)),...(await animeGoSources(id))])}
 catch(e){console.warn("[ANIMORA Player] Russian source lookup failed",e);return[]}
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
async function initialise(){loading("Ищем русскую озвучку и доступный видеопоток…");sources=await apiSources();fillSelect();if(!sources.length){error("Не удалось найти доступный русскоязычный поток для этой серии. Зарубежные источники отключены.");$("diagnostic").hidden=false;$("diagnostic").textContent="ANIMORA проверила русскоязычные источники AniLiberty и AnimeVost. Автоматического перехода на зарубежные источники нет.";return}start(0)}
initialise().catch(e=>{console.error("[ANIMORA Player] init failed",e);error("Ошибка при получении источников. Нажмите «Повторить источник».")});
})();