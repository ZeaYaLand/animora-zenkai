(function () {
"use strict";
const $=id=>document.getElementById(id), p=new URLSearchParams(location.search);
let sources=[],active=-1,frame=$("engineFrame"),attempt=0,lastError=0;
function url(raw){try{const u=new URL(String(raw||"").trim(),location.href);return /^https?:$/.test(u.protocol)?u.href:""}catch(_){return""}}
function parse(raw){try{const x=JSON.parse(raw||"[]");return Array.isArray(x)?x:x&&typeof x==="object"?[x]:[]}catch(_){return[]}}
function source(item,i,provider){
 if(typeof item==="string")item={url:item};if(!item||typeof item!=="object")return null;
 const embed=url(item.iframeUrl||item.embedUrl||"");
 const u=url(item.videoUrl||item.url||item.src||item.href||item.externalUrl||embed);if(!u)return null;
 const type=String(item.type||item.format||(String(item.provider||"").toUpperCase()==="HLS"?"hls":"")).toLowerCase();
 const kind=String(item.kind||item.mode||(embed||/iframe|embed/i.test(type)?"iframe":"")).toLowerCase();
 return {url:u,type,kind,label:String(item.label||item.name||item.provider||provider||("Источник "+(i+1))),poster:url(item.poster||item.thumbnail||p.get("poster")||"")};
}
function dedupe(list){const seen=new Set();return list.filter(Boolean).filter(s=>!seen.has(s.url)&&seen.add(s.url))}
function directSources(){const out=[],direct=p.get("src")||p.get("url")||p.get("videoUrl")||p.get("file");if(direct)out.push(source({url:direct,type:p.get("type"),label:p.get("provider")||"Переданный источник"},0));for(const k of ["sources","fallbacks","alternatives"])for(const x of parse(p.get(k)))out.push(source(x,out.length));return dedupe(out)}
function identity(){const explicit=p.get("slug")||p.get("anime")||p.get("animeSlug"),id=p.get("animeId")||p.get("id"),slug=explicit||(id&&!/^\d+$/.test(id.trim())?id:""),ep=p.get("episode")||p.get("ep")||p.get("episodeNumber");return slug&&ep?{slug:slug.trim(),ep:ep.trim()}:null}
async function apiSources(){
 const id=identity();if(!id)return[];const asked=(p.get("api")||p.get("sourceApi")||"").toLowerCase(),providers=asked?[asked]:["animeav1","tioanime"],out=[];
 for(const provider of providers){if(!/^[a-z0-9-]+$/.test(provider))continue;const endpoint=new URL("/api/"+provider+"/sources",location.origin);endpoint.searchParams.set("slug",id.slug);endpoint.searchParams.set("episode",id.ep);if(p.get("variant"))endpoint.searchParams.set("variant",p.get("variant"));if(p.get("refresh"))endpoint.searchParams.set("refresh",p.get("refresh"));
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
async function initialise(){loading("Получаем список источников серии…");sources=directSources();if(!sources.length)sources=await apiSources();fillSelect();if(!sources.length){error("ANIMORA не получила источники серии. Проверьте slug, номер серии и доступность API источников.");$("diagnostic").hidden=false;$("diagnostic").textContent="Проверены API animeav1 и tioanime. Если они возвращают 403 или пустой список, плееру неоткуда получить видеопоток.";return}start(0)}
initialise().catch(e=>{console.error("[ANIMORA Player] init failed",e);error("Ошибка при получении источников. Нажмите «Повторить источник».")});
})();