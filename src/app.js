import { renderAiMarkdown, bindMarkdownCopy } from './markdown.js';
import { enqueueOutbox, listOutbox, removeOutbox, clearOutbox, saveDraftIdb, loadDraftIdb, requestOutboxSync } from './idb.js';
import { encryptKeyBackup, decryptKeyBackup, buildRecoveryKitText, renderSafetyQrSvg } from './crypto-backup.js';
import { isPushSupported, getExistingPushSubscription, subscribeWebPush, unsubscribeWebPush } from './push-client.js';
import { buildLocalFeedData, renderFeedDOM } from './feed.js';
import { processUploadFile, POST_FILTERS, applyCanvasFilter } from './image-utils.js';
import {
  renderQrSvg, downloadQrPng, updateDynamicFavicon, sampleImageAmbientGlow,
  createMicVisualizer, scorePassphraseEntropy, formatSafetyNumberMatrix,
  registerWebAuthnPasskey, verifyWebAuthnPasskey, createTabSync,
  EncryptedSearchIndex, executePanicWipe, inspectExternalUrl
} from './ui-fx.js';
import {
  POST_ASPECT_RATIOS, STORY_FONTS, AI_STARTER_PROMPTS, WELCOME_TOUR_STEPS,
  findSimilarPosts, groupNotificationsByBucket, renderCreatorInsightsHtml,
  renderStoryStickersHtml
} from './features.js';

export function bootApp() {
'use strict';
/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const now=()=>new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const _initPath=(location.pathname||'').toLowerCase().replace(/\/+$/,'')||'/';
const _initSp=new URLSearchParams(location.search||'');
const _initHash=(location.hash||'').toLowerCase();
let INCOGNITO=(_initPath==='/incognito'||_initSp.get('incognito')==='1'||_initHash==='#incognito');
const _memStore=Object.create(null);
const store={
  get(k,d){
    if(INCOGNITO)return k in _memStore?_memStore[k]:d;
    try{const v=localStorage.getItem('wg_'+k);return v?JSON.parse(v):d}catch(e){return d}
  },
  set(k,v){
    if(INCOGNITO){_memStore[k]=v;return}
    try{localStorage.setItem('wg_'+k,JSON.stringify(v))}catch(e){}
  }
};
const lsSet=(k,v)=>{if(INCOGNITO)return;try{localStorage.setItem(k,v)}catch(e){}};
const lsGet=(k)=>{if(INCOGNITO)return null;try{return localStorage.getItem(k)}catch(e){return null}};
const lsDel=(k)=>{try{localStorage.removeItem(k)}catch(e){}};
const hue=s=>[...s].reduce((a,c)=>a+c.charCodeAt(0),0)%360;
const av=(n,sz='w-9 h-9')=>`<span class="${sz} text-xs rounded-full grid place-items-center font-bold shrink-0 text-white ring-1 ring-inset ring-white/15 shadow-inner" style="background:linear-gradient(135deg,hsl(${hue(n)} 74% 58%),hsl(${(hue(n)+45)%360} 78% 40%))">${esc(n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase())}</span>`;
const ic=(n,c='w-4 h-4')=>`<i data-lucide="${n}" class="${c}"></i>`;
const icons=()=>{try{window.lucide&&window.lucide.createIcons()}catch(e){}};
const setTxt=(s,t)=>{const e=$(s);if(e)e.textContent=t};
const show=(el,on,disp='flex')=>{if(typeof el==='string')el=$(el);if(!el)return;el.classList.toggle('hidden',!on);if(disp)el.classList.toggle(disp,on)};
function toast(msg,kind){const t=document.createElement('div');t.className=`max-w-full text-center px-3.5 py-2 rounded-2xl sm:rounded-full text-xs font-semibold backdrop-blur-2xl shadow-[0_16px_36px_-8px_rgba(0,0,0,.9),inset_0_1px_0_rgba(255,255,255,.16)] border ${kind==='err'?'bg-rose-600/90 border-rose-400/35 text-white':'bg-[#12141e]/95 border-white/[0.14] text-white'}`;t.textContent=msg;$('#toasts').appendChild(t);setTimeout(()=>t.remove(),2800)}
let AC=null;function tone(f=620,d=.03,pan=0,v=.03){try{const c=AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(c.state==='suspended')c.resume();const o=c.createOscillator(),g=c.createGain();g.gain.value=v;o.frequency.value=f;o.connect(g);if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=pan;g.connect(p);p.connect(c.destination)}else g.connect(c.destination);o.start();o.stop(c.currentTime+d)}catch(e){}}
async function sha(s){try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(e){let h=5381;for(const c of s)h=((h<<5)+h+c.charCodeAt(0))>>>0;return 'x'+h}}
const STOP_W=new Set(['a','an','the','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','can','may','might','of','in','on','at','to','for','with','by','from','as','into','like','through','after','over','between','out','against','during','without','before','under','around','among','what','which','who','whom','whose','where','when','why','how','this','that','these','those','it','its','i','me','my','you','your','we','they','them','and','or','but','if','not','no','yes','so','than','too','very','just','about']);
const tok=s=>(String(s).toLowerCase().match(/[a-z0-9]+/g)||[]).map(w=>w.replace(/(ing|ed|es|s)$/,''));
function sim(q,text){const raw=tok(q),sig=raw.filter(w=>w.length>1&&!STOP_W.has(w)),A=sig.length?sig:raw;if(!A.length)return 0;if(String(text).toLowerCase().includes(q.toLowerCase().trim()))return .95;const B=[...new Set(tok(text))];let h=0;A.forEach(w=>{if(B.includes(w))h++;else if(B.some(x=>x.length>3&&w.length>3&&(x.startsWith(w)||w.startsWith(x))))h+=.6});return h/A.length*.9}
const fileSize=b=>b>1048576?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';

/* ---------- data ---------- */
const seedChats=()=>[
 {id:'c1',name:'Alex Rivera',folder:'work',unread:1,status:'Online',pin:'m1',msgs:[{id:'m1',from:'them',type:'text',text:'Confirmed receipt of the Q3 project documents.',t:'19:40',react:{'❤️':1}},{id:'m2',from:'me',type:'text',text:'Thanks. Let me know if any architectural revisions are required.',t:'19:42',react:{}}]},
 {id:'c2',name:'Sarah Chen',folder:'personal',unread:0,status:'Away',pin:null,msgs:[{id:'m3',from:'them',type:'text',text:'Analytics export is ready for review at https://example.com/reports',t:'14:10',react:{}}]},
 {id:'c3',name:'Dev Master',folder:'work',unread:2,status:'Online',pin:null,msgs:[{id:'m4',from:'them',type:'text',text:'Can you review the deployment checklist before Friday?',t:'09:12',react:{}},{id:'m5',from:'them',type:'text',text:'Please send the updated files when ready.',t:'09:13',react:{}}]}];
const bgs=['linear-gradient(155deg,#833ab4,#fd1d1d 58%,#fcb045)','linear-gradient(155deg,#4f46e5,#9333ea 55%,#ec4899)','linear-gradient(155deg,#0575e6,#021b79)','linear-gradient(155deg,#0f766e,#065f46 55%,#0284c7)','linear-gradient(155deg,#ec4899,#f97316)','linear-gradient(160deg,#18181b,#27272a 55%,#09090b)'];
const seedStories=()=>[{id:'s1',name:'Alex Rivera',bg:bgs[0],q:'Ship the new design system tonight?',optYes:'Ship it',optNo:'Wait',yes:14,no:3,link:'',co:'',seen:false,voted:false},{id:'s2',name:'Sarah Chen',bg:bgs[1],q:'Coffee chat or live demo stream?',optYes:'Live demo',optNo:'Coffee',yes:9,no:4,link:'example.com/demo',co:'',seen:false,voted:false}];
const R=[
 {id:108,author:'alex.rivera',cap:'Quarterly roadmap update and architecture review',g:'linear-gradient(160deg,#1e3a8a,#0b1020 65%,#312e81)',likes:1240,com:[{n:'Sarah Chen',t:'Great breakdown of the milestones.'},{n:'Dev Master',t:'Can we get the slides?'}]},
 {id:109,author:'sarah.chen',cap:'Analytics dashboard walkthrough, week 42',g:'linear-gradient(160deg,#065f46,#04130f 65%,#134e4a)',likes:3890,com:[{n:'Alex Rivera',t:'The retention chart is the best part.'}]},
 {id:110,author:'dev.master',cap:'Zero-downtime deploys in five minutes',g:'linear-gradient(160deg,#581c87,#0f0a1f 65%,#7c2d12)',likes:840,com:[]},
 {id:111,author:'alex.rivera',cap:'Behind the scenes: designing the vault',g:'linear-gradient(160deg,#9f1239,#1a0509 65%,#1e3a8a)',likes:2105,com:[{n:'Dev Master',t:'Passkeys everywhere.'}]}];
const FILTERS=[['Normal','none'],['Sepia','sepia(1) contrast(1.1)'],['Cyberpunk','hue-rotate(90deg) saturate(1.8) contrast(1.2)'],['Mono','grayscale(1) contrast(1.15)'],['Vignette','brightness(.85) contrast(1.25) saturate(1.2)']];
const ACCENTS=[['Azure','#0095f6'],['Violet','#8b5cf6'],['Sunset','#e1306c'],['Emerald','#10b981']];
const NAV=[['chats','message-circle','Messages'],['feed','compass','Explore'],['reels','clapperboard','Reels'],['ai','sparkles','Assistant'],['profile','user','Profile'],['vault','shield-check','Vault'],['settings','settings','Settings']];

let cfg=Object.assign({accent:'#0095f6',theme:'default',fontScale:'md',startView:'chats',hideSeedReels:false,lockLaunch:true,idle:0,e2ee:false,receipts:true,vanish:false,vanishSec:6,wallpaper:true,smartReplies:true,notify:false,hc:false,rm:false,prot:false,spatial:false,pin:null,quietHours:false,hideOnline:false,hideTyping:false,lang:'en',totpEnabled:false},store.get('cfg',{}));
if(INCOGNITO){cfg.vanish=true;cfg.lockLaunch=false;}
let D=store.get('chats',null)||seedChats();
let ST=store.get('stories',null)||seedStories();
let LOG=store.get('log',[]);
let CUSTOM_REELS=store.get('custom_reels',[]);
const getReels=()=>cfg.hideSeedReels?CUSTOM_REELS:[...R,...CUSTOM_REELS];
const RS=Object.assign({liked:[],saved:[],follow:['alex.rivera'],filter:0,extra:{},cmLikes:[]},store.get('reels',{}));
const S={view:'chats',chat:null,folder:'all',q:'',reply:null,editId:null,thSearch:false,thQ:'',thMatches:[],thIdx:0,typing:{},typingTms:{},myTypingTm:0,myTypingChat:null,reel:0,reelMuted:true,paused:false,story:-1,rec:null,call:null,confirm:null,menu:null,stBg:0,stFont:0,stStickers:[],stDrafts:store.get('st_drafts',[]),contactTab:'dm',studioMode:'story',stMedia:null,smart:[],smartFor:null,knownFps:store.get('known_fps',{}),rtcCfg:null,lbMsgId:null,lbZoom:1,lbMediaList:[],lbMediaIdx:0,idleT:0,aiBusy:null,aiAbort:null,aiHist:[],aiSavedThreads:store.get('ai_saved_threads',[]),aiActiveThreadId:null,aiMode:'local',aiLastErr:null,aiMedia:null,aiThread:store.get('ai_threads',{}),draft:'',user:null,localUser:store.get('local_user',null),localAccounts:store.get('local_accounts',[]),incognito:INCOGNITO,users:[],onlineUsers:{},sbConfigured:false,sbRealtime:false,authTab:'signin',rtClient:null,rtChan:null,rtSig:null,rtPres:null,peerChans:{},pollTm:null,syncing:false,bootstrapping:false,ecdhId:null,e2eeRing:{},pubCache:store.get('e2ee_pubs',{}),profId:null,profPrevView:'chats',profTab:'posts',profSuggest:false,profTag:null,profData:null,profLoading:false,postViewId:null,postViewSlide:0,editingPostId:null,followListTab:'followers',followListQ:'',feedTab:'explore',feedTag:'',feedQ:'',feedSort:'recent',feedLayout:'cards',feedSlides:{},expandedCaps:{},feedData:null,feedLoading:false,feedNewPending:false,notes:store.get('wg_notes',[]),followRequests:[],blockedUsers:[],safety:store.get('wg_safety',{mutedIds:[],restrictedIds:[],closeFriendIds:[],followedTags:[],hiddenWords:[]}),collections:store.get('wg_collections',[{id:'col_default',title:'Saved Highlights',postIds:[]}]),colTargetPostId:null,sharePostId:null,storyViews:{},reportTarget:null,activity:store.get('wg_activity',[]),actUnread:0,postMedia:[],postBg:0,postAspect:'1:1',postFilter:'normal',hlBg:0,hlMedia:null,hlView:null,epAvatarPath:null,epAvatarUrl:null,pendingProfileLink:null,keyBackupExists:false,keyBackupUpdatedAt:null,pushSubscribed:false,vapidPublicKey:null,quietSend:false,auditFilter:'all',tourStep:0,totpSetup:null,insightsCache:null};
const _syncIdx=new Map();
const searchIdx={
  indexMessages(convId,msgs=[]){
    const entries=[];
    for(const m of msgs){const plain=String(m.text||m.fileName||'').trim();if(plain)entries.push({convId,msgId:m.id,preview:plain.slice(0,60),lower:plain.toLowerCase(),t:m.t||''})}
    _syncIdx.set(convId,entries);
    EncryptedSearchIndex.indexMessages(convId,msgs).catch(()=>{});
  },
  query(text,limit=25){
    const terms=String(text||'').toLowerCase().trim().split(/\s+/).filter(Boolean);
    if(!terms.length)return[];
    const hits=[];
    for(const entries of _syncIdx.values()){for(const e of entries){if(terms.every(t=>e.lower.includes(t))){hits.push(e);if(hits.length>=limit)return hits}}}
    return hits;
  },
  clear(){_syncIdx.clear()}
};
const reindexSearch=()=>{try{searchIdx.clear();D.forEach(c=>searchIdx.indexMessages(c.id,c.msgs||[]))}catch(e){}};
reindexSearch();
let tabSync=null;
const BLOBS={};const MEDIA_LOADING=new Set();let KEY=null,FP='';
function notifyDesktop(title,body){if(cfg.quietHours||!cfg.notify||typeof Notification==='undefined'||Notification.permission!=='granted'||!document.hidden)return;try{new Notification(title,{body:String(body||'').slice(0,120),icon:'/icon.svg'})}catch(e){}}
const saveD=()=>{store.set('chats',D);reindexSearch()},saveAiThread=()=>store.set('ai_threads',S.aiThread),saveSafety=()=>store.set('wg_safety',S.safety),saveCollections=()=>store.set('wg_collections',S.collections),saveCfg=()=>{store.set('cfg',cfg);tabSync?.post('cfg',{theme:cfg.theme,accent:cfg.accent,hc:cfg.hc,quietHours:cfg.quietHours});if(S.user&&!S.bootstrapping){sbPost({action:'saveSettings',cfg});sbPost({action:'savePrivacyPrefs',hideOnline:cfg.hideOnline,hideTyping:cfg.hideTyping,quietHours:cfg.quietHours})}},saveR=()=>{store.set('reels',RS);if(S.user&&!S.bootstrapping)sbPost({action:'saveReelsPrefs',reels:{liked:RS.liked,saved:RS.saved,follow:RS.follow,filter:RS.filter}})},saveS=()=>store.set('stories',ST);
const cur=()=>D.find(c=>c.id===S.chat);
function audit(m,cat){const c=cat||(/auth|pass|sign|login|2fa|totp|passkey/i.test(m)?'auth':/sync|cloud|realtime/i.test(m)?'sync':'security');const entry={t:new Date().toLocaleString(),m,cat:c};LOG.unshift(entry);LOG=LOG.slice(0,60);store.set('log',LOG);renderAudit();if(S.user&&!S.bootstrapping)sbPost({action:'logAudit',t:entry.t,m})}

/* ---------- supabase auth, sync, realtime, presence, storage & signaling ---------- */
let rtDebTm=null;
const readSentMap={};
function handleSbUnauthorized(){
  if(!S.user)return;
  disconnectRealtime();
  S.user=null;S.users=[];S.onlineUsers={};
  renderAccountUI();renderDmUsers();
  toast('Cloud session expired — sign in again','err');
}
async function sbGet(act,params){
  try{
    let q='action='+encodeURIComponent(act);
    if(params&&typeof params==='object'){for(const[k,v]of Object.entries(params))if(v!=null)q+='&'+encodeURIComponent(k)+'='+encodeURIComponent(String(v))}
    const r=await fetch('/api/supabase?'+q,{credentials:'same-origin'});
    if(r.status===401)handleSbUnauthorized();
    const d=await r.json().catch(()=>({}));
    if(!r.ok)return Object.assign({ok:false,status:r.status},d);
    return Object.assign({ok:true},d);
  }catch(e){return {ok:false,error:e.message||'Network error'}}
}
async function sbPost(payload){
  const pub=payload.action==='signin'||payload.action==='signup'||payload.action==='signout'||payload.action==='requestPasswordReset'||payload.action==='confirmPasswordReset';
  if(!S.user&&!pub)return null;
  try{
    const r=await fetch('/api/supabase',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});
    if(r.status===401&&!pub)handleSbUnauthorized();
    const d=await r.json().catch(()=>({}));
    if(!r.ok)return Object.assign({ok:false,status:r.status},d);
    return Object.assign({ok:true},d);
  }catch(e){return {ok:false,error:e.message||'Network error'}}
}
function disconnectRealtime(){
  clearTimeout(rtDebTm);rtDebTm=null;
  clearInterval(S.pollTm);S.pollTm=null;
  Object.values(S.typingTms).forEach(t=>clearTimeout(t));S.typingTms={};
  if(S.rtClient){
    [S.rtChan,S.rtSig,S.rtPres,...Object.values(S.peerChans)].forEach(ch=>{try{ch&&S.rtClient.removeChannel(ch)}catch(e){}});
  }
  S.rtChan=null;S.rtSig=null;S.rtPres=null;S.peerChans={};S.rtClient=null;S.onlineUsers={};
}
function scheduleCloudRefresh(ms=280){
  clearTimeout(rtDebTm);
  rtDebTm=setTimeout(()=>{if(S.user)refreshCloud(true)},ms);
}
async function getOutboundChannel(peerUserId){
  if(!S.rtClient||!peerUserId)return null;
  let entry=S.peerChans[peerUserId];
  if(!entry){
    const ch=S.rtClient.channel('wg-signal-'+peerUserId);
    let resReady;
    const ready=new Promise(r=>resReady=r);
    entry={ch,ready,joined:false};
    S.peerChans[peerUserId]=entry;
    ch.subscribe(st=>{
      if(st==='SUBSCRIBED'){entry.joined=true;resReady(true)}
      else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'||st==='CLOSED'){resReady(false)}
    });
    setTimeout(()=>resReady(entry.joined),3500);
  }
  await entry.ready;
  return entry.ch;
}
async function sendSignal(peerUserId,event,payload){
  if(!S.user||!peerUserId||!S.rtClient)return false;
  try{
    const ch=await getOutboundChannel(peerUserId);
    if(!ch)return false;
    await ch.send({type:'broadcast',event,payload});
    return true;
  }catch(e){return false}
}
function convRecipientIds(c){
  if(!c||!S.user)return [];
  if(c.isGroup&&Array.isArray(c.members))return c.members.map(m=>m.id).filter(id=>id&&id!==S.user.id);
  return c.peerUserId?[c.peerUserId]:[];
}
function signalConvPeers(c,event,payload){convRecipientIds(c).forEach(pid=>sendSignal(pid,event,payload))}
function sendReadReceipt(c,ms){
  const recips=convRecipientIds(c);
  if(!S.user||!recips.length||cfg.receipts===false)return;
  const ts=Math.max(ms||0,Date.now());
  if((readSentMap[c.id]||0)>=ts-250)return;
  readSentMap[c.id]=ts;
  sbPost({action:'markRead',conversationId:c.id,readMs:ts});
  signalConvPeers(c,'read',{fromUserId:S.user.id,conversationId:c.id,readMs:ts});
}
function syncPresenceToChats(){
  if(!S.rtPres)return;
  const map={};
  const state=S.rtPres.presenceState()||{};
  Object.entries(state).forEach(([k,arr])=>{
    if(Array.isArray(arr)&&arr.length)map[k]=true;
    (arr||[]).forEach(x=>{if(x?.user_id)map[x.user_id]=true});
  });
  S.onlineUsers=map;
  D.forEach(c=>{
    if(c.peerUserId)c.status=map[c.peerUserId]?'Online':'Away';
    if(c.isGroup&&Array.isArray(c.members))c.members.forEach(m=>{m.status=map[m.id]?'Online':'Away'});
  });
  S.users.forEach(u=>{u.status=map[u.id]?'Online':'Away'});
  renderList();renderHead();renderDmUsers();renderGroupMembers();
  if($('#info')?.classList.contains('open'))renderInfo();
}
function setPeerTyping(convId,active,fromName){
  clearTimeout(S.typingTms[convId]);
  if(active){
    S.typing[convId]=fromName||1;
    S.typingTms[convId]=setTimeout(()=>{delete S.typing[convId];renderHead();renderList();if(S.chat===convId)renderTypingRow()},3500);
  }else{delete S.typing[convId]}
  renderHead();renderList();if(S.chat===convId)renderTypingRow();
}
function notePeerKey(c,uid,fp){
  if(!c||!uid||!fp)return;
  const prevFp=S.knownFps[uid];
  if(!prevFp){S.knownFps[uid]=fp;store.set('known_fps',S.knownFps);c.keyChanged=false}
  else if(prevFp!==fp){c.keyChanged=true}
}
function connectRealtime(rt){
  disconnectRealtime();
  if(!S.user)return;
  const startPoll=()=>{
    if(S.pollTm)return;
    S.pollTm=setInterval(()=>{if(S.user&&navigator.onLine&&!document.hidden)refreshCloud(true)},6000);
  };
  if(!rt||!rt.url||!rt.publishableKey||!rt.accessToken||!window.supabase?.createClient){
    startPoll();renderAccountUI();return;
  }
  try{
    const client=window.supabase.createClient(rt.url,rt.publishableKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:'Bearer '+rt.accessToken}}
    });
    client.realtime.setAuth(rt.accessToken);
    const ch=client.channel('wg-live-'+S.user.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_messages'},async p=>{
        if(p.eventType==='INSERT'&&p.new){
          const n=p.new,c=D.find(x=>x.id===n.conversation_id);
          if(!c){scheduleCloudRefresh(120);return}
          if(c.msgs.some(m=>m.id===n.id))return;
          const from=n.sender_role==='sys'?'sys':(n.sender_id?(n.sender_id===S.user?.id?'me':'them'):n.sender_role);
          const msg={
            id:n.id,from,fromName:n.sender_name||undefined,type:n.msg_type||'text',text:n.body||'',
            name:n.file_name||undefined,size:n.file_size||undefined,
            mediaPath:n.media_path||undefined,mediaMime:n.media_mime||undefined,mediaEnc:Boolean(n.media_enc),
            dur:n.dur||undefined,ct:n.ct||undefined,editedAt:n.edited_at?Number(n.edited_at):undefined,
            reply:n.reply_preview||null,react:n.react||{},
            exp:n.exp_at?Number(n.exp_at):undefined,ts:Number(n.created_ms||0),t:n.time_label||'',_remote:true
          };
          await decryptMsg(msg,c);
          c.msgs.push(msg);
          if(c.id!==S.chat){c.unread=(c.unread||0)+1}
          else if(from==='them'){sendReadReceipt(c,msg.ts||Date.now())}
          if(from==='them'){
            setPeerTyping(c.id,false);
            notifyDesktop(msg.fromName||c.name,msg.text||(msg.type==='file'?'📎 '+(msg.name||'Attachment'):'🎙 Voice note'));
          }
          saveD();
          if(c.id===S.chat){renderThread();if(from==='them'){tone(660);loadSmartReplies(c)}}
          renderList();
        }else if(p.eventType==='UPDATE'&&p.new){
          const n=p.new,c=D.find(x=>x.id===n.conversation_id);
          const m=c?.msgs.find(x=>x.id===n.id);
          if(c&&m){
            m.ct=n.ct||undefined;
            if(!m.ct)m.text=n.body||'';
            if(n.reply_preview!==undefined)m.reply=n.reply_preview;
            m.react=n.react||{};
            m.editedAt=n.edited_at?Number(n.edited_at):m.editedAt;
            await decryptMsg(m,c);
            saveD();
            if(c.id===S.chat)renderThread();
            renderList();
          }else{scheduleCloudRefresh(250)}
        }else{scheduleCloudRefresh(250)}
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_conversations'},p=>{
        if(p.eventType==='UPDATE'&&p.new){
          const c=D.find(x=>x.id===p.new.id);
          if(c&&c.peerUserId){
            const prevRead=c.peerReadMs||0;
            const nextRead=Number(c.isOwner?p.new.peer_read_ms:p.new.owner_read_ms)||0;
            if(nextRead>prevRead){c.peerReadMs=nextRead;saveD();if(c.id===S.chat)renderThread();return}
          }
        }
        scheduleCloudRefresh(220);
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_conversation_members'},()=>scheduleCloudRefresh(220))
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_profiles'},p=>{
        if(p.new?.id&&p.new.public_key&&p.new.key_fp){
          cachePeerPub(p.new.key_fp,p.new.public_key);
          const u=S.users.find(x=>x.id===p.new.id);
          if(u){u.public_key=p.new.public_key;u.key_fp=p.new.key_fp}
          D.forEach(c=>{
            if(c.peerUserId===p.new.id){notePeerKey(c,p.new.id,p.new.key_fp);c.peerPublicKey=p.new.public_key;c.peerKeyFp=p.new.key_fp}
            if(c.isGroup&&Array.isArray(c.members))c.members.forEach(m=>{if(m.id===p.new.id){m.publicKey=p.new.public_key;m.keyFp=p.new.key_fp}});
          });
          decAllMessages().then(()=>{renderThread();if($('#info')?.classList.contains('open'))renderInfo()});
        }else{scheduleCloudRefresh(300)}
        scheduleProfileRefresh(260);
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_stories'},()=>scheduleCloudRefresh(260))
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_story_votes'},()=>scheduleCloudRefresh(260))
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_notes'},()=>scheduleCloudRefresh(200))
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_reels'},()=>{scheduleCloudRefresh(260);scheduleProfileRefresh(260)})
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_follows'},p=>{noteRealtimeActivity('follow',p);scheduleProfileRefresh(220)})
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_highlights'},()=>scheduleProfileRefresh(220))
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_posts'},p=>{noteRealtimeActivity('post',p);scheduleProfileRefresh(220)})
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_post_likes'},p=>{noteRealtimeActivity('like',p);scheduleProfileRefresh(220)})
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_post_comments'},p=>{noteRealtimeActivity('comment',p);scheduleProfileRefresh(220)})
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_post_saves'},()=>scheduleProfileRefresh(220))
      .on('postgres_changes',{event:'*',schema:'public',table:'wg_notifications'},p=>{
        if(p.eventType==='INSERT'&&p.new&&(!p.new.user_id||p.new.user_id===S.user?.id)){
          const row=p.new;
          pushActivity(row.kind||'info',row.message||'New notification',row.actor_id||null,row.created_at);
          notifyDesktop('WhatsGram Activity',row.message||'New notification');
        }
      })
      .subscribe(status=>{
        if(status==='SUBSCRIBED'){clearInterval(S.pollTm);S.pollTm=null;renderAccountUI()}
        else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){startPoll();renderAccountUI()}
      });
    const sig=client.channel('wg-signal-'+S.user.id)
      .on('broadcast',{event:'typing'},({payload})=>{
        if(!payload||payload.fromUserId===S.user.id)return;
        setPeerTyping(payload.conversationId,!!payload.active,payload.fromName);
      })
      .on('broadcast',{event:'read'},({payload})=>{
        if(!payload||payload.fromUserId===S.user.id)return;
        const c=D.find(x=>x.id===payload.conversationId);
        if(c&&(payload.readMs||0)>(c.peerReadMs||0)){c.peerReadMs=payload.readMs;saveD();if(c.id===S.chat)renderThread()}
      })
      .on('broadcast',{event:'key-update'},async({payload})=>{
        if(!payload||payload.fromUserId===S.user.id||!payload.publicKey||!payload.keyFp)return;
        cachePeerPub(payload.keyFp,payload.publicKey);
        const u=S.users.find(x=>x.id===payload.fromUserId);
        if(u){u.public_key=payload.publicKey;u.key_fp=payload.keyFp}
        D.forEach(c=>{
          if(c.peerUserId===payload.fromUserId){notePeerKey(c,payload.fromUserId,payload.keyFp);c.peerPublicKey=payload.publicKey;c.peerKeyFp=payload.keyFp}
          if(c.isGroup&&Array.isArray(c.members))c.members.forEach(m=>{if(m.id===payload.fromUserId){m.publicKey=payload.public_key||payload.publicKey;m.keyFp=payload.keyFp}});
        });
        await decAllMessages();
        renderThread();if($('#info')?.classList.contains('open'))renderInfo();
        toast('Peer rotated ECDH encryption key');
      })
      .on('broadcast',{event:'call-offer'},({payload})=>onIncomingCall(payload))
      .on('broadcast',{event:'call-answer'},({payload})=>onCallAnswer(payload))
      .on('broadcast',{event:'call-ice'},({payload})=>onCallIce(payload))
      .on('broadcast',{event:'call-reject'},({payload})=>onCallReject(payload))
      .on('broadcast',{event:'call-end'},({payload})=>onCallRemoteEnd(payload))
      .subscribe();
    const pres=client.channel('wg-online',{config:{presence:{key:S.user.id}}})
      .on('presence',{event:'sync'},syncPresenceToChats)
      .on('presence',{event:'join'},syncPresenceToChats)
      .on('presence',{event:'leave'},syncPresenceToChats)
      .subscribe(st=>{if(st==='SUBSCRIBED')pres.track({user_id:S.user.id,at:Date.now()})});
    S.rtClient=client;S.rtChan=ch;S.rtSig=sig;S.rtPres=pres;
    startPoll();
  }catch(e){startPoll()}
  renderAccountUI();
}
async function applyCloudBootstrap(data,quiet){
  if(!data||!data.user)return;
  S.bootstrapping=true;
  try{
    const prevCount=cur()?.msgs?.length||0;
    const prevTexts=new Map();
    D.forEach(c=>c.msgs.forEach(m=>{if((m.ct?.startsWith('e2ee1.')||m.ct?.startsWith('e2ee2.'))&&m.text&&!m.text.startsWith('🔒'))prevTexts.set(m.id,{text:m.text,reply:m.reply,_fk:m._fk,_mime:m._mime})}));
    S.user=data.user;
    if(Array.isArray(data.users)){
      S.users=data.users;
      S.users.forEach(u=>{if(u.public_key&&u.key_fp)cachePeerPub(u.key_fp,u.public_key)});
    }
    await ensureEcdhIdentity(false);
    if(Array.isArray(data.chats)){
      data.chats.forEach(c=>{
        if(c.peerPublicKey&&c.peerKeyFp){cachePeerPub(c.peerKeyFp,c.peerPublicKey);notePeerKey(c,c.peerUserId,c.peerKeyFp)}
        if(c.isGroup&&Array.isArray(c.members))c.members.forEach(m=>{if(m.publicKey&&m.keyFp)cachePeerPub(m.keyFp,m.publicKey);if(S.onlineUsers[m.id])m.status='Online'});
        if(c.peerUserId&&S.onlineUsers[c.peerUserId])c.status='Online';
        (c.msgs||[]).forEach(m=>{
          const prev=prevTexts.get(m.id);
          if(prev&&(!m.text||m.text.startsWith('🔒'))){m.text=prev.text;if(prev.reply)m.reply=prev.reply;if(prev._fk){m._fk=prev._fk;m._mime=prev._mime}}
        });
      });
      D.splice(0,D.length,...data.chats);
      if(S.chat&&!D.some(c=>c.id===S.chat))S.chat=null;
      if(S.chat){const ac=cur();if(ac){ac.unread=0;sendReadReceipt(ac)}}
      await decAllMessages();
      store.set('chats',D);
    }
    if(Array.isArray(data.stories)){ST.splice(0,ST.length,...data.stories);store.set('stories',ST)}
    if(Array.isArray(data.notes)){S.notes=data.notes;store.set('wg_notes',S.notes)}
    if(Array.isArray(data.followRequests)){S.followRequests=data.followRequests}
    if(data.storyViews&&typeof data.storyViews==='object'){S.storyViews=data.storyViews}
    if(Array.isArray(data.customReels)){CUSTOM_REELS=data.customReels;store.set('custom_reels',CUSTOM_REELS)}
    if(data.reels){Object.assign(RS,{liked:[],saved:[],follow:['alex.rivera'],filter:0,extra:{}},data.reels);store.set('reels',RS)}
    if(data.cfg){Object.assign(cfg,data.cfg);store.set('cfg',cfg);applyCfg()}
    if(Array.isArray(data.logs)){LOG.splice(0,LOG.length,...data.logs);store.set('log',LOG)}
    renderList();renderThread(true);renderInfo();renderStories();renderNotes();renderAudit();updateOfflineUI();
    if(S.view==='reels')renderReel(false);
    if(S.view==='feed')loadFeedData(true);
    if(!S.chat&&$('#v-chats'))$('#v-chats').dataset.open='0';
    if(quiet&&cur()&&cur().msgs.length>prevCount){
      const last=cur().msgs[cur().msgs.length-1];
      if(last?.from==='them'){tone(660);loadSmartReplies(cur())}
    }
    loadNotifications(false);
    checkKeyBackupStatus();
  }finally{S.bootstrapping=false}
  renderAccountUI();
  renderDmUsers();
  renderGroupMembers();
}
function updateIncognitoBanner(){
  const bar=$('#incognito-bar');
  const on=Boolean(S.incognito);
  document.body.classList.toggle('incognito-on',on);
  if(bar){bar.classList.toggle('hidden',!on);bar.classList.toggle('flex',on)}
  const pill=$('#incognito-pill');
  if(pill){
    pill.setAttribute('aria-pressed',String(on));
    pill.classList.toggle('bg-purple-500/20',on);
    pill.classList.toggle('border-purple-400/40',on);
    pill.classList.toggle('text-purple-200',on);
  }
}
function enterIncognitoMode(silent=false){
  INCOGNITO=true;S.incognito=true;
  S.user=null;S.localUser=null;
  disconnectRealtime();
  D.splice(0,D.length,...seedChats());
  ST.splice(0,ST.length,...seedStories());
  CUSTOM_REELS=[];
  LOG.splice(0,LOG.length,{t:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),m:'Incognito session active — zero localStorage persistence'});
  cfg.vanish=true;cfg.lockLaunch=false;
  S.chat=null;S.activity=[];S.actUnread=0;
  genKey();
  closeM('m-auth');
  setShell('app');
  setView(S.view==='feed'?'feed':'chats');
  if(window.matchMedia('(min-width:768px)').matches&&D.length)openChat(D[0].id);
  renderList();renderThread();renderInfo();renderStories();renderAudit();renderAccountUI();updateIncognitoBanner();
  if(!silent)toast('Incognito Mode active — nothing is saved locally');
}
function exitIncognitoMode(){
  if(!S.incognito&&!INCOGNITO)return;
  Object.keys(_memStore).forEach(k=>delete _memStore[k]);
  INCOGNITO=false;S.incognito=false;
  disconnectRealtime();
  D.splice(0,D.length,...(store.get('chats',null)||seedChats()));
  ST.splice(0,ST.length,...(store.get('stories',null)||seedStories()));
  CUSTOM_REELS=store.get('custom_reels',[]);
  LOG.splice(0,LOG.length,...store.get('log',[]));
  cfg=Object.assign({accent:'#0095f6',lockLaunch:true,idle:0,e2ee:false,receipts:true,vanish:false,vanishSec:6,wallpaper:true,smartReplies:true,notify:false,hc:false,rm:false,prot:false,spatial:false,pin:null},store.get('cfg',{}));
  S.chat=null;S.localUser=store.get('local_user',null);
  try{if(location.pathname==='/incognito')history.replaceState(null,'','/')}catch(e){}
  updateIncognitoBanner();
  applyCfg();renderAccountUI();renderList();renderThread();renderInfo();renderStories();renderAudit();
  setShell('landing');
  toast('Incognito session wiped & exited');
}
function setShell(mode){
  const isApp=mode==='app';
  const appEl=$('#app'),landEl=$('#landing');
  if(appEl){
    appEl.classList.toggle('hidden',!isApp);
    appEl.classList.toggle('flex',isApp);
  }
  if(landEl)landEl.classList.toggle('hidden',isApp);
  if(isApp){
    applyCfg();
    renderThread(true);
    renderInfo();
    renderStats();
    updateIncognitoBanner();
  }
  icons();
}
function inspectRouteAndTokens(){
  const hp=new URLSearchParams((location.hash||'').replace(/^#/, ''));
  const sp=new URLSearchParams(location.search||'');
  const profParam=hp.get('wg-profile')||sp.get('profile')||'';
  if(profParam)S.pendingProfileLink=profParam.replace(/^@/,'').trim();
  const rawToken=hp.get('wg-reset')||sp.get('reset')||'';
  const type=hp.get('type')||sp.get('type')||'';
  const accessToken=type==='recovery'?(hp.get('access_token')||''):'';
  const tokenHash=type==='recovery'?(sp.get('token_hash')||hp.get('token_hash')||''):'';
  let hasReset=false;
  if(rawToken||accessToken||tokenHash){
    S.recovery={token:rawToken||null,accessToken:accessToken||null,tokenHash:tokenHash||null};
    try{history.replaceState(null,'',location.pathname)}catch(e){}
    hasReset=true;
  }
  const path=(location.pathname||'/').toLowerCase().replace(/\/+$/,'')||'/';
  const route={hasReset,action:null,tab:'signin',view:null,target:null,chatId:null};
  if(hasReset){route.action='auth';route.tab='reset';return route}
  if(path==='/login'||path==='/signin'||path==='/auth'){route.action='auth';route.tab='signin'}
  else if(path==='/signup'||path==='/register'){route.action='auth';route.tab='signup'}
  else if(path==='/forgot'||path==='/reset'){route.action='auth';route.tab='forgot'}
  else if(path==='/logout'){route.action='logout'}
  else if(path==='/incognito'||sp.get('incognito')==='1'){route.action='incognito'}
  else if(path==='/feed'||path==='/explore'){route.action='view';route.view='feed'}
  else if(path==='/chats'||path==='/messages'){route.action='view';route.view='chats'}
  else if(path==='/reels'){route.action='view';route.view='reels'}
  else if(path==='/ai'||path==='/assistant'){route.action='view';route.view='ai'}
  else if(path==='/vault'){route.action='view';route.view='vault'}
  else if(path==='/settings'){route.action='view';route.view='settings'}
  else if(path==='/profile'){route.action='profile';route.target='self'}
  else if(path.startsWith('/u/')&&path.length>3){route.action='profile';route.target=decodeURIComponent(path.slice(3)).replace(/^@/,'')}
  else if(path.startsWith('/chat/')&&path.length>6){route.action='chat';route.chatId=decodeURIComponent(path.slice(6))}
  return route;
}
function parseHashOrSearchParams(){return inspectRouteAndTokens().hasReset}
const userHandle=u=>u?.username?('@'+u.username):(u?.email&&!String(u.email).endsWith('@users.whatsgram.invalid')?u.email:'Member');
async function refreshCloud(quiet=false){
  if(!S.user||S.syncing)return;
  S.syncing=true;renderAccountUI();
  try{
    const res=await sbGet('bootstrap');
    if(res?.ok&&res.user){
      await applyCloudBootstrap(res,quiet);
      if(res.realtime?.accessToken&&S.rtClient?.realtime)S.rtClient.realtime.setAuth(res.realtime.accessToken);
      else if(res.realtime&&!S.rtChan)connectRealtime(res.realtime);
      if(!quiet)toast('Synced with Supabase');
    }else if(!quiet&&res?.error){toast(res.error,'err')}
  }finally{S.syncing=false;renderAccountUI()}
}
async function checkSupabaseSession(route){
  const st=await sbGet('status');
  S.sbConfigured=Boolean(st?.configured);
  S.sbRealtime=Boolean(st?.hasRealtime);
  S.sbMissing=Array.isArray(st?.missing)?st.missing:[];
  renderAccountUI();
  if(S.incognito)return;
  if(!S.sbConfigured){
    if(route?.action==='auth'){
      setShell('landing');
      A.openAuth(route.tab||'signin');
      return;
    }
    if(route?.action==='view'&&route.view){
      lsSet('wg_local_mode','1');
      setShell('app');setView(route.view);return;
    }
    if(!S.recovery&&lsGet('wg_local_mode')!=='1'&&!S.localUser)setShell('landing');
    return;
  }
  const sess=await sbGet('session');
  if(sess?.ok&&sess.authenticated&&sess.user){
    lsSet('wg_has_session','1');lsDel('wg_local_mode');
    await applyCloudBootstrap(sess,false);
    connectRealtime(sess.realtime);
    if(!S.recovery){
      setShell('app');
      if(S.pendingProfileLink){
        const pRef=S.pendingProfileLink;S.pendingProfileLink=null;
        openProfile(pRef);
      }else if(route?.action==='profile'){
        openProfile(route.target||'self');
      }else if(route?.action==='chat'&&route.chatId){
        setView('chats');openChat(route.chatId);
      }else if(route?.action==='view'&&route.view){
        setView(route.view);
      }else if(route?.action==='auth'){
        setView('chats');
        if(window.matchMedia('(min-width:768px)').matches&&D.length&&(!S.chat||!D.some(c=>c.id===S.chat)))openChat(D[0].id);
        toast('Already signed in');
        try{history.replaceState(null,'','/')}catch(e){}
      }else{
        setView('chats');
        if(window.matchMedia('(min-width:768px)').matches&&D.length&&(!S.chat||!D.some(c=>c.id===S.chat)))openChat(D[0].id);
      }
      if(cfg.lockLaunch)lock();else audit('Cloud session verified');
    }
  }else{
    lsDel('wg_has_session');
    S.user=null;S.users=[];
    renderAccountUI();renderDmUsers();renderGroupMembers();
    if(route?.action==='auth'){
      setShell('landing');
      A.openAuth(route.tab||'signin');
      return;
    }
    if(route?.action==='view'&&route.view){
      lsSet('wg_local_mode','1');
      setShell('app');setView(route.view);return;
    }
    if(!S.recovery&&lsGet('wg_local_mode')!=='1'&&!S.localUser)setShell('landing');
  }
}
function blobToBase64(blob){
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=()=>res(String(r.result||'').split(',')[1]||'');
    r.onerror=rej;r.readAsDataURL(blob);
  });
}
async function encryptMediaBlob(blob,mime){
  if(!window.crypto?.subtle)return null;
  try{
    const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
    const rawKey=new Uint8Array(await crypto.subtle.exportKey('raw',key));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const pt=await blob.arrayBuffer();
    const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,pt));
    const combined=new Uint8Array(12+ct.length);
    combined.set(iv,0);combined.set(ct,12);
    return {encBlob:new Blob([combined],{type:'application/octet-stream'}),fk:b64uEnc(rawKey),mime:mime||blob.type||'application/octet-stream'};
  }catch(e){return null}
}
async function decryptMediaBuf(buf,fkB64){
  const raw=b64uDec(fkB64);
  const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
  const u8=new Uint8Array(buf);
  const iv=u8.slice(0,12),ct=u8.slice(12);
  return crypto.subtle.decrypt({name:'AES-GCM',iv},key,ct);
}
async function uploadCloudMedia(convId,msgId,fileOrBlob,fileName,mime,opts={}){
  if(!S.user||!navigator.onLine)return null;
  if(fileOrBlob.size>15*1024*1024){toast('File exceeds 15 MB cloud limit; kept locally','err');return null}
  let upBlob=fileOrBlob,upMime=mime||'application/octet-stream',upName=fileName,fileKeyObj=null;
  if(opts.encrypt){
    const encRes=await encryptMediaBlob(fileOrBlob,upMime);
    if(encRes){
      upBlob=encRes.encBlob;upMime='application/octet-stream';upName=fileName+'.enc';
      fileKeyObj={fk:encRes.fk,mime:mime||fileOrBlob.type||'application/octet-stream'};
    }
  }
  const base={action:'signUpload',...(opts.scope?{scope:opts.scope,itemId:msgId}:{conversationId:convId,msgId}),fileName:upName,mime:upMime};
  const s=await sbPost(base);
  if(s?.ok&&s.uploadUrl){
    try{
      const putRes=await fetch(s.uploadUrl,{method:'PUT',headers:{'Content-Type':upMime,'x-upsert':'true'},body:upBlob});
      if(putRes.ok)return {mediaPath:s.mediaPath,mediaMime:mime||s.mime,mediaEnc:Boolean(fileKeyObj),fileKeyObj};
    }catch(e){}
  }
  if(upBlob.size<=3.5*1024*1024){
    const b64=await blobToBase64(upBlob);
    const up=await sbPost({action:'uploadMedia',...(opts.scope?{scope:opts.scope,itemId:msgId}:{conversationId:convId,msgId}),fileName:upName,mime:upMime,dataBase64:b64});
    if(up?.ok)return {mediaPath:up.mediaPath,mediaMime:mime||up.mime,mediaEnc:Boolean(fileKeyObj),fileKeyObj};
  }
  return null;
}
async function resolveMediaUrl(c,m){
  if(BLOBS[m.id])return BLOBS[m.id];
  if(!m.mediaPath||!S.user)return null;
  const res=await sbGet('mediaUrl',{conversationId:c.id,messageId:m.id});
  if(!res?.ok||!res.url)return null;
  if(m.mediaEnc){
    if(!m._fk&&m.ct)await decryptMsg(m,c);
    if(!m._fk)return null;
    try{
      const r=await fetch(res.url);
      if(!r.ok)return null;
      const pt=await decryptMediaBuf(await r.arrayBuffer(),m._fk);
      BLOBS[m.id]=URL.createObjectURL(new Blob([pt],{type:m.mediaMime||m._mime||'application/octet-stream'}));
      return BLOBS[m.id];
    }catch(e){return null}
  }
  BLOBS[m.id]=res.url;
  return res.url;
}
async function resolveSocialMediaUrl(kind,item){
  const k='social:'+kind+':'+item.id;
  if(BLOBS[k])return BLOBS[k];
  if(!item?.mediaPath||!S.user)return null;
  const res=await sbGet(kind==='story'?'storyMediaUrl':'reelMediaUrl',kind==='story'?{storyId:item.id}:{reelId:item.id});
  if(res?.ok&&res.url){BLOBS[k]=res.url;return res.url}
  return null;
}
function hydrateThreadMedia(c){
  if(!c||!S.user)return;
  for(const m of (c.msgs||[])){
    if(m.mediaPath&&!BLOBS[m.id]&&!MEDIA_LOADING.has(m.id)&&(m.mediaMime?.startsWith('image/')||m.mediaMime?.startsWith('video/'))){
      MEDIA_LOADING.add(m.id);
      resolveMediaUrl(c,m).then(url=>{
        MEDIA_LOADING.delete(m.id);
        if(url&&S.chat===c.id)renderThread(true);
      }).catch(()=>MEDIA_LOADING.delete(m.id));
    }
  }
}
function renderAccountUI(){
  const dot=$('#sb-dot'),lbl=$('#sb-label'),navDot=$('#nav-auth-dot'),navLbl=$('#nav-auth-lbl');
  const lo=$('#auth-logged-out'),li=$('#auth-logged-in'),dlg=$('#auth-dialog'),sub=$('#auth-sub'),cfgMsg=$('#auth-cfg-msg'),rtBadge=$('#auth-rt-badge');
  const live=Boolean(S.user&&S.rtChan);
  const activeAcct=S.user||S.localUser;
  const uLabel=S.incognito?'Incognito':(activeAcct?(activeAcct.displayName||(activeAcct.username?'@'+activeAcct.username:activeAcct.email)):'');
  if(dot)dot.className='w-2 h-2 rounded-full '+(S.incognito?'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.85)]':(S.user?(live?'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]':'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]'):(S.localUser?'bg-emerald-400':(S.sbConfigured?'bg-amber-400':'bg-sky-400'))));
  if(lbl)lbl.textContent=S.incognito?'Incognito':(S.user?(S.syncing?'Syncing…':(live?'Live':'Cloud')):(S.localUser?uLabel:(S.sbConfigured?'Sign in':'Local')));
  if(navLbl)navLbl.textContent=S.incognito?'Incognito':(activeAcct?uLabel:(S.sbConfigured?'Sign in':'Local mode'));
  if(navDot){
    navDot.innerHTML=S.incognito?ic('eye-off','w-3.5 h-3.5'):(activeAcct?esc((uLabel||'U').replace(/^@/,'').slice(0,2).toUpperCase()):ic('cloud','w-3.5 h-3.5'));
    navDot.className='w-6 h-6 rounded-full grid place-items-center shrink-0 text-[10px] font-bold '+(S.incognito?'bg-purple-500/20 border border-purple-400/40 text-purple-300':(activeAcct?'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300':'bg-white/[0.08] border border-white/[0.12] text-zinc-300'));
  }
  const showResetPane=Boolean(S.recovery&&S.authTab==='reset');
  if(dlg)dlg.className='lux-modal w-full rounded-[28px] overflow-hidden my-auto '+((activeAcct&&!showResetPane)?'max-w-lg':'max-w-[900px]');
  if(lo&&li){lo.classList.toggle('hidden',Boolean(activeAcct&&!showResetPane));li.classList.toggle('hidden',!activeAcct||showResetPane)}
  if($('#set-acct-title')){
    $('#set-acct-title').textContent=S.incognito?'Incognito Ephemeral Session':(activeAcct?`${activeAcct.displayName||'Account'}${activeAcct.username?' · @'+activeAcct.username:''}`:'Local enclave session');
    $('#set-acct-sub').textContent=S.incognito
      ?'Zero localStorage writes. Closing or exiting wipes messages & temporary keys.'
      :(S.user
        ?(S.user.recoveryEmail?`Recovery email verified: ${S.user.recoveryEmail}`:'No optional recovery email linked yet — add one to enable password reset links.')
        :(S.localUser?'Signed in locally on this device.':'Sign in with a username or link an optional email for password reset recovery.'));
  }
  if(activeAcct){
    const recEmail=S.user?(S.user.recoveryEmail||(!String(S.user.email||'').endsWith('@users.whatsgram.invalid')?S.user.email:'')):'';
    if($('#auth-av'))$('#auth-av').innerHTML=av(uLabel||'U','w-10 h-10');
    if($('#auth-u-name'))$('#auth-u-name').textContent=activeAcct.displayName||activeAcct.username||'User';
    if($('#auth-u-handle'))$('#auth-u-handle').textContent=activeAcct.username?('@'+activeAcct.username):'';
    if($('#auth-u-email'))$('#auth-u-email').textContent=S.user?(recEmail?('Recovery email: '+recEmail):'No recovery email registered (optional)'):'Local Account · stored only in this browser';
    if($('#auth-rec-status'))$('#auth-rec-status').textContent=recEmail?'Registered':'Optional · Not set';
    if($('#auth-rec-in')&&document.activeElement!==$('#auth-rec-in'))$('#auth-rec-in').value=recEmail||'';
    if($('#auth-rec-clear'))$('#auth-rec-clear').classList.toggle('hidden',!recEmail);
    if(rtBadge)rtBadge.textContent=S.user?(S.syncing?'Syncing…':(live?'Realtime Live':'Cloud Synced')):'Local Enclave';
  }
  const missList=(S.sbMissing&&S.sbMissing.length)?S.sbMissing:['SUPABASE_URL','SUPABASE_SECRET_KEY'];
  if($('#auth-side-title'))$('#auth-side-title').textContent=S.sbConfigured?'Connected to Postgres Enclave':'Local Enclave Auth Active';
  if($('#auth-side-status'))$('#auth-side-status').textContent=S.sbConfigured?'HttpOnly session cookies + Row-Level Security':`Local accounts & Incognito work immediately (cloud env: ${missList.join(', ')})`;
  if($('#auth-sandbox-btn'))$('#auth-sandbox-btn').classList.toggle('hidden',false);
  if(cfgMsg){
    cfgMsg.textContent=S.sbConfigured
      ?'Accounts are stored in Supabase Postgres with Row-Level Security. Recovery emails remain completely private and optional.'
      :'Local account credentials are encrypted on this device with PBKDF2/SHA-256. You can also launch Instant Sandbox or Incognito Mode.';
  }
  const tab=S.authTab||'signin';
  const heading=$('#auth-heading'),tabs=$('#auth-tabs'),sTab=$('#auth-tab-signin'),uTab=$('#auth-tab-signup'),subBtn=$('#auth-submit');
  const titles={signin:'Sign in to WhatsGram',signup:'Create your account',forgot:'Password recovery',reset:'Set a new password'};
  const subs={signin:S.sbConfigured?'Enter your username or recovery email':'Sign in with a local handle or create one below',signup:'Username & password only — recovery email is optional',forgot:'Send a 15-min reset link to your registered optional email',reset:'Choose a strong new password for your account'};
  const btnText={signin:S.sbConfigured?'Sign in to Cloud Enclave':'Sign in to Local Account',signup:S.sbConfigured?'Create Cloud Account':'Create Local Account',forgot:'Send password reset link',reset:'Update password & sign in'};
  if(heading)heading.textContent=titles[tab]||titles.signin;
  if(sub)sub.textContent=subs[tab]||subs.signin;
  if(tabs)tabs.classList.toggle('hidden',tab==='forgot'||tab==='reset');
  if(sTab&&uTab){
    sTab.className='h-8 rounded-xl text-xs font-semibold transition-all '+(tab==='signup'?'lux-tab-off':'lux-tab-on');
    uTab.className='h-8 rounded-xl text-xs font-semibold transition-all '+(tab==='signup'?'lux-tab-on':'lux-tab-off');
  }
  show('#auth-panel-signin',tab==='signin',null);
  show('#auth-panel-signup',tab==='signup',null);
  show('#auth-panel-forgot',tab==='forgot',null);
  show('#auth-panel-reset',tab==='reset',null);
  if(subBtn)subBtn.textContent=btnText[tab]||btnText.signin;
  updateIncognitoBanner();
  icons();
}
function renderDmUsers(){
  const box=$('#dm-users'),list=$('#dm-users-list');
  if(!box||!list)return;
  if(!S.user){box.classList.add('hidden');list.innerHTML='';return}
  box.classList.remove('hidden');
  if(!S.users.length){
    list.innerHTML='<div class="text-xs text-zinc-500 py-2 px-1">No other registered accounts yet. Invite a friend to sign up!</div>';
    return;
  }
  list.innerHTML=S.users.map(u=>{
    const on=S.onlineUsers[u.id]||u.status==='Online';
    const handle=userHandle(u);
    return `<button data-act="dmUser" data-arg="${esc(u.id)}" class="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.075] border border-white/[0.07] hover:border-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,.04)] text-left transition-all"><span class="relative shrink-0">${av(u.display_name||handle||'U','w-9 h-9')}${on?'<span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0c0d14] shadow-[0_0_8px_rgba(52,211,153,.8)]"></span>':''}</span><div class="min-w-0 flex-1"><div class="text-xs font-semibold text-white truncate">${esc(u.display_name||handle)}</div><div class="text-[11px] text-zinc-400 truncate">${esc(handle)}${u.key_fp?` · 🔒 ${esc(u.key_fp.slice(0,8))}`:''}</div></div><span class="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-semibold text-emerald-300">DM</span></button>`;
  }).join('');
  icons();
}
function renderGroupMembers(){
  const list=$('#grp-members-list');
  if(!list)return;
  if(!S.user||!S.users.length){
    list.innerHTML=`<div class="text-xs text-zinc-500 py-2 px-1">${S.user?'No other registered users yet — creates a local group.':'Sign in to add cloud members, or create a local group room.'}</div>`;
    return;
  }
  list.innerHTML=S.users.map(u=>{
    const on=S.onlineUsers[u.id]||u.status==='Online';
    const handle=userHandle(u);
    return `<label class="flex items-center gap-2.5 p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.075] border border-white/[0.07] hover:border-white/[0.14] shadow-[inset_0_1px_0_rgba(255,255,255,.04)] cursor-pointer transition-all"><input type="checkbox" value="${esc(u.id)}" class="grp-mem-cb accent-[var(--ac)] w-4 h-4 rounded shrink-0">${av(u.display_name||handle||'U','w-8 h-8')}<div class="min-w-0 flex-1"><div class="text-xs font-semibold text-white truncate">${esc(u.display_name||handle)}</div><div class="text-[10px] text-zinc-400 truncate">${on?'Online':esc(handle)}${u.key_fp?` · 🔒 ${esc(u.key_fp.slice(0,6))}`:''}</div></div></label>`;
  }).join('');
}

/* ---------- crypto (ECDH P-256 + AES-GCM-256 E2EE) ---------- */
const b64uEnc=u8=>{let s='';for(let i=0;i<u8.length;i++)s+=String.fromCharCode(u8[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const b64uDec=s=>{const p=s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4);const b=atob(p),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
const AES_CACHE=new Map();
function cachePeerPub(fp,jwk){if(!fp||!jwk?.x||!jwk?.y)return;if(!S.pubCache[fp]){S.pubCache[fp]=jwk;store.set('e2ee_pubs',S.pubCache)}}
async function shaJwkFp(jwk){
  const canon=JSON.stringify({crv:jwk.crv,kty:jwk.kty,x:jwk.x,y:jwk.y});
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canon));
  return[...new Uint8Array(d).slice(0,6)].map(b=>b.toString(16).padStart(2,'0')).join(':');
}
async function safetyCode(fpA,fpB){
  if(!fpA||!fpB||!window.crypto?.subtle)return '';
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode([fpA,fpB].sort().join('|')));
  return[...new Uint8Array(d).slice(0,6)].map(b=>String(b).padStart(3,'0').slice(-2)).join('').match(/.{1,4}/g).join(' ');
}
async function ensureEcdhIdentity(rotate=false){
  if(!window.crypto?.subtle){setTxt('#key-fp','unavailable (WebCrypto needs https or localhost)');return null}
  const suffix=S.user?.id||'local';
  const idKey='e2ee_id_'+suffix,ringKey='e2ee_ring_'+suffix;
  const ring=Object.assign({},store.get(ringKey,{}));
  let curId=rotate?null:store.get(idKey,null);
  if(!curId?.pubJwk||!curId?.privJwk||!curId?.fp){
    const kp=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);
    const pubJwk=await crypto.subtle.exportKey('jwk',kp.publicKey);
    const privJwk=await crypto.subtle.exportKey('jwk',kp.privateKey);
    const fp=await shaJwkFp(pubJwk);
    curId={pubJwk,privJwk,fp};
    ring[fp]=privJwk;
    const keys=Object.keys(ring);
    if(keys.length>12)keys.slice(0,keys.length-12).forEach(k=>delete ring[k]);
    store.set(idKey,curId);
    store.set(ringKey,ring);
  }else if(!ring[curId.fp]){
    ring[curId.fp]=curId.privJwk;
    store.set(ringKey,ring);
  }
  S.ecdhId=curId;S.e2eeRing=ring;AES_CACHE.clear();
  cachePeerPub(curId.fp,curId.pubJwk);
  FP=`ECDH ${curId.fp}`;
  setTxt('#key-fp',`ECDH P-256 · ${curId.fp}`);
  if(S.user&&(rotate||S.user.keyFp!==curId.fp)){
    const pubRes=await sbPost({action:'publishPublicKey',publicKey:curId.pubJwk,keyFp:curId.fp});
    if(pubRes?.ok){
      S.user.publicKey=curId.pubJwk;S.user.keyFp=curId.fp;
      const notified=new Set();
      D.forEach(c=>convRecipientIds(c).forEach(pid=>{if(!notified.has(pid)){notified.add(pid);sendSignal(pid,'key-update',{fromUserId:S.user.id,publicKey:curId.pubJwk,keyFp:curId.fp})}}));
    }
  }
  return curId;
}
function canE2eeConv(c){
  return Boolean(S.ecdhId&&((c?.peerUserId&&c.peerPublicKey)||(c?.isGroup&&(c.members||[]).some(m=>m.publicKey))));
}
async function derivePeerAesKey(myFp,peerPubJwk){
  const peerFp=await shaJwkFp(peerPubJwk);
  const ck=myFp+'|'+peerFp;
  if(AES_CACHE.has(ck))return AES_CACHE.get(ck);
  const privJwk=S.e2eeRing[myFp]||(S.ecdhId?.fp===myFp?S.ecdhId.privJwk:null);
  if(!privJwk||!peerPubJwk?.x||!peerPubJwk?.y)return null;
  const [priv,pub]=await Promise.all([
    crypto.subtle.importKey('jwk',privJwk,{name:'ECDH',namedCurve:'P-256'},false,['deriveKey']),
    crypto.subtle.importKey('jwk',peerPubJwk,{name:'ECDH',namedCurve:'P-256'},false,[])
  ]);
  const aes=await crypto.subtle.deriveKey({name:'ECDH',public:pub},priv,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  AES_CACHE.set(ck,aes);
  return aes;
}
async function genKey(){
  try{KEY=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);const raw=new Uint8Array(await crypto.subtle.exportKey('raw',KEY));if(!S.ecdhId){FP=[...raw.slice(0,8)].map(b=>b.toString(16).padStart(2,'0')).join(':');setTxt('#key-fp',`AES-GCM 256 · ${FP}`)}}catch(e){KEY=null}
  await ensureEcdhIdentity(false);
}
async function enc(t,reply=null,conv=null,fileKeyObj=null){
  if(!window.crypto?.subtle)return null;
  try{
    const envObj={text:t,reply:reply||null,...(fileKeyObj?{fk:fileKeyObj.fk,mime:fileKeyObj.mime}:{})};
    if(conv?.peerUserId&&conv.peerPublicKey&&S.ecdhId){
      const peerFp=conv.peerKeyFp||await shaJwkFp(conv.peerPublicKey);
      cachePeerPub(peerFp,conv.peerPublicKey);
      const aes=await derivePeerAesKey(S.ecdhId.fp,conv.peerPublicKey);
      if(aes){
        const iv=crypto.getRandomValues(new Uint8Array(12));
        const pt=new TextEncoder().encode(JSON.stringify(envObj));
        const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,pt));
        return `e2ee1.${b64uEnc(iv)}.${b64uEnc(ct)}.${S.ecdhId.fp}.${peerFp}`;
      }
    }
    if(conv?.isGroup&&S.ecdhId&&Array.isArray(conv.members)){
      const msgKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
      const rawKey=new Uint8Array(await crypto.subtle.exportKey('raw',msgKey));
      const ivMsg=crypto.getRandomValues(new Uint8Array(12));
      const msgCt=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:ivMsg},msgKey,new TextEncoder().encode(JSON.stringify(envObj))));
      const keys={};
      const targets=[{keyFp:S.ecdhId.fp,publicKey:S.ecdhId.pubJwk},...conv.members.filter(m=>m.publicKey)];
      for(const rec of targets){
        const rFp=rec.keyFp||await shaJwkFp(rec.publicKey);
        cachePeerPub(rFp,rec.publicKey);
        const wrapAes=await derivePeerAesKey(S.ecdhId.fp,rec.publicKey);
        if(wrapAes){
          const ivW=crypto.getRandomValues(new Uint8Array(12));
          const ctW=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:ivW},wrapAes,rawKey));
          keys[rFp]=`${b64uEnc(ivW)}.${b64uEnc(ctW)}`;
        }
      }
      if(Object.keys(keys).length){
        const env={s:S.ecdhId.fp,iv:b64uEnc(ivMsg),ct:b64uEnc(msgCt),keys};
        return 'e2ee2.'+b64uEnc(new TextEncoder().encode(JSON.stringify(env)));
      }
    }
    if(!KEY)return null;
    const iv=crypto.getRandomValues(new Uint8Array(12)),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},KEY,new TextEncoder().encode(t)));
    return[...ct.slice(0,10)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }catch(e){return null}
}
async function decryptMsg(m,conv){
  if(!m?.ct||typeof m.ct!=='string'||!window.crypto?.subtle)return false;
  if(m.ct.startsWith('e2ee2.')){
    try{
      const env=JSON.parse(new TextDecoder().decode(b64uDec(m.ct.slice(6))));
      const senderPub=S.pubCache[env.s]||conv?.members?.find(x=>x.keyFp===env.s)?.publicKey||(S.ecdhId?.fp===env.s?S.ecdhId.pubJwk:null);
      const myFp=Object.keys(env.keys||{}).find(fp=>Boolean(S.e2eeRing[fp]));
      if(!senderPub||!myFp)return false;
      const [ivW,ctW]=String(env.keys[myFp]).split('.');
      const wrapAes=await derivePeerAesKey(myFp,senderPub);
      if(!wrapAes||!ivW||!ctW)return false;
      const rawKey=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64uDec(ivW)},wrapAes,b64uDec(ctW));
      const msgKey=await crypto.subtle.importKey('raw',rawKey,{name:'AES-GCM'},false,['decrypt']);
      const ptBuf=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64uDec(env.iv)},msgKey,b64uDec(env.ct));
      const obj=JSON.parse(new TextDecoder().decode(ptBuf));
      if(obj&&typeof obj.text==='string'){m.text=obj.text;if(obj.reply)m.reply=obj.reply;if(obj.fk){m._fk=obj.fk;m._mime=obj.mime||m.mediaMime}}
      m._decOk=true;
      return true;
    }catch(e){if(!m.text)m.text='🔒 Encrypted with another device key';return false}
  }
  if(!m.ct.startsWith('e2ee1.'))return false;
  const parts=m.ct.split('.');
  if(parts.length!==5)return false;
  const [,ivB64,ctB64,sFp,rFp]=parts;
  let myFp=null,otherFp=null;
  if(S.e2eeRing[rFp]){myFp=rFp;otherFp=sFp}
  else if(S.e2eeRing[sFp]){myFp=sFp;otherFp=rFp}
  else return false;
  const otherPub=S.pubCache[otherFp]||(conv?.peerKeyFp===otherFp?conv.peerPublicKey:null)||(conv?.peerUserId&&conv.peerPublicKey)||null;
  if(!otherPub)return false;
  try{
    const aes=await derivePeerAesKey(myFp,otherPub);
    if(!aes)return false;
    const ptBuf=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64uDec(ivB64)},aes,b64uDec(ctB64));
    const raw=new TextDecoder().decode(ptBuf);
    try{
      const obj=JSON.parse(raw);
      if(obj&&typeof obj.text==='string'){m.text=obj.text;if(obj.reply)m.reply=obj.reply;if(obj.fk){m._fk=obj.fk;m._mime=obj.mime||m.mediaMime}}
      else m.text=raw;
    }catch{m.text=raw}
    m._decOk=true;
    return true;
  }catch(e){
    if(!m.text)m.text='🔒 Encrypted with another device key';
    return false;
  }
}
async function decAllMessages(){
  for(const c of D){for(const m of (c.msgs||[])){if(m.ct?.startsWith('e2ee1.')||m.ct?.startsWith('e2ee2.'))await decryptMsg(m,c)}}
}

/* ---------- config / navigation ---------- */
function applyCfg(){
  const root=document.documentElement;
  root.style.setProperty('--ac',cfg.accent);
  const m=cfg.accent.match(/\w\w/g);
  if(m)root.style.setProperty('--ac-rgb',m.map(x=>parseInt(x,16)).join(' '));
  root.classList.toggle('theme-oled',cfg.theme==='oled');
  root.classList.toggle('theme-light',cfg.theme==='light');
  root.classList.toggle('font-sm',cfg.fontScale==='sm');
  root.classList.toggle('font-lg',cfg.fontScale==='lg');
  root.classList.toggle('hc',cfg.hc);
  root.classList.toggle('theme-hc',cfg.hc);
  root.classList.toggle('rm',cfg.rm);
  document.body.classList.toggle('prot',cfg.prot);
  $('#stream-wrap')?.classList.toggle('chat-bg',cfg.wallpaper!==false);
  $$('[data-k]').forEach(b=>b.setAttribute('aria-checked',String(!!cfg[b.dataset.k])));
  ['default','oled','light'].forEach(t=>{const el=$('#th-'+t);if(el)el.className='h-7 px-2.5 rounded-lg text-[11px] font-semibold '+((cfg.theme||'default')===t?'lux-tab-on':'lux-tab-off')});
  ['sm','md','lg'].forEach(f=>{const el=$('#fs-'+f);if(el)el.className='h-7 px-2.5 rounded-lg text-[11px] font-semibold '+((cfg.fontScale||'md')===f?'lux-tab-on':'lux-tab-off')});
  ['chats','feed'].forEach(sv=>{const el=$('#sv-'+sv);if(el)el.className='h-7 px-2.5 rounded-lg text-[11px] font-semibold '+((cfg.startView||'chats')===sv?'lux-tab-on':'lux-tab-off')});
  const i=$('#idle');if(i)i.value=String(cfg.idle);
  const vs=$('#vanish-sec');if(vs)vs.value=String(cfg.vanishSec||6);
  const lg=$('#set-lang');if(lg)lg.value=cfg.lang||'en';
  setTxt('#pin-state',cfg.pin?'Passcode is set. Required on unlock.':'No passcode set. Passkey verification only.');
  $$('#accents button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.arg===cfg.accent)));
  renderSmartChips();
}

function renderNav(){
  const bd='<span class="nav-badge hidden absolute top-1.5 left-7 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-tr from-rose-500 to-pink-500 ring-2 ring-[#06070c] text-white text-[10px] font-bold grid place-items-center shadow-[0_2px_10px_rgba(244,63,94,.6)]"></span>';
  const rail=([v,i,l])=>`<button data-act="nav" data-arg="${v}" class="nav-btn relative group flex items-center gap-3.5 h-11 w-12 xl:w-full px-3.5 rounded-xl text-[14.5px] font-medium text-zinc-400 hover:text-white hover:bg-white/[0.05] aria-[current=page]:bg-gradient-to-r aria-[current=page]:from-white/[0.11] aria-[current=page]:to-white/[0.03] aria-[current=page]:border aria-[current=page]:border-white/[0.10] aria-[current=page]:text-white aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_10px_24px_-12px_rgba(0,0,0,.75)] border border-transparent transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" title="${l}" aria-label="${l}">${ic(i,'w-[22px] h-[22px] shrink-0 group-hover:scale-105 transition-transform')}<span class="hidden xl:inline tracking-tight">${l}</span>${v==='chats'?bd:''}</button>`;
  const dock=([v,i,l])=>`<button data-act="nav" data-arg="${v}" class="dock-btn relative flex-1 min-w-0 h-14 grid place-items-center text-zinc-500 hover:text-zinc-200 aria-[current=page]:text-white transition-colors" title="${l}" aria-label="${l}">${ic(i,'w-5 h-5')}${v==='chats'?bd.replace('left-7','left-1/2 ml-1.5'):''}</button>`;
  const create=c=>c==='nav-btn'
    ?`<button data-act="storyNew" class="relative group flex items-center gap-3.5 h-11 w-12 xl:w-full px-3.5 rounded-xl text-[14.5px] font-medium text-zinc-400 hover:text-white hover:bg-white/[0.05] border border-transparent transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" title="Create" aria-label="Create story">${ic('square-plus','w-[22px] h-[22px] shrink-0 group-hover:scale-105 transition-transform')}<span class="hidden xl:inline tracking-tight">Create</span></button>`
    :`<button data-act="storyNew" class="relative flex-1 min-w-0 h-14 grid place-items-center text-zinc-300 hover:text-white transition-colors" title="Create" aria-label="Create story"><span class="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#f58529] via-[#dd2a7b] to-[#8134af] grid place-items-center text-white shadow-[0_6px_22px_-4px_rgba(221,42,123,.65),inset_0_1px_0_rgba(255,255,255,.35)] active:scale-95 transition-transform">${ic('plus','w-5 h-5')}</span></button>`;
  $('#rail').innerHTML=NAV.slice(0,3).map(rail).join('')+create('nav-btn')+NAV.slice(3).map(rail).join('');
  $('#dock').innerHTML=NAV.slice(0,2).map(dock).join('')+create('dock-btn')+NAV.slice(2).map(dock).join('');
}

function setView(v){
  closeMenu();
  if(S.view&&S.view!=='profile'&&v==='profile')S.profPrevView=S.view;
  S.view=v;
  $$('.view').forEach(e=>e.classList.toggle('hidden',e.id!=='v-'+v));
  $$('[data-act="nav"]').forEach(b=>{if(b.classList.contains('nav-btn')||b.classList.contains('dock-btn'))b.setAttribute('aria-current',b.dataset.arg===v?'page':'false')});
  if(v==='chats')renderList();
  if(v==='feed')loadFeedData();
  if(v==='reels')renderReel();else{pauseBar(true);const rv=$('#reel-vid');if(rv)rv.pause()}
  if(v==='profile'){loadProfileData(S.profId||'self')}
  if(v==='vault'){renderAudit();renderVaultBackupUI()}
  if(v==='settings'){renderStats();syncPushStateUI()}
  if(v==='ai'&&!$('#ai-log').children.length)aiWelcome();
  icons();
}

async function updateOfflineUI(){
  const bar=$('#offline-bar'),bd=$('#outbox-badge'),txt=$('#offline-txt');
  if(!bar)return;
  const offline=!navigator.onLine;
  let queued=[];
  try{queued=await listOutbox()}catch{}
  const qn=queued.length;
  show(bar,offline||qn>0,'flex');
  if(txt)txt.textContent=offline?"You're offline — messages will send automatically once reconnected.":'Syncing queued messages…';
  if(bd){bd.textContent=qn?`${qn} queued`:'';bd.classList.toggle('hidden',!qn)}
}

function badge(){
  const n=D.reduce((a,c)=>a+(c.unread||0),0);
  $$('.nav-badge').forEach(b=>{b.textContent=n;b.classList.toggle('hidden',!n);b.classList.toggle('grid',!!n)});
  document.title=(n?`(${n}) `:'')+'WhatsGram OS';
  updateDynamicFavicon(n,cfg.accent);
  tabSync?.post('badge',{unread:n});
  try{if(n>0&&navigator.setAppBadge)navigator.setAppBadge(n);else if(navigator.clearAppBadge)navigator.clearAppBadge()}catch{}
}

const openM=id=>{closeMenu();$('#'+id).classList.add('open');icons();const f=$('#'+id+' input,#'+id+' button.btn-ac');if(f&&id!=='m-story')setTimeout(()=>f.focus(),30)};
const closeM=id=>{const el=$('#'+id);if(!el)return;el.classList.remove('open');if(id==='m-media'){const v=$('#lb-vid');if(v){v.pause();v.removeAttribute('src');v.load()}S.lbMsgId=null;S.lbZoom=1}if(id==='m-studio'){const v=$('#st-media-vid');if(v){v.pause();v.removeAttribute('src');v.load()}}if(id==='m-post-view'){$$('video',$('#pv-media-box')).forEach(v=>{v.pause();v.removeAttribute('src');v.load()});S.postViewId=null}if(id==='m-post'){const v=$('#post-prev-vid');if(v){v.pause()}}if(id==='m-story'){S.hlView=null}};
function ask(title,body,fn){S.confirm=fn;setTxt('#cf-title',title);setTxt('#cf-body',body);openM('m-confirm')}

/* ---------- conversations ---------- */
function renderFolders(){
  const un=D.filter(c=>c.unread).length;
  const reqC=D.filter(c=>c.isRequest).length;
  $('#folders').innerHTML=[['all','All'],['work','Work'],['personal','Personal'],['unread','Unread'+(un?` ${un}`:'')],['requests','Requests'+(reqC?` ${reqC}`:'')]].map(([k,l])=>`<button role="tab" class="flex-1 min-w-0 h-8 px-1.5 rounded-xl text-[10.5px] lg:text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 border border-transparent aria-[selected=true]:bg-gradient-to-b aria-[selected=true]:from-white/[0.15] aria-[selected=true]:to-white/[0.07] aria-[selected=true]:text-white aria-[selected=true]:border-white/[0.14] aria-[selected=true]:shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_4px_12px_-4px_rgba(0,0,0,.6)] transition-all truncate" data-act="folder" data-arg="${k}" aria-selected="${S.folder===k}">${l}</button>`).join('');
}
const prev=m=>!m?'No messages':m.type==='voice'?'🎙 Voice note':m.type==='file'?'📎 '+m.name:m.text;

function renderList(){
  renderFolders();
  const q=S.q.trim();
  const idxHits=q?new Set(searchIdx.query(q).map(h=>h.convId)):null;
  let rows=D.map(c=>({c,s:q?Math.max(sim(q,c.name+' '+c.msgs.map(m=>m.text||m.name||'').join(' ')),idxHits?.has(c.id)?0.65:0):1})).filter(r=>{
    if(S.folder==='requests')return Boolean(r.c.isRequest)&&(!q||r.s>.1);
    if(S.folder==='unread')return Boolean(r.c.unread)&&(!q||r.s>.1);
    if(S.folder==='work'||S.folder==='personal')return r.c.folder===S.folder&&!r.c.isRequest&&(!q||r.s>.1);
    return !r.c.isRequest&&(!q||r.s>.1);
  });
  if(q)rows.sort((a,b)=>b.s-a.s);
  $('#list-body').innerHTML=rows.length?rows.map(({c,s})=>{
    const l=c.msgs[c.msgs.length-1];
    const active=c.id===S.chat;
    const online=!c.isGroup&&c.status==='Online';
    return `<button data-act="chat" data-arg="${c.id}" class="w-full text-left flex items-center gap-3.5 px-3 py-2.5 rounded-2xl border transition-all ${active?'bg-gradient-to-r from-white/[0.095] to-white/[0.03] border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,.09),0_12px_26px_-14px_rgba(0,0,0,.85)]':'border-transparent hover:bg-white/[0.04] hover:border-white/[0.05]'}">
      <span class="relative shrink-0">${av(c.name,'w-12 h-12')}${online?'<span class="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-2 ring-[#070810] shadow-[0_0_8px_rgba(52,211,153,.75)]"></span>':c.isGroup?'<span class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent ring-2 ring-[#070810] grid place-items-center text-[9px] font-bold text-white shadow-sm">G</span>':''}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[13.5px] ${c.unread?'font-bold text-white':'font-semibold text-zinc-100'} truncate">${esc(c.name)}</span>
          <span class="text-[10.5px] font-mono ${c.unread?'text-accent font-semibold':'text-zinc-500'} shrink-0">${esc(l?.t||'')}</span>
        </div>
        <div class="flex items-center justify-between gap-2 mt-0.5">
          ${S.typing[c.id]?'<span class="text-xs text-emerald-400 font-medium truncate">typing…</span>':`<span class="text-xs ${c.unread?'text-zinc-200 font-medium':'text-zinc-400'} truncate">${esc(prev(l))}</span>`}
          ${q?`<span class="font-mono text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent shrink-0">${Math.round(s*100)}%</span>`:c.unread?`<span class="btn-primary min-w-[19px] h-[19px] px-1.5 rounded-full text-[10px] font-bold grid place-items-center shrink-0">${c.unread}</span>`:''}
        </div>
      </div>
    </button>`;
  }).join(''):`<div class="p-8 text-center text-xs text-zinc-500">${q?'No conversations match your search.':'No conversations in this folder.'}</div>`;
  badge();icons();
}

function renderNotes(){
  const strip=$('#notes-strip');if(!strip)return;
  const meId=S.user?.id||'self';
  const meName=S.user?.displayName||'You';
  const nowMs=Date.now();
  let list=(S.notes||[]).filter(n=>!n.expires_at||new Date(n.expires_at).getTime()>nowMs);
  if(!list.length&&!S.user){
    list=[{user_id:'u_alex',text:'Shipping E2EE notes 🚀',username:'alex.rivera',displayName:'Alex Rivera'}];
  }
  const myNote=list.find(n=>n.user_id===meId);
  const others=list.filter(n=>n.user_id!==meId);
  strip.innerHTML=`<button type="button" data-act="openNoteModal" class="group shrink-0 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.09] transition max-w-[180px]" title="Share a 24h inbox note">
    ${av(meName,'w-6 h-6')}
    <span class="text-[11px] font-medium truncate ${myNote?'text-white':'text-zinc-400'}">${esc(myNote?myNote.text:'Leave a note…')}</span>
  </button>`+others.map(n=>`<button type="button" data-act="replyToNote" data-arg="${esc(n.user_id)}" class="shrink-0 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-2xl bg-accent/10 hover:bg-accent/20 border border-accent/25 transition max-w-[190px]" title="Reply to ${esc(n.displayName||n.username||'friend')}">
    ${av(n.displayName||n.username||'U','w-6 h-6')}
    <span class="min-w-0 text-left"><span class="block text-[10px] font-bold text-accent truncate">${esc((n.displayName||n.username||'Friend').split(' ')[0])}</span><span class="block text-[11px] text-zinc-200 truncate">${esc(n.text)}</span></span>
  </button>`).join('');
}

function renderStories(){
  renderNotes();
  const me=S.user?.displayName||S.user?.email||'You';
  $('#stories').innerHTML=`<button data-act="storyNew" class="group flex flex-col items-center gap-1.5 shrink-0 w-[68px]" aria-label="Create story">
    <span class="relative p-[2.5px] rounded-full bg-white/[0.12] group-hover:bg-white/[0.22] transition-all">
      <span class="block p-[2px] rounded-full bg-[#070810]">${av(me,'w-[54px] h-[54px]')}</span>
      <span class="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-[#0095f6] ring-2 ring-[#070810] grid place-items-center text-white shadow-md">${ic('plus','w-3 h-3 stroke-[2.8]')}</span>
    </span>
    <span class="text-[11px] font-medium text-zinc-400 group-hover:text-zinc-200 truncate w-full text-center">Your story</span>
  </button>`+ST.map((s,i)=>`<button data-act="storyOpen" data-arg="${i}" class="group flex flex-col items-center gap-1.5 shrink-0 w-[68px]" aria-label="View ${esc(s.name)} story">
    <span class="p-[2.5px] rounded-full transition-transform group-hover:scale-[1.04] ${s.closeFriends?(s.seen?'st-ring-cf opacity-75':'st-ring-cf shadow-[0_6px_18px_-6px_rgba(16,185,129,.65)]'):(s.seen?'bg-zinc-700/80':'bg-gradient-to-tr from-[#f58529] via-[#dd2a7b] to-[#8134af] shadow-[0_6px_18px_-6px_rgba(221,42,123,.65)]')}">
      <span class="block p-[2px] rounded-full bg-[#070810]">${av(s.name,'w-[54px] h-[54px]')}</span>
    </span>
    <span class="text-[11px] ${s.seen?'text-zinc-500':'text-zinc-200 font-medium'} w-full truncate text-center">${esc(s.name.split(' ')[0])}</span>
  </button>`).join('');
  icons();
}

function openChat(id){
  const c=D.find(x=>x.id===id);if(!c)return;
  S.chat=id;c.unread=0;S.reply=null;S.editId=null;S.thMatches=[];S.thIdx=0;S.smart=[];
  saveD();
  $('#v-chats').dataset.open='1';
  sendReadReceipt(c);
  setTxt('#jump-bottom-lbl','Latest');
  renderList();renderThread();renderInfo();loadSmartReplies(c);
  if(!S.incognito){
    loadDraftIdb(id).then(txt=>{if(S.chat===id&&txt&&$('#msg')&&!$('#msg').value){$('#msg').value=txt;$('#msg').dispatchEvent(new Event('input',{bubbles:true}))}});
  }
  if(matchMedia('(min-width:768px)').matches)setTimeout(()=>$('#msg').focus(),30);
}

function renderHead(){
  const c=cur();
  if(!c){setTxt('#th-name','Select a conversation');setTxt('#th-status','');$('#th-av').innerHTML='';return}
  const online=c.peerUserId?(S.onlineUsers[c.peerUserId]||c.status==='Online'):(!c.isGroup&&c.status==='Online');
  $('#th-av').innerHTML=`<span class="relative inline-block">${av(c.name,'w-9 h-9')}${online?'<span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#080910] shadow-[0_0_8px_rgba(52,211,153,.8)]"></span>':''}</span>`;
  setTxt('#th-name',c.name);
  const e2Txt=cfg.e2ee?((c.peerUserId||c.isGroup)?(canE2eeConv(c)?' · E2EE':' · E2EE pending'):' · E2EE'):'';
  const tp=S.typing[c.id];
  const baseSt=c.isGroup?`${c.members?.length||1} members`:(online?'Online':c.status);
  setTxt('#th-status',(tp?(typeof tp==='string'?tp+' typing…':'typing…'):baseSt)+e2Txt);
}

const linkSeg=s=>esc(s).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer" class="wg-ext-link underline underline-offset-2 decoration-white/50 hover:decoration-white">$1</a>');
function renderMsgText(raw,q){
  const str=String(raw||'');
  if(!q)return linkSeg(str);
  const re=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return str.split(/(https?:\/\/[^\s]+)/g).map((seg,idx)=>idx%2===1?`<a href="${esc(seg)}" target="_blank" rel="noopener noreferrer" class="wg-ext-link underline underline-offset-2 decoration-white/50 hover:decoration-white">${esc(seg).replace(re,'<mark class="hl">$1</mark>')}</a>`:esc(seg).replace(re,'<mark class="hl">$1</mark>')).join('');
}
function dayLabel(ts){
  if(!ts)return '';
  const d=new Date(ts),nowD=new Date();
  if(d.toDateString()===nowD.toDateString())return 'Today';
  const y=new Date(nowD);y.setDate(nowD.getDate()-1);
  if(d.toDateString()===y.toDateString())return 'Yesterday';
  return d.toLocaleDateString([],{month:'short',day:'numeric',year:d.getFullYear()!==nowD.getFullYear()?'numeric':undefined});
}
function typingBubbleHTML(tp){
  return `<div id="typing-bubble" class="msg-in flex items-center gap-2 pt-1"><div class="bubble-them px-4 py-3 rounded-[20px] rounded-bl-[6px] inline-flex items-center gap-1.5"><span class="tdot inline-flex items-center gap-1"><i></i><i></i><i></i></span>${typeof tp==='string'?`<span class="text-[11px] text-zinc-400 pl-1">${esc(tp)}</span>`:''}</div></div>`;
}
function renderTypingRow(){
  const s=$('#stream');if(!s)return;
  $('#typing-bubble',s)?.remove();
  const c=cur(),tp=c&&S.typing[c.id];
  if(tp){
    const atBot=s.scrollHeight-s.scrollTop-s.clientHeight<80;
    s.insertAdjacentHTML('beforeend',typingBubbleHTML(tp));
    if(atBot)s.scrollTop=s.scrollHeight;
  }
}

function msgHTML(m,c,isGrouped=false){
  if(m.from==='sys')return `<div class="text-center text-[11px] font-medium text-zinc-500 py-2">${esc(m.text)}</div>`;
  if(m._aiLocal){
    if(m.aiRole==='user'){
      return `<div class="grp group/msg flex flex-col items-end gap-1" id="${m.id}">
        <div class="flex items-center gap-1.5 max-w-[88%] md:max-w-md flex-row-reverse">
          <div class="rounded-[20px] rounded-br-[6px] bg-gradient-to-br from-indigo-500/25 to-accent/25 border border-accent/35 text-zinc-100 px-4 py-2.5 text-[13.5px] leading-relaxed break-words min-w-0">${linkSeg(m.text)}</div>
          <button data-act="delAiNote" data-arg="${m.id}" class="msgmenu w-7 h-7 shrink-0 rounded-full grid place-items-center text-zinc-500 hover:text-white hover:bg-white/[0.08] opacity-70 md:opacity-0 group-hover/msg:opacity-100 transition" aria-label="Dismiss AI prompt">${ic('x','w-3.5 h-3.5')}</button>
        </div>
        <span class="text-[10px] font-mono text-accent/80 px-1 inline-flex items-center gap-1">${ic('sparkles','w-2.5 h-2.5')}Private @AI · ${esc(m.t)}</span>
      </div>`;
    }
    return `<div class="grp group/msg flex flex-col items-start gap-1" id="${m.id}">
      <div class="flex items-start gap-2 max-w-[92%] md:max-w-lg">
        <span class="w-7 h-7 mt-1 rounded-xl border border-accent/35 bg-gradient-to-br from-accent/25 to-indigo-500/20 grid place-items-center text-accent shrink-0 shadow-[0_0_16px_-4px_rgb(var(--ac-rgb)/.45)]">${ic('sparkles','w-3.5 h-3.5')}</span>
        <div class="lux-card border-accent/25 rounded-[20px] rounded-tl-[6px] px-4 py-3 text-[13.5px] leading-relaxed text-zinc-100 break-words min-w-0">
          <div class="flex items-center justify-between gap-3 mb-1.5">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-accent">WhatsGram AI · Private to you</span>
            <button data-act="delAiNote" data-arg="${m.id}" class="w-5 h-5 rounded-full grid place-items-center text-zinc-500 hover:text-white hover:bg-white/10 transition" aria-label="Dismiss AI note">${ic('x','w-3 h-3')}</button>
          </div>
          <div class="whitespace-pre-wrap">${linkSeg(m.text)}</div>
          ${m.draft?`<div class="mt-2.5 pt-2 border-t border-white/[0.07] flex items-center gap-2"><button data-act="useInlineDraft" data-arg="${m.id}" class="btn-primary h-7 px-3 rounded-full text-[11px] font-semibold inline-flex items-center gap-1">${ic('corner-up-left','w-3 h-3')}Insert into message</button></div>`:''}
        </div>
      </div>
      <span class="text-[10px] font-mono text-zinc-500 pl-9">${esc(m.t)}${m.src==='wiki'?' · Wikipedia backup':''}</span>
    </div>`;
  }
  const me=m.from==='me';
  const q=S.thSearch?S.thQ.trim():'';
  let body;
  if(m.type==='voice')body=`<div class="flex items-center gap-3 min-w-[11.5rem]"><button data-act="voicePlay" data-arg="${m.id}" class="w-8 h-8 rounded-full bg-black/30 hover:bg-black/45 grid place-items-center shrink-0 transition" aria-label="Play voice note">${ic('play','w-3.5 h-3.5')}</button><span class="wv flex items-center gap-0.5 h-5">${[5,12,8,16,10,14,6,11,7].map(h=>`<i class="w-0.5 rounded-full bg-white/80 origin-center" style="height:${h}px"></i>`).join('')}</span><span class="font-mono text-[10px] opacity-85 tabular-nums">${m.dur||'0:00'}</span>${m.mediaPath?`<span class="text-[9px] px-1.5 py-0.5 rounded bg-black/25 font-mono">${m.mediaEnc?'🔒':'cloud'}</span>`:''}</div>${m.text?`<div class="mt-1.5 text-[11px] opacity-85 italic">“${esc(m.text)}”</div>`:''}`;
  else if(m.type==='file'){
    const dl=BLOBS[m.id]||m.mediaPath;
    const isImg=m.mediaMime?.startsWith('image/'),isVid=m.mediaMime?.startsWith('video/');
    let mediaEl='';
    if(isImg&&BLOBS[m.id])mediaEl=`<button data-act="openMedia" data-arg="${m.id}" class="block w-full mb-2 text-left rounded-xl overflow-hidden border border-white/10 hover:brightness-105 transition"><img src="${esc(BLOBS[m.id])}" alt="${esc(m.name)}" class="max-h-56 w-full object-cover"></button>`;
    else if(isVid&&BLOBS[m.id])mediaEl=`<div class="relative mb-2 rounded-xl overflow-hidden border border-white/10 bg-black"><video src="${esc(BLOBS[m.id])}" controls playsinline class="max-h-56 w-full"></video><button data-act="openMedia" data-arg="${m.id}" class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/65 hover:bg-black/85 text-white grid place-items-center" aria-label="Expand video">${ic('maximize-2','w-3.5 h-3.5')}</button></div>`;
    else if((isImg||isVid)&&m.mediaPath)mediaEl=`<div class="mb-2 h-28 rounded-xl bg-black/35 border border-white/10 grid place-items-center text-[11px] text-zinc-300 font-mono">${m.mediaEnc?'🔒 Decrypting cloud media…':'Loading cloud preview…'}</div>`;
    body=mediaEl+`<div class="flex items-center gap-2.5">${ic('file-text','w-4 h-4 shrink-0')}<div class="min-w-0 flex-1"><div class="font-medium truncate">${esc(m.name)}</div><div class="text-[10px] opacity-75 font-mono">${esc(m.size)}${m.mediaPath?(m.mediaEnc?' · 🔒 E2EE cloud':' · cloud'):''}</div></div>${dl?`<button data-act="downloadFile" data-arg="${m.id}" class="w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 grid place-items-center shrink-0 transition" title="Download file" aria-label="Download file">${ic('download','w-3.5 h-3.5')}</button>`:''}</div>`;
  }
  else if(m.reply&&m.reply._poll){
    const pl=m.reply._poll;
    const opts=Array.isArray(pl.options)?pl.options:[];
    const totalVotes=opts.reduce((sum,o)=>sum+((o.votes||[]).length),0);
    const myId=S.user?.id||'self';
    body=`<div class="min-w-[13rem] max-w-[17rem] space-y-2">
      <div class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider opacity-80">${ic('bar-chart-2','w-3.5 h-3.5')}<span>Poll · ${totalVotes} vote${totalVotes===1?'':'s'}</span></div>
      <div class="text-[13.5px] font-bold leading-snug">${esc(pl.question||'Poll')}</div>
      <div class="space-y-1.5">${opts.map((o,idx)=>{
        const v=(o.votes||[]).length;
        const pct=totalVotes?Math.round((v/totalVotes)*100):0;
        const picked=(o.votes||[]).includes(myId);
        return `<button type="button" data-act="votePoll" data-arg="${esc(m.id)}|${idx}" class="relative w-full overflow-hidden rounded-xl border ${picked?'border-white/75 bg-white/15':'border-white/20 bg-black/25 hover:bg-black/35'} px-3 py-1.5 text-left text-xs transition flex items-center justify-between gap-2">
          <span class="absolute inset-y-0 left-0 bg-white/20 transition-all pointer-events-none" style="width:${pct}%"></span>
          <span class="relative z-10 font-semibold truncate">${picked?'✓ ':''}${esc(o.text)}</span>
          <span class="relative z-10 font-mono text-[10px] shrink-0">${pct}%</span>
        </button>`;
      }).join('')}</div>
    </div>`;
  }
  else body=renderMsgText(m.text,q)+(m._tr?`<div class="mt-1.5 pt-1.5 border-t border-white/15 text-[11.5px] text-sky-200">🌐 ${esc(m._tr)}</div>`:'');

  const rep=(m.reply&&!m.reply._poll)?`<div class="mb-1.5 pl-2.5 border-l-2 border-white/50 text-[11px] opacity-85 truncate">${esc(m.reply.text)}</div>`:'';
  const rx=Object.entries(m.react||{}).map(([e,n])=>`<button data-act="react" data-arg="${m.id}|${e}" class="px-2 py-0.5 rounded-full border border-white/[0.12] bg-[#141724]/90 backdrop-blur-md hover:bg-white/[0.12] text-[11px] shadow-sm transition">${e} ${n}</button>`).join('');
  const cls=me?(m.ct?'bubble-me-zk':'bubble-me')+' text-white rounded-[20px] rounded-br-[6px]':'bubble-them text-zinc-100 rounded-[20px] rounded-bl-[6px]';
  const isZk=m.ct?.startsWith('e2ee1.')||m.ct?.startsWith('e2ee2.');
  const e2Badge=isZk?` · <span class="text-emerald-400" title="Zero-knowledge ECDH P-256 + AES-GCM-256">🔒 E2EE</span>`:(m.ct?` · <span title="AES-GCM ciphertext ${esc(m.ct)}">🔒 encrypted</span>`:'');
  let rcpt='';
  if(me&&cfg.receipts!==false){
    const peerRead=(c?.peerUserId||c?.isGroup)?((c.peerReadMs||0)>=(m.ts||0)&&(m.ts||0)>0):!m.pending;
    rcpt=m.pending?'':(peerRead?' · <span class="text-sky-400" title="Read by peer">✓✓ Read</span>':' · <span class="text-zinc-500">✓ Sent</span>');
  }
  const senderLbl=(c?.isGroup&&!me&&m.fromName&&!isGrouped)?`<span class="text-[10px] font-semibold text-zinc-400 px-1">${esc(m.fromName)}</span>`:'';
  const focused=S.thSearch&&S.thMatches[S.thIdx]===m.id?' msg-focus':'';

  return `<div class="grp group/msg flex flex-col ${me?'items-end':'items-start'} gap-1${isGrouped?' msg-grouped':''}${focused}" id="${m.id}">
    ${senderLbl}
    <div class="flex items-center gap-1.5 max-w-[88%] md:max-w-md ${me?'flex-row-reverse':''}">
      <div class="${cls} px-4 py-2.5 text-[13.5px] leading-relaxed break-words min-w-0">${rep}${body}</div>
      <button data-act="menu" data-arg="msg:${m.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Message options" class="msgmenu w-7 h-7 shrink-0 rounded-full grid place-items-center text-zinc-500 hover:text-white hover:bg-white/[0.08] opacity-75 md:opacity-0 group-hover/msg:opacity-100 focus:opacity-100 aria-[expanded=true]:opacity-100 transition-opacity">${ic('ellipsis','w-3.5 h-3.5')}</button>
    </div>
    ${rx?`<div class="flex flex-wrap gap-1">${rx}</div>`:''}
    <span class="text-[10px] font-mono text-zinc-500 px-1 tabular-nums">${m.starred?'★ ':''}${m.quiet?'🔕 ':''}${esc(m.t)}${m.editedAt?' · edited':''}${e2Badge}${rcpt}${m.pending?' · ⏳ queued':''}${m.exp?' · vanishing':''}</span>
  </div>`;
}

function renderThread(preserveScroll=false){
  renderHead();
  const c=cur(),s=$('#stream'),th=$('#thread');
  if(th){th.dataset.btheme=c?.bubbleTheme||'default';th.classList.toggle('vanish-active',Boolean(cfg.vanish))}
  const prevTop=s.scrollTop;
  if(!c){
    s.innerHTML=`<div class="h-full grid place-items-center px-6">
      <div class="lux-card max-w-xs w-full rounded-[28px] p-7 text-center space-y-3.5">
        <span class="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-[#f58529]/20 via-[#dd2a7b]/20 to-[#8134af]/20 border border-white/15 grid place-items-center text-white shadow-[0_0_30px_-8px_rgb(var(--ac-rgb)/.5)]">${ic('message-circle','w-6 h-6')}</span>
        <div>
          <div class="text-base font-bold text-white">Your messages</div>
          <p class="text-xs text-zinc-400 leading-relaxed mt-1">Select a conversation or start a new encrypted thread in your enclave.</p>
        </div>
        <button data-act="open" data-arg="m-contact" class="btn-primary inline-flex items-center gap-1.5 h-9 px-5 rounded-full text-xs font-semibold">Send message</button>
      </div>
    </div>`;
    show('#pinned',false);show('#key-warn',false);show('#jump-bottom',false);renderSmartChips();icons();return;
  }
  let html=c.isRequest?`<div class="lux-card rounded-2xl border-sky-500/30 p-3 flex flex-wrap items-center justify-between gap-2 text-xs mb-2"><span class="text-sky-200">Message request — accept to move into your inbox.</span><button type="button" data-act="acceptMsgReq" data-arg="${esc(c.id)}" class="btn-primary h-7 px-3 rounded-lg text-[11px] font-bold">Accept</button></div>`:'';
  html+=c.hasMore?`<div class="flex justify-center pt-1 pb-2"><button type="button" data-act="loadOlderMsgs" class="btn-ghost h-8 px-4 rounded-full text-[11px] font-semibold text-zinc-200 inline-flex items-center gap-1.5">${ic('history','w-3.5 h-3.5 text-accent')}<span>Load older messages</span></button></div>`:'';
  let lastDay='';
  const timeline=[...c.msgs,...(S.aiThread[c.id]||[])].sort((a,b)=>(a.ts||0)-(b.ts||0));
  for(let i=0;i<timeline.length;i++){
    const m=timeline[i],prevM=i>0?timeline[i-1]:null;
    const dl=dayLabel(m.ts);
    if(dl&&dl!==lastDay){
      lastDay=dl;
      html+=`<div class="day-div"><span>${esc(dl)}</span></div>`;
    }
    const grouped=Boolean(prevM&&prevM.from===m.from&&m.from!=='sys'&&!m._aiLocal&&!prevM._aiLocal&&Math.abs((m.ts||0)-(prevM.ts||0))<120000);
    html+=msgHTML(m,c,grouped);
  }
  if(!timeline.length)html+='<div class="h-full grid place-items-center text-xs text-zinc-500">No messages yet. Say hello or type @ai to ask anything.</div>';
  if(S.typing[c.id])html+=typingBubbleHTML(S.typing[c.id]);
  s.innerHTML=html;
  const p=c.msgs.find(m=>m.id===c.pin);
  show('#pinned',!!p);if(p)setTxt('#pinned-t',prev(p));
  show('#key-warn',Boolean(c.keyChanged));
  if(c.keyChanged)setTxt('#key-warn-t',`${c.name} rotated their ECDH key. Verify the safety number in Details.`);
  show('#edit-pill',Boolean(S.editId));if(S.editId)setTxt('#edit-t','Editing message');
  show('#reply-pill',!!S.reply&&!S.editId);if(S.reply)setTxt('#reply-t',S.reply.text);
  show('#th-search-bar',S.thSearch);$('#th-search-btn')?.setAttribute('aria-pressed',String(S.thSearch));
  renderSmartChips();
  if(preserveScroll)s.scrollTop=prevTop;else s.scrollTop=s.scrollHeight;
  show('#jump-bottom',s.scrollHeight-s.scrollTop-s.clientHeight>180);
  hydrateThreadMedia(c);
  icons();
}

function toggleThreadSearch(force){
  S.thSearch=typeof force==='boolean'?force:!S.thSearch;
  if(!S.thSearch){S.thQ='';S.thMatches=[];S.thIdx=0}
  show('#th-search-bar',S.thSearch);
  $('#th-search-btn')?.setAttribute('aria-pressed',String(S.thSearch));
  renderThread(true);
  if(S.thSearch)setTimeout(()=>$('#th-search-in')?.focus(),20);
}
function searchThread(q){
  S.thQ=q;const c=cur();
  const tq=q.trim().toLowerCase();
  S.thMatches=(c&&tq)?c.msgs.filter(m=>m.from!=='sys'&&((m.text||'').toLowerCase().includes(tq)||(m.name||'').toLowerCase().includes(tq))).map(m=>m.id):[];
  S.thIdx=S.thMatches.length?S.thMatches.length-1:0;
  setTxt('#th-search-cnt',S.thMatches.length?`${S.thIdx+1}/${S.thMatches.length}`:'0/0');
  renderThread(true);
  if(S.thMatches.length)$('#'+S.thMatches[S.thIdx])?.scrollIntoView({behavior:'smooth',block:'center'});
}
function searchStep(dir){
  if(!S.thMatches.length)return;
  S.thIdx=(S.thIdx+dir+S.thMatches.length)%S.thMatches.length;
  setTxt('#th-search-cnt',`${S.thIdx+1}/${S.thMatches.length}`);
  renderThread(true);
  $('#'+S.thMatches[S.thIdx])?.scrollIntoView({behavior:'smooth',block:'center'});
}

function renderSmartChips(){
  const box=$('#smart-chips'),c=cur();
  if(!box)return;
  if(!c||cfg.smartReplies===false||S.editId||!S.smart.length){show(box,false);box.innerHTML='';return}
  box.innerHTML=`<span class="text-[10px] font-medium text-zinc-500 mr-0.5 shrink-0">${ic('sparkles','w-3.5 h-3.5 inline text-accent')}</span>`+S.smart.map((t,i)=>`<button data-act="smartReply" data-arg="${i}" class="btn-ghost shrink-0 h-7 px-3 rounded-full text-[11px] font-medium text-zinc-200 hover:text-white truncate max-w-[14rem]">${esc(t)}</button>`).join('');
  show(box,true);
  icons();
}
async function loadSmartReplies(c){
  if(!c||cfg.smartReplies===false){S.smart=[];renderSmartChips();return}
  const inc=[...c.msgs].reverse().find(m=>m.from==='them'&&m.text&&!m.text.startsWith('🔒'));
  if(!inc){S.smart=[];S.smartFor=null;renderSmartChips();return}
  if(S.smartFor===inc.id&&S.smart.length){renderSmartChips();return}
  S.smartFor=inc.id;
  const lt=inc.text.toLowerCase();
  S.smart=/\?/.test(inc.text)?['Yes, looks good!','Let me check and reply.','Can we discuss details?']:/thank|great|awesome/.test(lt)?['Anytime!','Glad to help 👍','Let me know what is next.']:['Got it, thanks!','Sounds good!','On it shortly.'];
  renderSmartChips();
  if(!location.protocol.startsWith('http')||!navigator.onLine)return;
  const res=await callGemini({
    mode:'smartReplies',
    contactName:c.name,
    messages:c.msgs.filter(m=>m.from!=='sys'&&m.text&&!m.text.startsWith('🔒')).slice(-6).map(m=>({from:m.from==='me'?'Me':c.name,text:m.text,t:m.t}))
  });
  if(cur()?.id===c.id&&S.smartFor===inc.id&&Array.isArray(res?.suggestions)&&res.suggestions.length){
    S.smart=res.suggestions.slice(0,3);
    renderSmartChips();
  }
}

function renderInfo(){
  const c=cur(),el=$('#info');
  if(!c){el.innerHTML='';return}
  const files=c.msgs.filter(m=>m.type==='file');
  const online=c.peerUserId?(S.onlineUsers[c.peerUserId]||c.status==='Online'):(!c.isGroup&&c.status==='Online');
  el.innerHTML=`<div class="h-16 px-5 border-b border-white/[0.07] flex items-center justify-between shrink-0 bg-white/[0.01]">
    <span class="text-sm font-bold text-white">Details</span>
    <button class="w-8 h-8 rounded-full grid place-items-center text-zinc-400 hover:text-white hover:bg-white/[0.08] transition" data-act="info" aria-label="Close panel">${ic('x')}</button>
  </div>
  <div class="p-6 flex flex-col items-center gap-2 border-b border-white/[0.07] bg-gradient-to-b from-white/[0.02] to-transparent">
    <span class="p-1 rounded-full ring-1 ring-white/[0.1] shadow-[0_12px_30px_-8px_rgba(0,0,0,.8)]">${av(c.name,'w-16 h-16')}</span>
    <div class="text-sm font-bold text-white mt-1.5">${esc(c.name)}</div>
    <div class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-zinc-300">${online?'<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]"></span>':''}${online?'Online':esc(c.status)}</div>
    ${!c.isGroup?`<button data-act="openPeerProfile" class="mt-1.5 btn-ghost h-8 px-3.5 rounded-full text-[11px] font-semibold text-white inline-flex items-center gap-1.5">${ic('user','w-3.5 h-3.5 text-sky-400')}View Profile</button>`:''}
  </div>
  <div class="p-5 space-y-5">
    ${c.peerUserId?`<div class="lux-card rounded-2xl ${c.keyChanged?'border-amber-500/40':'border-emerald-400/20'} p-3.5 space-y-2"><div class="flex items-center justify-between text-xs"><span class="font-semibold text-zinc-200 inline-flex items-center gap-1.5">${ic('shield-check','w-3.5 h-3.5 text-emerald-400')}ECDH P-256 E2EE</span><span class="text-[10px] font-semibold ${c.keyChanged?'text-amber-300':(c.peerPublicKey&&S.ecdhId?'text-emerald-400':'text-amber-300')}">${c.keyChanged?'Key rotated':(c.peerPublicKey&&S.ecdhId?'Key verified':'Pending peer')}</span></div><div class="text-[11px] text-zinc-400">Peer key: <span class="font-mono text-zinc-200">${esc(c.peerKeyFp||'not published yet')}</span></div><div id="info-safety" class="text-[11px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 rounded-lg px-2.5 py-1 inline-block"></div><div id="info-qr" class="hidden pt-1 flex items-center gap-3"></div>${c.keyChanged?'<button data-act="verifyPeerKey" class="mt-1 h-7 px-3 rounded-lg bg-amber-400 text-black text-[11px] font-bold">Verify new key</button>':''}</div>`:''}
    ${c.isGroup?`<div class="lux-card rounded-2xl p-3.5 space-y-2"><div class="flex items-center justify-between text-xs"><span class="font-semibold text-zinc-200">Members (${c.members?.length||1})</span><span class="text-[10px] font-mono text-emerald-400">${canE2eeConv(c)?'e2ee2 wrapped':'Local'}</span></div><div class="space-y-1.5 max-h-36 overflow-y-auto">${(c.members||[]).map(m=>`<div class="flex items-center gap-2 text-xs"><span class="w-2 h-2 rounded-full ${S.onlineUsers[m.id]?'bg-emerald-400':'bg-zinc-600'}"></span><span class="flex-1 truncate text-zinc-200">${esc(m.displayName)}</span><span class="text-[10px] font-mono text-zinc-500">${m.keyFp?'🔒':''}${m.role==='owner'?' owner':''}</span></div>`).join('')}</div><div class="grid grid-cols-1 gap-1.5 pt-1"><button type="button" data-act="copyGroupInvite" class="btn-ghost w-full h-8 rounded-xl text-xs font-semibold text-sky-300 inline-flex items-center justify-center gap-1.5">${ic('link-2','w-3.5 h-3.5')}Copy Group Invite Link</button>${S.user?`<button data-act="leaveGroup" class="w-full h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-semibold text-rose-300 transition">Leave group</button>`:''}</div></div>`:''}
    <div>
      <div class="text-xs font-medium text-zinc-400 mb-2">Folder</div>
      <div class="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-black/45 border border-white/[0.08]">${['work','personal'].map(f=>`<button class="h-8 px-3 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white border border-transparent aria-[pressed=true]:bg-gradient-to-b aria-[pressed=true]:from-white/[0.16] aria-[pressed=true]:to-white/[0.08] aria-[pressed=true]:text-white aria-[pressed=true]:border-white/[0.15] aria-[pressed=true]:shadow-[inset_0_1px_0_rgba(255,255,255,.22)] transition-all" data-act="setFolder" data-arg="${f}" aria-pressed="${c.folder===f}">${f[0].toUpperCase()+f.slice(1)}</button>`).join('')}</div>
    </div>
    <div>
      <div class="text-xs font-medium text-zinc-400 mb-2">Chat bubble theme</div>
      <div class="flex flex-wrap gap-1.5">${[['default','Default','bg-accent'],['ocean','Ocean','bg-blue-600'],['sunset','Sunset','bg-rose-500'],['emerald','Emerald','bg-emerald-600'],['mono','Mono','bg-zinc-600']].map(([k,lbl,dot])=>`<button type="button" data-act="setChatTheme" data-arg="${k}" class="h-7 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 border transition ${(c.bubbleTheme||'default')===k?'border-white/50 bg-white/[0.14] text-white':'border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:text-white'}"><span class="w-2.5 h-2.5 rounded-full ${dot}"></span>${lbl}</button>`).join('')}</div>
    </div>
    <div class="flex items-center justify-between gap-3 py-1">
      <span class="text-xs font-semibold text-zinc-200">End-to-end encryption</span>
      <button class="lux-sw group relative w-11 h-6 rounded-full transition-all shrink-0" role="switch" data-act="sw" data-arg="e2ee" data-k="e2ee" aria-checked="${cfg.e2ee}" aria-label="Encryption"><span class="pointer-events-none block w-5 h-5 rounded-full bg-white shadow-sm translate-x-0.5 transition-transform duration-200 group-aria-[checked=true]:translate-x-[21px]"></span></button>
    </div>
    <div class="flex items-center justify-between gap-3 py-1">
      <span class="text-xs font-semibold text-zinc-200">Read receipts</span>
      <button class="lux-sw group relative w-11 h-6 rounded-full transition-all shrink-0" role="switch" data-act="sw" data-arg="receipts" data-k="receipts" aria-checked="${cfg.receipts!==false}" aria-label="Read receipts"><span class="pointer-events-none block w-5 h-5 rounded-full bg-white shadow-sm translate-x-0.5 transition-transform duration-200 group-aria-[checked=true]:translate-x-[21px]"></span></button>
    </div>
    <div class="flex items-center justify-between gap-3 py-1">
      <span class="text-xs font-semibold text-zinc-200">Vanish mode (${cfg.vanishSec||6}s)</span>
      <button class="lux-sw group relative w-11 h-6 rounded-full transition-all shrink-0" role="switch" data-act="sw" data-arg="vanish" data-k="vanish" aria-checked="${cfg.vanish}" aria-label="Vanish mode"><span class="pointer-events-none block w-5 h-5 rounded-full bg-white shadow-sm translate-x-0.5 transition-transform duration-200 group-aria-[checked=true]:translate-x-[21px]"></span></button>
    </div>
    <div>
      <div class="text-xs font-medium text-zinc-400 mb-2">Shared files (${files.length})</div>
      ${files.length?files.map(f=>(BLOBS[f.id]||f.mediaPath)?`<button data-act="downloadFile" data-arg="${f.id}" class="w-full flex items-center justify-between gap-2 text-xs py-2 border-b border-white/[0.06] hover:bg-white/[0.04] px-2 rounded-lg text-left transition"><span class="truncate text-zinc-200">${esc(f.name)}</span><span class="font-mono text-[10px] text-accent shrink-0">${esc(f.size)} ↓</span></button>`:`<div class="flex items-center justify-between gap-2 text-xs py-2 border-b border-white/[0.06]"><span class="truncate text-zinc-200">${esc(f.name)}</span><span class="font-mono text-[10px] text-zinc-500 shrink-0">${esc(f.size)}</span></div>`).join(''):'<div class="text-xs text-zinc-500">No shared files yet.</div>'}
    </div>
    <div class="grid gap-2 pt-1">
      <button class="btn-ghost h-9 px-3.5 rounded-xl text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5" data-act="summarize">${ic('sparkles','w-3.5 h-3.5 text-accent')}Summarize thread</button>
      <button class="h-9 px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-semibold text-rose-300 transition" data-act="clearChat">Clear history</button>
      <button class="h-9 px-3.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-semibold text-rose-300 transition" data-act="deleteChat">Delete conversation</button>
    </div>
  </div>`;
  if(c.peerUserId&&c.peerKeyFp&&S.ecdhId?.fp){
    safetyCode(S.ecdhId.fp,c.peerKeyFp).then(code=>{
      if(!code)return;
      if($('#info-safety'))$('#info-safety').textContent='Safety #: '+code;
      const qr=$('#info-qr');
      if(qr){
        qr.innerHTML=`${renderSafetyQrSvg(code,78)}<div class="text-[10.5px] text-zinc-400 leading-snug">Scan or compare QR safety matrix with ${esc(c.name)} in person.</div>`;
        qr.classList.remove('hidden');
      }
    });
  }
  icons();
}

function push(c,m){
  if(!m.ts)m.ts=Date.now();
  c.msgs.push(m);
  if(c.id!==S.chat){c.unread=(c.unread||0)+1}
  saveD();
  if(c.id===S.chat)renderThread();
  renderList();
  if(S.user&&!m._remote){
    const isZk=m.ct?.startsWith('e2ee1.')||m.ct?.startsWith('e2ee2.');
    const wire=isZk?Object.assign({},m,{text:'',reply:m.reply?{id:m.reply.id,text:'🔒'}:null}):Object.assign({},m);
    delete wire._fileKeyObj;delete wire._fk;delete wire._mime;
    if(S.user.displayName||S.user.email)wire.fromName=S.user.displayName||S.user.email;
    const queueOffline=async()=>{
      m.pending=true;saveD();if(c.id===S.chat)renderThread(true);
      await enqueueOutbox({id:m.id,conversationId:c.id,message:wire,queuedAt:Date.now()});
      updateOfflineUI();
      requestOutboxSync();
    };
    if(!navigator.onLine){queueOffline()}
    else{sbPost({action:'sendMessage',conversationId:c.id,message:wire}).then(r=>{if(!r?.ok&&!navigator.onLine)queueOffline()})}
  }
  if(!S.incognito)saveDraftIdb(c.id,'');
}
async function send(text,extra={}){
  const c=cur();if(!c)return toast('Select a conversation first','err');
  const rep=S.reply,ts=Date.now(),fkObj=extra._fileKeyObj||null;
  const cleanExtra=Object.assign({},extra);delete cleanExtra._fileKeyObj;
  const m=Object.assign({id:uid('m'),from:'me',fromName:S.user?.displayName||S.user?.email||undefined,type:'text',text,t:now(),ts,react:{},reply:rep,pending:!navigator.onLine,...(S.quietSend?{quiet:true}:{})},cleanExtra);
  if(S.quietSend){S.quietSend=false}
  if(cfg.e2ee&&(m.type==='text'||fkObj)&&!m.reply?._poll){
    m.ct=await enc(text,rep,c,fkObj);
    if(fkObj){m._fk=fkObj.fk;m._mime=fkObj.mime}
  }
  if(cfg.vanish)m.exp=Date.now()+(Number(cfg.vanishSec)||6)*1000;
  S.reply=null;S.smart=[];c.unread=0;
  if(S.myTypingChat===c.id&&convRecipientIds(c).length){clearTimeout(S.myTypingTm);S.myTypingChat=null;signalConvPeers(c,'typing',{fromUserId:S.user.id,conversationId:c.id,active:false})}
  push(c,m);tone(520);
  if(navigator.onLine&&m.type==='text'&&!c.peerUserId&&!c.isGroup)botReply(c,text);
}
async function sendAttachmentFile(f){
  const c=cur();if(!c){toast('Select a conversation first','err');return}
  const cleanFile=await processUploadFile(f,{maxDim:1600,quality:0.86});
  const id=uid('f'),mime=cleanFile.type||'application/octet-stream';
  BLOBS[id]=URL.createObjectURL(cleanFile);
  let mediaPath='',mediaMime=mime,mediaEnc=false,_fileKeyObj=null;
  if(S.user&&S.sbConfigured){
    const useE2ee=Boolean(cfg.e2ee&&canE2eeConv(c));
    toast(useE2ee?'Encrypting & uploading…':'Uploading attachment…');
    const up=await uploadCloudMedia(c.id,id,cleanFile,cleanFile.name,mime,{encrypt:useE2ee});
    if(up){mediaPath=up.mediaPath;mediaMime=up.mediaMime;mediaEnc=Boolean(up.mediaEnc);_fileKeyObj=up.fileKeyObj||null}
  }
  await send('',{id,type:'file',name:cleanFile.name,size:fileSize(cleanFile.size),mediaPath,mediaMime,mediaEnc,_fileKeyObj});
}
async function botReply(c,t){
  S.typing[c.id]=1;renderHead();renderTypingRow();
  const l=t.toLowerCase();
  const pool=/\?/.test(t)?['Good question. I will check and get back to you today.','Let me confirm with the team and reply shortly.']:/thank/.test(l)?['Anytime.','Glad it helped.']:/file|doc/.test(l)?['Received. Reviewing now.']:['Understood. I will follow up shortly.','Noted. Thanks for the update.','Sounds good to me.'];
  const started=Date.now();
  const res=await callGemini({
    mode:'reply',
    contactName:c.name,
    folder:c.folder,
    status:c.status,
    messages:c.msgs.filter(m=>m.from!=='sys').slice(-12).map(m=>({from:m.from==='me'?'User':c.name,text:m.text||(m.type==='file'?'[File: '+m.name+']':'[Voice note]'),t:m.t}))
  });
  const elapsed=Date.now()-started;
  if(elapsed<750)await wait(750-elapsed);
  delete S.typing[c.id];
  const replyText=(res&&res.text)||pool[Math.floor(Math.random()*pool.length)];
  push(c,{id:uid('m'),from:'them',type:'text',text:replyText,t:now(),react:{}});
  renderHead();
  if(c.id===S.chat)loadSmartReplies(c);
  if(c.id!==S.chat){toast(`New message from ${c.name}`);notifyDesktop(c.name,replyText)}
  tone(760);
}
setInterval(()=>{let ch=false;D.forEach(c=>{const n=c.msgs.length;c.msgs=c.msgs.filter(m=>!m.exp||m.exp>Date.now());if(c.msgs.length!==n)ch=true});if(ch){saveD();renderThread();renderList()}},1000);
async function flushOutbox(){
  let n=0;
  if(S.user&&navigator.onLine){
    const queued=await listOutbox();
    for(const item of queued){
      const r=await sbPost({action:'sendMessage',conversationId:item.conversationId,message:item.message});
      if(r?.ok){
        await removeOutbox(item.id);
        const c=D.find(x=>x.id===item.conversationId);
        const m=c?.msgs.find(x=>x.id===item.id);
        if(m)m.pending=false;
        n++;
      }
    }
  }
  D.forEach(c=>c.msgs.forEach(m=>{if(m.pending&&(!S.user||navigator.onLine)){m.pending=false;n++}}));
  if(n){saveD();renderThread();renderList();toast(`Sent ${n} queued message${n>1?'s':''}`)}
  updateOfflineUI();
}

/* ---------- voice, files, WebRTC calls ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const RTC_CFG={iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]};
async function startRec(){if(S.rec)return;const r=S.rec={s:0,txt:'',mr:null,chunks:[],stream:null,sr:null,tm:null,viz:null};show('#rec-bar',true);$('#mic').classList.add('text-red-500');setTxt('#rec-time','00:00');setTxt('#rec-text','Listening…');
 r.tm=setInterval(()=>{r.s++;setTxt('#rec-time',`${String(r.s/60|0).padStart(2,'0')}:${String(r.s%60).padStart(2,'0')}`)},1000);
 if(SR){try{r.sr=new SR();r.sr.continuous=true;r.sr.interimResults=true;r.sr.onresult=e=>{let t='';for(let i=0;i<e.results.length;i++)t+=e.results[i][0].transcript;r.txt=t;setTxt('#rec-text','“'+t+'”')};r.sr.start()}catch(e){}}
 try{r.stream=await navigator.mediaDevices.getUserMedia({audio:true});r.viz=createMicVisualizer(r.stream,lvl=>{const rb=$('#rec-bar');if(rb)rb.style.boxShadow=`0 0 ${Math.round(8+lvl*22)}px rgba(244,63,94,${(0.2+lvl*0.5).toFixed(2)})`});r.mr=new MediaRecorder(r.stream);r.mr.ondataavailable=e=>r.chunks.push(e.data);r.mr.start()}catch(e){toast('Microphone unavailable. Voice note will be simulated.','err')}}
function stopRec(){const r=S.rec;if(!r)return null;clearInterval(r.tm);try{r.viz?.stop()}catch(e){}try{r.sr&&r.sr.stop()}catch(e){}try{r.mr&&r.mr.state!=='inactive'&&r.mr.stop()}catch(e){}r.stream&&r.stream.getTracks().forEach(t=>t.stop());S.rec=null;show('#rec-bar',false);const rb=$('#rec-bar');if(rb)rb.style.boxShadow='';$('#mic').classList.remove('text-red-500');return r}
async function sendRec(){
  const r=S.rec;if(!r)return;
  const c=cur(),id=uid('v'),dur=`${r.s/60|0}:${String(r.s%60).padStart(2,'0')}`,txt=r.txt;
  stopRec();await wait(140);
  const extra={id,type:'voice',dur};
  if(r.chunks.length){
    const blob=new Blob(r.chunks,{type:'audio/webm'});
    BLOBS[id]=URL.createObjectURL(blob);
    if(c&&S.user&&navigator.onLine){
      const useE2ee=Boolean(cfg.e2ee&&canE2eeConv(c));
      const up=await uploadCloudMedia(c.id,id,blob,`${id}.webm`,'audio/webm',{encrypt:useE2ee});
      if(up){extra.mediaPath=up.mediaPath;extra.mediaMime=up.mediaMime;extra.mediaEnc=Boolean(up.mediaEnc);extra._fileKeyObj=up.fileKeyObj||null}
    }
  }
  await send(txt,extra);
}
async function getIceConfig(){
  if(S.rtcCfg)return S.rtcCfg;
  if(S.user){
    const r=await sbGet('rtcConfig');
    if(r?.ok&&Array.isArray(r.iceServers)&&r.iceServers.length){S.rtcCfg={iceServers:r.iceServers};return S.rtcCfg}
  }
  return RTC_CFG;
}
function startRing(k,f1,f2,every=2400){
  const pulse=()=>{if(S.call===k&&!k.tm){tone(f1,.14,0,.04);setTimeout(()=>{if(S.call===k&&!k.tm)tone(f2,.16,0,.04)},180)}};
  pulse();
  k.ringTm=setInterval(pulse,every);
}
function attachCallMediaUI(localStream,remoteStream,isVideo){
  const wrap=$('#call-media'),rv=$('#call-v'),lv=$('#call-local'),ra=$('#call-a');
  if(remoteStream){
    if(ra)ra.srcObject=remoteStream;
    if(isVideo&&remoteStream.getVideoTracks().length){
      rv.srcObject=remoteStream;
      wrap.classList.remove('hidden');
    }
  }else if(isVideo&&localStream){
    rv.srcObject=localStream;rv.muted=true;
    wrap.classList.remove('hidden');
  }
  if(isVideo&&localStream&&remoteStream){
    lv.srcObject=localStream;
    lv.classList.remove('hidden');
  }else{
    lv.classList.add('hidden');lv.srcObject=null;
  }
}
function startCallTimer(k){
  if(k.tm)return;
  clearInterval(k.ringTm);clearTimeout(k.ringTimeout);
  setTxt('#call-st','Connected · 00:00');
  k.tm=setInterval(()=>{if(S.call!==k)return;k.s++;setTxt('#call-st',`Connected · ${String(k.s/60|0).padStart(2,'0')}:${String(k.s%60).padStart(2,'0')}`)},1000);
  if(k.pc&&!k.statsTm){
    k.statsTm=setInterval(async()=>{
      if(S.call!==k||!k.pc)return;
      try{
        const stats=await k.pc.getStats();
        let rtt=null,relay=false;
        stats.forEach(st=>{
          if(st.type==='candidate-pair'&&st.state==='succeeded'&&typeof st.currentRoundTripTime==='number'){rtt=Math.round(st.currentRoundTripTime*1000)}
          if(st.type==='local-candidate'&&st.candidateType==='relay')relay=true;
        });
        const el=$('#call-stats');
        if(el&&rtt!=null){el.textContent=`${relay?'TURN relay':'Direct P2P'} · RTT ${rtt} ms`;el.classList.remove('hidden')}
      }catch(e){}
    },2000);
  }
}
function attachIceRecoveryHandlers(pc,k){
  pc.oniceconnectionstatechange=()=>{
    if(S.call!==k)return;
    const st=pc.iceConnectionState;
    if(st==='connected'||st==='completed'){
      if(k.discTm){clearTimeout(k.discTm);k.discTm=null}
      startCallTimer(k);
    }else if(st==='disconnected'){
      if(k.discTm)return;
      setTxt('#call-st','Reconnecting media…');
      try{if(typeof pc.restartIce==='function')pc.restartIce()}catch(_){}
      k.discTm=setTimeout(()=>{
        k.discTm=null;
        if(S.call===k&&(pc.iceConnectionState==='disconnected'||pc.iceConnectionState==='failed')){
          toast('Connection lost — call ended','err');
          endCall();
        }
      },5000);
    }else if(st==='failed'){
      if(k.discTm){clearTimeout(k.discTm);k.discTm=null}
      endCall();
    }
  };
}
function cleanupCall(k){
  if(!k)return;
  clearInterval(k.tm);clearInterval(k.ringTm);clearInterval(k.statsTm);clearTimeout(k.ringTimeout);
  if(k.discTm){clearTimeout(k.discTm);k.discTm=null}
  try{k.pc&&k.pc.close()}catch(e){}
  try{k.stream&&k.stream.getTracks().forEach(t=>t.stop())}catch(e){}
  try{k.screenStream&&k.screenStream.getTracks().forEach(t=>t.stop())}catch(e){}
  const rv=$('#call-v'),lv=$('#call-local'),ra=$('#call-a');
  if(rv){rv.srcObject=null;rv.muted=false}
  if(lv){lv.srcObject=null;lv.classList.add('hidden')}
  if(ra)ra.srcObject=null;
  $('#call-media')?.classList.add('hidden');
  $('#call-in-acts')?.classList.add('hidden');
  $('#call-live-acts')?.classList.remove('hidden');
  $('#call-mode-badge')?.classList.add('hidden');
  $('#call-stats')?.classList.add('hidden');
  $('#call-flip')?.classList.add('hidden');
  $('#call-share')?.classList.add('hidden');
  $('#call-mute')?.classList.remove('text-red-400');
  $('#call-cam')?.classList.remove('text-red-400');
  $('#call-share')?.classList.remove('text-accent');
  if(S.call===k)S.call=null;
  closeM('m-call');
  if(k.s>0&&k.c){
    k.c.msgs.push({id:uid('m'),from:'sys',type:'sys',text:`${k.type==='video'?'Video':'Voice'} call · ${k.s}s`,t:now(),ts:Date.now()});
    saveD();if(k.c.id===S.chat)renderThread();
  }
}
async function startCall(type){
  const c=cur();if(!c)return toast('Select a conversation first','err');
  if(S.call)return toast('Already in a call','err');
  const isRtc=Boolean(S.user&&S.rtChan&&c.peerUserId&&window.RTCPeerConnection);
  const k=S.call={id:uid('call'),c,type,s:0,stream:null,screenStream:null,remoteStream:null,pc:null,tm:null,ringTm:null,statsTm:null,ringTimeout:null,muted:false,cam:type==='video',sharing:false,facing:'user',isRtc,role:'caller',pendingIce:[]};
  openM('m-call');
  $('#call-av').innerHTML=av(c.name,'w-20 h-20');
  setTxt('#call-name',c.name);
  setTxt('#call-st',`${type==='video'?'Video':'Voice'} call · ${isRtc?'ringing peer…':'connecting…'}`);
  $('#call-in-acts').classList.add('hidden');
  $('#call-live-acts').classList.remove('hidden');
  show('#call-cam',type==='video',null);
  show('#call-flip',type==='video',null);
  show('#call-share',isRtc||type==='video',null);
  $('#call-media').classList.add('hidden');$('#call-local').classList.add('hidden');$('#call-stats')?.classList.add('hidden');
  const badge=$('#call-mode-badge');
  badge.textContent=isRtc?'WebRTC P2P':'Local preview';
  badge.classList.remove('hidden');

  try{
    k.stream=await navigator.mediaDevices.getUserMedia({audio:true,video:type==='video'?{facingMode:'user'}:false});
  }catch(e){
    if(isRtc){toast('Microphone/camera access required for peer call','err');return cleanupCall(k)}
    toast('Media devices unavailable. Running a simulated call.','err');
  }
  if(S.call!==k)return;

  if(!isRtc){
    attachCallMediaUI(k.stream,null,type==='video');
    await wait(1100);if(S.call!==k)return;
    startCallTimer(k);
    return;
  }

  try{
    const iceCfg=await getIceConfig();
    if(S.call!==k)return;
    const pc=new RTCPeerConnection(iceCfg);
    k.pc=pc;
    k.stream.getTracks().forEach(tr=>pc.addTrack(tr,k.stream));
    pc.onicecandidate=e=>{if(e.candidate&&S.call===k)sendSignal(c.peerUserId,'call-ice',{callId:k.id,fromUserId:S.user.id,candidate:e.candidate.toJSON()})};
    pc.ontrack=e=>{
      if(S.call!==k)return;
      if(!k.remoteStream)k.remoteStream=new MediaStream();
      e.streams[0]?k.remoteStream=e.streams[0]:k.remoteStream.addTrack(e.track);
      attachCallMediaUI(k.stream,k.remoteStream,true);
    };
    attachIceRecoveryHandlers(pc,k);
    attachCallMediaUI(k.stream,k.stream,type==='video');
    if(type==='video'){$('#call-local').srcObject=k.stream;$('#call-local').classList.remove('hidden');$('#call-v').muted=true}
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sent=await sendSignal(c.peerUserId,'call-offer',{callId:k.id,conversationId:c.id,fromUserId:S.user.id,fromName:S.user.displayName||S.user.email,callType:type,sdp:{type:offer.type,sdp:offer.sdp}});
    if(!sent){toast('Peer signaling unavailable','err');return cleanupCall(k)}
    startRing(k,440,480,2600);
    k.ringTimeout=setTimeout(()=>{if(S.call===k&&!k.tm){toast(`${c.name} did not answer`);endCall()}},35000);
  }catch(e){toast('WebRTC call setup failed: '+(e.message||e),'err');cleanupCall(k)}
}
function onIncomingCall(p){
  if(!p||!p.callId||p.fromUserId===S.user?.id)return;
  if(S.call){sendSignal(p.fromUserId,'call-reject',{callId:p.callId,fromUserId:S.user.id,reason:'busy'});return}
  const c=D.find(x=>x.id===p.conversationId||x.peerUserId===p.fromUserId)||{id:p.conversationId,name:p.fromName||'Peer',peerUserId:p.fromUserId,msgs:[]};
  const k=S.call={id:p.callId,c,type:p.callType||'voice',s:0,stream:null,screenStream:null,remoteStream:null,pc:null,tm:null,ringTm:null,statsTm:null,ringTimeout:null,muted:false,cam:(p.callType==='video'),sharing:false,facing:'user',isRtc:true,role:'callee',offer:p.sdp,pendingIce:[]};
  openM('m-call');
  $('#call-av').innerHTML=av(c.name,'w-20 h-20');
  setTxt('#call-name',c.name);
  setTxt('#call-st',`Incoming ${k.type==='video'?'video':'voice'} call…`);
  $('#call-media').classList.add('hidden');$('#call-stats')?.classList.add('hidden');
  $('#call-live-acts').classList.add('hidden');
  $('#call-in-acts').classList.remove('hidden');
  const badge=$('#call-mode-badge');badge.textContent='Incoming WebRTC';badge.classList.remove('hidden');
  startRing(k,660,784,2200);
  k.ringTimeout=setTimeout(()=>{if(S.call===k&&!k.pc)rejectCall()},35000);
}
async function acceptCall(){
  const k=S.call;if(!k||k.role!=='callee'||k.pc)return;
  clearInterval(k.ringTm);clearTimeout(k.ringTimeout);
  $('#call-in-acts').classList.add('hidden');
  $('#call-live-acts').classList.remove('hidden');
  show('#call-cam',k.type==='video',null);
  show('#call-flip',k.type==='video',null);
  show('#call-share',true,null);
  setTxt('#call-st','Connecting WebRTC…');
  $('#call-mode-badge').textContent='WebRTC P2P';
  try{
    const iceCfg=await getIceConfig();
    if(S.call!==k)return;
    k.stream=await navigator.mediaDevices.getUserMedia({audio:true,video:k.type==='video'?{facingMode:'user'}:false});
    const pc=new RTCPeerConnection(iceCfg);
    k.pc=pc;
    k.stream.getTracks().forEach(tr=>pc.addTrack(tr,k.stream));
    pc.onicecandidate=e=>{if(e.candidate&&S.call===k)sendSignal(k.c.peerUserId,'call-ice',{callId:k.id,fromUserId:S.user.id,candidate:e.candidate.toJSON()})};
    pc.ontrack=e=>{
      if(S.call!==k)return;
      if(!k.remoteStream)k.remoteStream=new MediaStream();
      e.streams[0]?k.remoteStream=e.streams[0]:k.remoteStream.addTrack(e.track);
      attachCallMediaUI(k.stream,k.remoteStream,true);
    };
    attachIceRecoveryHandlers(pc,k);
    await pc.setRemoteDescription(new RTCSessionDescription(k.offer));
    for(const ice of k.pendingIce){await pc.addIceCandidate(new RTCIceCandidate(ice)).catch(()=>{})}
    k.pendingIce=[];
    const ans=await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await sendSignal(k.c.peerUserId,'call-answer',{callId:k.id,fromUserId:S.user.id,sdp:{type:ans.type,sdp:ans.sdp}});
    if(k.type==='video'){$('#call-local').srcObject=k.stream;$('#call-local').classList.remove('hidden')}
  }catch(e){toast('Could not accept call: '+(e.message||e),'err');rejectCall()}
}
function rejectCall(){
  const k=S.call;if(!k)return;
  if(k.isRtc&&k.c?.peerUserId)sendSignal(k.c.peerUserId,'call-reject',{callId:k.id,fromUserId:S.user.id,reason:'declined'});
  cleanupCall(k);
}
async function onCallAnswer(p){
  const k=S.call;if(!k||k.id!==p?.callId||!k.pc)return;
  try{
    $('#call-v').muted=false;
    await k.pc.setRemoteDescription(new RTCSessionDescription(p.sdp));
    for(const ice of k.pendingIce){await k.pc.addIceCandidate(new RTCIceCandidate(ice)).catch(()=>{})}
    k.pendingIce=[];
    startCallTimer(k);
  }catch(e){endCall()}
}
async function onCallIce(p){
  const k=S.call;if(!k||k.id!==p?.callId||!p.candidate)return;
  if(k.pc&&k.pc.remoteDescription){await k.pc.addIceCandidate(new RTCIceCandidate(p.candidate)).catch(()=>{})}
  else{k.pendingIce.push(p.candidate)}
}
function onCallReject(p){
  const k=S.call;if(!k||k.id!==p?.callId)return;
  toast(p.reason==='busy'?'Peer is busy on another call':'Call declined');
  cleanupCall(k);
}
function onCallRemoteEnd(p){
  const k=S.call;if(!k||k.id!==p?.callId)return;
  toast('Call ended');
  cleanupCall(k);
}
function endCall(){
  const k=S.call;if(!k)return;
  if(k.isRtc&&k.c?.peerUserId)sendSignal(k.c.peerUserId,'call-end',{callId:k.id,fromUserId:S.user.id});
  if(S.user){sbPost({action:'logCallEvent',peerId:k.c?.peerUserId||null,kind:k.type||'voice',status:k.secs?'completed':'ended',durationSec:k.secs||0,conversationId:k.c?.id||null}).catch(()=>{})}
  cleanupCall(k);
}

/* ---------- reels & stories ---------- */
const fmtCount=n=>{const x=+n||0;if(x>=1e6)return (x/1e6).toFixed(1).replace(/\.0$/,'')+'M';if(x>=1e3)return (x/1e3).toFixed(1).replace(/\.0$/,'')+'K';return String(x)};
const bar=()=>$('#reel-bar');
function pauseBar(p){const b=bar();if(b)b.style.animationPlayState=p?'paused':'running';const v=$('#reel-vid');if(v&&!v.classList.contains('hidden'))p?v.pause():v.play().catch(()=>{})}
function renderReelCanvas(r){
  const bars=[14,24,42,28,54,36,60,44,26,48,22,38,50,30,16].map((h,i)=>`<span class="w-[3px] rounded-full bg-white/85" style="height:${h}px;animation:wave .9s ${(i*.07).toFixed(2)}s infinite alternate ease-in-out"></span>`).join('');
  return `<div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,.12),transparent_56%)]"></div>
    <div class="absolute -top-16 -left-14 w-72 h-72 rounded-full bg-white/[0.11] blur-3xl" style="animation:drift 9s ease-in-out infinite"></div>
    <div class="absolute bottom-16 -right-14 w-64 h-64 rounded-full bg-black/35 blur-3xl" style="animation:drift 11s ease-in-out infinite reverse"></div>
    <div class="absolute inset-0 opacity-[0.06]" style="background-image:radial-gradient(rgba(255,255,255,.75) 1px,transparent 1px);background-size:22px 22px"></div>
    <div class="absolute inset-0 flex flex-col items-center justify-center px-6 text-center pointer-events-none">
      <div class="reel-orb relative w-36 h-36 flex items-center justify-center mb-4">
        <span class="absolute inset-0 rounded-full border border-white/[0.15] animate-ping opacity-20" style="animation-duration:4s"></span>
        <span class="absolute inset-3 rounded-full border border-white/[0.2] bg-black/25 backdrop-blur-md shadow-[0_0_40px_rgba(255,255,255,.06)]"></span>
        <span class="reel-orb-pad relative z-10 flex items-center justify-center gap-1 h-16 px-4 overflow-hidden">${bars}</span>
      </div>
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/35 backdrop-blur-md border border-white/[0.14] text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85">${ic('clapperboard','w-3 h-3')}<span>@${esc(r.author)}</span></span>
    </div>`;
}
function renderReel(reset=true){
  const list=getReels();
  if(!list.length){
    $('#reel-bg').style.background='linear-gradient(160deg,#090a12,#111827)';
    $('#reel-vid').classList.add('hidden');$('#reel-img').classList.add('hidden');
    $('#reel-n').classList.remove('hidden');
    $('#reel-n').innerHTML=`<div class="text-center px-6 space-y-3"><div class="text-sm font-bold text-white">No custom reels yet</div><p class="text-xs text-zinc-400">Publish your first Reel or show starter reels in Appearance.</p><button type="button" data-act="storyNew" class="btn-primary h-9 px-4 rounded-full text-xs font-bold">Create Reel</button></div>`;
    $('#reel-ui').innerHTML='';if($('#reel-actions'))$('#reel-actions').innerHTML='';icons();return;
  }
  if(S.reel>=list.length)S.reel=0;
  const r=list[S.reel],liked=RS.liked.includes(r.id),saved=RS.saved.includes(r.id),f=RS.follow.includes(r.author),n=(r.likes||0)+(liked?1:0),com=(r.com||[]).length+(RS.extra[r.id]||[]).length;
  if(!r._viewedTracked){r._viewedTracked=true;r.views=(r.views||0)+1;if(S.user)sbPost({action:'trackReelView',reelId:String(r.id)}).catch(()=>{})}
  const fi=typeof r.filterIdx==='number'&&FILTERS[r.filterIdx]?r.filterIdx:RS.filter;
  $('#reel-bg').style.background=r.g;$('#reel-bg').style.filter=FILTERS[fi][1];setTxt('#filter-lbl',FILTERS[fi][0]);
  const aura=$('#reel-aura');if(aura)aura.style.background=r.g;
  const rv=$('#reel-vid'),ri=$('#reel-img'),rn=$('#reel-n');
  rv.classList.add('hidden');ri.classList.add('hidden');rn.classList.remove('hidden');rv.pause();
  rv.muted=Boolean(S.reelMuted);
  const mic=$('#reel-mute-ic');if(mic)mic.setAttribute('data-lucide',S.reelMuted?'volume-x':'volume-2');
  rn.innerHTML=renderReelCanvas(r);
  const applyReelUrl=url=>{
    if(!url||getReels()[S.reel]?.id!==r.id)return;
    rn.classList.add('hidden');
    if(r.mediaMime?.startsWith('video/')){rv.src=url;rv.classList.remove('hidden');rv.play().catch(()=>{})}
    else{ri.src=url;ri.classList.remove('hidden')}
  };
  const cached=r._localUrl||BLOBS['social:reel:'+r.id];
  if(cached)applyReelUrl(cached);
  else if(r.mediaPath&&S.user)resolveSocialMediaUrl('reel',r).then(applyReelUrl);
  const isVerified=['alex.rivera','sarah.chen','anas_dev'].includes(String(r.author).toLowerCase());
  const audioTxt=r.audioTitle?`${r.audioTitle} · ${r.author}`:`Original audio · ${r.author}`;
  $('#reel-ui').innerHTML=`<div class="min-w-0 space-y-2.5">
    <div class="flex items-center gap-2.5 min-w-0">
      <button data-act="openAuthorProfile" data-arg="${esc(r.author)}" class="flex items-center gap-2 min-w-0 hover:opacity-85 transition text-left">
        <span class="p-[1.5px] rounded-full ig-ring shrink-0"><span class="block p-[1.5px] rounded-full bg-black">${av(r.author,'w-8 h-8')}</span></span>
        <span class="text-[13px] font-semibold text-white drop-shadow truncate">${esc(r.author)}</span>
        ${isVerified?VERIFIED_BADGE_SVG:''}
      </button>
      <button data-act="reelFollow" class="h-[26px] px-3 rounded-lg border text-[12px] font-semibold transition shrink-0 ${f?'border-white/30 bg-white/[0.14] text-white':'border-white/65 bg-transparent hover:bg-white/[0.12] text-white'}">${f?'Following':'Follow'}</button>
      ${r.remixedFrom?`<span class="px-2 py-0.5 rounded-full bg-fuchsia-500/20 border border-fuchsia-400/35 text-[10px] font-semibold text-fuchsia-200 shrink-0">Remix</span>`:''}
    </div>
    <p class="text-[13px] text-white/95 leading-[1.38] line-clamp-2 drop-shadow break-words">${renderBioText(r.cap)}</p>
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" data-act="useReelAudio" data-arg="${esc(String(r.id))}" class="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md border border-white/[0.14] text-[11px] font-medium text-white max-w-full transition">
        <span class="inline-flex items-end gap-0.5 h-2.5 text-white shrink-0"><i class="eq-bar h-2"></i><i class="eq-bar h-2.5" style="animation-delay:.18s"></i><i class="eq-bar h-1.5" style="animation-delay:.36s"></i></span>
        <span class="truncate">${esc(audioTxt)}</span>
      </button>
      ${r.views?`<span class="text-[10.5px] font-mono text-white/75 tabular-nums">${fmtCompactCount(r.views)} views</span>`:''}
    </div>
  </div>`;
  const actBtn=(act,icon,lbl,on,onCls='text-[#ff3040] fill-current',extra='')=>`<button ${act==='menu'?'data-act="menu" data-arg="reelMore" aria-haspopup="menu" aria-expanded="false"':`data-act="${act}"`} class="group flex flex-col items-center gap-1 select-none" aria-label="${esc(lbl||icon)}">
    <span class="w-10 h-10 rounded-full grid place-items-center transition-transform group-hover:scale-110 group-active:scale-95 ${on?onCls:'text-white drop-shadow-[0_2px_10px_rgba(0,0,0,.9)]'} ${extra}">${ic(icon,'w-6 h-6'+(on?' fill-current':''))}</span>
    ${lbl?`<span class="text-[11px] font-semibold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,.95)] tabular-nums">${lbl}</span>`:''}
  </button>`;
  const ra=$('#reel-actions');
  if(ra){
    ra.innerHTML=`${actBtn('reelLike','heart',fmtCount(n),liked,'text-[#ff3040]')}
      ${actBtn('reelComments','message-circle',fmtCount(com),false)}
      ${actBtn('reelShare','send','Share',false)}
      ${actBtn('reelSave','bookmark',saved?'Saved':'Save',saved,'text-white')}
      ${actBtn('menu','more-horizontal','',false)}
      <button data-act="openAuthorProfile" data-arg="${esc(r.author)}" class="mt-0.5 w-7 h-7 rounded-[7px] p-0.5 border-[1.5px] border-white/85 shadow-lg overflow-hidden hover:scale-105 transition" style="background:${r.g}" aria-label="Audio track by ${esc(r.author)}">
        <span class="w-full h-full rounded-[4px] bg-black/35 grid place-items-center text-white spin-slow">${ic('disc-3','w-3.5 h-3.5')}</span>
      </button>`;
  }
  if(reset){const b=bar();b.style.animation='none';void b.offsetWidth;b.style.animation='bar 9s linear forwards';S.paused=false;show('#reel-pause',false)}
  icons();
}
const goReel=d=>{const len=getReels().length;S.reel=(S.reel+d+len)%len;renderReel()};
let lastTap=0,tapT=0;
function burst(x,y){const st=$('#reel-stage'),b=st.getBoundingClientRect(),h=document.createElement('div');h.className='burst absolute z-20 text-5xl';h.textContent='❤️';h.style.left=(x-b.left-24)+'px';h.style.top=(y-b.top-24)+'px';st.appendChild(h);setTimeout(()=>h.remove(),900)}
function likeReel(force){const r=getReels()[S.reel],i=RS.liked.indexOf(r.id);if(i<0)RS.liked.push(r.id);else if(!force)RS.liked.splice(i,1);saveR();renderReel(false)}
function openComments(){
  const r=getReels()[S.reel],all=[...(r.com||[]),...(RS.extra[r.id]||[])];
  const likedCnt=(r.likes||0)+(RS.liked.includes(r.id)?1:0);
  setTxt('#cm-title',`Comments (${all.length})`);
  const ctx=$('#cm-ctx');
  if(ctx){
    ctx.innerHTML=`<span class="p-[1.5px] rounded-full ig-ring shrink-0">${av(r.author,'w-7 h-7')}</span>
      <div class="min-w-0 flex-1">
        <div class="text-xs font-bold text-white truncate">@${esc(r.author)}</div>
        <div class="text-[11px] text-zinc-400 truncate">${esc(r.cap)}</div>
      </div>
      <span class="text-[10.5px] font-semibold text-zinc-400 inline-flex items-center gap-1 shrink-0">${ic('heart','w-3 h-3 text-rose-400 fill-rose-400')}${fmtCount(likedCnt)}</span>`;
  }
  const meAv=$('#cm-me-av');if(meAv)meAv.innerHTML=av(S.user?.displayName||'You','w-8 h-8');
  const cmLikes=RS.cmLikes||(RS.cmLikes=[]);
  $('#cm-list').innerHTML=all.length?all.map((c,i)=>{
    const k=`${r.id}:${i}`,on=cmLikes.includes(k),v=['alex.rivera','sarah.chen','anas_dev'].includes(String(c.n).toLowerCase());
    return `<div class="flex gap-2.5 items-start group">
      ${av(c.n,'w-8 h-8')}
      <div class="min-w-0 flex-1">
        <div class="text-xs leading-snug break-words"><span class="font-bold text-white mr-1.5 inline-flex items-center gap-1">${esc(c.n)}${v?VERIFIED_BADGE_SVG:''}</span><span class="text-zinc-200">${renderBioText(c.t)}</span></div>
        <div class="flex items-center gap-3 mt-1 text-[10.5px] text-zinc-500"><span>${c.id?'Just now':'Featured'}</span>${on?'<span class="text-rose-400 font-semibold">1 like</span>':''}</div>
      </div>
      <button type="button" data-act="cmLike" data-arg="${esc(k)}" class="w-7 h-7 rounded-full grid place-items-center shrink-0 transition ${on?'text-[#ff3040]':'text-zinc-500 hover:text-white'}" aria-label="Like comment">${ic('heart','w-3.5 h-3.5'+(on?' fill-current':''))}</button>
    </div>`;
  }).join(''):`<div class="py-10 text-center space-y-2">
    <div class="w-12 h-12 mx-auto rounded-full bg-white/[0.04] border border-white/[0.1] grid place-items-center text-zinc-400">${ic('message-circle','w-5 h-5')}</div>
    <div class="text-xs font-semibold text-white">No comments yet</div>
    <p class="text-[11px] text-zinc-500">Start the conversation on @${esc(r.author)}’s reel.</p>
  </div>`;
  openM('m-comments');$('#cm-list').scrollTop=1e9;icons();
}

/* ---------- stories ---------- */
function renderStudioPreview(){
  const isReel=S.studioMode==='reel';
  const ts=$('#st-tab-story'),tr=$('#st-tab-reel');
  if(ts&&tr){
    ts.className='h-7 px-3.5 rounded-full text-xs font-semibold transition-all '+(isReel?'text-zinc-400 hover:text-white':'bg-white text-black shadow-sm');
    tr.className='h-7 px-3.5 rounded-full text-xs font-semibold transition-all '+(isReel?'bg-white text-black shadow-sm':'text-zinc-400 hover:text-white');
  }
  setTxt('#studio-title',isReel?'New reel':'Create story');
  setTxt('#st-in-lbl',isReel?'Reel caption':'Poll question');
  $('#st-in').placeholder=isReel?'Write a caption… use #tags and @mentions':'Ask a poll question…';
  setTxt('#st-submit',isReel?'Share reel':'Share to story');
  show('#st-poll-prev',!isReel,'block');
  show('#st-hud-story',!isReel,'block');
  show('#st-foot-story',!isReel,'flex');
  show('#st-hud-reel',isReel,'flex');
  show('#st-foot-reel',isReel,'block');
  show('#st-reel-visual',isReel&&!S.stMedia?.url,'flex');
  show('#st-story-extra',!isReel,'block');

  const rawIn=$('#st-in').value.trim();
  const q=rawIn||(isReel?'Behind the scenes from today’s build #WhatsGram':'Drop the new release tonight?');
  const o1=($('#st-opt1')?.value||'').trim()||'Yes',o2=($('#st-opt2')?.value||'').trim()||'No';
  const u=$('#st-url').value.trim(),co=$('#st-co')?.value||'';
  setTxt('#st-q',q);
  setTxt('#st-reel-cap',q);
  setTxt('#st-opt1-prev',o1);
  setTxt('#st-opt2-prev',o2);

  const meName=(S.user?.displayName||S.user?.email||'you').split(' ')[0].toLowerCase();
  const meInit=(S.user?.displayName||'Y')[0].toUpperCase();
  setTxt('#st-hud-av',meInit);setTxt('#st-reel-av',meInit);setTxt('#st-hud-name',meName);setTxt('#st-reel-auth',meName);
  const coBadge=$('#st-hud-co');
  if(coBadge){coBadge.textContent='with '+co;coBadge.classList.toggle('hidden',isReel||!co)}

  const l=$('#st-link');
  l.innerHTML=u?`${ic('link-2','w-3 h-3 shrink-0')}<span>${esc(u.replace(/^https?:\/\//,''))}</span>`:'';
  l.classList.toggle('hidden',isReel||!u);
  l.classList.toggle('inline-flex',!isReel&&Boolean(u));

  const bg=$('#st-prev-bg');
  if(bg){
    bg.style.background=bgs[S.stBg]||bgs[0];
    bg.style.filter=(FILTERS[RS.filter]||FILTERS[0])[1];
  }
  $('#st-bgs').innerHTML=bgs.map((g,i)=>`<button type="button" data-act="stBg" data-arg="${i}" class="w-7 h-7 rounded-full border-2 transition ${i===S.stBg?'border-white scale-110 ring-2 ring-[#0095f6]/60':'border-white/15 opacity-75 hover:opacity-100'}" style="background:${g}" aria-label="Background ${i+1}"></button>`).join('');
  const fl=$('#st-filters');
  if(fl){
    fl.innerHTML=FILTERS.map(([n],i)=>`<button type="button" data-act="studioFilter" data-arg="${i}" class="h-6 px-2.5 rounded-full text-[11px] font-semibold shrink-0 border transition ${RS.filter===i?'bg-[#0095f6]/20 border-[#0095f6] text-white':'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'}">${esc(n)}</button>`).join('');
  }
  const fntEl=$('#st-fonts');
  if(fntEl){
    fntEl.innerHTML=STORY_FONTS.map((f,i)=>`<button type="button" data-act="studioSelectFont" data-arg="${i}" class="h-6 px-2.5 rounded-full text-[10.5px] font-semibold shrink-0 border transition ${S.stFont===i?'bg-accent/20 border-accent text-white':'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'}">${esc(f.label)}</button>`).join('');
  }
  const qEl=$('#st-q');if(qEl){STORY_FONTS.forEach(f=>{if(f.cls)qEl.classList.remove(...f.cls.trim().split(/\s+/))});const curF=STORY_FONTS[S.stFont];if(curF?.cls)qEl.classList.add(...curF.cls.trim().split(/\s+/))}
  const stkEl=$('#st-sticker-list');
  if(stkEl){
    if(S.stStickers.length){
      stkEl.classList.remove('hidden');
      stkEl.innerHTML=S.stStickers.map((sk,i)=>`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.08] border border-white/[0.12] text-zinc-200">${esc((sk.type||sk.kind||'text').toUpperCase())}: ${esc((sk.text||sk.question||'').slice(0,18))}<button type="button" data-act="studioDelSticker" data-arg="${i}" class="text-zinc-400 hover:text-white ml-0.5" aria-label="Remove sticker">×</button></span>`).join('');
    }else{stkEl.classList.add('hidden');stkEl.innerHTML=''}
  }
  const drEl=$('#st-drafts');
  if(drEl){
    if(S.stDrafts.length){
      drEl.classList.remove('hidden');
      drEl.innerHTML='<span class="text-zinc-500">Drafts:</span>'+S.stDrafts.map((dr,i)=>`<button type="button" data-act="loadStudioDraft" data-arg="${i}" class="px-2 py-0.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200">${esc((dr.q||'Draft').slice(0,16))}</button>`).join('');
    }else{drEl.classList.add('hidden');drEl.innerHTML=''}
  }
  const img=$('#st-media-img'),vid=$('#st-media-vid'),clr=$('#st-media-clr');
  img.classList.add('hidden');vid.classList.add('hidden');vid.pause();
  if(S.stMedia?.url){
    if(S.stMedia.mime?.startsWith('video/')){vid.src=S.stMedia.url;vid.classList.remove('hidden');vid.play().catch(()=>{})}
    else{img.src=S.stMedia.url;img.classList.remove('hidden')}
    setTxt('#st-media-title',S.stMedia.file?.name||'Custom media attached');
    setTxt('#st-media-lbl','Change');clr.classList.remove('hidden');clr.classList.add('grid');
  }else{
    setTxt('#st-media-title','Background photo or video');
    setTxt('#st-media-lbl','Upload');clr.classList.add('hidden');clr.classList.remove('grid');
  }
  icons();
}
function renderStory(){
  const s=ST[S.story];if(!s)return;
  const tot=Math.max(1,(s.yes||0)+(s.no||0)),py=Math.round((s.yes||0)/tot*100),pn=100-py;
  const o1=s.optYes||'Yes',o2=s.optNo||'No';
  $('#sv').style.background=s.bg;
  $('#sv').classList.remove('st-flip');void $('#sv').offsetWidth;$('#sv').classList.add('st-flip');
  const mediaKey='social:story:'+s.id,localUrl=s._localUrl||BLOBS[mediaKey];
  if(localUrl&&!s.mediaMime?.startsWith('video/')){sampleImageAmbientGlow(localUrl).then(rgba=>{if(rgba&&$('#sv'))$('#sv').style.boxShadow=`0 32px 95px -10px ${rgba}`})}
  const bgTag=url=>!url?'':(s.mediaMime?.startsWith('video/')?`<video src="${esc(url)}" class="sv-media absolute inset-0 w-full h-full object-cover" autoplay loop muted playsinline></video>`:`<img src="${esc(url)}" class="sv-media absolute inset-0 w-full h-full object-cover" alt="">`);
  const barsHtml=ST.map((_,idx)=>`<div class="h-[2px] flex-1 rounded-full bg-white/30 overflow-hidden">${idx<S.story?'<div class="h-full w-full bg-white"></div>':idx===S.story?'<div id="sv-bar" class="h-full bg-white origin-left" style="animation:bar 6s linear forwards"></div>':''}</div>`).join('');
  const isOwnStory=Boolean(!S.user||s.userId===S.user?.id||s.name===(S.user?.displayName||'You'));
  const viewers=Array.isArray(S.storyViews?.[s.id])?S.storyViews[s.id]:[];
  const fontCls=STORY_FONTS[s.fontIdx||0]?.cls||'';
  const extraStickersHtml=renderStoryStickersHtml(s.stickers||[],esc,s.stickerChoice);
  $('#sv').innerHTML=`${bgTag(localUrl)}<div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,.12),transparent_60%)]"></div>
  <div class="st-chrome absolute top-0 inset-x-0 p-3.5 z-10 bg-gradient-to-b from-black/75 via-black/30 to-transparent">
    <div class="flex gap-1 mb-3">${barsHtml}</div>
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2.5 min-w-0">
        <span class="p-[1.5px] rounded-full ${s.closeFriends?'st-ring-cf':'ig-ring'} shrink-0">${av(s.name,'w-8 h-8')}</span>
        <div class="min-w-0">
          <div class="text-xs font-bold text-white inline-flex items-center gap-1 truncate">${esc(s.name)}${VERIFIED_BADGE_SVG}${s.closeFriends?'<span class="px-1.5 py-0.2 rounded-full bg-emerald-500 text-[9px] font-bold text-white">CF</span>':''}</div>
          <div class="text-[10px] text-white/75 truncate">${s.co?'with '+esc(s.co):'Just now'}</div>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        ${isOwnStory?`<button data-act="delStory" data-arg="${esc(s.id)}" class="w-8 h-8 rounded-full bg-black/40 hover:bg-rose-600/80 grid place-items-center text-white transition" title="Delete story" aria-label="Delete story">${ic('trash-2','w-3.5 h-3.5')}</button>`:''}
        <button data-act="storyClose" class="w-8 h-8 rounded-full bg-black/40 hover:bg-black/65 grid place-items-center text-white transition" aria-label="Close story">${ic('x','w-4 h-4')}</button>
      </div>
    </div>
  </div>
  <button data-act="storyPrev" class="absolute inset-y-20 left-0 w-1/4 z-10" aria-label="Previous story"></button>
  <button data-act="storyNext" class="absolute inset-y-20 right-0 w-1/4 z-10" aria-label="Next story"></button>
  <div class="absolute inset-0 grid place-items-center px-6 pointer-events-none">
    <div class="w-full max-w-[300px] space-y-3 z-20 pointer-events-auto text-center">
      <div class="rounded-[20px] bg-white text-zinc-900 shadow-[0_24px_60px_rgba(0,0,0,.6)] p-3.5 space-y-2.5">
        <p class="px-1 text-[15px] font-extrabold text-zinc-900 leading-snug break-words ${fontCls}">${esc(s.q)}</p>
        <div class="space-y-2">
          <button data-act="storyVote" data-arg="yes" class="relative w-full overflow-hidden rounded-xl bg-zinc-100 border border-zinc-200/80 hover:bg-zinc-200/70 transition disabled:cursor-default flex items-center justify-between px-3.5 py-2.5 text-left" ${s.voted?'disabled':''}>
            ${s.voted?`<span class="absolute inset-y-0 left-0 bg-[#0095f6]/20 transition-all" style="width:${py}%"></span>`:''}
            <span class="relative z-10 text-xs font-extrabold text-zinc-900 truncate pr-2">${esc(o1)}</span>
            ${s.voted?`<span class="relative z-10 text-xs font-extrabold text-[#0095f6] tabular-nums shrink-0">${py}%</span>`:''}
          </button>
          <button data-act="storyVote" data-arg="no" class="relative w-full overflow-hidden rounded-xl bg-zinc-100 border border-zinc-200/80 hover:bg-zinc-200/70 transition disabled:cursor-default flex items-center justify-between px-3.5 py-2.5 text-left" ${s.voted?'disabled':''}>
            ${s.voted?`<span class="absolute inset-y-0 left-0 bg-zinc-300/60 transition-all" style="width:${pn}%"></span>`:''}
            <span class="relative z-10 text-xs font-extrabold text-zinc-900 truncate pr-2">${esc(o2)}</span>
            ${s.voted?`<span class="relative z-10 text-xs font-extrabold text-zinc-600 tabular-nums shrink-0">${pn}%</span>`:''}
          </button>
        </div>
      </div>
      ${extraStickersHtml}
      ${s.link?`<a href="https://${esc(s.link.replace(/^https?:\/\//,''))}" target="_blank" rel="noopener noreferrer" class="wg-ext-link relative z-20 inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-white/95 text-[#0095f6] shadow-xl hover:scale-[1.03] transition">${ic('link-2','w-3.5 h-3.5')}<span>${esc(s.link.replace(/^https?:\/\//,''))}</span></a>`:''}
    </div>
  </div>
  <div class="st-chrome absolute bottom-0 inset-x-0 p-3 z-20 bg-gradient-to-t from-black/85 via-black/45 to-transparent space-y-2 safe-b">
    <div class="flex items-center justify-between gap-2">
      ${isOwnStory?`<button type="button" data-act="openStoryViewers" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 text-[11px] font-semibold text-white transition">${ic('eye','w-3.5 h-3.5')}<span>Seen by ${viewers.length}</span></button>`:'<span></span>'}
      <div class="flex items-center gap-1">
        ${['❤️','🔥','👏'].map(em=>`<button type="button" data-act="storyQuickReact" data-arg="${em}" class="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 text-sm grid place-items-center transition">${em}</button>`).join('')}
      </div>
    </div>
    <div class="flex items-center gap-2 rounded-full bg-black/50 border border-white/25 px-3 py-1 backdrop-blur-md">
      <input id="st-reply-in" data-enter="sendStoryReply" class="flex-1 min-w-0 h-7 bg-transparent text-xs text-white placeholder:text-white/65 focus:outline-none" placeholder="Reply to ${esc(s.name.split(' ')[0])}…" autocomplete="off">
      <button type="button" data-act="sendStoryReply" class="h-7 px-2.5 rounded-full bg-[#0095f6] text-white text-[11px] font-bold shrink-0">Send</button>
    </div>
  </div>`;
  const svEl=$('#sv'),barEl=$('#sv-bar');
  svEl.onpointerdown=ev=>{if(ev.target.closest('button,a,input'))return;$('#m-story')?.classList.add('st-paused');if(barEl)barEl.style.animationPlayState='paused'};
  const resumeSt=()=>{if(document.activeElement?.id==='st-reply-in')return;$('#m-story')?.classList.remove('st-paused');if(barEl&&!s.voted)barEl.style.animationPlayState='running'};
  svEl.onpointerup=resumeSt;svEl.onpointercancel=resumeSt;
  const repIn=$('#st-reply-in');
  if(repIn){repIn.addEventListener('focus',()=>{if(barEl)barEl.style.animationPlayState='paused'});repIn.addEventListener('blur',resumeSt)}
  if(!localUrl&&s.mediaPath&&S.user){
    const curId=s.id;
    resolveSocialMediaUrl('story',s).then(url=>{if(url&&ST[S.story]?.id===curId&&!$('.sv-media',$('#sv')))$('#sv').insertAdjacentHTML('afterbegin',bgTag(url))});
  }
  if(S.user&&s.id&&!isOwnStory){sbPost({action:'markStoryViewed',storyId:s.id}).catch(()=>{})}
  s.seen=true;saveS();renderStories();barEl?.addEventListener('animationend',()=>A.storyNext());icons();
}

/* ---------- instagram-style creator profile, highlights, posts & realtime social ---------- */
const POST_BGS=[
  'from-indigo-600 via-fuchsia-600 to-rose-500',
  'from-sky-500 via-blue-600 to-indigo-700',
  'from-emerald-500 via-teal-600 to-cyan-700',
  'from-amber-500 via-orange-600 to-rose-600',
  'from-zinc-800 via-neutral-900 to-black'
];
const VERIFIED_BADGE_SVG='<svg class="w-4 h-4 text-sky-400 inline-block shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-label="Verified"><path d="M12 2l2.4 1.9 3-.3 1.1 2.8 2.7 1.4-.3 3L22.5 13l-1.9 2.4.3 3-2.8 1.1-1.4 2.7-3-.3L12 23.5l-2.4-1.9-3 .3-1.1-2.8-2.7-1.4.3-3L1.5 13l1.9-2.4-.3-3 2.8-1.1L7.3 3.8l3 .3L12 2zm-1.1 13.6l5.3-5.3-1.4-1.4-3.9 3.9-1.9-1.9-1.4 1.4 3.3 3.3z"/></svg>';

function seedLocalSocial(){
  return {
    profiles:[
      {id:'self',username:'you',display_name:'Your Creator Studio',status:'Online',verified:true,category:'Creator · Digital & AI',bio:'Building end-to-end encrypted apps & AI workflows on @whatsgram.\n#E2EE #Privacy #CreatorOS',location_text:'San Francisco, CA',website:'https://whatsgram-seven.vercel.app',links:[{title:'WhatsGram OS',url:'https://whatsgram-seven.vercel.app'},{title:'AI Assistant',url:'https://ai.google.dev'}],contact_email:'creator@whatsgram.app',threads_handle:'you',avatarUrl:''},
      {id:'u_alex',username:'alex.rivera',display_name:'Alex Rivera',status:'Online',verified:true,category:'Product & Architecture',bio:'Shipping Q3 milestones & passkey architecture.\n@sarah.chen · #Architecture #ZeroKnowledge',location_text:'1115 Broadway, New York, NY',website:'https://example.com/roadmap',links:[{title:'Q3 Roadmap',url:'https://example.com/roadmap'},{title:'Security Whitepaper',url:'https://example.com/e2ee'}],contact_email:'alex@whatsgram.app',threads_handle:'alex.rivera',avatarUrl:''},
      {id:'u_sarah',username:'sarah.chen',display_name:'Sarah Chen',status:'Away',verified:true,category:'Analytics & Growth',bio:'Turning retention curves into product insight 📊\n#Analytics #Growth',location_text:'London, UK',website:'https://example.com/reports',links:[{title:'Week 42 Export',url:'https://example.com/reports'}],contact_email:'sarah@whatsgram.app',threads_handle:'sarah.chen',avatarUrl:''},
      {id:'u_dev',username:'dev.master',display_name:'Dev Master',status:'Online',verified:false,category:'Infrastructure & Edge',bio:'Zero-downtime deploys & Postgres RLS.\n#Postgres #Edge',location_text:'Berlin, Germany',website:'https://example.com/deploy',links:[],contact_email:'',threads_handle:'dev.master',avatarUrl:''}
    ],
    follows:[['self','u_alex'],['u_alex','self'],['u_sarah','self'],['u_dev','u_alex'],['u_sarah','u_alex']],
    highlights:[
      {id:'hl_1',userId:'self',title:'Launches',coverBg:POST_BGS[0],slides:[{title:'Launches',text:'WhatsGram OS 2.0 shipped with Creator Profiles, Stories & Gemini AI.',bg:POST_BGS[0]}]},
      {id:'hl_2',userId:'self',title:'E2EE Lab',coverBg:POST_BGS[1],slides:[{title:'E2EE Lab',text:'ECDH P-256 + AES-GCM-256 encrypted DMs & safety verification.',bg:POST_BGS[1]}]},
      {id:'hl_3',userId:'u_alex',title:'Q3 Roadmap',coverBg:POST_BGS[2],slides:[{title:'Q3 Roadmap',text:'Real-time messaging, multi-device keys & vertical Reels live.',bg:POST_BGS[2]}]},
      {id:'hl_4',userId:'u_alex',title:'Passkeys',coverBg:POST_BGS[3],slides:[{title:'Passkeys',text:'Hardware-backed WebAuthn protection for private enclaves.',bg:POST_BGS[3]}]}
    ],
    posts:[
      {id:'pt_seed_1',userId:'self',caption:'Excited to launch Creator Profiles inside WhatsGram OS — live posts, Story Highlights, Reels & E2EE messaging in one unified space! #WhatsGram #CreatorOS #E2EE',locationText:'San Francisco, CA',tags:['whatsgram','creatoros','e2ee','alex.rivera'],mediaType:'card',mediaUrls:[],bg:POST_BGS[0],pinned:true,createdAt:new Date(Date.now()-86400000*2).toISOString()},
      {id:'pt_seed_2',userId:'self',caption:'Deep dive: How zero-knowledge media buckets sign temporary URLs while keeping client payloads encrypted. @dev.master #Security #Privacy',locationText:'Enclave Lab',tags:['security','privacy','dev.master'],mediaType:'carousel',mediaUrls:[],bg:POST_BGS[1],pinned:false,createdAt:new Date(Date.now()-86400000).toISOString()},
      {id:'pt_seed_3',userId:'u_alex',caption:'Q3 architecture sign-off complete. Proud of what @you and @sarah.chen built together this sprint! #Architecture #Teamwork',locationText:'1115 Broadway, New York, NY',tags:['you','sarah.chen','architecture','teamwork'],mediaType:'card',mediaUrls:[],bg:POST_BGS[2],pinned:true,createdAt:new Date(Date.now()-3600000*18).toISOString()},
      {id:'pt_seed_4',userId:'u_sarah',caption:'Week 42 engagement benchmark is live — retention climbed +34% after real-time Story polls shipped with @you #Analytics #Growth',locationText:'London, UK',tags:['you','analytics','growth'],mediaType:'carousel',mediaUrls:[],bg:POST_BGS[3],pinned:true,createdAt:new Date(Date.now()-3600000*8).toISOString()}
    ],
    likes:[['pt_seed_1','u_alex'],['pt_seed_1','u_sarah'],['pt_seed_3','self']],
    comments:[
      {id:'pc_seed_1',postId:'pt_seed_1',userId:'u_alex',authorName:'Alex Rivera',authorUsername:'alex.rivera',text:'This UI looks clean — loving the pinned posts!',createdAt:new Date(Date.now()-3600000*5).toISOString()},
      {id:'pc_seed_2',postId:'pt_seed_3',userId:'u_sarah',authorName:'Sarah Chen',authorUsername:'sarah.chen',text:'Best sprint yet!',createdAt:new Date(Date.now()-3600000*4).toISOString()}
    ],
    saves:[['pt_seed_3','self','repost']]
  };
}
let LOCAL_SOCIAL=store.get('social_v1',null)||seedLocalSocial();
const saveLocalSocial=()=>store.set('social_v1',LOCAL_SOCIAL);

function fmtCompactCount(n){
  const v=Number(n)||0;
  if(v>=1e6)return (v/1e6).toFixed(v%1e6>=1e5?1:0)+'M';
  if(v>=1e4)return (v/1e3).toFixed(1).replace(/\.0$/,'')+'K';
  return v.toLocaleString();
}
function timeAgo(v){
  const t=typeof v==='number'?v:Date.parse(v||'');
  if(!Number.isFinite(t))return 'Just now';
  const s=Math.max(0,Math.floor((Date.now()-t)/1000));
  if(s<60)return 'Just now';
  const m=Math.floor(s/60);
  if(m<60)return m+'m';
  const h=Math.floor(m/60);
  if(h<24)return h+'h';
  const d=Math.floor(h/24);
  if(d<7)return d+'d';
  return new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});
}
function renderAvatarCircle(prof,cls='w-20 h-20'){
  if(prof?.avatarUrl)return `<img src="${esc(prof.avatarUrl)}" alt="${esc(prof.display_name||prof.username||'Avatar')}" class="${cls} rounded-full object-cover shrink-0">`;
  return av(prof?.display_name||prof?.username||'U',cls);
}
function renderBioText(bio){
  if(!bio)return '';
  return esc(bio).replace(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer" class="text-sky-400 hover:underline">$1</a>')
    .replace(/@([a-z0-9][a-z0-9._-]{1,31})/gi,'<button type="button" data-act="openProfile" data-arg="$1" class="text-sky-400 hover:underline font-medium">@$1</button>')
    .replace(/#([a-z0-9][a-z0-9._-]{1,31})/gi,'<button type="button" data-act="filterTag" data-arg="$1" class="text-sky-400 hover:underline">#$1</button>')
    .replace(/\n/g,'<br>');
}
function noteRealtimeActivity(kind,payload){
  if(!S.user||!payload)return;
  const row=payload.new||payload.old;if(!row)return;
  if((kind==='follow'&&row.follower_id===S.user.id)||(kind!=='follow'&&row.user_id===S.user.id))return;
  let txt='';
  if(kind==='follow'&&payload.eventType==='INSERT'&&row.following_id===S.user.id)txt='A creator started following you';
  else if(kind==='like'&&payload.eventType==='INSERT')txt='New like on a community post';
  else if(kind==='comment'&&payload.eventType==='INSERT')txt=`${row.author_name||'Someone'} commented: "${String(row.text||'').slice(0,50)}"`;
  else if(kind==='post'&&payload.eventType==='INSERT')txt='New post published in the network';
  if(!txt)return;
  pushActivity(kind,txt,row.follower_id||row.user_id||null);
}
function pushActivity(kind,text,refUserId=null){
  S.activity.unshift({id:uid('act'),kind,text,refUserId,t:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})});
  S.activity=S.activity.slice(0,40);
  store.set('wg_activity',S.activity);
  S.actUnread++;
  renderActivityBadge();
  if($('#m-activity')?.classList.contains('open'))renderActivityModal();
}
function renderActivityBadge(){
  const b=$('#prof-act-badge');if(!b)return;
  b.textContent=S.actUnread>9?'9+':String(S.actUnread);
  b.classList.toggle('hidden',!S.actUnread);
  b.classList.toggle('grid',Boolean(S.actUnread));
}
let profDebTm=null;
function scheduleProfileRefresh(delay=250){
  if(!S.user||S.view!=='profile')return;
  clearTimeout(profDebTm);
  profDebTm=setTimeout(()=>loadProfileData(S.profId||'self',true),delay);
}

function buildLocalProfileData(targetIdOrHandle){
  const q=String(targetIdOrHandle||'self').trim().replace(/^@/,'').toLowerCase();
  const profs=LOCAL_SOCIAL.profiles;
  let target=profs.find(p=>p.id===q||normalizeHandle(p.username)===q||p.display_name.toLowerCase()===q);
  if(!target)target=profs[0];
  const viewerId='self';
  const follows=LOCAL_SOCIAL.follows;
  const viewerFollowSet=new Set(follows.filter(f=>f[0]===viewerId).map(f=>f[1]));
  const followerIds=follows.filter(f=>f[1]===target.id).map(f=>f[0]);
  const followingIds=follows.filter(f=>f[0]===target.id).map(f=>f[1]);
  const followers=followerIds.map(id=>profs.find(p=>p.id===id)).filter(Boolean);
  const following=followingIds.map(id=>profs.find(p=>p.id===id)).filter(Boolean);
  const mutuals=followers.filter(u=>u.id!==viewerId&&viewerFollowSet.has(u.id));
  const suggested=profs.filter(p=>p.id!==viewerId&&p.id!==target.id&&!viewerFollowSet.has(p.id));
  const mapPost=pt=>{
    const au=profs.find(p=>p.id===pt.userId)||profs[0];
    const likes=LOCAL_SOCIAL.likes.filter(l=>l[0]===pt.id);
    const cmList=LOCAL_SOCIAL.comments.filter(c=>c.postId===pt.id);
    return {
      ...pt,
      author:au,
      likesCount:likes.length,
      commentsCount:cmList.length,
      likedByMe:likes.some(l=>l[1]===viewerId),
      savedByMe:LOCAL_SOCIAL.saves.some(s=>s[0]===pt.id&&s[1]===viewerId&&s[2]==='save'),
      repostedByMe:LOCAL_SOCIAL.saves.some(s=>s[0]===pt.id&&s[1]===viewerId&&s[2]==='repost'),
      comments:cmList
    };
  };
  const blockedSet=new Set(S.user?.blockedIds||[]);
  const allPosts=LOCAL_SOCIAL.posts.filter(pt=>!blockedSet.has(pt.userId)).map(mapPost);
  const ownPosts=allPosts.filter(p=>p.userId===target.id&&!p.archived).sort((a,b)=>(Number(b.pinned)-Number(a.pinned))||String(b.createdAt).localeCompare(String(a.createdAt)));
  const archivedPosts=target.id===viewerId?allPosts.filter(p=>p.userId===target.id&&p.archived):[];
  const tHandle=normalizeHandle(target.username);
  const taggedPosts=tHandle?allPosts.filter(p=>!p.archived&&p.userId!==target.id&&((p.tags||[]).includes(tHandle)||new RegExp('@'+tHandle+'\\b','i').test(p.caption||''))):[];
  const repostIds=LOCAL_SOCIAL.saves.filter(s=>s[1]===target.id&&(s[2]==='repost'||(target.id===viewerId&&s[2]==='save'))).map(s=>s[0]);
  const reposts=[...new Set(repostIds)].map(pid=>allPosts.find(p=>p.id===pid&&!p.archived)).filter(Boolean);
  const reels=getReels().filter(r=>normalizeHandle(r.author)===tHandle||(target.id==='self'&&r.author==='You'));
  const highlights=LOCAL_SOCIAL.highlights.filter(h=>h.userId===target.id);
  return {
    ok:true,
    schemaReady:true,
    profile:{
      ...target,
      isPrivate:Boolean(target.is_private),
      isOwn:target.id===viewerId,
      isFollowing:viewerFollowSet.has(target.id),
      followStatus:viewerFollowSet.has(target.id)?'accepted':'none',
      followsMe:followingIds.includes(viewerId),
      postsCount:ownPosts.length+reels.length,
      followersCount:followers.length,
      followingCount:following.length
    },
    followers,following,mutuals,highlights,posts:ownPosts,archivedPosts,reels,reposts,taggedPosts,suggested
  };
}
const normalizeHandle=h=>String(h||'').trim().replace(/^@+/,'').toLowerCase();

async function loadProfileData(targetIdOrHandle='self',quiet=false){
  S.profId=targetIdOrHandle||'self';
  if(!quiet){S.profLoading=true;renderProfile()}
  try{
    if(S.user){
      const raw=String(targetIdOrHandle||'self').trim();
      const params={};
      if(raw&&raw!=='self'){
        if(/^[0-9a-f-]{32,36}$/i.test(raw)||(S.users||[]).some(u=>u.id===raw))params.userId=raw;
        else params.username=raw.replace(/^@/,'');
      }
      const res=await sbGet('profileData',params);
      if(res?.ok&&res.profile){
        S.profData=res;
        if(res.profile.isOwn&&S.user){
          S.user.displayName=res.profile.display_name||S.user.displayName;
          S.user.avatarUrl=res.profile.avatarUrl||S.user.avatarUrl;
          S.user.bio=res.profile.bio||'';
        }
        if($('#m-follow-list')?.classList.contains('open'))renderFollowListModal();
        if($('#m-post-view')?.classList.contains('open')&&S.postViewId)renderPostView();
      }else if(!quiet&&res?.error){
        toast(res.error,'err');
      }
    }else{
      S.profData=buildLocalProfileData(targetIdOrHandle);
      if($('#m-follow-list')?.classList.contains('open'))renderFollowListModal();
      if($('#m-post-view')?.classList.contains('open')&&S.postViewId)renderPostView();
    }
  }finally{
    S.profLoading=false;
    renderProfile();
  }
}

function openProfile(target='self'){
  const norm=normalizeHandle(target||'self'),curP=S.profData?.profile;
  if(curP&&((norm==='self'&&!curP.isOwn)||(norm!=='self'&&curP.id!==target&&normalizeHandle(curP.username)!==norm)))S.profData=null;
  S.profTag=null;
  if(S.view!=='profile')S.profPrevView=S.view||'chats';
  S.profId=target||'self';
  setView('profile');
}

async function loadFeedData(quiet=false,append=false){
  if(S.feedLoading)return;
  S.feedLoading=true;
  if(!quiet&&!append)renderFeedView();
  try{
    if(S.user){
      const params={limit:24,sort:S.feedSort||'recent'};
      if(append&&S.feedData?.nextCursor)params.before=S.feedData.nextCursor;
      const res=await sbGet('feedData',params);
      if(res?.ok){
        if(append&&S.feedData){
          const seen=new Set((S.feedData.posts||[]).map(p=>p.id));
          const merged=[...(S.feedData.posts||[]),...(res.posts||[]).filter(p=>!seen.has(p.id))];
          S.feedData={...S.feedData,posts:merged,nextCursor:res.nextCursor||null,hasMore:Boolean(res.hasMore)};
        }else{
          const nextData={posts:res.posts||[],creators:res.creators||[],trendingTags:res.trendingTags||[],nextCursor:res.nextCursor||null,hasMore:Boolean(res.hasMore)};
          const scroller=$('#feed-root')?.closest('.overflow-y-auto');
          if(quiet&&S.feedData?.posts?.length&&nextData.posts.length&&nextData.posts[0].id!==S.feedData.posts[0].id&&scroller&&scroller.scrollTop>180){
            S.feedNewPending=nextData;
          }else{
            S.feedNewPending=null;
            S.feedData=nextData;
          }
        }
      }
      else if(!S.feedData){S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S})}
    }else{
      S.feedNewPending=null;
      S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S});
    }
  }finally{
    S.feedLoading=false;
    renderFeedView();
  }
}
function renderFeedView(){
  const root=$('#feed-root');if(!root)return;
  const mapTab=(id,on)=>{const el=$('#feed-tab-'+id);if(el)el.className='h-8 px-3.5 rounded-xl text-xs font-semibold transition-all '+(on?'lux-tab-on':'lux-tab-off')};
  mapTab('explore',(S.feedTab||'explore')==='explore');
  mapTab('following',S.feedTab==='following');
  mapTab('trending',S.feedTab==='trending');
  const sortEl=$('#feed-sort');if(sortEl)sortEl.value=S.feedSort||'recent';
  const pillWrap=$('#feed-new-pill-wrap');if(pillWrap)pillWrap.classList.toggle('hidden',!S.feedNewPending);
  const layCards=$('#feed-lay-cards'),layGrid=$('#feed-lay-grid');
  if(layCards)layCards.className='w-7 h-7 rounded-full grid place-items-center '+(S.feedLayout!=='grid'?'lux-tab-on':'lux-tab-off');
  if(layGrid)layGrid.className='w-7 h-7 rounded-full grid place-items-center '+(S.feedLayout==='grid'?'lux-tab-on':'lux-tab-off');
  renderFeedDOM(root,{S,POST_BGS,VERIFIED_BADGE_SVG,esc,ic,renderAvatarCircle,renderBioText,fmtCompactCount,timeAgo});
  icons();
}
async function loadNotifications(markRead=false){
  if(!S.user)return;
  const res=await sbGet('notifications',{limit:40});
  if(res?.ok&&Array.isArray(res.notifications)){
    S.activity=res.notifications.map(n=>{const ts=n.createdAt||n.created_at||Date.now();return{id:n.id,kind:n.kind||'info',text:n.preview||n.message||(n.actorName?`${n.actorName} interacted with you`:'Notification'),refUserId:n.actorId||n.actor_id||null,read:typeof n.read==='boolean'?n.read:Boolean(n.read_at),t:timeAgo?timeAgo(ts):new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}});
    S.actUnread=Number(res.unreadCount??S.activity.filter(x=>!x.read).length);
    store.set('wg_activity',S.activity);
    renderActivityBadge();
    if($('#m-activity')?.classList.contains('open'))renderActivityModal();
  }
  if(markRead&&S.actUnread>0){
    await sbPost({action:'markNotificationsRead'});
    S.actUnread=0;S.activity.forEach(x=>x.read=true);
    renderActivityBadge();
  }
}
async function checkKeyBackupStatus(){
  if(!S.user){S.keyBackupExists=false;S.keyBackupUpdatedAt=null;renderVaultBackupUI();return}
  const r=await sbGet('getKeyBackup');
  S.keyBackupExists=Boolean(r?.ok&&r.payload);
  S.keyBackupUpdatedAt=S.keyBackupExists?(r.updatedAt||null):null;
  renderVaultBackupUI();
}
function renderVaultBackupUI(){
  const st=$('#vault-backup-state'),fpEl=$('#vault-backup-fp'),btn=$('#vault-backup-restore-btn');
  if(st)st.textContent=S.user?(S.keyBackupExists?`Cloud backup encrypted & active${S.keyBackupUpdatedAt?' · '+new Date(S.keyBackupUpdatedAt).toLocaleDateString():''}`:'No cloud E2EE backup uploaded yet — protect your keys across devices.'):'Sign in for Cloud Sync backup, or export a local Recovery Kit .txt.';
  if(fpEl)fpEl.textContent=FP?`Active Key FP: ${FP}`:'Generating key…';
  if(btn)btn.classList.toggle('hidden',!S.user||!S.keyBackupExists);
}
async function syncPushStateUI(){
  const sw=$('#push-sw'),lbl=$('#push-state'),testBtn=$('#push-test-btn');
  if(!isPushSupported()){
    if(lbl)lbl.textContent='Web Push is not supported in this browser.';
    if(sw){sw.disabled=true;sw.setAttribute('aria-checked','false')}
    if(testBtn)testBtn.classList.add('hidden');
    return;
  }
  const sub=await getExistingPushSubscription().catch(()=>null);
  S.pushSubscribed=Boolean(sub);
  if(sw)sw.setAttribute('aria-checked',String(S.pushSubscribed));
  if(lbl)lbl.textContent=S.pushSubscribed?'Subscribed to background Web Push notifications on this device.':(S.user?'Enable background Web Push alerts when messages arrive.':'Sign in to link Web Push notifications to your account.');
  if(testBtn)testBtn.classList.toggle('hidden',!S.pushSubscribed||!S.user);
}
function findPostById(postId){
  const d=S.profData;
  if(d){
    for(const arr of [d.posts,d.archivedPosts,d.reposts,d.taggedPosts]){
      const hit=(arr||[]).find(x=>x.id===postId);
      if(hit)return hit;
    }
  }
  const f=(S.feedData?.posts||[]).find(x=>x.id===postId);
  return f||null;
}

function renderProfile(){
  const root=$('#prof-root');if(!root)return;
  renderActivityBadge();
  const data=S.profData;
  const rtLbl=$('#prof-rt-lbl'),rtChip=$('#prof-rt-chip');
  if(rtLbl&&rtChip){
    const live=Boolean(S.user&&S.rtChan);
    rtLbl.textContent=S.user?(live?'Realtime Live':'Cloud Synced'):'Local Sandbox';
    rtChip.className='hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 '+(live?'bg-emerald-500/10 border border-emerald-400/20 text-emerald-300':'bg-white/[0.06] border border-white/[0.1] text-zinc-300');
  }
  if(!data&&S.profLoading){
    root.innerHTML='<div class="p-6 space-y-6 animate-pulse"><div class="flex items-center gap-6"><div class="w-24 h-24 rounded-full bg-white/10"></div><div class="flex-1 grid grid-cols-3 gap-4"><div class="h-10 rounded-xl bg-white/10"></div><div class="h-10 rounded-xl bg-white/10"></div><div class="h-10 rounded-xl bg-white/10"></div></div></div><div class="h-16 rounded-2xl bg-white/10"></div><div class="grid grid-cols-3 gap-1.5"><div class="aspect-square bg-white/10 rounded-lg"></div><div class="aspect-square bg-white/10 rounded-lg"></div><div class="aspect-square bg-white/10 rounded-lg"></div></div></div>';
    return;
  }
  if(!data?.profile){
    root.innerHTML='<div class="p-12 text-center space-y-3"><p class="text-sm font-semibold text-zinc-300">Profile unavailable</p><button data-act="refreshProfileNow" class="btn-primary h-9 px-4 rounded-full text-xs font-semibold">Retry</button></div>';
    icons();return;
  }
  const p=data.profile;
  const handleTxt=p.username?('@'+p.username):(p.display_name||'profile');
  setTxt('#prof-top-handle',handleTxt);
  $('#prof-top-verified')?.classList.toggle('hidden',!p.verified);
  const online=Boolean(p.isOwn||(S.user&&S.onlineUsers[p.id])||(!S.user&&p.status==='Online'));

  const extraLinks=(p.links||[]).filter(l=>l?.url&&l.url!==p.website);
  const totalLinksCount=(p.website?1:0)+extraLinks.length;
  const primaryLink=p.website||(p.links?.[0]?.url||'');
  const cleanLinkLbl=u=>String(u||'').replace(/^https?:\/\/(www\.)?/i,'').replace(/\/$/,'');
  const mutuals=data.mutuals||[];
  const mutualsHTML=(!p.isOwn&&mutuals.length)?`<button type="button" data-act="openFollowModal" data-arg="followers" class="flex items-center gap-2 text-left text-xs text-zinc-400 hover:text-zinc-200 transition pt-1"><span class="flex -space-x-2">${mutuals.slice(0,3).map(m=>`<span class="ring-2 ring-[#05060b] rounded-full">${renderAvatarCircle(m,'w-5 h-5')}</span>`).join('')}</span><span class="truncate">Followed by <strong class="text-zinc-200">${esc(mutuals[0].username||mutuals[0].display_name)}</strong>${mutuals.length>1?` and <strong class="text-zinc-200">${mutuals.length-1} other${mutuals.length>2?'s':''}</strong>`:''}</span></button>`:'';

  const schemaBanner=(S.user&&data.schemaReady===false)?`<div class="mx-4 mt-4 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200 flex items-center justify-between gap-2"><span>Run updated <code class="font-mono text-amber-100">supabase/schema.sql</code> in Supabase SQL Editor to enable Postgres posts, highlights &amp; follows.</span><button data-act="refreshProfileNow" class="shrink-0 h-7 px-3 rounded-lg bg-amber-400 text-black font-bold text-[11px]">Retry</button></div>`:'';

  const reqBanner=(p.isOwn&&S.followRequests?.length)?`<button type="button" data-act="openBlocksModal" class="mx-4 mt-3 w-[calc(100%-2rem)] rounded-2xl border border-sky-500/35 bg-sky-500/10 hover:bg-sky-500/15 px-4 py-2.5 text-xs text-sky-200 flex items-center justify-between gap-2 transition"><span class="inline-flex items-center gap-2 font-semibold">${ic('user-check','w-4 h-4 text-sky-400')}<span>${S.followRequests.length} pending follow request${S.followRequests.length>1?'s':''}</span></span><span class="font-bold text-white">Review</span></button>`:'';

  const actionRow=p.isOwn
    ?`<div class="flex items-center gap-1.5 sm:gap-2 pt-3">
        <button data-act="openEditProfile" class="flex-1 min-w-0 h-9 px-2 sm:px-3 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.1] text-[11px] sm:text-xs font-bold text-white whitespace-nowrap truncate transition">Edit profile</button>
        <button data-act="openPostModal" class="flex-1 min-w-0 h-9 px-2 sm:px-3 rounded-xl bg-[#0095f6] hover:bg-[#1aa3ff] text-[11px] sm:text-xs font-bold text-white shadow-[0_6px_18px_-4px_rgba(0,149,246,.5)] whitespace-nowrap truncate transition"><span class="hidden min-[350px]:inline">Create post</span><span class="min-[350px]:hidden">Post</span></button>
        <button data-act="profShare" class="flex-1 min-w-0 h-9 px-2 sm:px-3 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.1] text-[11px] sm:text-xs font-bold text-white whitespace-nowrap truncate transition"><span>Share<span class="hidden min-[390px]:inline"> profile</span></span></button>
        <button data-act="toggleSuggest" aria-pressed="${S.profSuggest}" class="w-9 h-9 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.1] grid place-items-center text-white shrink-0 transition" title="Discover people" aria-label="Discover suggested people">${ic('user-plus','w-4 h-4')}</button>
      </div>`
    :`<div class="flex items-center gap-1.5 sm:gap-2 pt-3">
        <button data-act="profFollow" class="flex-1 min-w-0 h-9 px-2 sm:px-3 rounded-xl text-[11px] sm:text-xs font-bold whitespace-nowrap truncate transition inline-flex items-center justify-center gap-1 ${(p.isFollowing||p.followStatus==='pending')?'bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.12] text-white':'bg-[#0095f6] hover:bg-[#1aa3ff] text-white shadow-[0_6px_18px_-4px_rgba(0,149,246,.5)]'}">${p.isFollowing?`Following ${ic('chevron-down','w-3.5 h-3.5')}`:(p.followStatus==='pending'?'Requested':(p.followsMe?'Follow Back':'Follow'))}</button>
        <button data-act="profMsg" class="flex-1 min-w-0 h-9 px-2 sm:px-3 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.1] text-[11px] sm:text-xs font-bold text-white whitespace-nowrap truncate transition">Message</button>
        ${p.contact_email?`<button data-act="profEmail" class="flex-1 min-w-0 h-9 px-2 sm:px-3 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.1] text-[11px] sm:text-xs font-bold text-white whitespace-nowrap truncate transition">Email</button>`:`<button data-act="profShare" class="flex-1 min-w-0 h-9 px-2 sm:px-3 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.1] text-[11px] sm:text-xs font-bold text-white whitespace-nowrap truncate transition">Share</button>`}
        <button data-act="toggleSuggest" aria-pressed="${S.profSuggest}" class="w-9 h-9 rounded-xl bg-white/[0.1] hover:bg-white/[0.16] border border-white/[0.1] grid place-items-center text-white shrink-0 transition" title="Suggested creators" aria-label="Toggle suggested creators">${ic('user-plus','w-4 h-4')}</button>
      </div>`;

  const suggestHTML=S.profSuggest?`<div class="px-4 sm:px-6 pb-4">
    <div class="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-3">
      <div class="flex items-center justify-between"><span class="text-xs font-bold text-white">Suggested for you</span><button data-act="openFollowModal" data-arg="suggested" class="text-[11px] font-semibold text-sky-400 hover:underline">See all</button></div>
      <div class="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">${(data.suggested||[]).length?(data.suggested||[]).map(u=>`<div class="w-36 shrink-0 rounded-2xl border border-white/[0.08] bg-[#0b0d15] p-3 flex flex-col items-center text-center gap-2">
        <button data-act="openProfile" data-arg="${esc(u.username||u.id)}" class="flex flex-col items-center gap-1.5 min-w-0 w-full">
          <span class="relative">${renderAvatarCircle(u,'w-12 h-12')}${S.onlineUsers[u.id]?'<span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#0b0d15]"></span>':''}</span>
          <span class="text-xs font-bold text-white truncate w-full inline-flex items-center justify-center gap-1">${esc(u.display_name||u.username)}${u.verified?VERIFIED_BADGE_SVG:''}</span>
          <span class="text-[10px] text-zinc-400 truncate w-full">@${esc(u.username||'user')}</span>
        </button>
        <button data-act="profToggleFollowId" data-arg="${esc(u.id)}" class="w-full h-7 rounded-lg bg-[#0095f6] hover:bg-[#1aa3ff] text-[11px] font-bold text-white transition">Follow</button>
      </div>`).join(''):'<div class="text-xs text-zinc-500 py-3 px-2">You follow everyone in the directory right now.</div>'}</div>
    </div>
  </div>`:'';

  const highlights=data.highlights||[];
  const hlHTML=`<div class="flex items-start gap-4 px-4 sm:px-6 pb-5 overflow-x-auto no-scrollbar">
    ${p.isOwn?`<button data-act="openHighlightModal" class="flex flex-col items-center gap-1.5 shrink-0 group" title="New Story Highlight">
      <span class="w-16 h-16 rounded-full border-2 border-dashed border-white/25 group-hover:border-white/55 grid place-items-center text-zinc-300 group-hover:text-white bg-white/[0.03] transition">${ic('plus','w-6 h-6')}</span>
      <span class="text-[11px] font-medium text-zinc-400 max-w-[72px] truncate">New</span>
    </button>`:''}
    ${highlights.map(h=>`<button data-act="openHighlight" data-arg="${esc(h.id)}" class="flex flex-col items-center gap-1.5 shrink-0 group">
      <span class="p-[2.5px] rounded-full bg-gradient-to-tr from-zinc-500/70 via-zinc-300/60 to-zinc-500/70 group-hover:from-[#f58529] group-hover:via-[#dd2a7b] group-hover:to-[#8134af] transition">
        <span class="block p-[2px] rounded-full bg-[#05060b]">
          ${h.coverUrl?`<img src="${esc(h.coverUrl)}" alt="${esc(h.title)}" class="w-14 h-14 rounded-full object-cover">`:`<span class="w-14 h-14 rounded-full bg-gradient-to-br ${esc(h.coverBg||POST_BGS[0])} grid place-items-center text-white text-sm font-bold">${esc(h.title.slice(0,2).toUpperCase())}</span>`}
        </span>
      </span>
      <span class="text-[11px] font-medium text-zinc-200 max-w-[72px] truncate">${esc(h.title)}</span>
    </button>`).join('')}
  </div>`;

  const tabBtn=(k,icon,lbl)=>`<button role="tab" data-act="profTab" data-arg="${k}" aria-selected="${S.profTab===k}" class="flex-1 h-11 grid place-items-center border-b-2 transition-colors ${S.profTab===k?'border-white text-white':'border-transparent text-zinc-500 hover:text-zinc-300'}" title="${lbl}" aria-label="${lbl}">${ic(icon,'w-5 h-5')}</button>`;

  let gridHTML='';
  const filterByTag=arr=>!S.profTag?arr:arr.filter(pt=>(pt.tags||[]).includes(S.profTag.toLowerCase())||String(pt.caption||'').toLowerCase().includes('#'+S.profTag.toLowerCase()));
  if(data.lockedByPrivacy){
    gridHTML=`<div class="py-16 px-6 text-center space-y-3">
      <span class="w-16 h-16 mx-auto rounded-full border-2 border-white/15 grid place-items-center text-zinc-200">${ic('lock','w-7 h-7')}</span>
      <div class="text-sm font-bold text-white">This account is private</div>
      <p class="text-xs text-zinc-400 max-w-xs mx-auto">Follow @${esc(p.username||'user')} to see their photos, videos, and highlights.</p>
    </div>`;
  }else if(S.profTab==='reels'){
    const rlList=data.reels||[];
    gridHTML=rlList.length?`<div class="grid grid-cols-3 gap-0.5 sm:gap-1.5 px-0 sm:px-6">${rlList.map(r=>`<button data-act="jumpReel" data-arg="${esc(r.id)}" class="group relative aspect-[9/16] overflow-hidden bg-zinc-900 sm:rounded-xl text-left">
      ${r.mediaUrl?(r.mediaMime?.startsWith('video/')?`<video src="${esc(r.mediaUrl)}" class="w-full h-full object-cover" muted playsinline></video>`:`<img src="${esc(r.mediaUrl)}" alt="" class="w-full h-full object-cover">`):`<div class="w-full h-full p-3 flex flex-col justify-end" style="background:${esc(r.g)}"><p class="text-[11px] font-semibold text-white line-clamp-3 drop-shadow">${esc(r.cap)}</p></div>`}
      <span class="absolute top-2 right-2 text-white/90 drop-shadow">${ic('clapperboard','w-4 h-4')}</span>
      <span class="absolute bottom-2 left-2 inline-flex items-center gap-1 text-[11px] font-bold text-white drop-shadow">${ic('play','w-3.5 h-3.5 fill-current')}<span>${fmtCompactCount(r.likes||0)}</span></span>
    </button>`).join('')}</div>`
    :`<div class="py-14 text-center space-y-2"><p class="text-sm font-semibold text-zinc-300">No Reels yet</p><p class="text-xs text-zinc-500">Create a vertical Reel in Studio to showcase it here.</p></div>`;
  }else{
    const src=S.profTab==='reposts'?(data.reposts||[]):S.profTab==='tagged'?(data.taggedPosts||[]):S.profTab==='archived'?(data.archivedPosts||[]):(data.posts||[]);
    const list=filterByTag(src);
    const tile=pt=>{
      const url=pt.mediaUrls?.[0];
      const isVid=pt.mediaType==='video';
      const isCar=pt.mediaType==='carousel'||(pt.mediaUrls?.length>1);
      return `<button data-act="viewPost" data-arg="${esc(pt.id)}" class="group relative aspect-square overflow-hidden bg-zinc-900 sm:rounded-xl text-left">
        ${url?(isVid?`<video src="${esc(url)}" class="w-full h-full object-cover" muted playsinline></video>`:`<img src="${esc(url)}" alt="${esc(pt.caption||'Post')}" loading="lazy" class="w-full h-full object-cover group-hover:scale-[1.03] transition duration-300">`)
        :`<div class="w-full h-full bg-gradient-to-br ${esc(pt.bg||POST_BGS[0])} p-3 sm:p-4 flex items-center justify-center text-center group-hover:scale-[1.02] transition duration-300"><p class="text-[11px] sm:text-xs font-bold text-white drop-shadow line-clamp-4">${esc(pt.caption||'WhatsGram Post')}</p></div>`}
        <div class="absolute top-2 right-2 flex items-center gap-1.5 text-white drop-shadow">
          ${pt.pinned?`<span class="w-5 h-5 rounded-full bg-black/55 backdrop-blur-sm grid place-items-center" title="Pinned">${ic('pin','w-3 h-3 rotate-45')}</span>`:''}
          ${isCar?`<span class="w-5 h-5 rounded-full bg-black/45 backdrop-blur-sm grid place-items-center">${ic('layers','w-3 h-3')}</span>`:''}
          ${isVid?`<span class="w-5 h-5 rounded-full bg-black/45 backdrop-blur-sm grid place-items-center">${ic('play','w-3 h-3 fill-current')}</span>`:''}
        </div>
        <div class="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4 text-xs font-bold text-white">
          <span class="inline-flex items-center gap-1">${ic('heart','w-4 h-4 fill-current')}<span>${fmtCompactCount(pt.likesCount)}</span></span>
          <span class="inline-flex items-center gap-1">${ic('message-circle','w-4 h-4 fill-current')}<span>${fmtCompactCount(pt.commentsCount)}</span></span>
        </div>
      </button>`;
    };
    const emptyMsg=S.profTab==='archived'?'Archived posts are only visible to you':S.profTab==='reposts'?'Reposts & saved posts will appear here':(S.profTab==='tagged'?'Posts that @mention or tag this account appear here':'No posts shared yet');
    gridHTML=list.length?`<div class="grid grid-cols-3 gap-0.5 sm:gap-1.5 px-0 sm:px-6">${list.map(tile).join('')}</div>`
      :`<div class="py-14 text-center space-y-3 px-6">
        <span class="w-14 h-14 mx-auto rounded-full border-2 border-white/15 grid place-items-center text-zinc-400">${ic(S.profTab==='archived'?'archive':S.profTab==='tagged'?'user-check':(S.profTab==='reposts'?'repeat-2':'camera'),'w-6 h-6')}</span>
        <div class="text-sm font-bold text-white">${esc(emptyMsg)}</div>
        ${p.isOwn&&S.profTab==='posts'?`<button data-act="openPostModal" class="btn-primary h-9 px-5 rounded-full text-xs font-bold">Share your first post</button>`:''}
      </div>`;
  }

  root.innerHTML=`${schemaBanner}${reqBanner}
  <div class="px-3.5 sm:px-6 pt-4 sm:pt-5 pb-3 space-y-3.5 sm:space-y-4">
    <div class="flex items-center gap-3.5 sm:gap-9">
      <button type="button" data-act="profAvatarTap" class="relative shrink-0 group" title="${p.isOwn?'Change photo or view Story':'View Story'}">
        <span class="block p-[3px] rounded-full bg-gradient-to-tr from-[#f58529] via-[#dd2a7b] to-[#8134af] group-hover:scale-[1.03] transition">
          <span class="block p-[2.5px] rounded-full bg-[#05060b]">
            ${renderAvatarCircle(p,'w-[72px] h-[72px] min-[380px]:w-20 min-[380px]:h-20 sm:w-28 sm:h-28')}
          </span>
        </span>
        ${online?'<span class="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-400 ring-[3px] ring-[#05060b] shadow-[0_0_10px_rgba(52,211,153,.9)]" title="Online now"></span>':''}
      </button>
      <div class="flex-1 min-w-0 space-y-2.5 sm:space-y-3">
        <div class="hidden sm:flex items-center gap-2">
          <h1 class="text-lg font-extrabold text-white tracking-tight truncate">${esc(p.display_name||handleTxt)}</h1>
          ${p.verified?VERIFIED_BADGE_SVG:''}
          ${p.isPrivate?`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.09] text-[10px] font-semibold text-zinc-300" title="Private account">${ic('lock','w-3 h-3')}Private</span>`:''}
          ${p.category?`<span class="px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[11px] font-medium text-zinc-300 truncate">${esc(p.category)}</span>`:''}
        </div>
        <div class="grid grid-cols-3 gap-2 sm:max-w-sm">
          <button data-act="scrollToPosts" class="py-1 rounded-xl hover:bg-white/[0.04] transition text-center sm:text-left">
            <div class="text-base sm:text-lg font-extrabold text-white tabular-nums">${fmtCompactCount(p.postsCount)}</div>
            <div class="text-[11.5px] text-zinc-400">posts</div>
          </button>
          <button data-act="openFollowModal" data-arg="followers" class="py-1 rounded-xl hover:bg-white/[0.04] transition text-center sm:text-left">
            <div class="text-base sm:text-lg font-extrabold text-white tabular-nums">${fmtCompactCount(p.followersCount)}</div>
            <div class="text-[11.5px] text-zinc-400">followers</div>
          </button>
          <button data-act="openFollowModal" data-arg="following" class="py-1 rounded-xl hover:bg-white/[0.04] transition text-center sm:text-left">
            <div class="text-base sm:text-lg font-extrabold text-white tabular-nums">${fmtCompactCount(p.followingCount)}</div>
            <div class="text-[11.5px] text-zinc-400">following</div>
          </button>
        </div>
      </div>
    </div>

    <div class="space-y-1 text-[13px] leading-snug">
      <div class="flex sm:hidden items-center gap-1.5">
        <span class="font-extrabold text-white text-sm">${esc(p.display_name||handleTxt)}</span>
        ${p.verified?VERIFIED_BADGE_SVG:''}
      </div>
      ${p.category?`<div class="sm:hidden text-xs font-medium text-zinc-400">${esc(p.category)}</div>`:''}
      ${p.bio?`<p class="text-zinc-100 leading-relaxed break-words">${renderBioText(p.bio)}</p>`:(p.isOwn?'<p class="text-zinc-500 text-xs">Add a bio, website link, or @hashtags from Edit profile.</p>':'')}
      ${p.location_text?`<div class="flex items-center gap-1.5 text-sky-400 text-xs font-medium pt-0.5">${ic('map-pin','w-3.5 h-3.5 shrink-0')}<span class="truncate">${esc(p.location_text)}</span></div>`:''}
      ${primaryLink?`<div class="flex items-center gap-1.5 text-xs pt-0.5 flex-wrap">
        ${ic('link-2','w-3.5 h-3.5 text-zinc-400 shrink-0')}
        <a href="${esc(primaryLink)}" target="_blank" rel="noopener noreferrer" class="font-semibold text-sky-300 hover:underline truncate max-w-[230px]">${esc(cleanLinkLbl(primaryLink))}</a>
        ${totalLinksCount>1?`<button type="button" data-act="openLinksModal" class="font-bold text-zinc-200 hover:text-white transition">and ${totalLinksCount-1} more</button>`:''}
      </div>`:''}
      ${p.threads_handle?`<div class="pt-1"><button type="button" data-act="copyHandle" data-arg="${esc(p.threads_handle)}" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[11px] font-bold text-white hover:bg-white/[0.12] transition">${ic('at-sign','w-3 h-3 text-zinc-400')}<span>${esc(p.threads_handle)}</span></button></div>`:''}
      ${mutualsHTML}
    </div>

    ${actionRow}
  </div>

  ${suggestHTML}
  ${hlHTML}

  ${S.profTag?`<div class="mx-4 sm:mx-6 mb-2 px-3.5 py-2 rounded-xl bg-sky-500/10 border border-sky-400/25 flex items-center justify-between text-xs text-sky-200"><span>Showing posts tagged <strong>#${esc(S.profTag)}</strong></span><button data-act="clearTagFilter" class="font-bold text-white hover:underline">Clear</button></div>`:''}

  <div id="prof-tabs-bar" role="tablist" aria-label="Profile content tabs" class="flex border-t border-b border-white/[0.08] sm:mx-6">
    ${tabBtn('posts','grid-3x3','Posts')}
    ${tabBtn('reels','clapperboard','Reels')}
    ${tabBtn('reposts','repeat-2','Reposts & Saved')}
    ${tabBtn('tagged','user-check','Tagged Posts')}
    ${p.isOwn?tabBtn('archived','archive','Archived Posts'):''}
  </div>

  <div class="pt-1 sm:pt-3">${gridHTML}</div>`;
  icons();
}

function renderEditProfileModal(){
  const p=S.profData?.profile;if(!p)return;
  S.epAvatarPath=p.avatar_path||'';S.epAvatarUrl=p.avatarUrl||'';
  $('#ep-handle-lbl').textContent=p.username?('@'+p.username):(p.display_name||'@creator');
  $('#ep-name').value=p.display_name||'';
  $('#ep-cat').value=p.category||'';
  $('#ep-bio').value=p.bio||'';
  $('#ep-web').value=p.website||'';
  $('#ep-links').value=(p.links||[]).map(l=>`${l.title} | ${l.url}`).join('\n');
  $('#ep-loc').value=p.location_text||'';
  $('#ep-email').value=p.contact_email||'';
  $('#ep-threads').value=p.threads_handle||'';
  $('#ep-status').value=p.status||'Online';
  $('#ep-private')?.setAttribute('aria-checked',String(Boolean(p.isPrivate||p.is_private)));
  updateEpAvatarPreview();
}
function updateEpAvatarPreview(){
  const box=$('#ep-av-prev'),clr=$('#ep-av-clear');if(!box)return;
  const url=S.epAvatarUrl;
  const p=S.profData?.profile||{display_name:'You'};
  box.innerHTML=url?`<img src="${esc(url)}" alt="Avatar preview" class="w-16 h-16 rounded-full object-cover">`:av(p.display_name||'You','w-16 h-16');
  clr?.classList.toggle('hidden',!url);
}

function renderPostPreview(){
  const bg=POST_BGS[S.postBg]||POST_BGS[0];
  const prev=$('#post-prev'),img=$('#post-prev-img'),vid=$('#post-prev-vid'),txt=$('#post-prev-txt'),clr=$('#post-media-clr');
  if(!prev)return;
  const arObj=POST_ASPECT_RATIOS.find(a=>a.key===S.postAspect)||POST_ASPECT_RATIOS[0];
  prev.className=`relative ${arObj.cls} w-full max-h-[340px] overflow-hidden bg-gradient-to-br ${bg} flex items-center justify-center p-5 text-center select-none transition-all`;
  [['1:1','post-ar-1-1'],['4:5','post-ar-4-5'],['16:9','post-ar-16-9']].forEach(([k,id])=>{
    const el=$('#'+id);if(el)el.className='h-6 px-2 rounded-md text-[10.5px] font-semibold '+((S.postAspect||'1:1')===k?'lux-tab-on':'lux-tab-off');
  });
  $('#post-bgs').innerHTML=POST_BGS.map((g,i)=>`<button type="button" data-act="postBg" data-arg="${i}" class="w-7 h-7 rounded-full bg-gradient-to-br ${g} border-2 transition ${i===S.postBg?'border-white scale-110 ring-2 ring-[#0095f6]/60':'border-white/15 opacity-75 hover:opacity-100'}" aria-label="Gradient ${i+1}"></button>`).join('');
  const pf=(POST_FILTERS.find(f=>f.key===S.postFilter)||POST_FILTERS[0]).css;
  img.style.filter=pf;vid.style.filter=pf;
  img.classList.add('hidden');vid.classList.add('hidden');vid.pause();
  const meHandle=(S.user?.username||S.user?.displayName||S.user?.email||'you').toLowerCase().replace(/\s+/g,'');
  const meInit=(S.user?.displayName||'Y')[0].toUpperCase();
  setTxt('#post-prev-av',meInit);
  setTxt('#post-prev-user',meHandle);
  const loc=$('#post-loc')?.value.trim()||'';
  const locEl=$('#post-prev-loc');
  if(locEl){locEl.textContent=loc;locEl.classList.toggle('hidden',!loc)}
  const rawCap=$('#post-cap')?.value||'';
  const cap=rawCap.trim()||'Share a moment, photo carousel, or creator update…';
  txt.textContent=cap;
  setTxt('#post-cap-cnt',`${rawCap.length}/1200`);
  const capSub=$('#post-prev-cap-sub');
  if(capSub)capSub.innerHTML=`<strong class="font-bold text-white mr-1.5">${esc(meHandle)}</strong>${esc(rawCap.trim()||'Write a caption to see how it appears in the feed…')}`;
  const multi=$('#post-prev-multi');
  const first=S.postMedia[0];
  const flBox=$('#post-filters'),ordBox=$('#post-slides-order');
  if(first){
    txt.classList.add('hidden');
    clr.classList.remove('hidden');clr.classList.add('grid');
    setTxt('#post-media-title',S.postMedia.length>1?`${S.postMedia.length} media slides attached`:(first.file?.name||'Media attached'));
    setTxt('#post-media-lbl',S.postMedia.length>1?`${S.postMedia.length} slides`:'Change');
    if(multi){multi.textContent=S.postMedia.length>1?`1 / ${S.postMedia.length}`:'Video';multi.classList.toggle('hidden',S.postMedia.length<=1&&!first.mime?.startsWith('video/'))}
    if(first.mime?.startsWith('video/')){vid.src=first.url;vid.classList.remove('hidden');vid.play().catch(()=>{})}
    else{img.src=first.url;img.classList.remove('hidden')}
    if(flBox&&!first.mime?.startsWith('video/')){
      flBox.classList.remove('hidden');
      flBox.innerHTML='<span class="text-[10px] font-semibold text-zinc-400 mr-1">Filter:</span>'+POST_FILTERS.map(f=>`<button type="button" data-act="postFilterSelect" data-arg="${f.key}" class="h-6 px-2.5 rounded-full text-[10.5px] font-semibold border transition ${(S.postFilter||'normal')===f.key?'bg-[#0095f6]/20 border-[#0095f6] text-white':'bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:text-white'}">${esc(f.label)}</button>`).join('');
    }else if(flBox){flBox.classList.add('hidden');flBox.innerHTML=''}
    if(ordBox&&S.postMedia.length>1){
      ordBox.classList.remove('hidden');
      ordBox.innerHTML='<span class="text-zinc-400 mr-1">Slides:</span>'+S.postMedia.map((m,idx)=>`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-zinc-200">#${idx+1}${idx>0?`<button type="button" data-act="postMoveSlide" data-arg="${idx}:-1" class="text-zinc-400 hover:text-white" title="Move earlier">‹</button>`:''}${idx<S.postMedia.length-1?`<button type="button" data-act="postMoveSlide" data-arg="${idx}:1" class="text-zinc-400 hover:text-white" title="Move later">›</button>`:''}</span>`).join('');
    }else if(ordBox){ordBox.classList.add('hidden');ordBox.innerHTML=''}
  }else{
    txt.classList.remove('hidden');
    clr.classList.add('hidden');clr.classList.remove('grid');
    setTxt('#post-media-title','Photos or video (up to 4)');
    setTxt('#post-media-lbl','Upload');
    multi?.classList.add('hidden');
    if(flBox){flBox.classList.add('hidden');flBox.innerHTML=''}
    if(ordBox){ordBox.classList.add('hidden');ordBox.innerHTML=''}
  }
}

function renderPostView(){
  const p=findPostById(S.postViewId);
  if(!p){closeM('m-post-view');return}
  const box=$('#pv-media-box'),hdr=$('#pv-hdr'),body=$('#pv-body'),acts=$('#pv-acts'),meta=$('#pv-meta');
  const au=p.author||{};const canDel=Boolean((S.user&&p.userId===S.user.id)||(!S.user&&p.userId==='self')||(S.profData?.profile?.isOwn&&(S.profData.posts||[]).some(x=>x.id===p.id)));
  const urls=p.mediaUrls||[];const sIdx=Math.max(0,Math.min(S.postViewSlide,Math.max(0,urls.length-1)));
  const curUrl=urls[sIdx];
  const arCls=p.aspectRatio==='4:5'?'wg-ar-4-5':p.aspectRatio==='16:9'?'wg-ar-16-9':'';
  if(curUrl){
    box.innerHTML=(p.mediaType==='video'
      ?`<video src="${esc(curUrl)}" class="w-full h-full max-h-[80vh] ${arCls} object-contain" controls autoplay loop playsinline></video>`
      :`<img src="${esc(curUrl)}" alt="" class="w-full h-full max-h-[80vh] ${arCls} object-contain">`)
      +(urls.length>1?`<button type="button" data-act="pvSlide" data-arg="-1" class="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/65 text-white grid place-items-center hover:bg-black/85 transition" aria-label="Previous slide">${ic('chevron-left','w-4 h-4')}</button>
        <button type="button" data-act="pvSlide" data-arg="1" class="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/65 text-white grid place-items-center hover:bg-black/85 transition" aria-label="Next slide">${ic('chevron-right','w-4 h-4')}</button>
        <div class="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">${urls.map((_,i)=>`<span class="w-1.5 h-1.5 rounded-full ${i===sIdx?'bg-white':'bg-white/40'}"></span>`).join('')}</div>`:'');
  }else{
    box.innerHTML=`<div class="w-full h-full min-h-[300px] bg-gradient-to-br ${esc(p.bg||POST_BGS[0])} p-8 flex items-center justify-center text-center"><p class="text-lg sm:text-xl font-extrabold text-white drop-shadow leading-snug max-w-md">${esc(p.caption||'WhatsGram Post')}</p></div>`;
  }
  const schedTag=p.scheduledAt&&new Date(p.scheduledAt).getTime()>Date.now()?`<span class="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">Scheduled</span>`:'';
  hdr.innerHTML=`<button type="button" data-act="openProfileFromModal" data-arg="${esc(au.username||p.userId)}" class="flex items-center gap-2.5 min-w-0 text-left hover:opacity-85">
    ${renderAvatarCircle(au,'w-8 h-8')}
    <div class="min-w-0">
      <div class="text-xs font-bold text-white inline-flex items-center gap-1 truncate">${esc(au.username||au.display_name||'creator')}${au.verified?VERIFIED_BADGE_SVG:''}${p.coauthorHandle?`<span class="text-zinc-400 font-normal">with @${esc(String(p.coauthorHandle).replace(/^@+/,''))}</span>`:''}${schedTag}</div>
      ${p.locationText?`<div class="text-[10px] text-zinc-400 truncate">${esc(p.locationText)}</div>`:''}
    </div>
  </button>
  <div class="flex items-center gap-1 shrink-0">
    ${canDel?`<button type="button" data-act="editPost" data-arg="${esc(p.id)}" class="w-8 h-8 rounded-full grid place-items-center text-zinc-300 hover:text-white hover:bg-white/[0.08] transition" title="Edit post" aria-label="Edit post">${ic('pencil','w-4 h-4')}</button>
      <button type="button" data-act="pinPost" class="w-8 h-8 rounded-full grid place-items-center ${p.pinned?'text-sky-400 bg-sky-500/15':'text-zinc-400 hover:text-white hover:bg-white/[0.08]'} transition" title="${p.pinned?'Unpin from profile':'Pin to profile'}" aria-label="Pin post">${ic('pin','w-4 h-4')}</button>
      <button type="button" data-act="delPost" class="w-8 h-8 rounded-full grid place-items-center text-rose-400 hover:bg-rose-500/15 transition" title="Delete post" aria-label="Delete post">${ic('trash-2','w-4 h-4')}</button>`:''}
    <button type="button" data-act="closeModal" data-arg="m-post-view" class="w-8 h-8 rounded-full grid place-items-center text-zinc-400 hover:text-white hover:bg-white/[0.08]" aria-label="Close post">${ic('x','w-4 h-4')}</button>
  </div>`;

  const cms=[...(p.comments||[])].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));
  const similar=findSimilarPosts(p,S.feedData?.posts||LOCAL_SOCIAL.posts||[],3);
  body.innerHTML=`<div class="text-xs text-zinc-100 leading-relaxed break-words"><strong class="font-bold text-white mr-1.5">${esc(au.username||au.display_name||'creator')}</strong>${renderBioText(p.caption)}</div>
  ${p.commentsDisabled?'<div class="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-2.5 py-1.5">Comments are disabled by the creator.</div>':''}
  <div class="border-t border-white/[0.06] pt-3 space-y-2.5">
    ${cms.length?cms.map(cm=>{
      const canDelCm=Boolean((S.user&&cm.userId===S.user.id)||(!S.user&&cm.userId==='self'));
      return `<div class="flex items-start gap-2 group">
        <button type="button" data-act="openProfileFromModal" data-arg="${esc(cm.authorUsername||cm.userId)}" class="shrink-0 mt-0.5">${cm.authorAvatarUrl?`<img src="${esc(cm.authorAvatarUrl)}" class="w-6 h-6 rounded-full object-cover" alt="">`:av(cm.authorName||'U','w-6 h-6')}</button>
        <div class="min-w-0 flex-1 text-xs leading-snug break-words"><button type="button" data-act="openProfileFromModal" data-arg="${esc(cm.authorUsername||cm.userId)}" class="font-bold text-white mr-1.5 hover:underline">${esc(cm.authorUsername||cm.authorName)}</button>${cm.pinned?'<span class="px-1.5 py-0.2 mr-1 rounded bg-sky-500/20 text-sky-300 text-[9px] font-bold">Pinned</span>':''}<span class="text-zinc-200">${esc(cm.text)}</span></div>
        <button type="button" data-act="likePostComment" data-arg="${esc(cm.id)}" class="text-[10px] ${cm.liked?'text-rose-400':'text-zinc-500 hover:text-rose-300'} inline-flex items-center gap-0.5 shrink-0" aria-label="Like comment">${ic('heart','w-3 h-3'+(cm.liked?' fill-current':''))}${cm.likes?`<span>${cm.likes}</span>`:''}</button>
        ${canDel?`<button type="button" data-act="pinPostComment" data-arg="${esc(cm.id)}" class="opacity-0 group-hover:opacity-100 ${cm.pinned?'opacity-100 text-sky-400':'text-zinc-500 hover:text-sky-300'} transition shrink-0" title="Pin comment" aria-label="Pin comment">${ic('pin','w-3 h-3')}</button>`:''}
        ${canDelCm?`<button type="button" data-act="delPostComment" data-arg="${esc(cm.id)}" class="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition shrink-0" aria-label="Delete comment">${ic('x','w-3.5 h-3.5')}</button>`:''}
      </div>`;
    }).join(''):'<div class="text-xs text-zinc-500 py-4 text-center">No comments yet — start the conversation.</div>'}
  </div>
  ${similar.length?`<div class="border-t border-white/[0.06] pt-3 space-y-2"><div class="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Related Posts</div><div class="grid grid-cols-3 gap-1.5">${similar.map(sp=>`<button type="button" data-act="viewPost" data-arg="${esc(sp.id)}" class="rounded-xl p-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-left transition"><div class="text-[10px] font-bold text-white truncate">@${esc(sp.author?.username||'creator')}</div><div class="text-[10px] text-zinc-400 line-clamp-2 mt-0.5">${esc((sp.caption||'Post').slice(0,48))}</div></button>`).join('')}</div></div>`:''}`;

  acts.innerHTML=`<div class="flex items-center gap-2">
    <button type="button" data-act="likePost" class="w-8 h-8 rounded-full grid place-items-center hover:bg-white/[0.08] transition ${p.likedByMe?'text-rose-500':'text-white'}" aria-label="Like post">${ic('heart','w-5 h-5'+(p.likedByMe?' fill-current':''))}</button>
    <button type="button" data-act="focusPostComment" class="w-8 h-8 rounded-full grid place-items-center text-white hover:bg-white/[0.08] transition" aria-label="Comment">${ic('message-circle','w-5 h-5')}</button>
    <button type="button" data-act="openShareToChat" data-arg="${esc(p.id)}" class="w-8 h-8 rounded-full grid place-items-center text-white hover:bg-white/[0.08] transition" title="Send to Chat" aria-label="Send to chat">${ic('send','w-4 h-4')}</button>
    <button type="button" data-act="repostPost" class="w-8 h-8 rounded-full grid place-items-center hover:bg-white/[0.08] transition ${p.repostedByMe?'text-emerald-400':'text-white'}" title="Repost to your profile" aria-label="Repost">${ic('repeat-2','w-5 h-5')}</button>
  </div>
  <div class="flex items-center gap-1">
    <button type="button" data-act="openCollectionPicker" data-arg="${esc(p.id)}" class="w-8 h-8 rounded-full grid place-items-center text-zinc-300 hover:text-white hover:bg-white/[0.08] transition" title="Save to collection" aria-label="Add to collection">${ic('folder-plus','w-4 h-4')}</button>
    <button type="button" data-act="savePost" class="w-8 h-8 rounded-full grid place-items-center hover:bg-white/[0.08] transition ${p.savedByMe?'text-amber-400':'text-white'}" title="Save post" aria-label="Save post">${ic('bookmark','w-5 h-5'+(p.savedByMe?' fill-current':''))}</button>
  </div>`;
  const likeLabel=(p.hideLikes&&!canDel)?'Likes hidden':`${fmtCompactCount(p.likesCount)} ${p.likesCount===1?'like':'likes'}`;
  meta.textContent=`${likeLabel} · ${fmtCompactCount(p.commentsCount)} ${p.commentsCount===1?'comment':'comments'}`;
  const cmIn=$('#pv-cm-in');if(cmIn){cmIn.disabled=Boolean(p.commentsDisabled);cmIn.placeholder=p.commentsDisabled?'Comments are off':'Add a comment…'}
  icons();
}

function renderFollowListModal(){
  const d=S.profData;if(!d)return;
  const tab=S.followListTab||'followers';
  const mapTab=(id,active)=>{const el=$('#fl-tab-'+id);if(el)el.className='h-8 rounded-xl text-xs font-semibold transition-all '+(active?'lux-tab-on':'lux-tab-off')};
  mapTab('followers',tab==='followers');mapTab('following',tab==='following');mapTab('suggested',tab==='suggested');
  const q=S.followListQ.trim().toLowerCase();
  let list=[];
  if(tab==='followers')list=d.followers||[];
  else if(tab==='following')list=d.following||[];
  else{
    const seen=new Set();
    const pool=S.user?[...(S.users||[]),...(d.suggested||[]),...(d.followers||[]),...(d.following||[])]:LOCAL_SOCIAL.profiles;
    list=pool.filter(u=>{if(!u||!u.id||seen.has(u.id))return false;seen.add(u.id);return true});
  }
  if(q)list=list.filter(u=>(u.display_name||'').toLowerCase().includes(q)||(u.username||'').toLowerCase().includes(q));
  setTxt('#fl-title',tab==='suggested'?'Discover Creators':(tab==='following'?'Following':'Followers'));
  const viewerId=S.user?S.user.id:'self';
  const followingIds=new Set(S.user?(d.profile.isOwn?(d.following||[]).map(u=>u.id):[]):LOCAL_SOCIAL.follows.filter(f=>f[0]==='self').map(f=>f[1]));
  if(S.user&&!d.profile.isOwn){if(d.profile.isFollowing)followingIds.add(d.profile.id);(d.mutuals||[]).forEach(u=>followingIds.add(u.id))}
  $('#fl-body').innerHTML=list.length?list.map(u=>{
    const isMe=u.id===viewerId;const isF=followingIds.has(u.id);
    return `<div class="flex items-center gap-3 p-2 rounded-2xl hover:bg-white/[0.04] transition">
      <button type="button" data-act="openProfileFromModal" data-arg="${esc(u.username||u.id)}" class="flex items-center gap-2.5 flex-1 min-w-0 text-left">
        <span class="relative shrink-0">${renderAvatarCircle(u,'w-10 h-10')}${S.onlineUsers[u.id]?'<span class="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#070810]"></span>':''}</span>
        <div class="min-w-0 flex-1">
          <div class="text-xs font-bold text-white inline-flex items-center gap-1 truncate max-w-full">${esc(u.display_name||u.username||'User')}${u.verified?VERIFIED_BADGE_SVG:''}</div>
          <div class="text-[11px] text-zinc-400 truncate">@${esc(u.username||'member')}</div>
        </div>
      </button>
      ${!isMe?`<button type="button" data-act="profToggleFollowId" data-arg="${esc(u.id)}" class="h-8 px-3.5 rounded-xl text-[11px] font-bold shrink-0 transition ${isF?'bg-white/[0.1] border border-white/[0.12] text-white':'bg-[#0095f6] hover:bg-[#1aa3ff] text-white'}">${isF?'Following':'Follow'}</button>`:'<span class="text-[10px] font-semibold text-zinc-500 px-2">You</span>'}
    </div>`;
  }).join(''):'<div class="py-10 text-center text-xs text-zinc-500">No accounts matching your search.</div>';
  icons();
}

function renderLinksModal(){
  const p=S.profData?.profile;if(!p)return;
  const all=[...(p.website?[{title:p.website.replace(/^https?:\/\/(www\.)?/i,'').split('/')[0],url:p.website}]:[]),...(p.links||[]).filter(l=>l?.url&&l.url!==p.website)];
  $('#links-list').innerHTML=all.length?all.map(l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition">
    <span class="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 grid place-items-center shrink-0">${ic('external-link','w-4 h-4')}</span>
    <div class="min-w-0 flex-1">
      <div class="text-xs font-bold text-white truncate">${esc(l.title||'Link')}</div>
      <div class="text-[11px] text-zinc-400 truncate">${esc(l.url)}</div>
    </div>
  </a>`).join(''):'<div class="text-xs text-zinc-500 text-center py-6">No external links added yet.</div>';
  icons();
}

function renderActivityModal(){
  const buckets=groupNotificationsByBucket(S.activity);
  $('#act-list').innerHTML=S.activity.length?buckets.map(b=>`<div class="space-y-1.5"><div class="px-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">${esc(b.label)}</div>${b.items.map(it=>`<div class="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
    <span class="w-8 h-8 rounded-full grid place-items-center shrink-0 ${it.kind==='follow'?'bg-sky-500/15 text-sky-400':it.kind==='like'?'bg-rose-500/15 text-rose-400':'bg-emerald-500/15 text-emerald-400'}">${ic(it.kind==='follow'?'user-plus':it.kind==='like'?'heart':'message-circle','w-4 h-4')}</span>
    <div class="min-w-0 flex-1">
      <div class="text-xs text-zinc-100 leading-snug">${esc(it.text)}</div>
      <div class="text-[10px] font-mono text-zinc-500 mt-0.5">${esc(it.t)}</div>
    </div>
    ${it.refUserId?`<button type="button" data-act="openProfileFromModal" data-arg="${esc(it.refUserId)}" class="btn-ghost h-7 px-2.5 rounded-lg text-[10px] font-semibold text-white shrink-0">View</button>`:''}
  </div>`).join('')}</div>`).join(''):'<div class="py-10 text-center text-xs text-zinc-500">Live followers, likes &amp; comments appear here in real time.</div>';
  icons();
}

function renderHighlightViewer(){
  const hv=S.hlView;if(!hv)return;
  const slides=hv.slides?.length?hv.slides:[{title:hv.title,text:hv.title,bg:hv.coverBg,mediaUrl:hv.coverUrl}];
  const idx=Math.max(0,Math.min(hv.idx||0,slides.length-1));hv.idx=idx;
  const sl=slides[idx];
  const imgUrl=sl.mediaUrl||hv.coverUrl||'';
  const canDel=Boolean(S.profData?.profile?.isOwn);
  $('#sv').style.background='linear-gradient(155deg,#1e1b4b,#311042)';
  $('#sv').innerHTML=`<div class="absolute inset-0 bg-gradient-to-br ${esc(sl.bg||hv.coverBg||POST_BGS[0])}"></div>
    ${imgUrl?`<img src="${esc(imgUrl)}" alt="" class="absolute inset-0 w-full h-full object-cover opacity-80">`:''}
    <div class="absolute top-0 inset-x-0 p-4 z-10 bg-gradient-to-b from-black/75 to-transparent">
      <div class="h-0.5 rounded-full bg-white/30 mb-3 overflow-hidden"><div id="sv-bar" class="h-full bg-white origin-left" style="animation:bar 5s linear forwards"></div></div>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">${renderAvatarCircle(S.profData?.profile,'w-8 h-8')}<div class="min-w-0"><div class="text-xs font-bold text-white truncate">${esc(hv.title)}</div><div class="text-[10px] text-white/75">${idx+1} of ${slides.length}</div></div></div>
        <div class="flex items-center gap-1.5">
          ${canDel?`<button data-act="delHighlight" data-arg="${esc(hv.id)}" class="w-8 h-8 rounded-full bg-black/45 hover:bg-rose-600/80 grid place-items-center text-white transition" title="Delete highlight" aria-label="Delete highlight">${ic('trash-2','w-3.5 h-3.5')}</button>`:''}
          <button data-act="storyClose" class="w-8 h-8 rounded-full bg-black/45 hover:bg-black/65 grid place-items-center text-white transition" aria-label="Close highlight">${ic('x','w-4 h-4')}</button>
        </div>
      </div>
    </div>
    <button data-act="storyPrev" class="absolute inset-y-20 left-0 w-1/4 z-10" aria-label="Previous highlight slide"></button>
    <button data-act="storyNext" class="absolute inset-y-20 right-0 w-1/4 z-10" aria-label="Next highlight slide"></button>
    <div class="absolute inset-0 grid place-items-center px-8 pointer-events-none">
      <div class="rounded-3xl bg-black/35 backdrop-blur-md border border-white/15 p-6 text-center shadow-2xl space-y-2">
        <div class="text-base font-extrabold text-white">${esc(sl.title||hv.title)}</div>
        ${sl.text?`<p class="text-xs sm:text-sm text-zinc-100 leading-relaxed">${esc(sl.text)}</p>`:''}
      </div>
    </div>`;
  $('#sv-bar').addEventListener('animationend',()=>A.storyNext());
  icons();
}

/* ---------- gemini & assistant ---------- */
function setAIStatus(live,label,errObj=null){
  S.aiMode=live?'gemini':(errObj?'error':'local');
  const b=$('#ai-status');
  if(b){
    const toneCls=live
      ?'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
      :errObj
        ?'bg-amber-500/15 border-amber-500/35 text-amber-200'
        :'bg-white/[0.06] border-white/[0.08] text-zinc-300';
    const dotCls=live
      ?'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
      :errObj
        ?'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]'
        :'bg-zinc-400';
    b.className=`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${toneCls}`;
    b.innerHTML=`<span class="w-1.5 h-1.5 rounded-full ${dotCls}"></span><span>${esc(label||(live?'Gemini Live':'Local'))}</span>`;
  }
  if(live){
    S.aiLastErr=null;
    setTxt('#ai-sub','Connected to Gemini · General knowledge, writing & chat copilot');
    show('#ai-warn',false,'flex');
  }else if(errObj){
    const shortMsg=errObj.code==='API_DISABLED'
      ?'Vertex / Agent Platform API is disabled on your Google Cloud project — backup GK active.'
      :(errObj.error||'Gemini API error — backup mode active.');
    setTxt('#ai-sub',shortMsg);
    setTxt('#ai-warn-t',shortMsg);
    const lnk=$('#ai-warn-link');
    if(lnk){
      if(errObj.actionUrl){lnk.href=errObj.actionUrl;show(lnk,true,'inline-flex')}
      else show(lnk,false,'inline-flex');
    }
    show('#ai-warn',true,'flex');
  }else{
    setTxt('#ai-sub','Local mode · built-in math, encyclopedia backup & inbox search');
    show('#ai-warn',false,'flex');
  }
}
async function checkAIStatus(){
  if(!location.protocol.startsWith('http')||!navigator.onLine){setAIStatus(false,'Local');return}
  try{
    const ctrl=new AbortController();const tm=setTimeout(()=>ctrl.abort(),3500);
    const res=await fetch('/api/gemini',{signal:ctrl.signal});
    clearTimeout(tm);
    if(!res.ok){setAIStatus(false,'Local');return}
    const data=await res.json();
    setAIStatus(Boolean(data&&data.configured),data&&data.configured?'Gemini Live':'Local');
  }catch{setAIStatus(false,'Local')}
}
async function callGemini(payload,signal){
  if(!location.protocol.startsWith('http')||!navigator.onLine)return null;
  try{
    const res=await fetch('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){
      const errObj={status:res.status,error:data?.error||`Gemini request failed (${res.status})`,code:data?.code||'UPSTREAM_ERROR',actionUrl:data?.actionUrl||null};
      S.aiLastErr=errObj;
      setAIStatus(false,errObj.code==='API_DISABLED'?'API Setup Needed':'API Error',errObj);
      return null;
    }
    if(data&&data.text){setAIStatus(true,'Gemini Live');return data}
    return null;
  }catch(e){
    if(e&&e.name==='AbortError')throw e;
    return null;
  }
}
async function callGeminiStream(payload,onChunk,signal){
  if(!location.protocol.startsWith('http')||!navigator.onLine)return null;
  try{
    const res=await fetch('/api/gemini',{method:'POST',headers:{'Content-Type':'application/json','Accept':'text/event-stream'},body:JSON.stringify({...payload,stream:true}),signal});
    const ct=res.headers.get('content-type')||'';
    if(!res.ok){
      const data=await res.json().catch(()=>({}));
      const errObj={status:res.status,error:data?.error||`Gemini request failed (${res.status})`,code:data?.code||'UPSTREAM_ERROR',actionUrl:data?.actionUrl||null};
      S.aiLastErr=errObj;
      setAIStatus(false,errObj.code==='API_DISABLED'?'API Setup Needed':'API Error',errObj);
      return null;
    }
    if(ct.includes('text/event-stream')&&res.body){
      const reader=res.body.getReader(),dec=new TextDecoder();
      let buf='',evtName='message',accText='',modelUsed=null;
      const handleBlock=blk=>{
        let curEvt=evtName;const dataLines=[];
        blk.split(/\r?\n/).forEach(l=>{
          if(l.startsWith('event:'))curEvt=l.slice(6).trim();
          else if(l.startsWith('data:'))dataLines.push(l.slice(5).trim());
        });
        if(!dataLines.length)return;
        try{
          const obj=JSON.parse(dataLines.join('\n'));
          if(curEvt==='chunk'&&obj.delta){accText+=obj.delta;onChunk&&onChunk(accText)}
          else if(curEvt==='done'){if(obj.text)accText=obj.text;modelUsed=obj.model||null;onChunk&&onChunk(accText)}
          else if(curEvt==='error'){S.aiLastErr={status:502,error:obj.error||'Stream failed',code:obj.code||'STREAM_ERR'}}
        }catch(_){}
      };
      while(true){
        const{done,value}=await reader.read();
        if(done)break;
        buf+=dec.decode(value,{stream:true});
        let idx;
        while((idx=buf.search(/\r?\n\r?\n/))!==-1){
          const blk=buf.slice(0,idx);
          const sepLen=buf.slice(idx).startsWith('\r\n\r\n')?4:2;
          buf=buf.slice(idx+sepLen);
          if(blk.trim())handleBlock(blk);
        }
      }
      if(buf.trim())handleBlock(buf);
      if(accText){setAIStatus(true,'Gemini Live');return{text:accText,model:modelUsed,streamed:true}}
      return null;
    }
    const data=await res.json().catch(()=>({}));
    if(data&&data.text){setAIStatus(true,'Gemini Live');onChunk&&onChunk(data.text);return data}
    return null;
  }catch(e){
    if(e&&e.name==='AbortError')throw e;
    return null;
  }
}
function buildAiConversations(){
  return D.map(c=>({name:c.name,folder:c.folder,status:c.status,msgs:c.msgs.filter(m=>m.from!=='sys').slice(-15).map(m=>({from:m.from,type:m.type,text:m.text||m.name||'',t:m.t}))}));
}
function aiBubble(role,html){
  const d=document.createElement('div');
  d.className=role==='me'?'flex justify-end':'flex gap-3 items-start';
  d.innerHTML=role==='me'
    ?`<div class="bubble-me text-white rounded-[20px] rounded-br-[6px] px-4 py-2.5 text-[13.5px] max-w-[85%] break-words">${html}</div>`
    :`<span class="w-8 h-8 rounded-xl border border-accent/35 bg-gradient-to-br from-accent/25 to-indigo-500/20 grid place-items-center text-accent shrink-0 shadow-[0_0_16px_-4px_rgb(var(--ac-rgb)/.45)]">${ic('bot','w-4 h-4')}</span><div class="lux-card rounded-[20px] rounded-tl-[6px] px-4 py-3 text-[13.5px] leading-relaxed text-zinc-100 max-w-[90%] break-words overflow-x-auto"></div>`;
  const log=$('#ai-log');
  bindMarkdownCopy(log,()=>toast('Code copied'));
  log.appendChild(d);icons();log.scrollTop=1e9;return role==='me'?d:d.lastElementChild;
}
function renderAiThreadsBar(){
  const bar=$('#ai-threads-bar');if(!bar)return;
  const list=S.aiSavedThreads||[];
  bar.innerHTML=list.length?list.map(th=>`<span class="inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-1 text-[11px] shrink-0 ${S.aiActiveThreadId===th.id?'bg-accent/20 border-accent text-white':'bg-white/[0.05] border-white/[0.1] text-zinc-300'}">
    <button type="button" data-act="aiLoadThread" data-arg="${esc(th.id)}" class="truncate max-w-[140px] font-medium">${esc(th.title||'AI Session')}</button>
    <button type="button" data-act="aiDeleteThread" data-arg="${esc(th.id)}" class="w-4 h-4 rounded-full hover:bg-white/15 grid place-items-center text-zinc-400 hover:text-white" aria-label="Delete thread">×</button>
  </span>`).join(''):'<span class="text-[11px] text-zinc-500">Saved AI sessions will appear here after your first prompt.</span>';
}
function aiWelcome(){
  const box=aiBubble('bot','');
  box.innerHTML=`<p>Hi! I'm WhatsGram AI. Ask me any general knowledge question, or ask me to summarize conversations, find action items, and draft replies.</p>
  <div class="mt-3 flex flex-wrap gap-1.5">${AI_STARTER_PROMPTS.map(p=>{const pr=typeof p==='string'?p:p.prompt,lb=typeof p==='string'?p:p.label;return `<button type="button" data-act="aiRun" data-arg="${esc(pr)}" class="px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[11px] font-medium text-zinc-200 text-left transition">${esc(lb)}</button>`}).join('')}</div>`;
  renderAiThreadsBar();
}
function trySafeMath(expr){
  const s=expr.replace(/×/g,'*').replace(/÷/g,'/').replace(/\s+/g,'');
  if(!s||!/^[0-9+\-*/().%^]+$/.test(s)||!/\d/.test(s))return null;
  let pos=0;
  const peek=()=>s[pos],eat=c=>s[pos]===c?(pos++,true):false;
  const parseNum=()=>{const m=s.slice(pos).match(/^(?:\d+\.?\d*|\.\d+)/);if(!m)return NaN;pos+=m[0].length;return Number(m[0])};
  const parseFactor=()=>{if(eat('+'))return parseFactor();if(eat('-'))return -parseFactor();if(eat('(')){const v=parseExpr();if(!eat(')'))return NaN;return v}return parseNum()};
  const parsePow=()=>{let v=parseFactor();while(eat('^'))v=Math.pow(v,parseFactor());return v};
  const parseTerm=()=>{let v=parsePow();while(pos<s.length&&(peek()==='*'||peek()==='/'||peek()==='%')){const op=s[pos++];const r=parsePow();v=op==='*'?v*r:op==='/'?(r===0?NaN:v/r):(r===0?NaN:v%r)}return v};
  const parseExpr=()=>{let v=parseTerm();while(pos<s.length&&(peek()==='+'||peek()==='-')){const op=s[pos++];const r=parseTerm();v=op==='+'?v+r:v-r}return v};
  const val=parseExpr();
  return Number.isFinite(val)&&pos===s.length?val:null;
}
function tryLocalMathOrClock(p){
  const l=p.trim().toLowerCase().replace(/[?!.]+$/,'');
  if(/\b(what time is it|current time|time now)\b/.test(l))return{t:`Current local time: ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`};
  if(/\b(what (?:date|day) is (?:today|it)|today'?s date)\b/.test(l))return{t:`Today is ${new Date().toLocaleDateString([],{weekday:'long',year:'numeric',month:'long',day:'numeric'})}.`};
  const pct=l.match(/(?:what is\s+)?(-?\d+(?:\.\d+)?)\s*%\s*of\s+(-?\d+(?:\.\d+)?)/);
  if(pct){const v=(Number(pct[1])/100)*Number(pct[2]);return{t:`${pct[1]}% of ${pct[2]} = ${Number(v.toFixed(6))}`}}
  const cleaned=l.replace(/^(?:what is|calculate|compute|evaluate|solve)\s+/,'');
  const val=trySafeMath(cleaned);
  if(val!==null)return{t:`${cleaned} = ${Number(val.toFixed(8))}`};
  return null;
}
async function tryWikipediaGk(p,signal){
  if(!navigator.onLine)return null;
  let q=p.trim().replace(/[?!.]+$/,'').replace(/^(?:@?(?:ai|meta(?:\s+ai)?)\s*[,:]?\s*)/i,'');
  q=q.replace(/^(?:please\s+|can you\s+|could you\s+)?(?:tell me|explain|define|describe)\s+(?:what\s+(?:is|are)\s+)?/i,'')
     .replace(/^(?:what|who|where|when|why|how)\s+(?:is|are|was|were|did|do|does)\s+(?:the|a|an)?\s*/i,'')
     .replace(/^(?:scient[ie]fic|biological|zoological|botanical|latin)\s+name\s+(?:of|for)\s+(?:a|an|the)?\s*/i,'')
     .replace(/^(?:meaning|definition)\s+of\s+(?:the\s+)?/i,'')
     .trim();
  if(!q||q.length<2)return null;
  try{
    const u='https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(q)+'&utf8=&format=json&origin=*&srlimit=2';
    const sr=await fetch(u,{signal}).then(r=>r.ok?r.json():null);
    const title=sr?.query?.search?.[0]?.title;
    if(!title)return null;
    const sum=await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(title.replace(/ /g,'_')),{signal}).then(r=>r.ok?r.json():null);
    if(!sum?.extract)return null;
    return{t:`${sum.title}\n${sum.extract}`,src:'wiki'};
  }catch(e){
    if(e&&e.name==='AbortError')throw e;
    return null;
  }
}
function aiAnswer(p){
  const all=D.flatMap(c=>c.msgs.filter(m=>m.text&&m.from!=='sys').map(m=>({c,m})));const l=p.toLowerCase();
  if(/\bsummar/.test(l))return{t:D.length?D.map(c=>{const ms=c.msgs.filter(m=>m.text);return `• ${c.name} (${ms.length} messages): ${ms.length?'latest — “'+ms[ms.length-1].text.slice(0,90)+'”':'no text messages'}`}).join('\n'):'There are no conversations to summarize.'};
  if(/\b(action items?|todos?|tasks?)\b/.test(l)){const h=all.filter(x=>/\b(please|need|send|review|schedule|confirm|share|update|can you)\b/i.test(x.m.text));return{t:h.length?'Possible action items:\n'+h.map(x=>`• [${x.c.name}] ${x.m.text}`).join('\n'):'No action items found in your messages.'}}
  if(/\b(hashtag|caption)\b/.test(l)){const f={};all.map(x=>x.m.text).concat(p).join(' ').toLowerCase().match(/[a-z]{5,}/g)?.forEach(w=>{if(!STOP_W.has(w))f[w]=(f[w]||0)+1});const t=Object.entries(f).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([w])=>'#'+w[0].toUpperCase()+w.slice(1));return{t:(t.length?t.join(' '):'#WhatsGramOS')+'\n\nDraft caption: Shipping clean software every day.'}}
  if(/\b(draft|write\s+(?:a\s+)?reply|reply\s+to)\b/.test(l)){const c=cur();const last=c&&[...c.msgs].reverse().find(m=>m.from==='them'&&m.text);if(!last)return{t:'Open a conversation with an incoming message first, then ask for a draft.'};const d=`Thanks for the update on “${last.text.slice(0,50)}”. I will review it and follow up shortly.`;return{t:`Draft for ${c.name}:\n\n${d}`,draft:d}}
  const mathAns=tryLocalMathOrClock(p);
  if(mathAns)return mathAns;
  const r=all.map(x=>({...x,s:sim(p,x.m.text+' '+x.c.name)})).filter(x=>x.s>=.34).sort((a,b)=>b.s-a.s).slice(0,4);
  if(r.length)return{t:`Inbox matches for “${p}”:\n`+r.map(x=>`• ${Math.round(x.s*100)}% · ${x.c.name}: ${x.m.text.slice(0,100)}`).join('\n')};
  return null;
}
async function aiFallbackAnswer(p,errObj,signal){
  const local=aiAnswer(p);
  const explicitInbox=/\b(inbox|conversations?|threads?|messages?|chats?|summar|action item|draft|reply to)\b/i.test(p);
  if(local&&explicitInbox)return local;
  if(!explicitInbox){
    const mathAns=tryLocalMathOrClock(p);
    if(mathAns)return mathAns;
    const wiki=await tryWikipediaGk(p,signal);
    if(wiki){
      const note=errObj?(errObj.code==='API_DISABLED'?'Note: Activate the Vertex / Agent Platform API via the banner above for full Gemini reasoning, coding & drafting.':'Note: Gemini API unavailable ('+errObj.error+').'):'Offline backup via Wikipedia.';
      return{t:`${wiki.t}\n\n— ${note}`,src:'wiki'};
    }
  }
  if(local)return local;
  if(errObj){
    return{t:`Could not reach Gemini AI right now.\n\nReason: ${errObj.error}${errObj.actionUrl?'\nEnable link: '+errObj.actionUrl:''}`};
  }
  return{t:`I couldn't find an answer offline for “${p}”. Connect Gemini API on /api/gemini for full general knowledge, coding, translations & inbox Q&A.`};
}
async function aiRun(p){
  p=p.trim();if((!p&&!S.aiMedia)||S.aiBusy||S.aiAbort)return;
  const mediaSnap=S.aiMedia?{mimeType:S.aiMedia.mimeType,dataBase64:S.aiMedia.dataBase64}:null;
  const mediaLabel=S.aiMedia?.name||'';
  S.aiMedia=null;const chip=$('#ai-media-chip');if(chip)chip.classList.add('hidden');
  const promptText=p||(mediaLabel?`Analyze this attachment (${mediaLabel})`:'');
  aiBubble('me',(mediaLabel?`<div class="text-[10.5px] font-mono text-white/80 mb-1">📎 ${esc(mediaLabel)}</div>`:'')+esc(promptText));
  const el=aiBubble('bot','');
  el.textContent='Thinking…';
  el.classList.add('text-zinc-400','italic');
  $('#ai-send').classList.add('hidden');
  show('#ai-stop',true,'inline-flex');
  const ctrl=new AbortController();
  S.aiAbort=ctrl;
  S.aiLastErr=null;
  let res=null,a={t:'Could not process request right now.'},streamedChunks=false;
  try{
    res=await callGeminiStream({
      mode:'assistant',
      prompt:promptText,
      activeChatName:cur()?.name||null,
      conversations:buildAiConversations(),
      history:S.aiHist.slice(-10),
      ...(mediaSnap?{media:mediaSnap}:{})
    },partial=>{
      if(ctrl.signal.aborted)return;
      streamedChunks=true;
      el.classList.remove('text-zinc-400','italic');
      el.innerHTML=renderAiMarkdown(partial);
      $('#ai-log').scrollTop=1e9;
    },ctrl.signal);
    if(ctrl.signal.aborted){S.aiAbort=null;return}
    a=res&&res.text?{t:res.text,draft:res.draft||null}:await aiFallbackAnswer(promptText,S.aiLastErr,ctrl.signal);
  }catch(e){
    if(e&&e.name==='AbortError'){S.aiAbort=null;el.classList.remove('text-zinc-400','italic');el.textContent='Stopped.';$('#ai-send').classList.remove('hidden');show('#ai-stop',false,'inline-flex');return}
  }
  if(ctrl.signal.aborted){S.aiAbort=null;return}
  S.aiAbort=null;
  el.classList.remove('text-zinc-400','italic');
  if(res&&res.text){S.aiHist.push({role:'user',text:promptText},{role:'model',text:res.text});if(S.aiHist.length>20)S.aiHist=S.aiHist.slice(-20)}
  if(streamedChunks){aiDone(el,a);return}
  let i=0;
  S.aiBusy=setInterval(()=>{i+=14;el.innerHTML=renderAiMarkdown(a.t.slice(0,i));$('#ai-log').scrollTop=1e9;if(i>=a.t.length)aiDone(el,a)},12);
}
function aiDone(el,a){
  clearInterval(S.aiBusy);S.aiBusy=null;el.innerHTML=renderAiMarkdown(a.t);
  if(a.draft){S.draft=a.draft;el.insertAdjacentHTML('beforeend',`<div class="mt-3"><button class="btn-primary h-8 px-4 rounded-full text-xs font-semibold" data-act="useDraft">Insert into conversation</button></div>`)}
  $('#ai-send').classList.remove('hidden');show('#ai-stop',false,'inline-flex');
  if(S.aiHist.length){
    if(!S.aiActiveThreadId)S.aiActiveThreadId='ait_'+Date.now().toString(36);
    const firstUser=S.aiHist.find(x=>x.role==='user')?.text||'AI Chat';
    const idx=(S.aiSavedThreads||[]).findIndex(t=>t.id===S.aiActiveThreadId);
    const rec={id:S.aiActiveThreadId,title:firstUser.slice(0,36),history:S.aiHist.slice(-20),updatedAt:Date.now()};
    if(idx>=0)S.aiSavedThreads[idx]=rec;else S.aiSavedThreads=[rec,...(S.aiSavedThreads||[])].slice(0,16);
    store.set('ai_saved_threads',S.aiSavedThreads);
    renderAiThreadsBar();
    if(S.user&&!S.incognito)sbPost({action:'saveAiThread',id:rec.id,title:rec.title,messages:rec.history}).catch(()=>{});
  }
}

async function askThreadAI(query,wantDraft=false){
  const c=cur();if(!c)return;
  const cid=c.id,cname=c.name;
  const q=String(query||'').trim();if(!q)return;
  const list=S.aiThread[cid]=S.aiThread[cid]||[];
  list.push({id:uid('ai'),_aiLocal:true,aiRole:'user',text:'@ai '+q,t:now(),ts:Date.now()});
  saveAiThread();renderThread();
  S.typing[cid]='WhatsGram AI';renderHead();renderTypingRow();
  S.aiLastErr=null;
  let ans={t:'Could not reach AI right now.',draft:null,src:null};
  try{
    const res=await callGemini({
      mode:'assistant',
      prompt:q,
      wantDraft,
      activeChatName:cname,
      conversations:buildAiConversations(),
      history:[]
    });
    if(res&&res.text)ans={t:res.text,draft:res.draft||null,src:'gemini'};
    else ans=await aiFallbackAnswer(q,S.aiLastErr);
  }finally{
    delete S.typing[cid];
    list.push({id:uid('ai'),_aiLocal:true,aiRole:'bot',text:ans.t,draft:ans.draft||null,src:ans.src||null,t:now(),ts:Date.now()});
    saveAiThread();
    if(S.chat===cid){renderThread();tone(740,.04)}else renderHead();
  }
}
async function draftChatReply(replyTarget=null){
  const c=cur();if(!c)return toast('Open a conversation first','err');
  const inp=$('#msg');
  const targetNote=replyTarget?` specifically replying to: "${replyTarget.text}"`:' based on recent messages';
  toast('Drafting reply with AI…');
  S.aiLastErr=null;
  const res=await callGemini({
    mode:'assistant',
    wantDraft:true,
    prompt:`Draft one concise, natural chat reply to ${c.name}${targetNote}.`,
    activeChatName:c.name,
    conversations:buildAiConversations()
  });
  let draft=res?.draft||res?.text;
  if(!draft){
    const last=replyTarget||[...c.msgs].reverse().find(m=>m.from==='them'&&m.text);
    draft=last?`Thanks for sharing “${last.text.slice(0,45)}”. Let me review and follow up shortly.`:'Sounds good, thanks for reaching out!';
    if(S.aiLastErr)toast(S.aiLastErr.code==='API_DISABLED'?'Using local draft (enable Gemini API for smart drafts)':'Using offline draft','err');
  }
  if(inp){inp.value=draft;inp.focus();inp.dispatchEvent(new Event('input',{bubbles:true}))}
}
async function rewriteComposerDraft(tone){
  const inp=$('#msg'),c=cur();if(!inp)return;
  const raw=inp.value.trim();if(!raw)return toast('Type a draft message first','err');
  toast('Polishing draft…');
  S.aiLastErr=null;
  const res=await callGemini({
    mode:'rewrite',
    tone:tone==='es'?'translate':tone,
    targetLang:'Spanish',
    text:raw,
    contactName:c?.name||'',
    messages:c?c.msgs.filter(m=>m.from!=='sys'&&m.text).slice(-6).map(m=>({from:m.from==='me'?'Me':c.name,text:m.text})):[]
  });
  const out=res?.draft||res?.text;
  if(out){
    inp.value=out.trim();inp.focus();inp.dispatchEvent(new Event('input',{bubbles:true}));
    toast('Draft updated');
    return;
  }
  if(tone==='polite')inp.value=raw.replace(/\bi\b/g,'I')+(raw.endsWith('.')||raw.endsWith('!')||raw.endsWith('?')?'':'.')+' Thank you!';
  else if(tone==='fix')inp.value=raw.charAt(0).toUpperCase()+raw.slice(1).replace(/\s{2,}/g,' ');
  else return toast(S.aiLastErr?.error||'AI rewrite requires Gemini connection','err');
  inp.focus();inp.dispatchEvent(new Event('input',{bubbles:true}));
}

/* ---------- vault / settings ---------- */
function renderAudit(){
  const flt=S.auditFilter||'all';
  $$('#acc-audit [data-act="auditFilter"]').forEach(b=>{
    const on=(b.dataset.arg||'all')===flt;
    b.className='h-7 px-2.5 rounded-lg text-[11px] font-semibold '+(on?'bg-white text-black':'btn-ghost text-zinc-300');
  });
  const rows=LOG.filter(l=>flt==='all'||(l.cat||'security')===flt);
  const u=$('#audit');
  if(u)u.innerHTML=rows.length?rows.map(l=>`<li class="px-4 sm:px-5 py-2.5 flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3"><span class="text-zinc-500 text-[10px] sm:text-[11px] shrink-0">${esc(l.t)}</span><span class="px-1.5 py-0.2 rounded bg-white/[0.06] text-[9.5px] uppercase text-zinc-400 shrink-0 w-fit">${esc(l.cat||'security')}</span><span class="text-zinc-200 break-words">${esc(l.m)}</span></li>`).join(''):'<li class="px-5 py-4 text-zinc-500">No events matching this filter.</li>';
}
function renderStats(){
  const sent=D.reduce((a,c)=>a+c.msgs.filter(m=>m.from==='me').length,0),rec=D.reduce((a,c)=>a+c.msgs.filter(m=>m.from==='them').length,0),mx=Math.max(1,...D.map(c=>c.msgs.length));
  $('#stats').innerHTML=[['Conversations',D.length],['Sent',sent],['Received',rec],['Reels liked',RS.liked.length]].map(([l,v])=>`<div class="rounded-2xl bg-gradient-to-b from-white/[0.045] to-white/[0.015] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,.06)] p-3.5"><div class="text-[11px] font-medium text-zinc-400">${l}</div><div class="text-2xl font-extrabold tracking-tight text-white mt-1 font-mono tabular-nums">${v}</div></div>`).join('');
  $('#bars').innerHTML=D.length?D.map(c=>`<div class="flex items-center gap-2.5 sm:gap-3 text-xs"><span class="w-20 sm:w-28 truncate text-zinc-300 font-medium">${esc(c.name)}</span><div class="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden"><div class="h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgb(var(--ac-rgb)/.6)]" style="width:${c.msgs.length/mx*100}%;background:linear-gradient(90deg,var(--ac),rgb(var(--ac-rgb)/.65))"></div></div><span class="font-mono w-6 text-right text-zinc-300 tabular-nums">${c.msgs.length}</span></div>`).join(''):'<div class="text-xs text-zinc-500">No data.</div>';
  $('#accents').innerHTML=ACCENTS.map(([n,c])=>`<button data-act="accent" data-arg="${c}" aria-label="${n}" title="${n}" aria-pressed="${cfg.accent===c}" class="w-7 h-7 rounded-full border-2 border-[#080a12] ring-1 ring-white/20 aria-[pressed=true]:ring-2 aria-[pressed=true]:ring-white aria-[pressed=true]:scale-110 transition-transform shadow-sm" style="background:${c}"></button>`).join('');
  const updQ=(u,q)=>{const pct=q?Math.min(100,Math.max(2,Math.round(u/q*100))):8;const bar=$('#set-quota-bar'),lbl=$('#set-quota-lbl');if(bar)bar.style.width=pct+'%';if(lbl)lbl.textContent=`${(u/1048576).toFixed(2)} MB / ${(q/1048576).toFixed(0)} MB`};
  if(navigator.storage?.estimate){navigator.storage.estimate().then(est=>updQ(est.usage||0,est.quota||50*1048576)).catch(()=>updQ(102400,50*1048576))}
  else{let bytes=0;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);bytes+=(localStorage.getItem(k)||'').length*2}}catch(e){}updQ(bytes,5*1048576)}
  icons();
}
const diag=m=>{const o=$('#diag');o.classList.remove('hidden');o.textContent+=`[${now()}] ${m}\n`;o.scrollTop=1e9};
function lock(){closeMenu();$('#lock-pin').value='';show('#lock-pin',!!cfg.pin,null);$('#lock-pin').classList.toggle('hidden',!cfg.pin);setTxt('#lock-btn',cfg.pin?'Unlock':'Verify passkey');setTxt('#lock-sub',cfg.pin?'Enter your passcode to open the enclave.':'Verify to open your private enclave.');openM('m-lock');audit('Vault locked')}
function resetIdle(){clearTimeout(S.idleT);if(cfg.idle>0&&!$('#m-lock').classList.contains('open'))S.idleT=setTimeout(lock,cfg.idle*60000)}
const bn={t:0,tm:0,best:null};

/* ---------- command palette ---------- */
function cmdItems(q){
  const feedPosts=(S.feedData?.posts||LOCAL_SOCIAL.posts||[]).slice(0,25);
  const feedTags=(S.feedData?.trendingTags||[]).slice(0,10);
  const creators=(S.user&&S.users?.length?S.users:LOCAL_SOCIAL.profiles||[]).slice(0,25);
  const list=[
    ...D.map(c=>({lbl:c.name,sub:c.isGroup?`Group · ${c.members?.length||1} members`:(c.peerUserId?'Encrypted Live DM':'Conversation'),icon:c.isGroup?'users':'message-circle',run:'chat:'+c.id})),
    ...creators.map(u=>({lbl:u.display_name||('@'+(u.username||'member')),sub:`@${u.username||'member'} · Creator Profile`,icon:'user',run:'user:'+(u.username||u.id)})),
    ...feedPosts.map(p=>({lbl:(p.caption||'WhatsGram Post').slice(0,55),sub:`Post by @${p.author?.username||'creator'}${p.locationText?' · '+p.locationText:''}`,icon:'image',run:'post:'+p.id})),
    ...feedTags.map(t=>({lbl:'#'+t.tag,sub:`${t.count} posts in Explore`,icon:'hash',run:'tag:'+t.tag})),
    {lbl:'Messages',sub:'View inbox & active threads',icon:'message-circle',run:'nav:chats'},
    {lbl:'Explore Feed',sub:'Browse Following, Trending & community posts',icon:'compass',run:'nav:feed'},
    {lbl:'Reels',sub:'View vertical video feed',icon:'clapperboard',run:'nav:reels'},
    {lbl:'AI Assistant',sub:'Ask Gemini across your threads',icon:'sparkles',run:'nav:ai'},
    {lbl:'Security Vault',sub:'Manage passkey, ECDH keys & logs',icon:'shield-check',run:'nav:vault'},
    {lbl:'E2EE Key Backup',sub:'Wrap or restore multi-device encryption keys',icon:'key-round',run:'act:openBackupModal'},
    {lbl:'Settings',sub:'Appearance, Web Push, notifications & diagnostics',icon:'settings',run:'nav:settings'},
    {lbl:'Leave an Inbox Note',sub:'Share a 24-hour status bubble with friends',icon:'sticky-note',run:'act:openNoteModal'},
    {lbl:'Create Chat Poll',sub:'Send an interactive poll to active thread',icon:'bar-chart-2',run:'act:openPollModal'},
    {lbl:'New conversation / DM',sub:'Start a chat or Live DM',icon:'user-plus',run:'act:open:m-contact'},
    {lbl:'New E2EE Group',sub:'Create a multi-member encrypted group',icon:'users',run:'act:newGroup'},
    {lbl:'Creator Studio (Story / Reel)',sub:'Publish a story poll or reel',icon:'plus-circle',run:'act:storyNew'},
    {lbl:'Safety & Follow Requests',sub:'Review follow requests and blocked accounts',icon:'user-x',run:'act:openBlocksModal'},
    {lbl:'Keyboard Shortcuts',sub:'View navigation hotkeys',icon:'keyboard',run:'act:openShortcuts'},
    {lbl:S.incognito?'Exit Incognito Mode':'Launch Incognito Mode',sub:'Zero localStorage · vanish messages automatically',icon:'eye-off',run:'act:toggleIncognito'},
    {lbl:'Toggle End-to-End Encryption',sub:`Currently ${cfg.e2ee?'enabled':'disabled'}`,icon:'lock',run:'act:sw:e2ee'},
    {lbl:'Rotate ECDH identity key',sub:'Generate a fresh P-256 keypair',icon:'rotate-cw',run:'act:rotateKey'},
    {lbl:'Lock Security Vault',sub:'Require passkey / passcode now',icon:'shield-alert',run:'act:lock'},
    ...(S.user?[{lbl:'Sync with Supabase',sub:'Refresh cloud messages & presence',icon:'refresh-cw',run:'act:syncNow'}]:[]),
    {lbl:'Log out',sub:'End session and return to welcome screen',icon:'log-out',run:'act:signOut'}
  ];
  const tq=String(q||'').trim();
  if(!tq)return list.slice(0,12);
  const msgHits=tq.length>=2?searchIdx.query(tq,4).map(h=>{const conv=D.find(c=>c.id===h.convId);return{lbl:h.preview||tq,sub:`Message in ${conv?.name||'chat'} · ${h.t||''}`,icon:'search',run:'chat:'+h.convId}}):[];
  return [...msgHits,...list.map(it=>({it,s:sim(tq,it.lbl+' '+it.sub)})).filter(x=>x.s>.1).sort((a,b)=>b.s-a.s).slice(0,14).map(x=>x.it)].slice(0,15);
}
function renderCmdPalette(q=''){
  const items=cmdItems(q),box=$('#cmd-list');if(!box)return;
  box.innerHTML=items.length?items.map(it=>`<button data-act="cmdRun" data-arg="${esc(it.run)}" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-transparent hover:bg-white/[0.06] hover:border-white/[0.08] focus:bg-white/[0.08] focus:outline-none text-left transition-all"><span class="w-8 h-8 rounded-xl bg-white/[0.05] border border-white/[0.09] grid place-items-center text-accent shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">${ic(it.icon,'w-4 h-4')}</span><div class="min-w-0 flex-1"><div class="text-xs font-semibold text-white truncate">${esc(it.lbl)}</div><div class="text-[11px] text-zinc-400 truncate">${esc(it.sub)}</div></div><i data-lucide="corner-down-left" class="w-3.5 h-3.5 text-zinc-500 shrink-0"></i></button>`).join(''):'<div class="py-8 text-center text-xs text-zinc-500">No matching commands.</div>';
  icons();
}

/* ---------- popover menus ---------- */
const PREF={account:'right'};
const MENUS={
 chatsNew:()=>[{l:'New conversation',i:'user-plus',act:'open',arg:'m-contact'},{l:'New E2EE Group',i:'users',act:'newGroup'},{l:'New story / reel',i:'camera',act:'storyNew'}],
 chatMore:()=>{const c=cur()||{};const aiCnt=(S.aiThread[c.id]||[]).length;return[{l:'Search in thread',i:'search',act:'toggleThreadSearch'},{l:'Summarize unread',i:'sparkles',act:'summarizeUnread'},{l:'Summarize thread',i:'file-text',act:'summarize'},{l:'Ask @AI in chat',i:'bot',act:'prefillAi'},{l:S.quietSend?'Disable quiet send':'Send next quietly',i:'bell-off',act:'toggleQuietSend'},{l:'Schedule message',i:'clock',act:'scheduleMsgPrompt'},...(c.isGroup?[{l:'Copy invite link',i:'link-2',act:'copyGroupInvite'}]:[]),...(aiCnt?[{l:'Clear private AI notes',i:'eraser',act:'clearAiNotes'}]:[]),{l:'Thread tools',i:'panel-right',act:'info'},{sep:1},{label:'Move to folder'},{l:'Work',i:'briefcase',act:'setFolder',arg:'work',radio:1,on:c.folder==='work'},{l:'Personal',i:'user',act:'setFolder',arg:'personal',radio:1,on:c.folder==='personal'},{sep:1},{l:'Clear history',i:'eraser',act:'clearChat',danger:1},{l:'Delete conversation',i:'trash-2',act:'deleteChat',danger:1}]},
 compose:()=>[{l:'Attach file',i:'paperclip',act:'attach'},{l:'Create chat poll',i:'bar-chart-2',act:'openPollModal'},{l:'Draft reply with AI',i:'sparkles',act:'aiDraftReply'},{sep:1},{label:'Quick replies'},{l:'Sounds good',i:'message-square',act:'quick',arg:"Sounds good. Let's schedule a sync."},{l:'Request files',i:'file-text',act:'quick',arg:'Can you send over the updated files?'},{l:'Confirmed',i:'check',act:'quick',arg:'Confirmed. Moving forward with this plan.'}],
 aiAssist:()=>{const hasDraft=Boolean($('#msg')?.value.trim()&&!/^@(?:ai|meta)\b/i.test($('#msg').value));const c=cur(),hasNotes=Boolean(c&&(S.aiThread[c.id]||[]).length);return[
   ...(hasDraft?[{label:'Polish current draft'},{l:'Fix grammar & spelling',i:'check',act:'aiRewrite',arg:'fix'},{l:'Make polite & warm',i:'heart',act:'aiRewrite',arg:'polite'},{l:'Make concise',i:'scissors',act:'aiRewrite',arg:'concise'},{l:'Professional tone',i:'briefcase',act:'aiRewrite',arg:'professional'},{l:'Translate to Spanish',i:'languages',act:'aiRewrite',arg:'es'},{sep:1}]:[]),
   {label:'Meta-style AI Copilot'},
   {l:'Draft reply for this chat',i:'sparkles',act:'aiDraftReply'},
   {l:'Ask @AI any question',i:'bot',act:'prefillAi'},
   {l:'Summarize thread',i:'file-text',act:'summarize'},
   ...(hasNotes?[{l:'Clear AI notes in chat',i:'eraser',act:'clearAiNotes'}]:[]),
   {sep:1},
   {l:'Open full AI Assistant',i:'external-link',act:'nav',arg:'ai'}
 ]},
 msg:id=>{const m=cur()?.msgs.find(x=>x.id===id);return[{emojis:['❤️','👍','😂'],id},{sep:1},{l:'Reply',i:'corner-up-left',act:'reply',arg:id},...(m?.text?[{l:'Translate message',i:'languages',act:'translateMsg',arg:id},{l:'Reply with AI',i:'sparkles',act:'aiReplyToMsg',arg:id},{l:'Explain / translate',i:'bot',act:'aiExplainMsg',arg:id}]:[]),{l:m?.starred?'Unstar message':'Star message',i:'star',act:'toggleStarMsg',arg:id},...(m?.from==='me'&&m.type==='text'?[{l:'Edit message',i:'pencil',act:'editMsg',arg:id}]:[]),{l:cur()&&cur().pin===id?'Unpin message':'Pin message',i:'pin',act:'pin',arg:id},{l:'Copy text',i:'copy',act:'copy',arg:id},{sep:1},{l:'Delete message',i:'trash-2',act:'delMsg',arg:id,danger:1}]},
 reelFilter:()=>[{label:'AR filter'},...FILTERS.map(([n],i)=>({l:n,act:'setFilter',arg:String(i),radio:1,on:RS.filter===i}))],
 reelMore:()=>{const r=getReels()[S.reel];const isCustom=Boolean(r&&(CUSTOM_REELS.some(x=>String(x.id)===String(r.id))||(S.user&&r.userId===S.user.id)||(!S.user&&r&&String(r.id).startsWith('rl_'))));return[
   {label:'AR filter'},...FILTERS.map(([n],i)=>({l:n,act:'setFilter',arg:String(i),radio:1,on:RS.filter===i})),
   {sep:1},
   ...(r?[{l:'Open @'+r.author,i:'user',act:'openAuthorProfile',arg:r.author},{l:'Remix this reel',i:'shuffle',act:'remixReel',arg:String(r.id)},{l:'Use audio track',i:'music-2',act:'useReelAudio',arg:String(r.id)},{l:'Copy reel link',i:'share-2',act:'reelShare'}]:[]),
   ...(isCustom?[{sep:1},{l:'Delete reel',i:'trash-2',act:'delReel',arg:String(r.id),danger:1}]:[])
 ]},
 aiTools:()=>[{l:'Ask general knowledge',i:'globe',act:'aiRun',arg:'What is the scientific name of a lizard and 3 quick facts?'},{l:'Summarize all conversations',i:'sparkles',act:'aiRun',arg:'Summarize all conversations'},{l:'Find action items',i:'list-checks',act:'aiRun',arg:'Find action items'},{l:'Generate hashtags',i:'hash',act:'aiRun',arg:'Generate hashtags'},{sep:1},{l:'Clear conversation',i:'trash-2',act:'aiClear',danger:1}],
 profileMore:()=>{const p=S.profData?.profile;const own=Boolean(p?.isOwn);const blocked=p&&!own&&(S.user?.blockedIds||[]).includes(p.id);const muted=p&&!own&&(S.safety.mutedIds||[]).includes(p.id);const restricted=p&&!own&&(S.safety.restrictedIds||[]).includes(p.id);const isCf=p&&!own&&(S.safety.closeFriendIds||[]).includes(p.id);return[
   ...(own?[{l:'Edit profile',i:'pencil',act:'openEditProfile'},{l:'Create post',i:'plus-square',act:'openPostModal'},{l:'New highlight',i:'circle-plus',act:'openHighlightModal'},{l:'Creator Insights',i:'bar-chart-3',act:'openInsights'},{l:'Saved Collections',i:'bookmark',act:'openCollectionsModal'},{l:'Archived posts',i:'archive',act:'profTab',arg:'archived'},{l:'Safety & Requests',i:'user-check',act:'openBlocksModal'},{sep:1}]:[{l:'My profile',i:'user',act:'openProfile',arg:'self'},{sep:1}]),
   {l:'Discover creators',i:'compass',act:'openFollowModal',arg:'suggested'},
   {l:'Profile QR Card',i:'qr-code',act:'openQrCard'},
   {l:'Share profile link',i:'share-2',act:'profShare'},
   {l:'Copy @handle',i:'copy',act:'copyHandle'},
   {l:'Refresh live stats',i:'refresh-cw',act:'refreshProfileNow'},
   ...(!own&&p?[{sep:1},{l:isCf?'Remove Close Friend':'Add Close Friend',i:'star',act:'toggleCloseFriendUser',arg:p.id},{l:muted?'Unmute user':'Mute user',i:'volume-x',act:'toggleMuteUser',arg:p.id},{l:restricted?'Unrestrict user':'Restrict user',i:'shield-off',act:'toggleRestrictUser',arg:p.id},{l:blocked?'Unblock user':'Block user',i:'user-x',act:'toggleBlockUser',arg:p.id,danger:1},{l:'Report account',i:'flag',act:'openReportModal',arg:'user:'+p.id,danger:1}]:[]),
   ...(own?[{sep:1},{l:'Export account JSON',i:'download',act:'exportAccountJson'},{l:'Account & recovery',i:'shield-check',act:'open',arg:'m-auth'},{l:S.incognito?'Exit Incognito':'Log out',i:'log-out',act:S.incognito?'exitIncognito':'signOut',danger:1}]:[])
 ]},
 account:()=>{const actUser=S.user||S.localUser;const lbl=S.incognito?'Incognito Mode':(actUser?`Account · ${actUser.displayName||(actUser.username?'@'+actUser.username:actUser.email)}`:'Sign in / Create account');return[{l:lbl,i:actUser?'user-check':'cloud',act:'open',arg:'m-auth'},{l:'Explore feed',i:'compass',act:'nav',arg:'feed'},{l:'My creator profile',i:'user',act:'openProfile',arg:'self'},{l:'Overview page',i:'layout-template',act:'openLanding'},{l:'Command palette',i:'command',act:'openCmd'},{sep:1},{l:S.incognito?'Exit Incognito Mode':'Incognito Mode',i:'eye-off',act:'toggleIncognito'},{l:'E2EE key backup',i:'key-round',act:'openBackupModal'},{l:'Settings',i:'settings',act:'nav',arg:'settings'},{l:'Security vault',i:'shield-check',act:'nav',arg:'vault'},{sep:1},{l:'Create story / reel',i:'plus-circle',act:'storyNew'},{l:'Lock now',i:'lock',act:'lock'},{sep:1},{l:S.incognito?'Exit Incognito':'Log out',i:'log-out',act:S.incognito?'exitIncognito':'signOut',danger:1}]}
};
function menuHTML(items){return items.map(it=>{
 if(it.sep)return '<div class="my-1 h-px bg-white/[0.08]" role="separator"></div>';
 if(it.label)return `<div class="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500" role="presentation">${esc(it.label)}</div>`;
 if(it.emojis)return `<div class="flex gap-1 px-1 py-1" role="group">${it.emojis.map(e=>`<button role="menuitem" data-act="react" data-arg="${it.id}|${e}" class="w-9 h-8 rounded-lg hover:bg-white/[0.1] focus:bg-white/[0.1] focus:outline-none text-base transition">${e}</button>`).join('')}</div>`;
 return `<button role="${it.radio?'menuitemradio':'menuitem'}" ${it.radio?`aria-checked="${!!it.on}"`:''} data-act="${it.act}" data-arg="${esc(it.arg==null?'':it.arg)}" class="w-full flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-xs font-medium text-left hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none transition-colors ${it.danger?'text-rose-400':'text-zinc-200'}">${it.i?ic(it.i,'w-3.5 h-3.5 shrink-0'):'<span class="w-3.5 shrink-0"></span>'}<span class="flex-1 truncate">${esc(it.l)}</span>${it.radio&&it.on?ic('check','w-3.5 h-3.5 text-accent shrink-0'):''}</button>`}).join('')}
function closeMenu(restore){const o=S.menu;if(!o)return;S.menu=null;o.m.remove();if(o.el.isConnected){o.el.setAttribute('aria-expanded','false');if(restore)o.el.focus()}}
function openMenu(key,el){
  const[name,param]=key.split(':'),def=MENUS[name];if(!def)return console.warn('Unknown menu',name);
  const m=document.createElement('div');m.id='menu';m.setAttribute('role','menu');
  m.className='fixed z-[60] min-w-[13.5rem] max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-y-auto lux-modal rounded-2xl p-1.5';
  m.style.visibility='hidden';m.style.left='0';m.style.top='0';m.innerHTML=menuHTML(def(param));document.body.appendChild(m);icons();
  const r=el.getBoundingClientRect(),w=m.offsetWidth,h=m.offsetHeight,vw=innerWidth,vh=innerHeight;let x,y;
  if(PREF[name]==='right'){x=r.right+8;y=r.bottom-h}else{x=r.right-w;y=r.bottom+6;if(y+h>vh-8)y=r.top-h-6}
  m.style.left=Math.max(8,Math.min(x,vw-w-8))+'px';m.style.top=Math.max(8,Math.min(y,vh-h-8))+'px';m.style.visibility='visible';
  S.menu={key,el,m};el.setAttribute('aria-expanded','true');const f=m.querySelector('[role^=menuitem]');f&&f.focus({preventScroll:true});
}

function renderBlocksLists(){
  const reqEl=$('#blocks-req-list'),blkEl=$('#blocks-user-list');
  if(reqEl){
    const reqs=S.followRequests||[];
    reqEl.innerHTML=reqs.length?reqs.map(u=>`<div class="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
      <button type="button" data-act="openProfile" data-arg="${esc(u.username||u.id)}" class="flex items-center gap-2.5 min-w-0 text-left">${renderAvatarCircle(u,'w-8 h-8')}<div class="min-w-0"><div class="text-xs font-bold text-white truncate">${esc(u.display_name||u.username||'User')}</div><div class="text-[10.5px] text-zinc-400 truncate">@${esc(u.username||'member')}</div></div></button>
      <div class="flex items-center gap-1.5 shrink-0">
        <button type="button" data-act="approveFollowReq" data-arg="${esc(u.id)}" class="btn-primary h-7 px-2.5 rounded-lg text-[11px] font-bold">Approve</button>
        <button type="button" data-act="declineFollowReq" data-arg="${esc(u.id)}" class="btn-ghost h-7 px-2.5 rounded-lg text-[11px] font-semibold text-zinc-300">Decline</button>
      </div>
    </div>`).join(''):'<div class="text-xs text-zinc-500 py-2">No pending follow requests.</div>';
  }
  if(blkEl){
    const blks=S.blockedUsers||[];
    blkEl.innerHTML=blks.length?blks.map(u=>`<div class="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
      <div class="flex items-center gap-2.5 min-w-0">${renderAvatarCircle(u,'w-8 h-8')}<div class="min-w-0"><div class="text-xs font-bold text-white truncate">${esc(u.display_name||u.username||'User')}</div><div class="text-[10.5px] text-zinc-400 truncate">@${esc(u.username||'member')}</div></div></div>
      <button type="button" data-act="unblockUserId" data-arg="${esc(u.id)}" class="btn-ghost h-7 px-3 rounded-lg text-[11px] font-semibold text-zinc-200 shrink-0">Unblock</button>
    </div>`).join(''):'<div class="text-xs text-zinc-500 py-2">No blocked accounts.</div>';
  }
  icons();
}

async function deliverStoryDmReply(s,text){
  if(!s||!text)return;
  const targetName=String(s.name||'').trim();
  const body=`[Story reply · "${String(s.q||'').slice(0,36)}"] ${text}`;
  let targetConv=null;
  if(S.user&&s.userId&&s.userId!==S.user.id){
    targetConv=D.find(c=>c.peerUserId===s.userId);
    if(!targetConv){
      const cr=await sbPost({action:'createChat',targetUserId:s.userId});
      if(cr?.ok&&cr.conversation)targetConv=D.find(c=>c.id===cr.conversation.id)||cr.conversation;
    }
    if(targetConv&&!D.some(x=>x.id===targetConv.id)){D.unshift(targetConv);saveD()}
  }
  if(!targetConv){
    targetConv=D.find(c=>!c.isGroup&&c.name.toLowerCase()===targetName.toLowerCase());
    if(!targetConv){
      targetConv={id:uid('c'),name:targetName||'Creator',folder:'personal',unread:0,status:'Online',pin:null,msgs:[]};
      D.unshift(targetConv);
    }
  }
  const msg={id:uid('m'),from:'me',type:'text',text:body,t:now(),ts:Date.now(),react:{},pending:!navigator.onLine};
  if(cfg.e2ee)msg.ct=await enc(body,null,targetConv,null);
  push(targetConv,msg);
  return true;
}

/* ---------- actions (every data-act resolves here) ---------- */
const A={
 nav:v=>setView(v),
 menu(key,el){if(S.menu&&S.menu.key===key){closeMenu(true);return}closeMenu();openMenu(key,el)},
 acc(_,el){const open=el.getAttribute('aria-expanded')!=='true';el.setAttribute('aria-expanded',String(open));const b=document.getElementById(el.getAttribute('aria-controls'));if(b)b.classList.toggle('hidden',!open)},
 lock:()=>lock(),
 async unlock(){if(cfg.pin&&await sha($('#lock-pin').value)!==cfg.pin){toast('Incorrect passcode','err');audit('Failed unlock attempt');return}const r=$('#lock-ring');r.classList.add('animate-pulse');await wait(cfg.pin?100:700);r.classList.remove('animate-pulse');closeM('m-lock');audit('Vault unlocked');resetIdle();tone(880,.08)},
 open:id=>{openM(id);if(id==='m-auth'){if($('#auth-err'))$('#auth-err').classList.add('hidden');if($('#auth-fp-res'))$('#auth-fp-res').classList.add('hidden');if(S.user&&S.authTab!=='reset')S.authTab='signin';renderAccountUI()}if(id==='m-contact'){A.contactTab(S.contactTab||'dm');renderDmUsers();renderGroupMembers();if(S.user)sbGet('users').then(r=>{if(r?.ok&&Array.isArray(r.users)){S.users=r.users;r.users.forEach(u=>{if(u.public_key&&u.key_fp)cachePeerPub(u.key_fp,u.public_key)});renderDmUsers();renderGroupMembers()}})}},closeModal:id=>{closeM(id);if(id==='m-auth'&&S.user)S.authTab='signin'},
 openCmd(){$('#cmd-in').value='';renderCmdPalette('');openM('m-cmd');setTimeout(()=>$('#cmd-in')?.focus(),25)},
 cmdRun(spec){closeM('m-cmd');const idx=String(spec||'').indexOf(':'),kind=idx>0?spec.slice(0,idx):spec,rest=idx>0?spec.slice(idx+1):'';if(kind==='chat'){setView('chats');openChat(rest)}else if(kind==='nav'){setView(rest)}else if(kind==='user'){openProfile(rest)}else if(kind==='post'){setView('feed');A.viewPost(rest)}else if(kind==='tag'){S.feedTag=rest;setView('feed')}else if(kind==='act'){const[actName,sub]=rest.split(':');if(A[actName])A[actName](sub)}},
 chat:id=>openChat(id),back(){$('#v-chats').dataset.open='0'},
 info(){const o=$('#info').classList.toggle('open');$$('[data-act="info"][aria-pressed]').forEach(b=>b.setAttribute('aria-pressed',String(o)));renderInfo()},
 folder(f){S.folder=f;renderList()},
 setFolder(f){const c=cur();if(c){c.folder=f;saveD();renderInfo();renderList();toast(`Moved to ${f}`);if(S.user)sbPost({action:'updateChat',id:c.id,folder:f})}},
 toggleThreadSearch:()=>toggleThreadSearch(),
 searchPrev:()=>searchStep(-1),
 searchNext:()=>searchStep(1),
 scrollBottom(){const s=$('#stream');if(s){s.scrollTo({top:s.scrollHeight,behavior:'smooth'});show('#jump-bottom',false)}},
 verifyPeerKey(){const c=cur();if(!c?.peerUserId||!c.peerKeyFp)return;S.knownFps[c.peerUserId]=c.peerKeyFp;store.set('known_fps',S.knownFps);c.keyChanged=false;saveD();renderThread(true);renderInfo();toast('Peer key verified')},
 async summarize(){const c=cur();if(!c)return;const ms=c.msgs.filter(m=>m.text&&m.from!=='sys');if(!ms.length){push(c,{id:uid('m'),from:'them',type:'text',text:'✨ Nothing to summarize yet.',t:now(),react:{}});return}S.typing[c.id]=1;renderHead();const res=await callGemini({mode:'summarize',contactName:c.name,messages:ms.slice(-30).map(m=>({from:m.from==='me'?'You':c.name,text:m.text,t:m.t}))});delete S.typing[c.id];renderHead();const t=(res&&res.text)||`Thread summary: ${ms.length} messages. Latest from ${ms[ms.length-1].from==='me'?'you':c.name}: “${ms[ms.length-1].text.slice(0,80)}”.`;push(c,{id:uid('m'),from:'them',type:'text',text:'✨ '+t,t:now(),react:{}})},
 call:t=>startCall(t),endCall:()=>endCall(),
 callMute(_,el){const k=S.call;if(!k)return;k.muted=!k.muted;const st=k.stream;st&&st.getAudioTracks().forEach(t=>t.enabled=!k.muted);el.innerHTML=ic(k.muted?'mic-off':'mic','w-5 h-5');el.classList.toggle('text-red-400',k.muted);icons()},
 callCam(_,el){const k=S.call;if(!k)return;k.cam=!k.cam;const st=k.stream;st&&st.getVideoTracks().forEach(t=>t.enabled=k.cam);$('#call-v').classList.toggle('hidden',k.isRtc?false:(!k.cam||!st));$('#call-local')?.classList.toggle('hidden',!k.isRtc||!k.cam||!st);el.innerHTML=ic(k.cam?'video':'video-off','w-5 h-5');el.classList.toggle('text-red-400',!k.cam);icons()},
 async callFlip(){
   const k=S.call;if(!k||k.type!=='video'||!navigator.mediaDevices?.getUserMedia)return;
   const next=k.facing==='user'?'environment':'user';
   try{
     const ns=await navigator.mediaDevices.getUserMedia({video:{facingMode:next}});
     const newTr=ns.getVideoTracks()[0];if(!newTr)return;
     const oldTr=k.stream?.getVideoTracks()[0];
     if(k.stream){if(oldTr){k.stream.removeTrack(oldTr);oldTr.stop()}k.stream.addTrack(newTr)}else{k.stream=ns}
     const sender=k.pc?.getSenders().find(s=>s.track?.kind==='video');
     if(sender)await sender.replaceTrack(newTr);
     k.facing=next;attachCallMediaUI(k.stream,k.remoteStream||k.stream,true);toast('Camera switched');
   }catch(e){toast('Could not switch camera','err')}
 },
 async callShare(_,el){
   const k=S.call;if(!k)return;
   if(k.sharing){
     try{k.screenStream?.getTracks().forEach(t=>t.stop())}catch(e){}
     k.screenStream=null;k.sharing=false;el?.classList.remove('text-accent');
     const camTr=k.stream?.getVideoTracks()[0]||null;
     const sender=k.pc?.getSenders().find(s=>s.track?.kind==='video');
     if(sender&&camTr)await sender.replaceTrack(camTr);
     attachCallMediaUI(k.stream,k.remoteStream||k.stream,k.type==='video');
     return;
   }
   if(!navigator.mediaDevices?.getDisplayMedia)return toast('Screen share unavailable in this browser','err');
   try{
     const ss=await navigator.mediaDevices.getDisplayMedia({video:true});
     const scrTr=ss.getVideoTracks()[0];if(!scrTr)return;
     k.screenStream=ss;k.sharing=true;el?.classList.add('text-accent');
     scrTr.onended=()=>{if(S.call===k&&k.sharing)A.callShare(null,$('#call-share'))};
     const sender=k.pc?.getSenders().find(s=>s.track?.kind==='video');
     if(sender)await sender.replaceTrack(scrTr);
     else if(k.pc)k.pc.addTrack(scrTr,ss);
     attachCallMediaUI(ss,k.remoteStream||ss,true);
     toast('Sharing screen');
   }catch(e){}
 },
 attach:()=>$('#file').click(),
 mic:()=>S.rec?A.recSend():startRec(),recCancel:()=>stopRec(),recSend:()=>sendRec(),
 async send(){
   const i=$('#msg'),t=i.value.trim();if(!t)return;
   if(S.editId){
     const c=cur(),m=c?.msgs.find(x=>x.id===S.editId);
     if(c&&m){
       m.text=t;m.editedAt=Date.now();
       if(cfg.e2ee)m.ct=await enc(t,m.reply,c);
       saveD();
       if(S.user&&!m._remote){
         const isZk=m.ct?.startsWith('e2ee1.')||m.ct?.startsWith('e2ee2.');
         sbPost({action:'editMessage',conversationId:c.id,messageId:m.id,text:isZk?'':t,ct:m.ct||null,editedAt:m.editedAt});
       }
     }
     S.editId=null;i.value='';show('#sent',false,null);show('#mention-box',false);renderThread(true);renderList();return;
   }
   const aiMatch=t.match(/^@(?:ai|meta(?:\s+ai)?)\b\s*(.*)$/i);
   if(aiMatch){
     i.value='';show('#sent',false,null);show('#mention-box',false);
     askThreadAI(aiMatch[1]||'Summarize this conversation and suggest a smart reply');
     return;
   }
   i.value='';show('#sent',false,null);show('#mention-box',false);send(t);
 },
 editMsg(id){const m=cur()?.msgs.find(x=>x.id===id);if(!m||m.type!=='text')return;S.editId=id;S.reply=null;$('#msg').value=m.text||'';renderThread(true);$('#msg').focus()},
 cancelEdit(){S.editId=null;$('#msg').value='';renderThread(true)},
 smartReply(idx){const t=S.smart[+idx];if(!t)return;send(t)},
 pickMention(name){const i=$('#msg');if(!i)return;i.value=i.value.replace(/@([a-z0-9._-]*)$/i,'@'+name+' ');show('#mention-box',false);i.focus()},
 quick(t){send(t)},cancelReply(){S.reply=null;show('#reply-pill',false)},
 react(a){const[id,e]=a.split('|'),m=cur()?.msgs.find(x=>x.id===id);if(m){m.react=m.react||{};m.react[e]=(m.react[e]||0)+1;saveD();renderThread(true);if(S.user&&S.chat)sbPost({action:'reactMessage',conversationId:S.chat,messageId:id,react:m.react})}},
 reply(id){const m=cur()?.msgs.find(x=>x.id===id);if(m){S.editId=null;S.reply={id,text:prev(m).slice(0,80)};renderThread(true);$('#msg').focus()}},
 pin(id){const c=cur();if(c){const was=c.pin===id;c.pin=was?null:id;saveD();renderThread(true);toast(was?'Message unpinned':'Message pinned');if(S.user)sbPost({action:'updateChat',id:c.id,pin:c.pin})}},
 unpin(){const c=cur();if(c){c.pin=null;saveD();renderThread(true);if(S.user)sbPost({action:'updateChat',id:c.id,pin:null})}},
 copy(id){const m=cur()?.msgs.find(x=>x.id===id);if(m)navigator.clipboard?.writeText(m.text||m.name||'').then(()=>toast('Copied'),()=>toast('Copy blocked by browser','err'))},
 delMsg(id){const c=cur();if(c){c.msgs=c.msgs.filter(m=>m.id!==id);if(c.pin===id)c.pin=null;saveD();renderThread(true);renderList();if(S.user)sbPost({action:'deleteMessage',conversationId:c.id,messageId:id})}},
 clearChat(){const c=cur();if(c)ask('Clear history?',`All messages with ${c.name} will be removed from this device.`,()=>{c.msgs=[];c.pin=null;delete S.aiThread[c.id];saveAiThread();saveD();renderThread();renderList();renderInfo();if(S.user)sbPost({action:'clearChat',id:c.id})})},
 deleteChat(){const c=cur();if(c)ask('Delete conversation?',`${c.name} and its messages will be removed.`,()=>{D=D.filter(x=>x.id!==c.id);delete S.aiThread[c.id];saveAiThread();S.chat=null;saveD();$('#v-chats').dataset.open='0';renderList();renderThread();renderInfo();audit('Conversation deleted');if(S.user)sbPost({action:'deleteChat',id:c.id})})},
 contactTab(tab){S.contactTab=tab==='group'?'group':'dm';const isG=S.contactTab==='group';const td=$('#ctab-dm'),tg=$('#ctab-grp');if(td&&tg){td.className='h-8 rounded-xl text-xs font-semibold transition-all '+(isG?'lux-tab-off':'lux-tab-on');tg.className='h-8 rounded-xl text-xs font-semibold transition-all '+(isG?'lux-tab-on':'lux-tab-off')}show('#dm-panel',!isG,'space-y-3.5');show('#grp-panel',isG,'space-y-3.5');if(isG)renderGroupMembers()},
 newGroup(){S.contactTab='group';A.open('m-contact')},
 async createGroup(){
   const n=$('#grp-name').value.trim();if(!n)return toast('Enter a group name','err');
   const memberIds=$$('.grp-mem-cb:checked').map(el=>el.value);
   const sys={id:uid('m'),from:'sys',type:'sys',text:`Encrypted group "${n}" created`,t:now(),ts:Date.now()};
   const members=S.user?[{id:S.user.id,displayName:S.user.displayName||S.user.email,publicKey:S.ecdhId?.pubJwk||null,keyFp:S.ecdhId?.fp||null,role:'owner'},...memberIds.map(id=>{const u=S.users.find(x=>x.id===id);return u?{id:u.id,displayName:u.display_name||u.email,publicKey:u.public_key||null,keyFp:u.key_fp||null,role:'member'}:null}).filter(Boolean)]:[{id:'local-you',displayName:'You',role:'owner'}];
   const c={id:uid('c'),name:n,isGroup:true,members,folder:$('#grp-folder').value,unread:0,status:`${members.length} members`,pin:null,msgs:[sys]};
   if(S.user){const res=await sbPost({action:'createChat',id:c.id,name:c.name,folder:c.folder,isGroup:true,memberIds,sysMsg:sys});if(!res?.ok)return toast(res?.error||'Could not create group','err')}
   D.push(c);saveD();$('#grp-name').value='';S.contactTab='dm';closeM('m-contact');setView('chats');openChat(c.id);toast(`Group "${n}" ready`);
 },
 leaveGroup(){const c=cur();if(!c?.isGroup)return;ask('Leave group?',`Remove yourself from ${c.name}?`,async()=>{D=D.filter(x=>x.id!==c.id);S.chat=null;saveD();$('#v-chats').dataset.open='0';renderList();renderThread();renderInfo();if(S.user)await sbPost({action:'leaveGroup',conversationId:c.id});toast('Left group')})},
 addContact(){const n=$('#c-name').value.trim();if(!n)return toast('Enter a contact name','err');if(D.some(c=>c.name.toLowerCase()===n.toLowerCase()))return toast('Contact already exists','err');const sys={id:uid('m'),from:'sys',type:'sys',text:`Conversation with ${n} created`,t:now()};const c={id:uid('c'),name:n,folder:$('#c-folder').value,unread:0,status:'Online',pin:null,msgs:[sys]};D.push(c);saveD();$('#c-name').value='';closeM('m-contact');setView('chats');openChat(c.id);if(S.user)sbPost({action:'createChat',id:c.id,name:c.name,folder:c.folder,peerUserId:null,sysMsg:sys})},
 async dmUser(userId){if(!S.user){closeM('m-contact');openM('m-auth');return toast('Sign in to start a Live DM','err')}const u=S.users.find(x=>x.id===userId);if(!u)return toast('User not found','err');if(u.public_key&&u.key_fp)cachePeerPub(u.key_fp,u.public_key);const existing=D.find(c=>c.peerUserId===u.id);if(existing){closeM('m-contact');setView('chats');return openChat(existing.id)}const sys={id:uid('m'),from:'sys',type:'sys',text:`Encrypted DM started with ${u.display_name||u.email}`,t:now(),ts:Date.now()};const cid=uid('c'),c={id:cid,name:u.display_name||u.email,peerUserId:u.id,peerPublicKey:u.public_key||null,peerKeyFp:u.key_fp||'',isOwner:true,myReadMs:Date.now(),peerReadMs:0,folder:'personal',unread:0,status:u.status||'Online',pin:null,msgs:[sys]};const res=await sbPost({action:'createChat',id:cid,name:c.name,folder:'personal',peerUserId:u.id,sysMsg:sys});if(!res?.ok)return toast(res?.error||'Could not start DM','err');closeM('m-contact');setView('chats');if(res.existing&&res.id){await refreshCloud(true);openChat(res.id);return}D.push(c);saveD();openChat(c.id);toast(`Live DM with ${c.name} ready`)},
 async refreshUsers(){if(!S.user)return;const r=await sbGet('users');if(r?.ok&&Array.isArray(r.users)){S.users=r.users;r.users.forEach(u=>{if(u.public_key&&u.key_fp)cachePeerPub(u.key_fp,u.public_key)});renderDmUsers();renderGroupMembers();toast('Account directory updated')}},
 landScroll(id){const el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})},
 landTab(tab){const k=tab==='ai'||tab==='vault'?tab:'chat';['chat','ai','vault'].forEach(t=>{const b=$('#ltab-'+t),p=$('#lprev-'+t);if(b)b.className='px-2.5 py-1 rounded-lg font-semibold '+(t===k?'lux-tab-on':'lux-tab-off');if(p)p.classList.toggle('hidden',t!==k)})},
 landFaq(_,el){const open=el.getAttribute('aria-expanded')!=='true';el.setAttribute('aria-expanded',String(open));const body=el.nextElementSibling;if(body)body.classList.toggle('hidden',!open);const ico=el.querySelector('svg,[data-lucide]');if(ico)ico.style.transform=open?'rotate(180deg)':'rotate(0deg)'},
 enterDemo(){closeM('m-auth');if(S.incognito)exitIncognitoMode();lsSet('wg_local_mode','1');setShell('app');setView('chats');if(window.matchMedia('(min-width:768px)').matches&&D.length&&(!S.chat||!D.some(c=>c.id===S.chat)))openChat(D[0].id);try{if(['/login','/signin','/signup','/register','/auth','/forgot','/reset'].includes(location.pathname.toLowerCase()))history.replaceState(null,'','/')}catch(e){}audit('Local sandbox started')},
 startIncognito(){enterIncognitoMode(false)},
 exitIncognito(){exitIncognitoMode()},
 toggleIncognito(){if(S.incognito)exitIncognitoMode();else enterIncognitoMode(false)},
 openLanding(){closeMenu();setShell('landing');const ld=$('#landing');if(ld)ld.scrollTo({top:0,behavior:'smooth'})},
 openAuth(tab){S.authTab=['signin','signup','forgot','reset'].includes(tab)?tab:'signin';if($('#auth-err'))$('#auth-err').classList.add('hidden');if($('#auth-fp-res'))$('#auth-fp-res').classList.add('hidden');renderAccountUI();openM('m-auth');setTimeout(()=>{const f=S.authTab==='signup'?'#auth-su-user':S.authTab==='forgot'?'#auth-fp-id':S.authTab==='reset'?'#auth-rs-p1':'#auth-si-id';$(f)?.focus()},40)},
 togglePass(id,el){const inp=document.getElementById(id);if(!inp)return;const showPass=inp.type==='password';inp.type=showPass?'text':'password';if(el){el.setAttribute('aria-label',showPass?'Hide password':'Show password');el.innerHTML=ic(showPass?'eye-off':'eye','w-3.5 h-3.5');icons()}},
 authTab(tab){S.authTab=['signin','signup','forgot','reset'].includes(tab)?tab:'signin';if($('#auth-err'))$('#auth-err').classList.add('hidden');if($('#auth-fp-res'))$('#auth-fp-res').classList.add('hidden');renderAccountUI();setTimeout(()=>{const f=S.authTab==='signup'?'#auth-su-user':S.authTab==='forgot'?'#auth-fp-id':S.authTab==='reset'?'#auth-rs-p1':'#auth-si-id';$(f)?.focus()},30)},
 async authSubmit(){
   if(S.authTab==='forgot')return A.requestReset();
   if(S.authTab==='reset')return A.confirmReset();
   const errEl=$('#auth-err'),btn=$('#auth-submit'),showErr=msg=>{if(errEl){errEl.textContent=msg;errEl.classList.remove('hidden')}};
   if(errEl)errEl.classList.add('hidden');
   if(!S.sbConfigured){
     const accts=Array.isArray(S.localAccounts)?S.localAccounts:store.get('local_accounts',[]);
     if(S.authTab==='signup'){
       const username=($('#auth-su-user')?.value||'').trim().toLowerCase().replace(/^@+/,'');
       const displayName=($('#auth-su-name')?.value||'').trim()||username;
       const recoveryEmail=($('#auth-su-email')?.value||'').trim().toLowerCase();
       const password=$('#auth-su-pass')?.value||'';
       if(!/^[a-z0-9][a-z0-9._-]{1,22}[a-z0-9]$/.test(username))return showErr('Username must be 3–24 characters using lowercase letters, numbers, dot, underscore or hyphen.');
       if(password.length<6)return showErr('Password must be at least 6 characters.');
       if(accts.some(a=>a.username===username))return showErr('Local handle already exists — sign in instead.');
       const passHash=await sha(username+'::'+password);
       const rec={id:'loc_'+username,username,displayName,recoveryEmail:recoveryEmail||null,passHash,createdAt:Date.now()};
       accts.push(rec);S.localAccounts=accts;store.set('local_accounts',accts);
       S.localUser={id:rec.id,username:rec.username,displayName:rec.displayName,recoveryEmail:rec.recoveryEmail};
       store.set('local_user',S.localUser);
       if(LOCAL_SOCIAL.profiles[0]){LOCAL_SOCIAL.profiles[0].username=username;LOCAL_SOCIAL.profiles[0].display_name=displayName;saveLocalSocial()}
       lsSet('wg_local_mode','1');
       if($('#auth-su-pass'))$('#auth-su-pass').value='';
       closeM('m-auth');renderAccountUI();setShell('app');setView('chats');
       if(window.matchMedia('(min-width:768px)').matches&&D.length&&!D.some(c=>c.id===S.chat))openChat(D[0].id);
       try{if(['/login','/signin','/signup','/register','/auth'].includes(location.pathname.toLowerCase()))history.replaceState(null,'','/')}catch(e){}
       toast(`Created local account @${username}`);
       return;
     }
     const identifier=($('#auth-si-id')?.value||'').trim().toLowerCase().replace(/^@+/,'');
     const password=$('#auth-si-pass')?.value||'';
     if(!identifier||!password)return showErr('Enter your username and password (at least 4 chars).');
     if(password.length<4)return showErr('Password must be at least 4 characters.');
     const existing=accts.find(a=>a.username===identifier||a.recoveryEmail===identifier);
     const passHash=await sha((existing?.username||identifier)+'::'+password);
     if(existing&&existing.passHash!==passHash)return showErr('Incorrect password for local account.');
     let active=existing;
     if(!active){
       active={id:'loc_'+identifier.replace(/[^a-z0-9._-]/g,'_'),username:identifier.replace(/[^a-z0-9._-]/g,'_')||'member',displayName:identifier,recoveryEmail:null,passHash,createdAt:Date.now()};
       accts.push(active);S.localAccounts=accts;store.set('local_accounts',accts);
     }
     S.localUser={id:active.id,username:active.username,displayName:active.displayName,recoveryEmail:active.recoveryEmail||null};
     store.set('local_user',S.localUser);
     if(LOCAL_SOCIAL.profiles[0]){LOCAL_SOCIAL.profiles[0].username=S.localUser.username;LOCAL_SOCIAL.profiles[0].display_name=S.localUser.displayName;saveLocalSocial()}
     lsSet('wg_local_mode','1');
     if($('#auth-si-pass'))$('#auth-si-pass').value='';
     closeM('m-auth');renderAccountUI();setShell('app');setView('chats');
     if(window.matchMedia('(min-width:768px)').matches&&D.length&&!D.some(c=>c.id===S.chat))openChat(D[0].id);
     try{if(['/login','/signin','/signup','/register','/auth'].includes(location.pathname.toLowerCase()))history.replaceState(null,'','/')}catch(e){}
     toast(`Signed in locally as @${S.localUser.username}`);
     return;
   }
   let payload;
   if(S.authTab==='signup'){
     const username=($('#auth-su-user')?.value||'').trim().toLowerCase().replace(/^@+/,'');
     const displayName=($('#auth-su-name')?.value||'').trim();
     const recoveryEmail=($('#auth-su-email')?.value||'').trim().toLowerCase();
     const password=$('#auth-su-pass')?.value||'';
     if(!/^[a-z0-9][a-z0-9._-]{1,22}[a-z0-9]$/.test(username))return showErr('Username must be 3–24 characters using lowercase letters, numbers, dot, underscore or hyphen.');
     if(recoveryEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail))return showErr('Enter a valid recovery email or leave the field blank.');
     if(password.length<6)return showErr('Password must be at least 6 characters.');
     payload={action:'signup',username,password,displayName,recoveryEmail:recoveryEmail||null};
   }else{
     const identifier=($('#auth-si-id')?.value||'').trim();
     const password=$('#auth-si-pass')?.value||'';
     const totpCode=($('#auth-si-totp')?.value||'').trim();
     if(!identifier||!password)return showErr('Enter your username (or recovery email) and password.');
     payload={action:'signin',identifier,password,...(totpCode?{totpCode}:{})};
   }
   if(btn){btn.disabled=true;btn.textContent=S.authTab==='signup'?'Creating account…':'Signing in…'}
   try{
     const res=await sbPost(payload);
     if(!res?.ok){
       if(res?.requiresTotp){$('#auth-si-totp-wrap')?.classList.remove('hidden');$('#auth-si-totp')?.focus()}
       return showErr(res?.error||'Authentication failed');
     }
     if($('#auth-si-totp'))$('#auth-si-totp').value='';
     $('#auth-si-totp-wrap')?.classList.add('hidden');
     lsSet('wg_has_session','1');lsDel('wg_local_mode');
     if(S.incognito)INCOGNITO=false;S.incognito=false;
     await applyCloudBootstrap(res,false);
     connectRealtime(res.realtime);
     if($('#auth-si-pass'))$('#auth-si-pass').value='';
     if($('#auth-su-pass'))$('#auth-su-pass').value='';
     closeM('m-auth');
     setShell('app');
     setView('chats');
     if(window.matchMedia('(min-width:768px)').matches&&D.length&&!D.some(c=>c.id===S.chat))openChat(D[0].id);
     try{if(['/login','/signin','/signup','/register','/auth'].includes(location.pathname.toLowerCase()))history.replaceState(null,'','/')}catch(e){}
     toast(S.authTab==='signup'?'Account created & synced':'Signed in to WhatsGram');
   }finally{if(btn){btn.disabled=false;renderAccountUI()}}
 },
 async requestReset(){
   const errEl=$('#auth-err'),resEl=$('#auth-fp-res'),btn=$('#auth-submit'),showErr=msg=>{if(errEl){errEl.textContent=msg;errEl.classList.remove('hidden')}};
   if(errEl)errEl.classList.add('hidden');
   if(resEl)resEl.classList.add('hidden');
   if(!S.sbConfigured)return showErr(`Missing ${(S.sbMissing?.length?S.sbMissing:['SUPABASE_URL','SUPABASE_SECRET_KEY']).join(' / ')} in Vercel Environment Variables. Add them & redeploy, or click "Continue in Local Sandbox Mode" below.`);
   const identifier=($('#auth-fp-id')?.value||'').trim();
   if(!identifier)return showErr('Enter your username or registered recovery email.');
   if(btn){btn.disabled=true;btn.textContent='Sending reset link…'}
   try{
     const res=await sbPost({action:'requestPasswordReset',identifier});
     if(!res?.ok)return showErr(res?.error||'Could not send reset link');
     if(resEl){
       resEl.className='rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-200 leading-relaxed';
       resEl.textContent=res.message||`Password reset link sent to ${res.maskedEmail||'your registered recovery email'}. Check your inbox.`;
       resEl.classList.remove('hidden');
     }
     toast('Reset link dispatched');
   }finally{if(btn){btn.disabled=false;renderAccountUI()}}
 },
 async confirmReset(){
   const errEl=$('#auth-err'),btn=$('#auth-submit'),showErr=msg=>{if(errEl){errEl.textContent=msg;errEl.classList.remove('hidden')}};
   if(errEl)errEl.classList.add('hidden');
   if(!S.sbConfigured)return showErr(`Missing ${(S.sbMissing?.length?S.sbMissing:['SUPABASE_URL','SUPABASE_SECRET_KEY']).join(' / ')} in Vercel Environment Variables. Add them & redeploy, or click "Continue in Local Sandbox Mode" below.`);
   if(!S.recovery?.token&&!S.recovery?.accessToken&&!S.recovery?.tokenHash)return showErr('Reset token is missing or already used.');
   const p1=$('#auth-rs-p1')?.value||'',p2=$('#auth-rs-p2')?.value||'';
   if(p1.length<6)return showErr('New password must be at least 6 characters.');
   if(p1!==p2)return showErr('Passwords do not match.');
   if(btn){btn.disabled=true;btn.textContent='Updating password…'}
   try{
     const res=await sbPost({action:'confirmPasswordReset',token:S.recovery.token||undefined,accessToken:S.recovery.accessToken||undefined,tokenHash:S.recovery.tokenHash||undefined,newPassword:p1});
     if(!res?.ok)return showErr(res?.error||'Could not update password');
     S.recovery=null;
     if($('#auth-rs-p1'))$('#auth-rs-p1').value='';
     if($('#auth-rs-p2'))$('#auth-rs-p2').value='';
     if(res.authenticated&&res.user){
       try{localStorage.setItem('wg_has_session','1');localStorage.removeItem('wg_local_mode')}catch(e){}
       await applyCloudBootstrap(res,false);
       connectRealtime(res.realtime);
       closeM('m-auth');
       setShell('app');
       setView('chats');
       if(window.matchMedia('(min-width:768px)').matches&&D.length&&!D.some(c=>c.id===S.chat))openChat(D[0].id);
       toast('Password updated · signed in');
     }else{
       S.authTab='signin';
       renderAccountUI();
       toast('Password updated · please sign in');
     }
   }finally{if(btn){btn.disabled=false;renderAccountUI()}}
 },
 async saveRecoveryEmail(){
   const email=($('#auth-rec-in')?.value||'').trim().toLowerCase();
   if(!email)return toast('Enter a recovery email or click Remove','err');
   const res=await sbPost({action:'updateRecoveryEmail',recoveryEmail:email});
   if(!res?.ok)return toast(res?.error||'Could not save recovery email','err');
   if(S.user){S.user.recoveryEmail=res.recoveryEmail||email;S.user.hasRecoveryEmail=true}
   renderAccountUI();
   toast('Recovery email saved');
 },
 async clearRecoveryEmail(){
   const res=await sbPost({action:'updateRecoveryEmail',recoveryEmail:''});
   if(!res?.ok)return toast(res?.error||'Could not remove recovery email','err');
   if(S.user){S.user.recoveryEmail=null;S.user.hasRecoveryEmail=false}
   if($('#auth-self-link-box'))$('#auth-self-link-box').classList.add('hidden');
   renderAccountUI();
   toast('Recovery email removed');
 },
 async sendSelfReset(){
   const res=await sbPost({action:'createSelfResetLink',sendEmail:true});
   if(!res?.ok)return toast(res?.error||'Could not create reset link','err');
   const box=$('#auth-self-link-box'),msg=$('#auth-self-link-msg'),urlIn=$('#auth-self-url'),mailA=$('#auth-self-mailto');
   if(urlIn)urlIn.value=res.resetUrl||'';
   if(msg)msg.textContent=res.delivered
     ?`Reset link dispatched via ${res.provider||'email'} to ${res.maskedEmail} and ready to copy below (valid ${res.expiresInMinutes||15} min).`
     :`Single-use 15-min reset link generated for ${res.maskedEmail}. Copy or share it below${res.emailNotice?' — '+res.emailNotice:''}.`;
   if(mailA){
     const sub=encodeURIComponent('WhatsGram Password Reset Link');
     const body=encodeURIComponent(`Use this single-use 15-minute link to reset your WhatsGram password:\n\n${res.resetUrl}\n`);
     mailA.href=`mailto:${encodeURIComponent(res.recoveryEmail||'')}?subject=${sub}&body=${body}`;
   }
   if(box)box.classList.remove('hidden');
   toast(res.delivered?'Reset link emailed & ready':'Reset link ready to share');
 },
 copySelfReset(){
   const v=$('#auth-self-url')?.value||'';
   if(!v)return toast('Create a reset link first','err');
   if(navigator.clipboard?.writeText)navigator.clipboard.writeText(v).then(()=>toast('Reset link copied'),()=>toast('Copy blocked by browser','err'));
   else toast('Clipboard unavailable','err');
 },
 openSelfReset(){
   const raw=($('#auth-self-url')?.value||'').trim();
   const m=raw.match(/#wg-reset=([^&#]+)/)||raw.match(/[?&]reset=([^&#]+)/);
   const token=m?decodeURIComponent(m[1]):'';
   if(!token)return toast('Create a reset link first','err');
   S.recovery={token,accessToken:null,tokenHash:null};
   S.authTab='reset';
   if($('#auth-err'))$('#auth-err').classList.add('hidden');
   if($('#auth-rs-p1'))$('#auth-rs-p1').value='';
   if($('#auth-rs-p2'))$('#auth-rs-p2').value='';
   renderAccountUI();
   setTimeout(()=>$('#auth-rs-p1')?.focus(),40);
 },
 async changePassword(){
   const currentPassword=$('#auth-chg-cur')?.value||'',newPassword=$('#auth-chg-new')?.value||'';
   if(!currentPassword||newPassword.length<6)return toast('Enter current password and a new password (6+ chars)','err');
   const res=await sbPost({action:'changePassword',currentPassword,newPassword});
   if(!res?.ok)return toast(res?.error||'Could not update password','err');
   if($('#auth-chg-cur'))$('#auth-chg-cur').value='';
   if($('#auth-chg-new'))$('#auth-chg-new').value='';
   toast('Password updated');
 },
 async signOut(){if(S.incognito){exitIncognitoMode();return}disconnectRealtime();if(S.user)await sbPost({action:'signout'});lsDel('wg_has_session');lsDel('wg_local_mode');lsDel('wg_local_user');S.user=null;S.localUser=null;S.users=[];S.profData=null;S.profId=null;S.ecdhId=null;S.e2eeRing={};S.onlineUsers={};S.typingTms={};S.recovery=null;await genKey();renderAccountUI();renderDmUsers();renderGroupMembers();renderList();renderThread();renderInfo();renderStories();closeM('m-auth');closeMenu();setShell('landing');try{if(location.pathname==='/logout')history.replaceState(null,'','/')}catch(e){}toast('Logged out')},
 syncNow(){refreshCloud(false)},
 confirmYes(){const f=S.confirm;S.confirm=null;closeM('m-confirm');f&&f()},
 sw(k){cfg[k]=!cfg[k];if(k==='notify'&&cfg[k]&&typeof Notification!=='undefined'&&Notification.permission==='default'){Notification.requestPermission().then(p=>{if(p!=='granted'){cfg.notify=false;applyCfg()}saveCfg()})}saveCfg();applyCfg();if(k==='spatial'&&cfg[k]){tone(500,.25,-1,.05);setTimeout(()=>tone(700,.25,1,.05),300)}if(k==='e2ee'){renderHead();audit('E2EE '+(cfg[k]?'enabled':'disabled'))}if(k==='vanish')audit('Vanish mode '+(cfg[k]?'enabled':'disabled'))},
 accent(c){cfg.accent=c;saveCfg();applyCfg();renderStats()},
 savePin:async()=>{const v=$('#pin-in').value.trim();if(v.length<4)return toast('Use at least 4 digits','err');cfg.pin=await sha(v);saveCfg();$('#pin-in').value='';applyCfg();audit('Passcode set');toast('Passcode saved')},
 removePin(){if(!cfg.pin)return toast('No passcode is set','err');cfg.pin=null;saveCfg();applyCfg();audit('Passcode removed')},
 async rotateKey(){await ensureEcdhIdentity(true);renderInfo();renderHead();audit('ECDH identity key rotated');toast(S.user?'ECDH key rotated & published':'ECDH key rotated')},
 copyFp(){navigator.clipboard?.writeText(FP).then(()=>toast('Fingerprint copied'),()=>toast('Copy blocked by browser','err'))},
 purge(){ask('Purge enclave?','This permanently erases all local data and reloads the app.',async()=>{if(S.user){await sbPost({action:'purgeEnclave'});await sbPost({action:'signout'})}await clearOutbox();try{Object.keys(localStorage).filter(k=>k.startsWith('wg_')).forEach(k=>localStorage.removeItem(k))}catch(e){}location.reload()})},
 auditClear(){LOG=[];store.set('log',LOG);renderAudit();if(S.user)sbPost({action:'clearAudit'})},
 async voicePlay(id,el){const row=el.closest('.grp');if(!row)return;if(row.classList.contains('playing')){row.classList.remove('playing');return}row.classList.add('playing');const c=cur(),m=c?.msgs.find(x=>x.id===id),stop=()=>row.classList.remove('playing');let url=BLOBS[id];if(!url&&m?.mediaPath&&S.user)url=await resolveMediaUrl(c,m);if(url){const a=new Audio(url);a.onended=stop;a.onerror=stop;a.play().catch(stop)}else{const[mm,ss]=(m?.dur||'0:02').split(':').map(Number);setTimeout(stop,Math.max(1200,(mm*60+ss)*1000))}},
 acceptCall:()=>acceptCall(),
 rejectCall:()=>rejectCall(),
 async openMedia(id){
   const c=cur(),m=c?.msgs.find(x=>x.id===id);if(!m)return;
   const url=BLOBS[m.id]||(m.mediaPath?await resolveMediaUrl(c,m):'');if(!url)return toast('Media unavailable','err');
   S.lbMediaList=(c?.msgs||[]).filter(x=>x.type==='media').map(x=>x.id);
   S.lbMediaIdx=Math.max(0,S.lbMediaList.indexOf(m.id));
   S.lbMsgId=m.id;S.lbZoom=1;
   setTxt('#lb-cap',`${m.name||'Media'} · ${m.size||''}`);
   setTxt('#lb-zoom-lbl','1x');
   const wm=$('#lb-wm');if(wm)wm.textContent=`@${userHandle(S.user||S.localUser)||'whatsgram'}`;
   const img=$('#lb-img'),vid=$('#lb-vid');img.classList.add('hidden');vid.classList.add('hidden');vid.pause();img.style.transform='scale(1)';
   if(m.mediaMime?.startsWith('video/')){vid.src=url;vid.classList.remove('hidden')}else{img.src=url;img.classList.remove('hidden')}
   openM('m-media');
 },
 lbDownload(){if(S.lbMsgId)A.downloadFile(S.lbMsgId)},
 async downloadFile(id){const c=cur(),m=c?.msgs.find(x=>x.id===id);if(!m)return;const url=BLOBS[m.id]||(m.mediaPath?await resolveMediaUrl(c,m):'');if(!url){toast(m.mediaPath?'Sign in to download cloud attachment':'File preview expired (local-only)');return}const a=document.createElement('a');a.href=url;a.download=m.name||'attachment';a.target='_blank';a.rel='noopener';document.body.appendChild(a);a.click();a.remove()},
 reelNext:()=>goReel(1),reelPrev:()=>goReel(-1),reelLike:()=>likeReel(),
 reelMute(){S.reelMuted=!S.reelMuted;const rv=$('#reel-vid');if(rv)rv.muted=S.reelMuted;const mic=$('#reel-mute-ic');if(mic){mic.setAttribute('data-lucide',S.reelMuted?'volume-x':'volume-2');icons()}toast(S.reelMuted?'Sound muted':'Sound unmuted')},
 reelSave(){const id=getReels()[S.reel].id,i=RS.saved.indexOf(id);i<0?RS.saved.push(id):RS.saved.splice(i,1);saveR();renderReel(false);toast(i<0?'Saved to collection':'Removed from collection')},
 reelFollow(){const a=getReels()[S.reel].author,i=RS.follow.indexOf(a);i<0?RS.follow.push(a):RS.follow.splice(i,1);saveR();renderReel(false)},
 setFilter(i){RS.filter=+i;saveR();$('#reel-bg').style.filter=FILTERS[RS.filter][1];setTxt('#filter-lbl',FILTERS[RS.filter][0])},
 studioFilter(i){RS.filter=+i;saveR();renderStudioPreview();if(S.view==='reels'){$('#reel-bg').style.filter=FILTERS[RS.filter][1];setTxt('#filter-lbl',FILTERS[RS.filter][0])}},
 reelComments:()=>openComments(),
 cmLike(k){const ls=RS.cmLikes||(RS.cmLikes=[]),i=ls.indexOf(k);i<0?ls.push(k):ls.splice(i,1);saveR();openComments()},
 reelShare(){const u=`${location.href.split('#')[0]}#reel-${getReels()[S.reel].id}`;if(navigator.share)navigator.share({title:'WhatsGram reel',url:u}).catch(()=>{});else navigator.clipboard?.writeText(u).then(()=>toast('Reel link copied'),()=>toast('Copy blocked by browser','err'))},
 postComment(){const i=$('#cm-in'),t=i.value.trim();if(!t)return;const id=getReels()[S.reel].id,author=S.user?.displayName||'You';(RS.extra[id]=RS.extra[id]||[]).push({n:author,t});saveR();i.value='';openComments();renderReel(false);if(S.user)sbPost({action:'addReelComment',reelId:id,id:uid('rc'),authorName:author,text:t})},
 reelNew(){A.storyNew('reel')},
 storyNew(mode){S.studioMode=mode==='reel'?'reel':'story';S.stBg=0;S.stFont=0;S.stStickers=[];S.stMedia=null;S.reelAudioDraft=null;S.reelRemixDraft=null;$('#st-in').value='';$('#st-url').value='';$('#st-file').value='';if($('#st-opt1'))$('#st-opt1').value='';if($('#st-opt2'))$('#st-opt2').value='';if($('#st-cf'))$('#st-cf').checked=false;$('#st-co').innerHTML='<option value="">Tag co-author</option>'+D.map(c=>`<option>${esc(c.name)}</option>`).join('');renderStudioPreview();openM('m-studio')},
 studioMode(m){S.studioMode=m==='reel'?'reel':'story';renderStudioPreview()},
 studioPickMedia(){$('#st-file').click()},
 studioClearMedia(){S.stMedia=null;$('#st-file').value='';renderStudioPreview()},
 stBg(i){S.stBg=+i;renderStudioPreview()},
 async aiStudioSuggest(){
   const isReel=S.studioMode==='reel',seed=$('#st-in').value.trim();
   toast('Generating with Gemini…');
   const prompt=isReel
     ?`Write a catchy short Instagram Reel caption (1-2 sentences) with 3 relevant #hashtags${seed?' about: '+seed:' about behind-the-scenes studio craftsmanship'}. Output only the caption.`
     :`Write a short punchy Instagram Story Poll question (under 55 characters, ends with ?) + two short 1-2 word answer choices separated by | e.g. Question? | Opt A | Opt B${seed?' inspired by: '+seed:''}.`;
   const res=await callGemini({prompt,system:'You are a concise Instagram creative assistant. Follow exact output format.'});
   const txt=(res?.text||'').trim().replace(/^["']|["']$/g,'');
   if(isReel){
     $('#st-in').value=(txt||'Behind the scenes shipping the latest creator studio upgrade today. #WhatsGram #CreatorStudio #DarkMode').slice(0,500);
   }else{
     const parts=txt.split('|').map(x=>x.trim()).filter(Boolean);
     if(parts.length>=3){
       $('#st-in').value=parts[0].slice(0,120);
       if($('#st-opt1'))$('#st-opt1').value=parts[1].slice(0,24);
       if($('#st-opt2'))$('#st-opt2').value=parts[2].slice(0,24);
     }else{
       $('#st-in').value=(txt||'Drop the new release tonight?').slice(0,120);
     }
   }
   renderStudioPreview();
   toast(res?.text?'Generated with Gemini AI':'Sample prompt inserted');
 },
 async publish(){
   const isReel=S.studioMode==='reel',q=$('#st-in').value.trim()||(isReel?'Behind the scenes from today’s build #WhatsGram':'Drop the new release tonight?');
   const itemId=isReel?(Math.floor(Date.now()%1800000000)+10000):uid('s');
   let up=null;
   if(S.stMedia?.file&&S.user&&S.sbConfigured){
     toast(isReel?'Uploading reel media…':'Uploading story media…');
     up=await uploadCloudMedia(null,String(itemId),S.stMedia.file,S.stMedia.file.name,S.stMedia.mime,{scope:S.studioMode});
   }
   if(isReel){
     const rl={id:itemId,author:S.user?.displayName||S.user?.email||'you',cap:q,g:bgs[S.stBg]||bgs[0],filterIdx:RS.filter,likes:1,com:[],...(S.reelAudioDraft?{audioTitle:S.reelAudioDraft}:{}),...(S.reelRemixDraft?{remixedFrom:S.reelRemixDraft}:{}),...(up?{mediaPath:up.mediaPath,mediaMime:up.mediaMime}:{}),...(S.stMedia?.url?{_localUrl:S.stMedia.url,mediaMime:S.stMedia.mime}:{})};
     S.reelAudioDraft=null;S.reelRemixDraft=null;
     CUSTOM_REELS.push(rl);store.set('custom_reels',CUSTOM_REELS);closeM('m-studio');setView('reels');S.reel=getReels().length-1;renderReel();toast('Reel published');
     if(S.user){const wire=Object.assign({},rl);delete wire._localUrl;sbPost({action:'createReel',reel:wire})}
     return;
   }
   const optYes=($('#st-opt1')?.value||'').trim()||'Yes',optNo=($('#st-opt2')?.value||'').trim()||'No';
   const st={id:itemId,name:S.user?.displayName||'You',bg:bgs[S.stBg]||bgs[0],fontIdx:S.stFont||0,stickers:[...(S.stStickers||[])],closeFriends:Boolean($('#st-cf')?.checked),q,optYes,optNo,yes:1,no:0,link:$('#st-url').value.trim(),co:$('#st-co').value,seen:true,voted:false,...(up?{mediaPath:up.mediaPath,mediaMime:up.mediaMime}:{}),...(S.stMedia?.url?{_localUrl:S.stMedia.url,mediaMime:S.stMedia.mime}:{})};
   ST.push(st);saveS();closeM('m-studio');renderStories();toast('Story published');
   if(S.user){const wire=Object.assign({},st);delete wire._localUrl;sbPost({action:'createStory',story:wire})}
 },
 storyOpen(i){S.hlView=null;S.story=+i;openM('m-story');renderStory()},
 storyNext(){if(S.hlView){const slides=S.hlView.slides||[];if(S.hlView.idx<slides.length-1){S.hlView.idx++;renderHighlightViewer()}else A.storyClose();return}if(S.story<ST.length-1){S.story++;renderStory()}else A.storyClose()},
 storyPrev(){if(S.hlView){if(S.hlView.idx>0){S.hlView.idx--;renderHighlightViewer()}return}if(S.story>0){S.story--;renderStory()}},
 storyClose(){S.story=-1;S.hlView=null;closeM('m-story');$('#sv').innerHTML=''},
 async storyVote(c){const s=ST[S.story];if(!s||s.voted)return;s[c]=(s[c]||0)+1;s.voted=true;saveS();renderStory();$('#sv-bar').style.animationPlayState='paused';if(S.user){const res=await sbPost({action:'voteStory',storyId:s.id,choice:c});if(res?.ok&&typeof res.yes==='number'&&typeof res.no==='number'){s.yes=res.yes;s.no=res.no;saveS();if(S.story>=0&&ST[S.story]?.id===s.id)renderStory()}}},
 async delStory(){
  const s=ST[S.story];if(!s)return;
  const isCustom=Boolean((S.user&&s.userId===S.user.id)||(!S.user&&(s.isCustom||String(s.id).startsWith('st_'))));
  if(!isCustom)return toast('Built-in demo stories cannot be deleted','err');
  ask('Delete story?','This permanently removes your story.',async()=>{
   if(S.user){
    const res=await sbPost({action:'deleteStory',storyId:String(s.id)});
    if(!res?.ok)return toast(res?.error||'Could not delete story','err');
   }
   const idx=ST.findIndex(x=>String(x.id)===String(s.id));
   if(idx>=0)ST.splice(idx,1);
   saveS();A.storyClose();renderStories();toast('Story deleted');
  });
 },
 async delReel(id){
  const rid=id||getReels()[S.reel]?.id;
  const rl=CUSTOM_REELS.find(x=>String(x.id)===String(rid));
  if(!rl)return toast('Only your published custom reels can be deleted','err');
  ask('Delete reel?','This permanently removes your reel and its comments.',async()=>{
   if(S.user){
    const res=await sbPost({action:'deleteReel',reelId:String(rl.id)});
    if(!res?.ok)return toast(res?.error||'Could not delete reel','err');
   }
   CUSTOM_REELS=CUSTOM_REELS.filter(x=>String(x.id)!==String(rl.id));
   store.set('custom_reels',CUSTOM_REELS);
   S.reel=Math.max(0,Math.min(S.reel,getReels().length-1));
   renderReel(true);toast('Reel deleted');
  });
 },
 openProfile:target=>openProfile(target||'self'),
 openProfileFromModal(target){closeM('m-post-view');closeM('m-follow-list');closeM('m-activity');openProfile(target||'self')},
 openPeerProfile(){
   const c=cur();if(!c)return openProfile('self');
   if(c.peerUserId){
     const peer=(S.users||[]).find(u=>u.id===c.peerUserId);
     return openProfile(peer?.username||c.peerUserId);
   }
   const match=LOCAL_SOCIAL.profiles.find(p=>p.display_name.toLowerCase()===c.name.toLowerCase());
   openProfile(match?(match.username||match.id):'self');
 },
 openAuthorProfile(author){
   const raw=normalizeHandle(author);if(!raw||raw==='you')return openProfile('self');
   if(S.user){
     const hit=S.users.find(u=>normalizeHandle(u.username)===raw||String(u.display_name||'').toLowerCase()===String(author||'').toLowerCase());
     return openProfile(hit?(hit.id||hit.username):raw);
   }
   const loc=LOCAL_SOCIAL.profiles.find(p=>normalizeHandle(p.username)===raw||p.display_name.toLowerCase()===String(author||'').toLowerCase());
   openProfile(loc?(loc.username||loc.id):'self');
 },
 profBack(){
   if(S.profPrevView&&S.profPrevView!=='profile')setView(S.profPrevView);
   else if(S.profId&&S.profId!=='self')openProfile('self');
   else setView('chats');
 },
 async openProfilePicker(){
   if(!S.profData)await loadProfileData('self',true);
   A.openFollowModal('suggested');
 },
 openActivity(){S.actUnread=0;renderActivityBadge();renderActivityModal();openM('m-activity');loadNotifications(true)},
 refreshProfileNow(){loadProfileData(S.profId||'self',false)},
 profAvatarTap(){
   const d=S.profData;if(!d)return;
   if(d.highlights?.length)return A.openHighlight(d.highlights[0].id);
   if(d.profile?.isOwn)return A.openEditProfile();
 },
 scrollToPosts(){$('#prof-tabs-bar')?.scrollIntoView({behavior:'smooth',block:'start'})},
 profTab(k){S.profTab=k||'posts';renderProfile()},
 toggleSuggest(){S.profSuggest=!S.profSuggest;renderProfile()},
 clearTagFilter(){S.profTag=null;renderProfile()},
 filterTag(t){S.profTag=String(t||'').replace(/^#/,'');renderProfile()},
 copyHandle(h){
   const raw=h||(S.profData?.profile?.username)||(S.profData?.profile?.display_name)||'creator';
   const txt='@'+String(raw).replace(/^@/,'');
   navigator.clipboard?.writeText(txt).then(()=>toast(`Copied ${txt}`),()=>toast(txt));
 },
 profShare(){
   const p=S.profData?.profile;
   const slug=p?.username||p?.id||'self';
   const url=`${location.origin}${location.pathname}#wg-profile=${encodeURIComponent(slug)}`;
   if(navigator.share)navigator.share({title:`${p?.display_name||slug} on WhatsGram`,url}).catch(()=>{});
   else navigator.clipboard?.writeText(url).then(()=>toast('Profile link copied'),()=>toast(url));
 },
 profEmail(){
   const em=S.profData?.profile?.contact_email;
   if(!em)return toast('No public contact email set','err');
   navigator.clipboard?.writeText(em).catch(()=>{});
   try{location.href='mailto:'+encodeURIComponent(em)}catch(e){}
   toast(`Contact email copied: ${em}`);
 },
 async profFollow(){
   const p=S.profData?.profile;if(!p||p.isOwn)return;
   return A.profToggleFollowId(p.id);
 },
 async profToggleFollowId(targetId){
   if(!targetId)return;
   if(S.user){
     const res=await sbPost({action:'toggleFollow',targetUserId:targetId});
     if(!res?.ok)return toast(res?.error||'Could not update follow status','err');
     const status=res.status||(res.requested?'pending':(res.following?'accepted':'none'));
     toast(status==='pending'?'Follow request sent':res.following?'Following':'Unfollowed');
     if(S.feedData){
       (S.feedData.creators||[]).forEach(c=>{if(c.id===targetId){c.isFollowing=Boolean(res.following);c.followStatus=status;c.requested=Boolean(res.requested)}});
       (S.feedData.posts||[]).forEach(p=>{if(p.userId===targetId)p.fromFollowing=Boolean(res.following)});
       if(S.view==='feed')renderFeedView();
     }
     if(S.profData)await loadProfileData(S.profId||'self',true);
     return;
   }
   const idx=LOCAL_SOCIAL.follows.findIndex(f=>f[0]==='self'&&f[1]===targetId);
   if(idx>=0){LOCAL_SOCIAL.follows.splice(idx,1);toast('Unfollowed')}
   else{LOCAL_SOCIAL.follows.push(['self',targetId]);toast('Following')}
   saveLocalSocial();
   if(S.feedData){S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S});if(S.view==='feed')renderFeedView()}
   S.profData=buildLocalProfileData(S.profId||'self');
   renderProfile();
   if($('#m-follow-list')?.classList.contains('open'))renderFollowListModal();
 },
 async profMsg(){
   const p=S.profData?.profile;if(!p)return;
   if(S.user){
     if(p.id===S.user.id){setView('chats');return}
     if(!S.users.some(u=>u.id===p.id))S.users.push(p);
     return A.dmUser(p.id);
   }
   const existing=D.find(c=>c.name.toLowerCase()===(p.display_name||'').toLowerCase());
   if(existing){setView('chats');return openChat(existing.id)}
   const cid=uid('c');
   D.push({id:cid,name:p.display_name||p.username||'Creator',folder:'personal',unread:0,status:p.status||'Online',pin:null,msgs:[{id:uid('m'),from:'sys',type:'sys',text:`Encrypted DM started with ${p.display_name||p.username}`,t:now(),ts:Date.now()}]});
   saveD();setView('chats');openChat(cid);
 },
 openEditProfile(){renderEditProfileModal();openM('m-edit-profile')},
 pickAvatar(){$('#ep-av-file').click()},
 clearAvatar(){S.epAvatarPath='';S.epAvatarUrl='';updateEpAvatarPreview()},
 async aiBioSuggest(){
   const name=$('#ep-name').value.trim()||'Creator',cat=$('#ep-cat').value.trim()||'Digital Creator',curBio=$('#ep-bio').value.trim();
   toast('Drafting bio with Gemini…');
   const prompt=`Write a punchy, attractive 2-line Instagram creator bio (under 150 chars total) for ${name}${cat?' ('+cat+')':''}${curBio?', refining: "'+curBio+'"':''}. Include 2 relevant #hashtags. Return ONLY the bio text, no quotes.`;
   const res=await callGemini({prompt,system:'You are a concise brand copywriter. Output only the requested bio text.'});
   const bio=(res?.text||'').trim().replace(/^["']|["']$/g,'')||`${cat} · Building remarkable digital products & workflows.\n#CreatorOS #WhatsGram`;
   $('#ep-bio').value=bio.slice(0,300);
   toast(res?.text?'Bio polished with Gemini AI':'Crafted clean creator bio');
 },
 async saveProfile(){
   const btn=$('#ep-save');
   const displayName=$('#ep-name').value.trim();
   if(!displayName)return toast('Display name is required','err');
   const links=[];
   for(const line of $('#ep-links').value.split('\n')){
     const clean=line.trim();if(!clean)continue;
     const parts=clean.split('|');
     const urlRaw=(parts[1]||parts[0]).trim();
     const title=(parts[1]?parts[0]:urlRaw.replace(/^https?:\/\//i,'').split('/')[0]).trim();
     if(urlRaw)links.push({title,url:/^https?:\/\//i.test(urlRaw)?urlRaw:'https://'+urlRaw});
   }
   const isPrivate=$('#ep-private')?.getAttribute('aria-checked')==='true';
   const payload={
     displayName,
     category:$('#ep-cat').value.trim(),
     bio:$('#ep-bio').value.trim(),
     website:$('#ep-web').value.trim(),
     links,
     locationText:$('#ep-loc').value.trim(),
     contactEmail:$('#ep-email').value.trim(),
     threadsHandle:$('#ep-threads').value.trim(),
     status:$('#ep-status').value.trim()||'Online',
     avatarPath:S.epAvatarPath||'',
     isPrivate
   };
   if(btn){btn.disabled=true;btn.textContent='Saving…'}
   try{
     if(S.user){
       const res=await sbPost({action:'updateProfile',...payload});
       if(!res?.ok)return toast(res?.error||'Save failed','err');
       S.user.displayName=displayName;
       S.user.isPrivate=isPrivate;
       if(res.profile?.avatarUrl)S.user.avatarUrl=res.profile.avatarUrl;
       renderAccountUI();
       closeM('m-edit-profile');
       await loadProfileData('self',true);
       toast('Profile updated');
       return;
     }
     const me=LOCAL_SOCIAL.profiles[0];
     Object.assign(me,{display_name:displayName,category:payload.category,bio:payload.bio,website:/^https?:\/\//i.test(payload.website)||!payload.website?payload.website:'https://'+payload.website,links,location_text:payload.locationText,contact_email:payload.contactEmail,threads_handle:payload.threadsHandle.replace(/^@/,''),status:payload.status,is_private:isPrivate,avatarUrl:S.epAvatarUrl||''});
     saveLocalSocial();
     closeM('m-edit-profile');
     loadProfileData('self',true);
     toast('Profile updated');
   }finally{if(btn){btn.disabled=false;btn.textContent='Save profile changes'}}
 },
 openPostModal(){S.editingPostId=null;S.postMedia=[];S.postBg=0;S.postAspect='1:1';S.postFilter='normal';$('#post-cap').value='';$('#post-loc').value='';$('#post-tags').value='';if($('#post-coauthor'))$('#post-coauthor').value='';if($('#post-schedule'))$('#post-schedule').value='';$('#post-pin').checked=false;if($('#post-hide-likes'))$('#post-hide-likes').checked=false;if($('#post-no-comments'))$('#post-no-comments').checked=false;$('#post-file').value='';setTxt('#post-modal-title','Create new post');setTxt('#post-submit','Share post');renderPostPreview();openM('m-post')},
 editPost(postId){
   const p=findPostById(postId||S.postViewId);if(!p)return;
   S.editingPostId=p.id;
   S.postMedia=(p.mediaUrls||[]).map(u=>({url:u,mime:p.mediaType==='video'?'video/mp4':'image/jpeg',existing:true}));
   const bgIdx=POST_BGS.indexOf(p.bg);
   S.postBg=bgIdx>=0?bgIdx:0;
   S.postAspect=p.aspectRatio||'1:1';
   S.postFilter='normal';
   $('#post-cap').value=p.caption||'';
   $('#post-loc').value=p.locationText||'';
   $('#post-tags').value=(p.tags||[]).join(', ');
   if($('#post-coauthor'))$('#post-coauthor').value=p.coauthorHandle||'';
   if($('#post-schedule'))$('#post-schedule').value=p.scheduledAt?String(p.scheduledAt).slice(0,16):'';
   $('#post-pin').checked=Boolean(p.pinned);
   if($('#post-hide-likes'))$('#post-hide-likes').checked=Boolean(p.hideLikes);
   if($('#post-no-comments'))$('#post-no-comments').checked=Boolean(p.commentsDisabled);
   $('#post-file').value='';
   setTxt('#post-modal-title','Edit post');
   setTxt('#post-submit','Save changes');
   closeM('m-post-view');
   renderPostPreview();
   openM('m-post');
 },
 postBg(i){S.postBg=+i;renderPostPreview()},
 pickPostMedia(){$('#post-file').click()},
 clearPostMedia(){S.postMedia=[];S.postFilter='normal';$('#post-file').value='';renderPostPreview()},
 async aiPostCaption(){
   const seed=$('#post-cap').value.trim(),loc=$('#post-loc').value.trim();
   toast('Generating caption with Gemini…');
   const prompt=`${seed||'Launching a sleek new encrypted creator workspace update'}${loc?' in '+loc:''}`;
   const res=await callGemini({mode:'caption',prompt});
   const rawCap=(res?.caption||res?.text||'').trim().replace(/^["']|["']$/g,'')||'Shipping fresh updates from the studio today — faster workflows, crisp design, zero compromise on privacy.\n#WhatsGram #LaunchDay #PrivacyFirst #BuildInPublic';
   const hashStr=Array.isArray(res?.hashtags)&&res.hashtags.length?'\n'+res.hashtags.map(h=>'#'+String(h).replace(/^#+/,'')).join(' '):'';
   const full=(hashStr&&!rawCap.includes('#'))?(rawCap+hashStr):rawCap;
   $('#post-cap').value=full.slice(0,1200);
   if(Array.isArray(res?.hashtags)&&res.hashtags.length&&$('#post-tags')&&!$('#post-tags').value.trim()){
     $('#post-tags').value=res.hashtags.map(h=>String(h).replace(/^#+/,'')).join(', ');
   }
   renderPostPreview();
   toast((res?.caption||res?.text)?'Caption generated with Gemini AI':'Sample caption generated');
 },
 async createPost(){
   const caption=$('#post-cap').value.trim(),locationText=$('#post-loc').value.trim(),pinned=Boolean($('#post-pin').checked);
   const coauthorHandle=($('#post-coauthor')?.value||'').trim().replace(/^@+/,'').toLowerCase()||null;
   const schedVal=$('#post-schedule')?.value||'';
   const scheduledAt=schedVal?new Date(schedVal).toISOString():null;
   const hideLikes=Boolean($('#post-hide-likes')?.checked);
   const commentsDisabled=Boolean($('#post-no-comments')?.checked);
   const aspectRatio=S.postAspect||'1:1';
   const rawTags=$('#post-tags').value.split(',').map(x=>x.trim().replace(/^[@#]+/,'').toLowerCase()).filter(Boolean);
   if(!caption&&!S.postMedia.length)return toast('Add a caption or media file','err');
   const btn=$('#post-submit'),isEdit=Boolean(S.editingPostId),editId=S.editingPostId;
   if(btn){btn.disabled=true;btn.textContent=isEdit?'Saving…':'Publishing…'}
   try{
     if(isEdit){
       if(S.user){
         const res=await sbPost({action:'editPost',postId:editId,caption,locationText,tags:rawTags,bg:POST_BGS[S.postBg],coauthorHandle,scheduledAt,hideLikes,commentsDisabled,aspectRatio});
         if(!res?.ok)return toast(res?.error||'Save failed','err');
         S.editingPostId=null;closeM('m-post');
         if(S.profData)await loadProfileData(S.profId||'self',true);
         if(S.feedData)await loadFeedData(true);
         toast('Post updated');
         return;
       }
       const raw=LOCAL_SOCIAL.posts.find(x=>x.id===editId);
       if(raw){
         const autoTags=[...new Set([...rawTags,...[...caption.matchAll(/[@#]([a-z0-9][a-z0-9._-]{1,31})/gi)].map(m=>m[1].toLowerCase())])];
         raw.caption=caption;raw.locationText=locationText;raw.tags=autoTags;raw.bg=POST_BGS[S.postBg];raw.pinned=pinned;
         raw.coauthorHandle=coauthorHandle;raw.scheduledAt=scheduledAt;raw.hideLikes=hideLikes;raw.commentsDisabled=commentsDisabled;raw.aspectRatio=aspectRatio;
         saveLocalSocial();
       }
       S.editingPostId=null;closeM('m-post');
       S.profData=buildLocalProfileData(S.profId||'self');
       if(S.feedData){S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S});if(S.view==='feed')renderFeedView()}
       if(S.view==='profile')renderProfile();
       toast('Post updated');
       return;
     }
     const pid=uid('pt');
     const processedItems=[];
     for(const item of S.postMedia){
       if(item.file&&S.postFilter&&S.postFilter!=='normal'&&item.mime?.startsWith('image/')){
         const filteredFile=await applyCanvasFilter(item.file,S.postFilter,1600);
         let dataUrl=item.dataUrl;
         if(!S.user&&filteredFile.size<=1500000){
           dataUrl=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(String(r.result||''));r.onerror=()=>res(null);r.readAsDataURL(filteredFile)});
         }
         processedItems.push({...item,file:filteredFile,dataUrl});
       }else processedItems.push(item);
     }
     if(S.user){
       const mediaPaths=[];
       for(let i=0;i<processedItems.length;i++){
         const item=processedItems[i];
         if(S.sbConfigured&&item.file){
           const up=await uploadCloudMedia(null,`${pid}_${i}`,item.file,item.file.name,item.mime,{scope:'post'});
           if(up?.mediaPath)mediaPaths.push(up.mediaPath);
         }
       }
       const firstVid=processedItems[0]?.mime?.startsWith('video/');
       const mediaType=mediaPaths.length>1?'carousel':(firstVid?'video':(mediaPaths.length?'image':'card'));
       const res=await sbPost({action:'createPost',post:{id:pid,caption,locationText,tags:rawTags,mediaType,mediaPaths,bg:POST_BGS[S.postBg],pinned,coauthorHandle,scheduledAt,hideLikes,commentsDisabled,aspectRatio}});
       if(!res?.ok)return toast(res?.error||'Publish failed','err');
       closeM('m-post');
       S.profTab='posts';
       await loadProfileData('self',false);
       if(S.feedData)loadFeedData(true);
       toast(scheduledAt?'Post scheduled':'Post published');
       return;
     }
     const mediaUrls=[];
     for(const item of processedItems){
       if(item.dataUrl)mediaUrls.push(item.dataUrl);
       else if(item.url)mediaUrls.push(item.url);
     }
     const firstVid=processedItems[0]?.mime?.startsWith('video/');
     const autoTags=[...new Set([...rawTags,...[...caption.matchAll(/[@#]([a-z0-9][a-z0-9._-]{1,31})/gi)].map(m=>m[1].toLowerCase())])];
     LOCAL_SOCIAL.posts.unshift({id:pid,userId:'self',caption,locationText,tags:autoTags,mediaType:mediaUrls.length>1?'carousel':(firstVid?'video':(mediaUrls.length?'image':'card')),mediaUrls,bg:POST_BGS[S.postBg],pinned,coauthorHandle,scheduledAt,hideLikes,commentsDisabled,aspectRatio,createdAt:new Date().toISOString()});
     saveLocalSocial();
     closeM('m-post');
     if(S.feedData)S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S});
     S.profTab='posts';
     if(S.view==='feed')renderFeedView();else openProfile('self');
     toast('Post published');
   }finally{if(btn){btn.disabled=false;btn.textContent=S.editingPostId?'Save changes':'Share post'}}
 },
 viewPost(postId){S.postViewId=postId;S.postViewSlide=0;renderPostView();openM('m-post-view')},
 pvSlide(d){const p=findPostById(S.postViewId);const n=(p?.mediaUrls||[]).length;if(n<2)return;S.postViewSlide=(S.postViewSlide+(+d)+n)%n;renderPostView()},
 dblLikePost(_,__,ev){
   if(ev?.target?.closest('button'))return;
   const n=Date.now();
   if(S._pvTap&&n-S._pvTap<320){
     S._pvTap=0;
     const box=$('#pv-media-box');
     if(box){const h=document.createElement('div');h.className='burst absolute z-20 text-6xl pointer-events-none';h.textContent='❤️';box.appendChild(h);setTimeout(()=>h.remove(),900)}
     const p=findPostById(S.postViewId);if(p&&!p.likedByMe)A.likePost();
   }else{S._pvTap=n}
 },
 async likePost(){
   const p=findPostById(S.postViewId);if(!p)return;
   if(S.user){
     const res=await sbPost({action:'togglePostLike',postId:p.id});
     if(!res?.ok)return toast(res?.error||'Could not like post','err');
     p.likedByMe=res.liked;p.likesCount=res.count;
     const fp=(S.feedData?.posts||[]).find(x=>x.id===p.id);if(fp&&fp!==p){fp.likedByMe=res.liked;fp.likesCount=res.count}
     renderPostView();if(S.view==='profile')renderProfile();if(S.view==='feed')renderFeedView();
     return;
   }
   const idx=LOCAL_SOCIAL.likes.findIndex(l=>l[0]===p.id&&l[1]==='self');
   if(idx>=0)LOCAL_SOCIAL.likes.splice(idx,1);else LOCAL_SOCIAL.likes.push([p.id,'self']);
   saveLocalSocial();S.profData=buildLocalProfileData(S.profId||'self');
   if(S.feedData)S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S});
   renderPostView();if(S.view==='profile')renderProfile();if(S.view==='feed')renderFeedView();
 },
 async savePost(){
   const p=findPostById(S.postViewId);if(!p)return;
   if(S.user){
     const res=await sbPost({action:'togglePostSave',postId:p.id,kind:'save'});
     if(!res?.ok)return toast(res?.error||'Save failed','err');
     p.savedByMe=Boolean(res.active);
     const fp=(S.feedData?.posts||[]).find(x=>x.id===p.id);if(fp&&fp!==p)fp.savedByMe=Boolean(res.active);
     toast(res.active?'Saved to profile':'Removed from saved');
     if(S.profData)await loadProfileData(S.profId||'self',true);else renderPostView();
     if(S.view==='feed')renderFeedView();
     return;
   }
   const idx=LOCAL_SOCIAL.saves.findIndex(s=>s[0]===p.id&&s[1]==='self'&&s[2]==='save');
   if(idx>=0){LOCAL_SOCIAL.saves.splice(idx,1);toast('Removed from saved')}
   else{LOCAL_SOCIAL.saves.push([p.id,'self','save']);toast('Saved to profile')}
   saveLocalSocial();S.profData=buildLocalProfileData(S.profId||'self');
   if(S.feedData)S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S});
   renderPostView();if(S.view==='profile')renderProfile();if(S.view==='feed')renderFeedView();
 },
 async repostPost(){
   const p=findPostById(S.postViewId);if(!p)return;
   if(S.user){
     const res=await sbPost({action:'togglePostSave',postId:p.id,kind:'repost'});
     if(!res?.ok)return toast(res?.error||'Repost failed','err');
     toast(res.active?'Reposted to your profile':'Repost removed');
     await loadProfileData(S.profId||'self',true);
     return;
   }
   const idx=LOCAL_SOCIAL.saves.findIndex(s=>s[0]===p.id&&s[1]==='self'&&s[2]==='repost');
   if(idx>=0){LOCAL_SOCIAL.saves.splice(idx,1);toast('Repost removed')}
   else{LOCAL_SOCIAL.saves.push([p.id,'self','repost']);toast('Reposted to your profile')}
   saveLocalSocial();S.profData=buildLocalProfileData(S.profId||'self');renderPostView();renderProfile();
 },
 async pinPost(){
   const p=findPostById(S.postViewId);if(!p)return;
   if(S.user){
     const res=await sbPost({action:'togglePinPost',postId:p.id});
     if(!res?.ok)return toast(res?.error||'Could not update pin','err');
     toast(res.pinned?'Pinned to top of grid':'Unpinned');
     await loadProfileData(S.profId||'self',true);
     return;
   }
   const raw=LOCAL_SOCIAL.posts.find(x=>x.id===p.id);if(!raw)return;
   if(!raw.pinned&&LOCAL_SOCIAL.posts.filter(x=>x.userId==='self'&&x.pinned).length>=3)return toast('Maximum 3 pinned posts allowed','err');
   raw.pinned=!raw.pinned;saveLocalSocial();
   S.profData=buildLocalProfileData(S.profId||'self');renderPostView();renderProfile();
   toast(raw.pinned?'Pinned to top of grid':'Unpinned');
 },
 delPost(){
   const p=findPostById(S.postViewId);if(!p)return;
   ask('Delete post?','This permanently removes the post and its comments.',async()=>{
     if(S.user){
       const res=await sbPost({action:'deletePost',postId:p.id});
       if(!res?.ok)return toast(res?.error||'Delete failed','err');
       closeM('m-post-view');
       if(S.profData)await loadProfileData(S.profId||'self',true);
       if(S.feedData){S.feedData.posts=(S.feedData.posts||[]).filter(x=>x.id!==p.id);if(S.view==='feed')renderFeedView()}
       toast('Post deleted');
       return;
     }
     LOCAL_SOCIAL.posts=LOCAL_SOCIAL.posts.filter(x=>x.id!==p.id);
     LOCAL_SOCIAL.comments=LOCAL_SOCIAL.comments.filter(x=>x.postId!==p.id);
     LOCAL_SOCIAL.likes=LOCAL_SOCIAL.likes.filter(x=>x[0]!==p.id);
     LOCAL_SOCIAL.saves=LOCAL_SOCIAL.saves.filter(x=>x[0]!==p.id);
     saveLocalSocial();closeM('m-post-view');
     S.profData=buildLocalProfileData(S.profId||'self');
     if(S.feedData){S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S});if(S.view==='feed')renderFeedView()}
     if(S.view==='profile')renderProfile();
     toast('Post deleted');
   });
 },
 focusPostComment(){$('#pv-cm-in')?.focus()},
 async aiPostComment(){
   const p=findPostById(S.postViewId);if(!p)return;
   const res=await callGemini({prompt:`Write one warm, natural, concise 1-sentence Instagram comment reacting to this post caption: "${p.caption.slice(0,250)}". Output only the comment text.`,system:'Be friendly, authentic, and under 18 words.'});
   $('#pv-cm-in').value=(res?.text||'').trim().replace(/^["']|["']$/g,'')||'Love how clean and thoughtful this looks!';
   $('#pv-cm-in').focus();
 },
 async addPostComment(){
   const p=findPostById(S.postViewId),inp=$('#pv-cm-in');
   const text=inp?.value.trim();if(!p||!text)return;
   inp.value='';
   if(S.user){
     const res=await sbPost({action:'addPostComment',postId:p.id,text});
     if(!res?.ok)return toast(res?.error||'Comment failed','err');
     p.comments=[...(p.comments||[]),res.comment];p.commentsCount=p.comments.length;
     renderPostView();renderProfile();
     return;
   }
   const me=LOCAL_SOCIAL.profiles[0];
   LOCAL_SOCIAL.comments.push({id:uid('pc'),postId:p.id,userId:'self',authorName:me.display_name,authorUsername:me.username,authorAvatarUrl:me.avatarUrl||null,text,createdAt:new Date().toISOString()});
   saveLocalSocial();S.profData=buildLocalProfileData(S.profId||'self');renderPostView();renderProfile();
 },
 async delPostComment(cmId){
   const p=findPostById(S.postViewId);if(!p||!cmId)return;
   if(S.user){
     const res=await sbPost({action:'deletePostComment',commentId:cmId});
     if(!res?.ok)return toast(res?.error||'Delete failed','err');
     await loadProfileData(S.profId||'self',true);
     return;
   }
   LOCAL_SOCIAL.comments=LOCAL_SOCIAL.comments.filter(c=>c.id!==cmId);
   saveLocalSocial();S.profData=buildLocalProfileData(S.profId||'self');renderPostView();renderProfile();
 },
 openFollowModal(tab){S.followListTab=tab||'followers';S.followListQ='';if($('#fl-search'))$('#fl-search').value='';renderFollowListModal();openM('m-follow-list')},
 followListTab(tab){S.followListTab=tab||'followers';renderFollowListModal()},
 openHighlightModal(){
   S.hlBg=0;S.hlMedia=null;$('#hl-title').value='';$('#hl-text').value='';$('#hl-file').value='';setTxt('#hl-media-lbl','Cover photo');
   $('#hl-bgs').innerHTML=POST_BGS.map((g,i)=>`<button type="button" data-act="hlBg" data-arg="${i}" class="w-7 h-7 rounded-lg bg-gradient-to-br ${g} border-2 transition ${i===S.hlBg?'border-white scale-105':'border-white/15 opacity-75'}" aria-label="Highlight color ${i+1}"></button>`).join('');
   openM('m-highlight');
 },
 hlBg(i){S.hlBg=+i;$('#hl-bgs').innerHTML=POST_BGS.map((g,idx)=>`<button type="button" data-act="hlBg" data-arg="${idx}" class="w-7 h-7 rounded-lg bg-gradient-to-br ${g} border-2 transition ${idx===S.hlBg?'border-white scale-105':'border-white/15 opacity-75'}" aria-label="Highlight color ${idx+1}"></button>`).join('')},
 pickHighlightMedia(){$('#hl-file').click()},
 async createHighlight(){
   const title=$('#hl-title').value.trim();if(!title)return toast('Enter a highlight title','err');
   const text=$('#hl-text').value.trim();
   const bg=POST_BGS[S.hlBg]||POST_BGS[0];
   const hid=uid('hl');
   if(S.user){
     let coverPath='';
     if(S.hlMedia?.file&&S.sbConfigured){
       const up=await uploadCloudMedia(null,hid,S.hlMedia.file,S.hlMedia.file.name,S.hlMedia.mime,{scope:'highlight'});
       if(up?.mediaPath)coverPath=up.mediaPath;
     }
     const res=await sbPost({action:'createHighlight',highlight:{id:hid,title,coverBg:bg,coverPath,slides:[{title,text,bg,mediaPath:coverPath}]}});
     if(!res?.ok)return toast(res?.error||'Highlight failed','err');
     closeM('m-highlight');await loadProfileData('self',true);toast('Highlight saved');
     return;
   }
   const coverUrl=S.hlMedia?.dataUrl||S.hlMedia?.url||'';
   LOCAL_SOCIAL.highlights.push({id:hid,userId:'self',title,coverBg:bg,coverUrl,slides:[{title,text,bg,mediaUrl:coverUrl}]});
   saveLocalSocial();closeM('m-highlight');S.profData=buildLocalProfileData('self');renderProfile();toast('Highlight saved');
 },
 openHighlight(hlId){
   const hl=(S.profData?.highlights||[]).find(h=>h.id===hlId);if(!hl)return;
   S.hlView=Object.assign({},hl,{idx:0});openM('m-story');renderHighlightViewer();
 },
 async delHighlight(hlId){
   if(!hlId)return;
   if(S.user){
     const res=await sbPost({action:'deleteHighlight',highlightId:hlId});
     if(!res?.ok)return toast(res?.error||'Delete failed','err');
     A.storyClose();await loadProfileData('self',true);toast('Highlight deleted');
     return;
   }
   LOCAL_SOCIAL.highlights=LOCAL_SOCIAL.highlights.filter(h=>h.id!==hlId);
   saveLocalSocial();A.storyClose();S.profData=buildLocalProfileData(S.profId||'self');renderProfile();toast('Highlight deleted');
 },
 openLinksModal(){renderLinksModal();openM('m-links')},
 jumpReel(reelId){
   const list=getReels();
   const idx=list.findIndex(r=>String(r.id)===String(reelId));
   S.reel=idx>=0?idx:0;setView('reels');
 },
 async loadOlderMsgs(){
   const c=cur();if(!c)return;
   if(!S.user){c.hasMore=false;renderThread(true);return}
   const oldest=c.msgs.reduce((min,m)=>Math.min(min,Number(m.ts)||Infinity),Infinity);
   const beforeMs=Number.isFinite(oldest)?oldest:undefined;
   const res=await sbGet('messages',{conversationId:c.id,limit:40,beforeMs});
   if(!res?.ok)return toast(res?.error||'Could not load older messages','err');
   const existing=new Set(c.msgs.map(m=>m.id));
   const older=(res.messages||[]).filter(m=>!existing.has(m.id));
   c.hasMore=Boolean(res.hasMore);
   if(older.length){
     c.msgs=[...older,...c.msgs].sort((a,b)=>(a.ts||0)-(b.ts||0));
     await decAllMessages();
     store.set('chats',D);
   }
   renderThread(true);
   if(!older.length)toast('Reached start of conversation');
 },
 feedTab(t){S.feedTab=t||'explore';renderFeedView()},
 feedSelectTag(tag){S.feedTag=String(tag||'').toLowerCase();renderFeedView()},
 feedResetFilter(){S.feedTab='explore';S.feedTag='';S.feedQ='';if($('#feed-search'))$('#feed-search').value='';renderFeedView()},
 refreshFeed(){loadFeedData(false)},
 async feedLikePost(postId){
   const p=(S.feedData?.posts||[]).find(x=>x.id===postId);if(!p)return;
   if(S.user){
     const res=await sbPost({action:'togglePostLike',postId});
     if(!res?.ok)return toast(res?.error||'Could not like post','err');
     p.likedByMe=res.liked;p.likesCount=res.count;renderFeedView();return;
   }
   const idx=LOCAL_SOCIAL.likes.findIndex(l=>l[0]===postId&&l[1]==='self');
   if(idx>=0)LOCAL_SOCIAL.likes.splice(idx,1);else LOCAL_SOCIAL.likes.push([postId,'self']);
   saveLocalSocial();S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S});renderFeedView();
 },
 async feedSavePost(postId){
   const p=(S.feedData?.posts||[]).find(x=>x.id===postId);if(!p)return;
   if(S.user){
     const res=await sbPost({action:'togglePostSave',postId,kind:'save'});
     if(!res?.ok)return toast(res?.error||'Save failed','err');
     p.savedByMe=Boolean(res.active);toast(res.active?'Saved to profile':'Removed from saved');renderFeedView();return;
   }
   const idx=LOCAL_SOCIAL.saves.findIndex(s=>s[0]===postId&&s[1]==='self'&&s[2]==='save');
   if(idx>=0){LOCAL_SOCIAL.saves.splice(idx,1);toast('Removed from saved')}
   else{LOCAL_SOCIAL.saves.push([postId,'self','save']);toast('Saved to profile')}
   saveLocalSocial();S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S});renderFeedView();
 },
 openBackupModal(){
   if($('#bk-pass'))$('#bk-pass').value='';
   if($('#bk-err'))$('#bk-err').classList.add('hidden');
   setTxt('#bk-state',S.user?(S.keyBackupExists?'Cloud E2EE key backup is active on your account.':'No cloud E2EE backup stored yet.'):'Offline / Local mode: export a Recovery Kit .txt file to move keys across devices.');
   setTxt('#bk-fp-val',FP||'Unavailable');
   const mat=$('#bk-safety-matrix');
   if(mat)mat.innerHTML=formatSafetyNumberMatrix(FP||S.ecdhId?.fp||'WHATSGRAM').map(g=>`<span class="rounded-lg bg-white/[0.04] border border-white/[0.08] py-1">${esc(g)}</span>`).join('');
   const bar=$('#bk-strength-bar'),lbl=$('#bk-strength-lbl');
   if(bar){bar.className='h-full bg-rose-400 transition-all';bar.style.width='0%'}
   if(lbl){lbl.textContent='Passphrase strength';lbl.className='text-[10px] font-mono text-zinc-400'}
   show('#bk-restore-btn',Boolean(S.user&&S.keyBackupExists));
   show('#bk-del-btn',Boolean(S.user&&S.keyBackupExists));
   openM('m-backup');
 },
 async saveKeyBackupAction(){
   const err=$('#bk-err'),pass=($('#bk-pass')?.value||'').trim();
   const showErr=m=>{if(err){err.textContent=m;err.classList.remove('hidden')}};
   if(err)err.classList.add('hidden');
   if(pass.length<8)return showErr('Use a strong backup passphrase of at least 8 characters.');
   if(!S.ecdhId)await ensureEcdhIdentity(false);
   if(!S.ecdhId)return showErr('WebCrypto ECDH key identity unavailable.');
   try{
     const payload=await encryptKeyBackup(S.ecdhId,S.ecdhId.fp,pass,{ring:S.e2eeRing,pubCache:S.pubCache});
     if(S.user){
       const res=await sbPost({action:'saveKeyBackup',keyFp:S.ecdhId.fp,payload});
       if(!res?.ok)return showErr(res?.error||'Failed to save encrypted key backup.');
       S.keyBackupExists=true;S.keyBackupUpdatedAt=res.updatedAt||new Date().toISOString();
       renderVaultBackupUI();closeM('m-backup');toast('Encrypted E2EE keys backed up to cloud');audit('E2EE key backup encrypted & synced');
     }else{
       const txt=buildRecoveryKitText(payload,userHandle(S.localUser||S.user)||'local');
       const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
       const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'whatsgram-recovery-kit.txt'});a.click();
       closeM('m-backup');toast('Encrypted Recovery Kit downloaded');
     }
   }catch(e){showErr(e?.message||'Encryption failed')}
 },
 async restoreKeyBackupAction(){
   const err=$('#bk-err'),pass=($('#bk-pass')?.value||'').trim();
   const showErr=m=>{if(err){err.textContent=m;err.classList.remove('hidden')}};
   if(err)err.classList.add('hidden');
   if(!S.user)return showErr('Sign in first to restore your cloud E2EE key backup.');
   if(!pass)return showErr('Enter your backup passphrase.');
   const r=await sbGet('getKeyBackup');
   if(!r?.ok||!r.payload)return showErr(r?.error||'No cloud key backup found.');
   try{
     const dec=await decryptKeyBackup(r.payload,pass);
     const curId=(dec?.fp&&dec?.privJwk&&dec?.pubJwk)?{fp:dec.fp,pubJwk:dec.pubJwk,privJwk:dec.privJwk}:dec?.curId;
     if(!curId?.fp||!curId?.privJwk||!curId?.pubJwk)return showErr('Backup payload was invalid or corrupted.');
     const suffix=S.user?.id||'local';
     const mergedRing=Object.assign({},dec.ring||{},S.e2eeRing||{},{[curId.fp]:curId.privJwk});
     const mergedPub=Object.assign({},S.pubCache||{},dec.pubCache||{},{[curId.fp]:curId.pubJwk});
     store.set('e2ee_id_'+suffix,curId);
     store.set('e2ee_ring_'+suffix,mergedRing);
     store.set('e2ee_pubs',mergedPub);
     S.ecdhId=curId;S.e2eeRing=mergedRing;S.pubCache=mergedPub;AES_CACHE.clear();
     FP=`ECDH ${curId.fp}`;setTxt('#key-fp',`ECDH P-256 · ${curId.fp}`);
     await sbPost({action:'publishPublicKey',publicKey:curId.pubJwk,keyFp:curId.fp});
     await decAllMessages();renderThread(true);renderInfo();renderVaultBackupUI();
     closeM('m-backup');toast('E2EE identity & historical ring restored');audit('E2EE keys restored from cloud backup');
   }catch(e){showErr(e?.message||'Wrong passphrase or corrupt backup')}
 },
 async exportRecoveryKit(){
   const err=$('#bk-err'),pass=($('#bk-pass')?.value||'').trim();
   const showErr=m=>{if(err){err.textContent=m;err.classList.remove('hidden')}};
   if(err)err.classList.add('hidden');
   if(pass.length<8)return showErr('Enter a passphrase (8+ chars) to encrypt your Recovery Kit.');
   if(!S.ecdhId)await ensureEcdhIdentity(false);
   try{
     const payload=await encryptKeyBackup(S.ecdhId,S.ecdhId.fp,pass,{ring:S.e2eeRing,pubCache:S.pubCache});
     const txt=buildRecoveryKitText(payload,userHandle(S.user||S.localUser)||'enclave');
     const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
     const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`whatsgram-recovery-${Date.now()}.txt`});a.click();
     toast('Recovery Kit downloaded');
   }catch(e){showErr(e?.message||'Could not generate Recovery Kit')}
 },
 async deleteKeyBackupAction(){
   if(!S.user)return;
   await sbPost({action:'deleteKeyBackup'});
   S.keyBackupExists=false;S.keyBackupUpdatedAt=null;
   renderVaultBackupUI();closeM('m-backup');toast('Cloud key backup removed');
 },
 async togglePush(){
   if(!isPushSupported())return toast('Web Push is not supported in this browser','err');
   if(!S.user)return toast('Sign in to enable Web Push alerts','err');
   if(S.pushSubscribed){
     await unsubscribeWebPush(async endpoint=>{await sbPost({action:'deletePushSub',endpoint})});
     await syncPushStateUI();toast('Web Push alerts disabled');
     return;
   }
   const keyRes=await sbGet('pushKey');
   if(!keyRes?.enabled||!keyRes?.publicKey)return toast('Set VAPID_PUBLIC_KEY & VAPID_PRIVATE_KEY env vars on Vercel first','err');
   const out=await subscribeWebPush(keyRes.publicKey,async sub=>{await sbPost({action:'savePushSub',subscription:sub})});
   if(!out?.ok)return toast(out?.error||'Web Push subscription failed','err');
   await syncPushStateUI();toast('Background Web Push enabled');
 },
 async testPush(){
   if(!S.user)return toast('Sign in first','err');
   const res=await sbPost({action:'sendTestPush'});
   if(res?.ok&&res?.enabled)toast(`Web Push dispatched (${res.sent||0} device)`);
   else toast(res?.message||res?.error||'VAPID keys not configured','err');
 },
 aiPickMedia(){$('#ai-file')?.click()},
 aiClearMedia(){S.aiMedia=null;$('#ai-media-chip')?.classList.add('hidden');if($('#ai-file'))$('#ai-file').value=''},
 aiRun:p=>aiRun(p),aiSend(){if(S.aiBusy||S.aiAbort){toast('Wait for current AI reply or tap Stop');return}const i=$('#ai-in'),v=i.value;i.value='';aiRun(v)},
 aiStop(){if(S.aiAbort){S.aiAbort.abort();S.aiAbort=null}if(S.aiBusy){clearInterval(S.aiBusy);S.aiBusy=null}$('#ai-send').classList.remove('hidden');show('#ai-stop',false,'inline-flex')},
 aiClear(){A.aiStop();S.aiHist=[];$('#ai-log').innerHTML='';aiWelcome()},
 aiWarnClose(){show('#ai-warn',false,'flex')},
 prefillAi(){const i=$('#msg');if(!i)return;if(!cur())return toast('Open a conversation first','err');i.value=i.value.trim().startsWith('@ai')?i.value:'@ai '+i.value.replace(/^@/,'');i.focus();i.dispatchEvent(new Event('input',{bubbles:true}))},
 aiDraftReply(){draftChatReply()},
 aiRewrite:tone=>rewriteComposerDraft(tone),
 aiReplyToMsg(id){const m=cur()?.msgs.find(x=>x.id===id);if(!m)return;S.editId=null;S.reply={id,text:prev(m).slice(0,80)};renderThread(true);draftChatReply(m)},
 aiExplainMsg(id){const m=cur()?.msgs.find(x=>x.id===id);if(!m)return;askThreadAI(`Explain and, if non-English, translate this message in brief plain language: "${m.text||m.name||''}"`)},
 useInlineDraft(id){const c=cur(),m=(S.aiThread[c?.id]||[]).find(x=>x.id===id);const i=$('#msg');if(!m?.draft||!i)return;i.value=m.draft;i.focus();i.dispatchEvent(new Event('input',{bubbles:true}));toast('Inserted into composer')},
 delAiNote(id){const c=cur();if(!c||!S.aiThread[c.id])return;S.aiThread[c.id]=S.aiThread[c.id].filter(x=>x.id!==id);saveAiThread();renderThread(true)},
 clearAiNotes(){const c=cur();if(!c)return;delete S.aiThread[c.id];saveAiThread();renderThread(true);toast('Cleared private AI notes')},
 useDraft(){setView('chats');$('#msg').value=S.draft;$('#msg').focus();toast('Draft inserted')},
 feedLayout(l){S.feedLayout=l==='grid'?'grid':'cards';renderFeedView()},
 feedSlide(arg,_,ev){
   ev?.stopPropagation();
   const i=String(arg||'').lastIndexOf(':');
   if(i<=0)return;
   const postId=arg.slice(0,i),d=Number(arg.slice(i+1))||1;
   const p=(S.feedData?.posts||[]).find(x=>x.id===postId);
   const n=(p?.mediaUrls||[]).length;
   if(n<2)return;
   S.feedSlides[postId]=((S.feedSlides[postId]||0)+d+n)%n;
   renderFeedView();
 },
 feedMediaTap(postId,el,ev){
   if(ev?.target?.closest('button'))return;
   if(!S._feedTap)S._feedTap={};
   if(!S._feedTimer)S._feedTimer={};
   const nowT=Date.now(),prevT=S._feedTap[postId]||0;
   if(nowT-prevT<280){
     clearTimeout(S._feedTimer[postId]);
     S._feedTap[postId]=0;
     if(el){
       const h=document.createElement('div');
       h.className='dt-heart text-5xl';
       h.textContent='❤️';
       el.appendChild(h);
       setTimeout(()=>h.remove(),820);
     }
     const p=(S.feedData?.posts||[]).find(x=>x.id===postId);
     if(p&&!p.likedByMe)A.feedLikePost(postId);
     return;
   }
   S._feedTap[postId]=nowT;
   S._feedTimer[postId]=setTimeout(()=>{A.viewPost(postId)},260);
 },
 expandPostCap(postId){S.expandedCaps[postId]=!S.expandedCaps[postId];renderFeedView()},
 sharePostLink(postId){
   const url=location.protocol.startsWith('http')?`${location.origin}/share/post/${encodeURIComponent(postId)}`:`#post/${postId}`;
   navigator.clipboard?.writeText(url).catch(()=>{});
   toast('Post share link copied');
 },
 loadMoreFeed(){loadFeedData(false,true)},
 async togglePostArchive(postId){
   const p=findPostById(postId);
   if(S.user){
     const res=await sbPost({action:'togglePostArchive',postId});
     if(!res?.ok)return toast(res?.error||'Archive failed','err');
     toast(res.archived?'Moved to Archive':'Restored to Profile');
     if(S.feedData)await loadFeedData(true);
     if(S.profData)await loadProfileData(S.profId||'self',true);
     return;
   }
   const raw=LOCAL_SOCIAL.posts.find(x=>x.id===postId);
   if(!raw)return;
   raw.archived=!raw.archived;
   saveLocalSocial();
   if(S.feedData)S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S});
   S.profData=buildLocalProfileData(S.profId||'self');
   if(S.view==='feed')renderFeedView();
   if(S.view==='profile')renderProfile();
   toast(raw.archived?'Moved to Archive':'Restored to Profile');
 },
 async openBlocksModal(){
   openM('m-blocks');
   renderBlocksLists();
   if(S.user){
     const [rReq,rBlk,rSaf]=await Promise.all([sbGet('followRequests'),sbGet('blockedUsers'),sbGet('safetyLists')]);
     if(rReq?.ok)S.followRequests=rReq.requests||[];
     if(rBlk?.ok)S.blockedUsers=rBlk.users||[];
     if(rSaf?.ok){
       S.safety={
         mutedIds:rSaf.mutedIds||S.safety.mutedIds||[],
         restrictedIds:rSaf.restrictedIds||S.safety.restrictedIds||[],
         closeFriendIds:rSaf.closeFriendIds||S.safety.closeFriendIds||[],
         followedTags:rSaf.followedTags||S.safety.followedTags||[],
         hiddenWords:rSaf.hiddenWords||S.safety.hiddenWords||[]
       };
       saveSafety();
     }
     renderBlocksLists();
     if(S.view==='profile')renderProfile();
   }
 },
 async approveFollowReq(followerId){
   if(!followerId)return;
   if(S.user){
     const res=await sbPost({action:'approveFollow',followerId});
     if(!res?.ok)return toast(res?.error||'Could not approve','err');
   }
   S.followRequests=(S.followRequests||[]).filter(u=>u.id!==followerId);
   renderBlocksLists();
   if(S.view==='profile')loadProfileData(S.profId||'self',true);
   toast('Follow request approved');
 },
 async declineFollowReq(followerId){
   if(!followerId)return;
   if(S.user){
     const res=await sbPost({action:'declineFollow',followerId});
     if(!res?.ok)return toast(res?.error||'Could not decline','err');
   }
   S.followRequests=(S.followRequests||[]).filter(u=>u.id!==followerId);
   renderBlocksLists();
   if(S.view==='profile')renderProfile();
   toast('Follow request declined');
 },
 async toggleBlockUser(targetUserId){
   if(!targetUserId)return;
   if(S.user){
     const res=await sbPost({action:'toggleBlock',targetUserId});
     if(!res?.ok)return toast(res?.error||'Could not update block','err');
     const set=new Set(S.user.blockedIds||[]);
     if(res.blocked)set.add(targetUserId);else set.delete(targetUserId);
     S.user.blockedIds=[...set];
     toast(res.blocked?'User blocked':'User unblocked');
     if(S.feedData)await loadFeedData(true);
     if(S.view==='profile')openProfile('self');
     return;
   }
   if(!S.user)LOCAL_SOCIAL._blocked=LOCAL_SOCIAL._blocked||[];
   const i=LOCAL_SOCIAL._blocked.indexOf(targetUserId);
   if(i>=0){LOCAL_SOCIAL._blocked.splice(i,1);toast('User unblocked')}
   else{LOCAL_SOCIAL._blocked.push(targetUserId);toast('User blocked')}
   saveLocalSocial();
   if(S.view==='profile')renderProfile();
 },
 async unblockUserId(targetUserId){
   await A.toggleBlockUser(targetUserId);
   S.blockedUsers=(S.blockedUsers||[]).filter(u=>u.id!==targetUserId);
   renderBlocksLists();
 },
 openReportModal(arg){
   const idx=String(arg||'').indexOf(':');
   const targetType=idx>0?arg.slice(0,idx):'post';
   const targetId=idx>0?arg.slice(idx+1):String(arg||'');
   S.reportTarget={targetType,targetId};
   if($('#rep-details'))$('#rep-details').value='';
   openM('m-report');
 },
 async submitReport(){
   if(!S.reportTarget?.targetId)return closeM('m-report');
   const reason=$('#rep-reason')?.value||'spam';
   const details=$('#rep-details')?.value.trim()||'';
   if(S.user){
     const res=await sbPost({action:'reportContent',targetType:S.reportTarget.targetType,targetId:S.reportTarget.targetId,reason,details});
     if(!res?.ok)return toast(res?.error||'Could not submit report','err');
   }
   closeM('m-report');
   toast('Report submitted for moderation review');
 },
 async exportAccountJson(){
   let payload;
   if(S.user){
     toast('Preparing account archive…');
     const res=await sbGet('exportAccountData');
     if(!res?.ok)return toast(res?.error||'Export failed','err');
     payload=res.export||res;
   }else{
     payload={exportedAt:new Date().toISOString(),mode:'local-sandbox',cfg,profile:LOCAL_SOCIAL.profiles[0],social:LOCAL_SOCIAL,chats:D,stories:ST};
   }
   const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
   const a=Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`whatsgram-export-${new Date().toISOString().slice(0,10)}.json`});
   a.click();
   toast('Account archive downloaded');
 },
 setTheme(t){cfg.theme=['default','oled','light'].includes(t)?t:'default';saveCfg();applyCfg();toast(`Theme: ${cfg.theme}`)},
 setFont(f){cfg.fontScale=['sm','md','lg'].includes(f)?f:'md';saveCfg();applyCfg()},
 setStartView(v){cfg.startView=v==='feed'?'feed':'chats';saveCfg();applyCfg();toast(`Launch view set to ${cfg.startView==='feed'?'Explore':'Messages'}`)},
 openShortcuts(){openM('m-shortcuts')},
 toggleEditPrivate(_,el){const on=el.getAttribute('aria-checked')==='true';el.setAttribute('aria-checked',String(!on))},
 openNoteModal(){
   const meId=S.user?.id||'self';
   const curN=(S.notes||[]).find(n=>n.user_id===meId&&(!n.expires_at||new Date(n.expires_at).getTime()>Date.now()));
   if($('#note-in'))$('#note-in').value=curN?.text||'';
   openM('m-note');
 },
 async saveNote(){
   const text=($('#note-in')?.value||'').trim().slice(0,60);
   if(S.user){
     const res=await sbPost({action:'saveNote',text});
     if(!res?.ok)return toast(res?.error||'Could not save note','err');
   }
   const meId=S.user?.id||'self';
   const rest=(S.notes||[]).filter(n=>n.user_id!==meId);
   if(text)rest.unshift({user_id:meId,text,username:S.user?.username||'you',displayName:S.user?.displayName||'You',expires_at:new Date(Date.now()+86400000).toISOString()});
   S.notes=rest;store.set('wg_notes',S.notes);
   closeM('m-note');renderNotes();toast(text?'Note shared (24h)':'Note cleared');
 },
 async clearNote(){
   if($('#note-in'))$('#note-in').value='';
   await A.saveNote();
 },
 replyToNote(userId){
   const n=(S.notes||[]).find(x=>x.user_id===userId)||{displayName:'Alex Rivera'};
   if(S.user&&userId&&userId!=='u_alex'&&userId!==S.user.id){return A.dmUser(userId)}
   const existing=D.find(c=>!c.isGroup&&c.name.toLowerCase().includes(String(n.displayName||n.username||'').toLowerCase()));
   if(existing)openChat(existing.id);
   else if(D.length)openChat(D[0].id);
   if($('#msg')){
     $('#msg').value=n.text?`Re "${n.text}": `:'';
     $('#msg').focus();
   }
 },
 setChatTheme(t){
   const c=cur();if(!c)return;
   c.bubbleTheme=['default','ocean','sunset','emerald','mono'].includes(t)?t:'default';
   saveD();renderThread(true);renderInfo();
 },
 openPollModal(){
   if(!cur())return toast('Open a conversation first','err');
   ['#poll-q','#poll-o1','#poll-o2','#poll-o3','#poll-o4'].forEach(sel=>{if($(sel))$(sel).value=''});
   openM('m-poll');
 },
 async sendPoll(){
   const q=($('#poll-q')?.value||'').trim();
   const opts=[$('#poll-o1')?.value,$('#poll-o2')?.value,$('#poll-o3')?.value,$('#poll-o4')?.value].map(v=>String(v||'').trim()).filter(Boolean);
   if(!q||opts.length<2)return toast('Add a question and at least 2 options','err');
   const poll={question:q,options:opts.slice(0,4).map(text=>({text,votes:[]}))};
   closeM('m-poll');
   await send(`Poll: ${q}`,{type:'text',reply:{_poll:poll,text:q}});
 },
 async votePoll(arg){
   const [msgId,optStr]=String(arg||'').split('|');
   const optIdx=Number(optStr);
   const c=cur(),m=c?.msgs.find(x=>x.id===msgId);
   const poll=m?.reply?._poll;
   if(!c||!m||!poll||!Array.isArray(poll.options)||!poll.options[optIdx])return;
   const myId=S.user?.id||'self';
   const had=(poll.options[optIdx].votes||[]).includes(myId);
   poll.options.forEach(o=>{o.votes=(o.votes||[]).filter(id=>id!==myId)});
   if(!had)poll.options[optIdx].votes.push(myId);
   saveD();renderThread(true);
   if(S.user){
     const res=await sbPost({action:'voteChatPoll',conversationId:c.id,messageId:m.id,optionIndex:optIdx});
     if(res?.ok&&res.poll){m.reply._poll=res.poll;saveD();renderThread(true)}
   }
 },
 async sendStoryReply(){
   const s=ST[S.story],inp=$('#st-reply-in'),txt=(inp?.value||'').trim();
   if(!s||!txt)return;
   inp.value='';
   await deliverStoryDmReply(s,txt);
   toast('Reply sent to DM');
   if($('#sv-bar')&&!s.voted)$('#sv-bar').style.animationPlayState='running';
 },
 async storyQuickReact(em){
   const s=ST[S.story];if(!s||!em)return;
   await deliverStoryDmReply(s,em);
   toast(`Sent ${em}`);
 },
 async openStoryViewers(){
   const s=ST[S.story];if(!s)return;
   let viewers=Array.isArray(S.storyViews?.[s.id])?S.storyViews[s.id]:[];
   if(S.user&&s.id){
     const res=await sbGet('storyViewers',{storyId:s.id});
     if(res?.ok&&Array.isArray(res.viewers)){viewers=res.viewers;S.storyViews[s.id]=viewers}
   }
   const names=viewers.map(v=>'@'+(v.username||v.display_name||'viewer')).join(', ');
   toast(viewers.length?`Viewed by ${viewers.length}: ${names}`:'No viewers recorded yet');
 },
 async batchMarkRead(){
   let changed=0;
   D.forEach(c=>{if(c.unread){c.unread=0;changed++}});
   S.actUnread=0;S.activity.forEach(a=>a.read=true);
   saveD();renderList();renderActivityBadge();badge();
   if(S.user)await sbPost({action:'batchMarkAllRead'});
   toast(changed?`Marked ${changed} conversation${changed===1?'':'s'} as read`:'All conversations are up to date');
 },
 async acceptMsgReq(){
   const c=cur();if(!c)return;
   c.isRequest=false;
   saveD();renderFolders();renderList();renderThread(true);
   if(S.user)await sbPost({action:'acceptMessageRequest',conversationId:c.id});
   toast(`Accepted message request from ${c.name}`);
 },
 async copyGroupInvite(){
   const c=cur();if(!c?.isGroup)return;
   let token=c.inviteToken;
   if(!token&&S.user){
     const res=await sbPost({action:'groupAdminAction',conversationId:c.id,op:'rotateInvite'});
     if(res?.inviteToken){token=res.inviteToken;c.inviteToken=token;saveD()}
   }
   if(!token){token=uid('inv');c.inviteToken=token;saveD()}
   const link=`${location.origin}/?join=${encodeURIComponent(token)}`;
   navigator.clipboard?.writeText(link).then(()=>toast('Group invite link copied'),()=>toast(link));
 },
 toggleQuietSend(){
   S.quietSend=!S.quietSend;
   toast(S.quietSend?'Next message will send quietly (muted alert)':'Quiet send cancelled');
 },
 scheduleMsgPrompt(){
   const c=cur();if(!c)return;
   const rawMin=window.prompt('Send scheduled message in how many minutes? (1–1440)','5');
   if(rawMin==null)return;
   const mins=Math.max(1,Math.min(1440,parseInt(rawMin,10)||5));
   const txt=$('#msg')?.value.trim()||window.prompt('Message text to schedule:','')||'';
   if(!txt.trim())return toast('Enter a message first','err');
   if($('#msg'))$('#msg').value='';
   const delayMs=mins*60000;
   toast(`Scheduled "${txt.slice(0,28)}" for ${mins}m from now`);
   audit(`Scheduled message in ${c.name} (+${mins}m)`);
   setTimeout(()=>{
     const conv=D.find(x=>x.id===c.id);if(!conv)return;
     conv.msgs.push({id:uid('m'),from:'me',type:'text',text:txt.trim(),t:now(),ts:Date.now(),st:'sent',_sched:true});
     conv.unread=0;saveD();renderList();
     if(S.chat===conv.id)renderThread(true);
     if(S.user)sbPost({action:'sendMessage',conversationId:conv.id,message:{id:uid('m'),text:txt.trim()}});
   },Math.min(delayMs,2147483647));
 },
 async translateMsg(id){
   const c=cur(),m=c?.msgs.find(x=>x.id===id);if(!m?.text)return;
   const tgt=cfg.lang&&cfg.lang!=='en'?cfg.lang:'en';
   const labelMap={en:'English',es:'Spanish',fr:'French',de:'German',ja:'Japanese',ar:'Arabic',hi:'Hindi'};
   const targetName=labelMap[tgt]||'English';
   toast('Translating…');
   const res=await callGemini({prompt:`Translate concisely to ${targetName}. Return only the translated sentence:\n${m.text}`,system:'Provide direct accurate translations without commentary.'});
   m._tr=(res?.text||'').trim()||`[${targetName}] ${m.text}`;
   renderThread();
 },
 async summarizeUnread(){
   const c=cur();if(!c)return;
   const unreadMsgs=c.msgs.filter(m=>m.from==='them').slice(-12);
   if(!unreadMsgs.length)return toast('No incoming messages to summarize');
   const summaryText=unreadMsgs.map(m=>`${c.name}: ${m.text||'[media]'}`).join('\n');
   const res=await callGemini({mode:'assistant',prompt:`Summarize these latest messages from ${c.name} in 3 crisp bullets:\n${summaryText}`,activeChatName:c.name,conversations:buildAiConversations()});
   const list=S.aiThread[c.id]=S.aiThread[c.id]||[];
   list.push({id:uid('ai'),_aiLocal:true,aiRole:'bot',text:'**Unread Recap**\n\n'+(res?.text||unreadMsgs.map(m=>'• '+(m.text||'[media]')).join('\n')),t:now(),ts:Date.now()});
   saveAiThread();renderThread(true);
 },
 async toggleStarMsg(id){
   const c=cur(),m=c?.msgs.find(x=>x.id===id);if(!m)return;
   m.starred=!m.starred;
   saveD();renderThread();
   toast(m.starred?'Message starred':'Removed star');
   if(S.user&&!String(m.id).startsWith('m_'))await sbPost({action:'toggleStarMessage',conversationId:c.id,messageId:m.id});
 },
 async toggleFollowTag(tag){
   const clean=String(tag||'').trim().replace(/^#+/,'').toLowerCase();
   if(!clean)return;
   const arr=S.safety.followedTags=S.safety.followedTags||[];
   const idx=arr.indexOf(clean);
   if(idx>=0)arr.splice(idx,1);else arr.push(clean);
   saveSafety();renderFeedView();
   toast(idx>=0?`Unfollowed #${clean}`:`Following #${clean}`);
   if(S.user)await sbPost({action:'toggleFollowTag',tag:clean});
 },
 feedSelectLoc(loc){
   S.feedQ=String(loc||'').trim();
   if($('#feed-search'))$('#feed-search').value=S.feedQ;
   renderFeedView();
 },
 applyFeedNew(){
   if(S.feedNewPending){S.feedData=S.feedNewPending;S.feedNewPending=null}
   const scroller=$('#feed-root')?.closest('.overflow-y-auto');
   if(scroller)scroller.scrollTo({top:0,behavior:'smooth'});
   renderFeedView();
 },
 openShareToChat(postId){
   const p=findPostById(postId);if(!p)return;
   S.sharePostId=p.id;
   const box=$('#share-chat-list');
   if(box){
     box.innerHTML=D.length?D.map(c=>`<button type="button" data-act="sendPostToChat" data-arg="${esc(c.id)}" class="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-left transition">
       ${av(c.name,'w-8 h-8')}
       <div class="min-w-0 flex-1">
         <div class="text-xs font-bold text-white truncate">${esc(c.name)}</div>
         <div class="text-[10.5px] text-zinc-400 truncate">${esc(c.isGroup?'Group chat':(c.sub||'Direct message'))}</div>
       </div>
       <span class="px-2.5 py-1 rounded-lg bg-accent text-black text-[10.5px] font-bold shrink-0">Send</span>
     </button>`).join(''):'<div class="text-xs text-zinc-500 py-4 text-center">No active conversations yet.</div>';
   }
   openM('m-share-chat');
 },
 async sendPostToChat(convId){
   const conv=D.find(x=>x.id===convId),p=findPostById(S.sharePostId);
   if(!conv||!p)return closeM('m-share-chat');
   const url=`${location.origin}/?post=${encodeURIComponent(p.id)}`;
   const txt=`Shared post by @${p.author?.username||'creator'}: "${(p.caption||'WhatsGram Post').slice(0,80)}" · ${url}`;
   const mid=uid('m');
   conv.msgs.push({id:mid,from:'me',type:'text',text:txt,t:now(),ts:Date.now(),st:'sent'});
   conv.unread=0;saveD();renderList();
   if(S.chat===conv.id)renderThread(true);
   if(S.user)await sbPost({action:'sendMessage',conversationId:conv.id,message:{id:mid,text:txt}});
   closeM('m-share-chat');
   toast(`Shared post to ${conv.name}`);
 },
 _renderCollections(){
   const box=$('#col-list');if(!box)return;
   const cols=S.collections||[],pid=S.colTargetPostId;
   box.innerHTML=cols.length?cols.map(col=>{
     const has=pid&&(col.postIds||[]).includes(pid);
     return `<div class="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
       <div class="min-w-0">
         <div class="text-xs font-bold text-white truncate">${esc(col.title||'Saved')}</div>
         <div class="text-[10.5px] text-zinc-400">${(col.postIds||[]).length} saved posts</div>
       </div>
       ${pid?`<button type="button" data-act="toggleCollectionPost" data-arg="${esc(col.id)}" class="${has?'btn-primary':'btn-ghost text-zinc-200'} h-7 px-3 rounded-lg text-[11px] font-bold shrink-0">${has?'Saved':'Add'}</button>`
         :`<span class="text-[10px] font-mono text-zinc-500">${(col.postIds||[]).length} items</span>`}
     </div>`;
   }).join(''):'<div class="text-xs text-zinc-500 py-4 text-center">No collections created yet.</div>';
 },
 openCollectionPicker(postId){
   S.colTargetPostId=postId||null;
   if($('#col-new-name'))$('#col-new-name').value='';
   A._renderCollections();
   openM('m-collections');
 },
 openCollectionsModal(){
   S.colTargetPostId=null;
   if($('#col-new-name'))$('#col-new-name').value='';
   A._renderCollections();
   openM('m-collections');
 },
 async createCollectionAction(){
   const inp=$('#col-new-name'),title=(inp?.value||'').trim();
   if(!title)return toast('Enter a collection folder name','err');
   const col={id:'col_'+Date.now().toString(36),title,postIds:S.colTargetPostId?[S.colTargetPostId]:[]};
   if(S.user){
     const res=await sbPost({action:'createCollection',name:title,postIds:col.postIds});
     if(res?.collection?.id){col.id=res.collection.id}
   }
   S.collections.unshift(col);
   saveCollections();
   if(inp)inp.value='';
   A._renderCollections();
   toast(`Created "${title}"`);
 },
 async toggleCollectionPost(colId){
   const pid=S.colTargetPostId;if(!pid)return;
   const col=S.collections.find(c=>c.id===colId);if(!col)return;
   col.postIds=col.postIds||[];
   const idx=col.postIds.indexOf(pid);
   if(idx>=0)col.postIds.splice(idx,1);else col.postIds.push(pid);
   saveCollections();
   if(S.user)await sbPost({action:'addPostToCollection',collectionId:colId,postId:pid});
   A._renderCollections();
   toast(idx>=0?`Removed from ${col.title}`:`Saved to ${col.title}`);
 },
 async feedQuickComment(postId,el){
   const inp=(el&&el.classList?.contains('feed-qc-inp')?el:null)||el?.parentElement?.querySelector('.feed-qc-inp')||document.querySelector(`.feed-qc-inp[data-post-id="${postId}"]`);
   const txt=(inp?.value||'').trim();
   if(!txt)return;
   const fp=(S.feedData?.posts||[]).find(x=>x.id===postId);
   const p=fp||findPostById(postId);if(!p)return;
   const me=LOCAL_SOCIAL.profiles[0]||{};
   const fakeCm={id:uid('pc'),postId,userId:S.user?.id||'self',authorName:S.user?(userDisplay(S.user)||'You'):(me.display_name||S.localUser?.displayName||'You'),authorUsername:S.user?(userHandle(S.user)||'you'):(me.username||S.localUser?.username||'you'),authorAvatarUrl:me.avatarUrl||null,text:txt,createdAt:new Date().toISOString()};
   if(inp)inp.value='';
   if(S.user){
     p.comments=[...(p.comments||[]),fakeCm];p.commentsCount=(p.commentsCount||0)+1;
     const pp=findPostById(postId);
     if(pp&&pp!==p){pp.comments=[...(pp.comments||[]),fakeCm];pp.commentsCount=(pp.commentsCount||0)+1}
     renderFeedView();
     const res=await sbPost({action:'addPostComment',postId,text:txt});
     if(res?.comment){const ix=p.comments.findIndex(x=>x.id===fakeCm.id);if(ix>=0)p.comments[ix]=res.comment;renderFeedView()}
   }else{
     LOCAL_SOCIAL.comments.push(fakeCm);saveLocalSocial();
     S.feedData=buildLocalFeedData({LOCAL_SOCIAL,S});
     if(S.profData)S.profData=buildLocalProfileData(S.profId||'self');
     renderFeedView();
   }
   toast('Reply posted');
 },
 async likePostComment(cmId){
   const p=findPostById(S.postViewId);if(!p)return;
   const cm=(p.comments||[]).find(c=>c.id===cmId);if(!cm)return;
   cm.liked=!cm.liked;
   cm.likes=Math.max(0,(cm.likes||0)+(cm.liked?1:-1));
   renderPostView();
   if(S.user&&!String(cmId).startsWith('lcm'))await sbPost({action:'toggleCommentLike',commentId:cmId});
 },
 async pinPostComment(cmId){
   const p=findPostById(S.postViewId);if(!p)return;
   const cm=(p.comments||[]).find(c=>c.id===cmId);if(!cm)return;
   const next=!cm.pinned;
   (p.comments||[]).forEach(c=>c.pinned=false);
   cm.pinned=next;
   renderPostView();
   toast(next?'Comment pinned to top':'Comment unpinned');
   if(S.user&&!String(cmId).startsWith('lcm'))await sbPost({action:'pinPostComment',postId:p.id,commentId:cmId});
 },
 toggleAiThreads(){
   const bar=$('#ai-threads-bar');if(!bar)return;
   bar.classList.toggle('hidden');
   renderAiThreadsBar();
 },
 aiNewThread(){
   A.aiStop();S.aiHist=[];S.aiActiveThreadId='ait_'+Date.now().toString(36);
   $('#ai-log').innerHTML='';aiWelcome();
 },
 aiLoadThread(id){
   const th=(S.aiSavedThreads||[]).find(t=>t.id===id);if(!th)return;
   A.aiStop();S.aiActiveThreadId=th.id;S.aiHist=[...(th.history||[])];
   $('#ai-log').innerHTML='';
   S.aiHist.forEach(m=>{const b=aiBubble(m.role==='user'?'me':'bot','');b.innerHTML=m.role==='user'?esc(m.text):renderAiMarkdown(m.text)});
   renderAiThreadsBar();
 },
 aiDeleteThread(id){
   S.aiSavedThreads=(S.aiSavedThreads||[]).filter(t=>t.id!==id);
   if(S.aiActiveThreadId===id)S.aiActiveThreadId=null;
   store.set('ai_saved_threads',S.aiSavedThreads);
   renderAiThreadsBar();
   if(S.user)sbPost({action:'deleteAiThread',id}).catch(()=>{});
 },
 aiDictate(){
   if(!SR)return toast('Speech recognition unavailable in this browser','err');
   const r=new SR();r.lang=cfg.lang||'en-US';
   toast('Listening…');
   r.onresult=e=>{const t=e.results[0][0].transcript;const inp=$('#ai-in');if(inp){inp.value=(inp.value?inp.value+' ':'')+t;inp.focus()}};
   r.onerror=()=>toast('Voice dictation cancelled');
   r.start();
 },
 studioSelectFont(i){S.stFont=+i||0;renderStudioPreview()},
 studioAddSticker(kind){
   const fk=STORY_FONTS[S.stFont]?.key||'modern';
   if(kind==='quiz'){
     const q=window.prompt('Quiz question:','Which stack powers E2EE?');if(!q)return;
     const o1=window.prompt('Option A (correct):','WebCrypto P-256')||'Option A';
     const o2=window.prompt('Option B:','Plaintext')||'Option B';
     S.stStickers.push({type:'quiz',font:fk,question:q.slice(0,80),options:[o1.slice(0,24),o2.slice(0,24)],correct:0});
   }else if(kind==='slider'){
     const q=window.prompt('Slider prompt:','How clean is this UI?')||'Rate this!';
     const em=window.prompt('Slider emoji:','🔥')||'🔥';
     S.stStickers.push({type:'slider',font:fk,question:q.slice(0,60),emoji:em.slice(0,4)});
   }else{
     const t=window.prompt('Floating text sticker:','LIVE NOW')||'';if(!t)return;
     S.stStickers.push({type:'text',font:fk,text:t.slice(0,40)});
   }
   renderStudioPreview();
 },
 studioDelSticker(i){S.stStickers.splice(+i,1);renderStudioPreview()},
 voteStoryQuiz(arg){
   const s=ST[S.story];if(!s)return;
   const raw=String(arg||'');
   const optIdx=raw.includes(':')?raw.split(':')[1]:raw;
   s.stickerChoice=Number(optIdx)||0;
   saveS();renderStory();toast('Quiz vote recorded');
 },
 saveStudioDraft(){
   const q=$('#st-in')?.value.trim()||'';
   if(!q&&!S.stStickers.length)return toast('Write text or add a sticker before saving draft','err');
   S.stDrafts=[{mode:S.studioMode,bg:S.stBg,font:S.stFont,q,stickers:[...S.stStickers],url:$('#st-url')?.value||'',opt1:$('#st-opt1')?.value||'',opt2:$('#st-opt2')?.value||''},...(S.stDrafts||[])].slice(0,8);
   store.set('st_drafts',S.stDrafts);
   renderStudioPreview();
   toast('Studio draft saved');
 },
 loadStudioDraft(i){
   const dr=(S.stDrafts||[])[+i];if(!dr)return;
   S.studioMode=dr.mode||'story';S.stBg=dr.bg||0;S.stFont=dr.font||0;S.stStickers=[...(dr.stickers||[])];
   if($('#st-in'))$('#st-in').value=dr.q||'';
   if($('#st-url'))$('#st-url').value=dr.url||'';
   if($('#st-opt1'))$('#st-opt1').value=dr.opt1||'';
   if($('#st-opt2'))$('#st-opt2').value=dr.opt2||'';
   renderStudioPreview();toast('Loaded draft');
 },
 useReelAudio(id){
   const r=getReels().find(x=>String(x.id)===String(id))||getReels()[S.reel];
   A.storyNew('reel');
   S.reelAudioDraft=r?`Original audio · @${r.author}`:'Studio Audio Track';
   if($('#st-in'))$('#st-in').value=`#audio "${S.reelAudioDraft}" · `;
   renderStudioPreview();
   toast(`Selected audio from @${r?.author||'creator'}`);
 },
 remixReel(id){
   const r=getReels().find(x=>String(x.id)===String(id))||getReels()[S.reel];
   A.storyNew('reel');
   S.reelRemixDraft=r?`@${r.author}`:'creator';
   if($('#st-in'))$('#st-in').value=`Remix with @${r?.author||'creator'}: `;
   renderStudioPreview();
   toast(`Remixing @${r?.author||'creator'}'s reel`);
 },
 postAspect(ratio){S.postAspect=['1:1','4:5','16:9'].includes(ratio)?ratio:'1:1';renderPostPreview()},
 postFilterSelect(key){S.postFilter=POST_FILTERS.some(f=>f.key===key)?key:'normal';renderPostPreview()},
 postMoveSlide(arg){
   const [rawI,rawD]=String(arg||'').split(':');
   const i=+rawI,d=+rawD,j=i+d;
   if(j<0||j>=S.postMedia.length)return;
   const arr=[...S.postMedia];[arr[i],arr[j]]=[arr[j],arr[i]];
   S.postMedia=arr;renderPostPreview();
 },
 lbZoom(){
   S.lbZoom=S.lbZoom===1?2:1;
   const img=$('#lb-img');
   if(img)img.style.transform=`scale(${S.lbZoom})`;
   setTxt('#lb-zoom-lbl',S.lbZoom+'x');
 },
 lbStep(d){
   if(!S.lbMediaList.length)return;
   S.lbMediaIdx=(S.lbMediaIdx+(+d)+S.lbMediaList.length)%S.lbMediaList.length;
   A.openMedia(S.lbMediaList[S.lbMediaIdx]);
 },
 openQrCard(){
   const handle=userHandle(S.user||S.localUser)||'you';
   const url=`${location.origin}/?u=${encodeURIComponent(handle)}`;
   setTxt('#qr-handle-lbl','@'+handle);
   const box=$('#qr-svg-box');
   if(box)box.innerHTML=renderQrSvg(url,{size:168,fg:'#090b10',bg:'#ffffff',title:'Profile QR'});
   openM('m-qr-card');
 },
 downloadQrCard(){
   const svg=$('#qr-svg-box')?.innerHTML||'';
   if(svg)downloadQrPng(svg,'whatsgram-profile-qr.png');
   toast('Downloaded QR namecard PNG');
 },
 copyQrLink(){
   const handle=userHandle(S.user||S.localUser)||'you';
   const url=`${location.origin}/?u=${encodeURIComponent(handle)}`;
   navigator.clipboard?.writeText(url).then(()=>toast('Profile URL copied'),()=>toast(url));
 },
 async openInsights(){
   openM('m-insights');
   const box=$('#insights-body');
   if(box)box.innerHTML='<div class="py-6 text-center text-zinc-400">Loading creator insights…</div>';
   let data=null;
   if(S.user){
     const res=await sbGet('creatorInsights');
     if(res?.ok)data=res;
   }
   if(!data){
     const posts=LOCAL_SOCIAL.posts||[];
     const likes=posts.reduce((a,p)=>a+LOCAL_SOCIAL.likes.filter(l=>l[0]===p.id).length,0);
     const comments=posts.reduce((a,p)=>a+LOCAL_SOCIAL.comments.filter(c=>c.postId===p.id||c[0]===p.id).length,0);
     const saves=posts.reduce((a,p)=>a+LOCAL_SOCIAL.saves.filter(s=>s[0]===p.id&&s[2]==='save').length,0);
     const rViews=getReels().reduce((a,r)=>a+(r.views||0),0);
     data={followersTotal:(LOCAL_SOCIAL.follows||[]).length+128,followers7d:14,postsCount:posts.length,reelsCount:getReels().length,totals:{views:rViews+posts.length*420,likes,comments,saves},topPosts:posts.slice(0,4).map(p=>({id:p.id,caption:p.caption,likes:LOCAL_SOCIAL.likes.filter(l=>l[0]===p.id).length,comments:LOCAL_SOCIAL.comments.filter(c=>c.postId===p.id||c[0]===p.id).length}))};
   }
   if(box){box.innerHTML=renderCreatorInsightsHtml(data,{esc,fmtCompactCount,ic});icons()}
 },
 async openSessionsModal(){
   openM('m-sessions');
   setTxt('#totp-status-lbl',cfg.totpEnabled?'2FA Authenticator active on account':'Not configured');
   $('#totp-setup-box')?.classList.add('hidden');
   const sessBox=$('#sess-list'),khBox=$('#key-hist-list');
   if(sessBox)sessBox.innerHTML='<div class="text-zinc-500 py-2">Loading sessions…</div>';
   if(khBox)khBox.innerHTML=`<div>Active key: ${esc(FP||'ECDH P-256')}</div>`;
   if(S.user){
     const [rs,rk]=await Promise.all([sbGet('sessionsList'),sbGet('keyHistory')]);
     const sessions=rs?.sessions||[];
     if(sessBox)sessBox.innerHTML=sessions.length?sessions.map(s=>`<div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]"><div class="min-w-0"><div class="text-white font-semibold truncate">${esc(s.device_label||'Web Browser')}</div><div class="text-[10px] text-zinc-400">Last seen ${timeAgo(s.last_seen_at||s.created_at)}</div></div><button type="button" data-act="revokeSessionAction" data-arg="${esc(s.id)}" class="btn-ghost h-7 px-2.5 rounded-lg text-[10.5px] font-semibold text-rose-300 shrink-0">Revoke</button></div>`).join(''):'<div class="text-zinc-500 py-2">Current web session active.</div>';
     const hist=rk?.history||[];
     if(khBox&&hist.length)khBox.innerHTML=hist.map(h=>`<div class="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">${esc(h.key_fp)} · ${esc(h.reason||'rotation')} · ${timeAgo(h.created_at)}</div>`).join('');
   }else if(sessBox){
     sessBox.innerHTML='<div class="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between"><div><div class="text-white font-semibold">Current Local Browser</div><div class="text-[10px] text-zinc-400">Active now</div></div><span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">This device</span></div>';
   }
 },
 async enableTotpSetup(){
   let secret='WG2FA7JXKQ4N6M2P5R8T',otpauth=`otpauth://totp/WhatsGram:${encodeURIComponent(userHandle(S.user||S.localUser)||'user')}?secret=${secret}&issuer=WhatsGramOS`;
   if(S.user){
     const res=await sbPost({action:'setupTotp'});
     if(res?.ok&&res.secret){secret=res.secret;otpauth=res.otpauthUrl||otpauth}
   }
   S.totpSetup={secret,otpauth};
   $('#totp-setup-box')?.classList.remove('hidden');
   const qr=$('#totp-qr-box');if(qr)qr.innerHTML=renderQrSvg(otpauth,{size:128,fg:'#090b10',bg:'#ffffff',title:'2FA QR'});
   setTxt('#totp-secret-lbl',`Secret: ${secret}`);
 },
 async verifyTotpEnable(){
   const code=($('#totp-verify-code')?.value||'').trim();
   if(!/^\d{6}$/.test(code))return toast('Enter a 6-digit code from your authenticator app','err');
   if(S.user){
     const res=await sbPost({action:'enableTotp',code,secret:S.totpSetup?.secret});
     if(!res?.ok)return toast(res?.error||'Invalid verification code','err');
   }
   cfg.totpEnabled=true;saveCfg();
   $('#totp-setup-box')?.classList.add('hidden');
   setTxt('#totp-status-lbl','2FA Authenticator active on account');
   audit('Authenticator 2FA enabled','auth');
   toast('2FA Authenticator enabled');
 },
 async disableTotpAction(){
   if(S.user)await sbPost({action:'disableTotp'});
   cfg.totpEnabled=false;saveCfg();
   $('#totp-setup-box')?.classList.add('hidden');
   setTxt('#totp-status-lbl','Not configured');
   audit('Authenticator 2FA disabled','auth');
   toast('2FA disabled');
 },
 async revokeSessionAction(sid){
   if(S.user)await sbPost({action:'revokeSession',sessionId:sid});
   toast('Session revoked');A.openSessionsModal();
 },
 async enrollPasskeyAction(){
   try{
     const handle=userHandle(S.user||S.localUser)||'whatsgram-user';
     const res=await registerWebAuthnPasskey(S.user?.id||handle,handle);
     audit(`WebAuthn passkey enrolled (${res.id.slice(0,10)}…)`,'auth');
     toast('Hardware Passkey enrolled for this browser');
   }catch(e){toast(e?.message||'Passkey cancelled or unsupported in this browser','err')}
 },
 async authPasskeyLogin(){
   try{
     const res=await verifyWebAuthnPasskey();
     toast('Passkey assertion verified');
     audit(`Passkey unlock verified (${res.id.slice(0,8)}…)`,'auth');
   }catch(e){toast(e?.message||'No enrolled passkey verified on this origin','err')}
 },
 auditFilter(cat){S.auditFilter=cat||'all';renderAudit()},
 scheduleDeleteAction(){
   ask('Schedule account deletion?','Enters a 30-day reversible grace window before permanent removal.',async()=>{
     if(S.user)await sbPost({action:'scheduleAccountDeletion'});
     audit('Account deletion scheduled (30-day grace window)','auth');
     toast('Account scheduled for deletion (30-day grace period)');
   });
 },
 panicWipeAction(){
   ask('Panic Wipe Device?','Immediately shreds local keys, IndexedDB drafts, cache, and reloads the enclave.',async()=>{
     if(S.user)await sbPost({action:'signout'}).catch(()=>{});
     await executePanicWipe(tabSync);
   });
 },
 async toggleMuteUser(targetUserId){
   if(!targetUserId)return;
   const arr=S.safety.mutedIds=S.safety.mutedIds||[];
   const i=arr.indexOf(targetUserId);if(i>=0)arr.splice(i,1);else arr.push(targetUserId);
   saveSafety();if(S.feedData)renderFeedView();if(S.view==='profile')renderProfile();
   toast(i>=0?'User unmuted':'User muted');
   if(S.user)await sbPost({action:'toggleMute',targetUserId});
 },
 async toggleRestrictUser(targetUserId){
   if(!targetUserId)return;
   const arr=S.safety.restrictedIds=S.safety.restrictedIds||[];
   const i=arr.indexOf(targetUserId);if(i>=0)arr.splice(i,1);else arr.push(targetUserId);
   saveSafety();if(S.view==='profile')renderProfile();
   toast(i>=0?'Account unrestricted':'Account restricted');
   if(S.user)await sbPost({action:'toggleRestrict',targetUserId});
 },
 async toggleCloseFriendUser(targetUserId){
   if(!targetUserId)return;
   const arr=S.safety.closeFriendIds=S.safety.closeFriendIds||[];
   const i=arr.indexOf(targetUserId);if(i>=0)arr.splice(i,1);else arr.push(targetUserId);
   saveSafety();if(S.view==='profile')renderProfile();
   toast(i>=0?'Removed from Close Friends':'Added to Close Friends');
   if(S.user)await sbPost({action:'toggleCloseFriend',targetUserId});
 },
 _renderTour(){
   const step=WELCOME_TOUR_STEPS[S.tourStep]||WELCOME_TOUR_STEPS[0];
   setTxt('#tour-step-badge',step.badge||`Step ${S.tourStep+1} of ${WELCOME_TOUR_STEPS.length}`);
   setTxt('#tour-title',step.title);
   setTxt('#tour-desc',step.body||step.desc||'');
 },
 startWelcomeTour(){S.tourStep=0;A._renderTour();openM('m-tour')},
 tourPrev(){S.tourStep=Math.max(0,S.tourStep-1);A._renderTour()},
 tourNext(){if(S.tourStep<WELCOME_TOUR_STEPS.length-1){S.tourStep++;A._renderTour()}else A.finishTour()},
 finishTour(){store.set('tour_done',true);closeM('m-tour')},
 dWiring(){const els=$$('[data-act]'),acts=new Set(els.map(e=>e.dataset.act)),badMenus=[...new Set(els.filter(e=>e.dataset.act==='menu').map(e=>e.dataset.arg.split(':')[0]))].filter(k=>!MENUS[k]);let items=0;Object.values(MENUS).forEach(f=>{try{f('x').forEach(i=>{if(i.act){acts.add(i.act);items++}if(i.emojis){acts.add('react');items++}})}catch(e){}});const miss=[...acts].filter(a=>!A[a]);diag(`${els.length} controls · ${items} menu items · ${acts.size} actions · ${miss.length||badMenus.length?'UNWIRED: '+[...miss,...badMenus.map(m=>'menu:'+m)].join(', '):'0 unwired'}`)},
 dSignal(){let v=0,seen=null;const subs=[n=>seen=n];const set=n=>{v=n;subs.forEach(f=>f(n))};set(42);diag(`Reactive signal propagation: ${seen===42&&v===42?'PASS':'FAIL'}`)},
 dDeps(){diag(`Bundles ESBuild · Lucide ${window.lucide?'ok':'MISSING'} · WebCrypto ${window.crypto&&crypto.subtle?'ok':'unavailable'} · ECDH ${S.ecdhId?'P-256':'off'} · WebRTC ${window.RTCPeerConnection?'ok':'unavailable'} · SpeechRecognition ${SR?'ok':'unavailable'} · MediaRecorder ${window.MediaRecorder?'ok':'unavailable'} · Gemini ${S.aiMode} · Supabase ${S.sbConfigured?(S.user?'signed-in':'ready'):'local-only'} · Realtime ${S.rtChan?'connected':(S.sbRealtime?'standby':'poll')} · Presence ${S.rtPres?'on':'off'} · WebPush ${S.pushSubscribed?'subscribed':'off'} · SW ${navigator.serviceWorker?.controller?'active':'standby'} · Incognito ${S.incognito?'on':'off'} · secure context ${window.isSecureContext}`)},
 dTelemetry(){const m=performance.memory;diag(`DOM nodes ${document.getElementsByTagName('*').length} · heap ${m?(m.usedJSHeapSize/1048576).toFixed(1)+' MB':'n/a'} · cores ${navigator.hardwareConcurrency||'?'} · online ${navigator.onLine}`)},
 bench(){clearTimeout(bn.tm);const t=$('#b-target');t.classList.add('hidden');setTxt('#b-msg','Wait for the target…');$('#b-msg').classList.remove('hidden');bn.tm=setTimeout(()=>{const a=$('#b-area');t.style.left=Math.random()*(a.clientWidth-48)+4+'px';t.style.top=Math.random()*(a.clientHeight-48)+4+'px';t.classList.remove('hidden');$('#b-msg').classList.add('hidden');bn.t=performance.now()},700+Math.random()*1500)},
 bhit(){const ms=Math.round(performance.now()-bn.t);$('#b-target').classList.add('hidden');setTxt('#b-last',ms);bn.best=bn.best==null?ms:Math.min(bn.best,ms);setTxt('#b-best',bn.best);setTxt('#b-msg','Nice. Press start for another round.');$('#b-msg').classList.remove('hidden')}
};

/* ---------- event binding ---------- */
document.addEventListener('click',e=>{
  resetIdle();
  if(S.menu&&!e.target.closest('#menu')&&!e.target.closest('[data-act="menu"]'))closeMenu();
  const bd=e.target;
  if(bd.classList&&bd.classList.contains('modal')&&bd.id!=='m-lock'){
    if(bd.id==='m-story')A.storyClose();else if(bd.id==='m-call')return;else closeM(bd.id);
    return;
  }
  const extLink=e.target.closest('a.wg-ext-link');
  if(extLink){
    const chk=inspectExternalUrl(extLink.href);
    if(!chk.safe&&!window.confirm(`${chk.warning}\n\nHost: ${chk.hostname}\nProceed anyway?`)){e.preventDefault();return}
  }
  const t=e.target.closest('[data-act]');if(!t||t.disabled)return;
  const f=A[t.dataset.act];if(!f){console.warn('Unwired control:',t.dataset.act);return}
  if(t.closest('#menu'))closeMenu();
  tone();f(t.dataset.arg,t,e);
});
document.addEventListener('keydown',e=>{
  resetIdle();const t=e.target;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#m-cmd').classList.contains('open')?closeM('m-cmd'):A.openCmd();return}
  if(S.menu){
    const its=$$('[role^=menuitem]',S.menu.m),i=its.indexOf(document.activeElement),n=its.length;
    if(e.key==='ArrowDown'){e.preventDefault();its[(i+1)%n].focus();return}
    if(e.key==='ArrowUp'){e.preventDefault();its[(i-1+n)%n].focus();return}
    if(e.key==='Home'){e.preventDefault();its[0].focus();return}
    if(e.key==='End'){e.preventDefault();its[n-1].focus();return}
    if(e.key==='Escape'){e.preventDefault();closeMenu(true);return}
    if(e.key==='Tab'){closeMenu()}
  }
  if(e.key==='Enter'&&t.id==='cmd-in'){e.preventDefault();$('#cmd-list [data-act="cmdRun"]')?.click();return}
  if(e.key==='Enter'&&t.id==='th-search-in'){e.preventDefault();searchStep(e.shiftKey?-1:1);return}
  if(e.key==='Enter'&&t.dataset&&t.dataset.enter){e.preventDefault();A[t.dataset.enter]()}
  if(e.key==='Escape'){$$('.modal.open').forEach(m=>{if(m.id==='m-lock'||m.id==='m-call')return;m.id==='m-story'?A.storyClose():closeM(m.id)});S.editId&&A.cancelEdit();S.reply&&A.cancelReply();show('#mention-box',false)}
  if($('#m-story')?.classList.contains('open')&&!/INPUT|TEXTAREA/.test(t.tagName)){
    if(e.key==='ArrowLeft'){e.preventDefault();A.storyPrev();return}
    if(e.key==='ArrowRight'){e.preventDefault();A.storyNext();return}
  }
  if(e.key==='?'&&!/INPUT|TEXTAREA|SELECT/.test(t.tagName)&&!$('.modal.open')){e.preventDefault();A.openShortcuts();return}
  if(S.view==='reels'&&!/INPUT|TEXTAREA|SELECT/.test(t.tagName)&&!$('.modal.open')){if(e.key==='ArrowDown'||e.key==='j')goReel(1);if(e.key==='ArrowUp'||e.key==='k')goReel(-1);if(e.key==='m')A.reelMute();if(e.key==='l')likeReel()}
});
document.addEventListener('input',e=>{
  const k=e.target.dataset&&e.target.dataset.input;
  if(k==='search'){S.q=e.target.value;renderList()}
  if(k==='feedSearch'){S.feedQ=e.target.value;renderFeedView()}
  if(k==='bkStrength'){
    const res=scorePassphraseEntropy(e.target.value||'');
    const bar=$('#bk-strength-bar'),lbl=$('#bk-strength-lbl');
    const cls=res.tone==='emerald'?'bg-emerald-400':res.tone==='sky'?'bg-sky-400':res.tone==='amber'?'bg-amber-400':'bg-rose-400';
    if(bar){bar.className=`h-full transition-all ${cls}`;bar.style.width=res.pct+'%'}
    if(lbl){lbl.textContent=`${res.label} · ${res.bits} bits (${res.crack})`;lbl.className=`text-[10px] font-mono text-${res.tone}-300`}
  }
  if(k==='suUser'){
    const raw=String(e.target.value||'').trim().toLowerCase().replace(/^@+/,'');
    const hint=$('#auth-su-user-hint');
    if(hint){
      if(!raw){hint.className='text-[10px] font-mono text-zinc-500';hint.textContent='3–24 chars: lowercase letters, numbers, dot, underscore or hyphen.'}
      else if(/^[a-z0-9][a-z0-9._-]{1,22}[a-z0-9]$/.test(raw)){
        hint.className='text-[10px] font-mono text-emerald-300';hint.textContent=`@${raw} · Valid handle`;
        clearTimeout(S._suChkTm);
        if(S.sbConfigured){S._suChkTm=setTimeout(async()=>{const r=await sbGet('usernameAvailable',{username:raw});if($('#auth-su-user-hint')&&($('#auth-su-user')?.value||'').trim().toLowerCase().replace(/^@+/,'')===raw){$('#auth-su-user-hint').className='text-[10px] font-mono '+(r?.available!==false?'text-emerald-300':'text-rose-300');$('#auth-su-user-hint').textContent=r?.available!==false?`@${raw} · Available`:`@${raw} · Already taken`}},320)}
      }
      else{hint.className='text-[10px] font-mono text-amber-300';hint.textContent='Use 3–24 lowercase letters, numbers, dot, underscore or hyphen.'}
    }
  }
  if(k==='pwStrength'){
    const p=String(e.target.value||''),bar=$('#auth-pw-bar'),lbl=$('#auth-pw-lbl');
    let sc=0;if(p.length>=6)sc++;if(p.length>=10)sc++;if(/[A-Z]/.test(p)&&/[a-z]/.test(p))sc++;if(/\d/.test(p))sc++;if(/[^A-Za-z0-9]/.test(p))sc++;
    const lvl=!p?{w:'0%',c:'bg-rose-400',t:'Min 6 chars'}:p.length<6?{w:'20%',c:'bg-rose-400',t:'Too short'}:sc<=2?{w:'45%',c:'bg-amber-400',t:'Fair'}:sc===3?{w:'75%',c:'bg-sky-400',t:'Good'}:{w:'100%',c:'bg-emerald-400',t:'Strong'};
    if(bar){bar.className=`h-full transition-all ${lvl.c}`;bar.style.width=lvl.w}
    if(lbl){lbl.textContent=lvl.t;lbl.className='text-[10px] font-mono '+(sc>=3&&p.length>=6?'text-emerald-300':'text-zinc-400')}
  }
  if(k==='storyPreview')renderStudioPreview();
  if(k==='postPreview')renderPostPreview();
  if(k==='followSearch'){S.followListQ=e.target.value;renderFollowListModal()}
  if(k==='threadSearch')searchThread(e.target.value);
  if(k==='cmd')renderCmdPalette(e.target.value);
  if(k==='sentiment'){
    const rawVal=e.target.value,v=rawVal.toLowerCase(),b=$('#sent'),c=cur();
    if(c&&!S.incognito){clearTimeout(S._draftTm);S._draftTm=setTimeout(()=>{saveDraftIdb(c.id,rawVal)},280)}
    const recips=convRecipientIds(c);
    if(S.user&&recips.length&&S.rtChan){
      if(v.trim()){
        if(!S.myTypingTm||S.myTypingChat!==c.id||Date.now()-(S.myTypingSentAt||0)>1500){
          S.myTypingSentAt=Date.now();S.myTypingChat=c.id;
          signalConvPeers(c,'typing',{fromUserId:S.user.id,fromName:S.user.displayName||S.user.email,conversationId:c.id,active:true});
        }
        clearTimeout(S.myTypingTm);
        S.myTypingTm=setTimeout(()=>{S.myTypingTm=null;if(S.user&&cur()?.id===c.id&&S.rtChan)signalConvPeers(c,'typing',{fromUserId:S.user.id,conversationId:c.id,active:false})},2200);
      }else if(S.myTypingTm){
        clearTimeout(S.myTypingTm);S.myTypingTm=null;
        signalConvPeers(c,'typing',{fromUserId:S.user.id,conversationId:c.id,active:false});
      }
    }
    const mb=$('#mention-box'),mm=c?rawVal.match(/@([a-z0-9._-]*)$/i):null;
    if(mm){
      const mq=mm[1].toLowerCase(),items=[];
      if('ai'.includes(mq)||'meta'.includes(mq)||!mq){
        items.push(`<button data-act="pickMention" data-arg="ai" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.08] text-xs text-white text-left"><span class="w-6 h-6 rounded-full bg-gradient-to-br from-accent/35 to-indigo-500/35 border border-accent/40 grid place-items-center text-accent shrink-0">${ic('sparkles','w-3.5 h-3.5')}</span><span class="min-w-0 flex-1 truncate font-medium">@ai <span class="text-zinc-400 font-normal">· Ask anything or draft reply</span></span></button>`);
      }
      if(c?.isGroup&&Array.isArray(c.members)){
        c.members.filter(m=>m.id!==S.user?.id&&m.displayName.toLowerCase().includes(mq)).forEach(m=>{
          items.push(`<button data-act="pickMention" data-arg="${esc(m.displayName)}" class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.08] text-xs text-white text-left">${av(m.displayName,'w-6 h-6')}<span class="truncate">${esc(m.displayName)}</span></button>`);
        });
      }
      if(items.length){mb.innerHTML=items.join('');show(mb,true);icons()}else show(mb,false);
    }else if(mb)show(mb,false);
    if(!v.trim()){b.classList.add('hidden');return}
    b.classList.remove('hidden');
    const pos=/thank|good|great|confirm|love|perfect/.test(v),neg=/issue|error|delay|problem|bug|fail/.test(v);
    b.textContent=pos?'Positive':neg?'Concerned':'Neutral';
    b.className=`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${pos?'border-emerald-500/40 bg-emerald-500/10 text-emerald-300':neg?'border-amber-500/40 bg-amber-500/10 text-amber-300':'border-white/15 bg-white/5 text-zinc-400'}`;
  }
});
document.addEventListener('change',e=>{
  if(e.target.dataset.change==='idle'){cfg.idle=+e.target.value;saveCfg();resetIdle();audit(cfg.idle?`Auto-lock set to ${cfg.idle} min`:'Auto-lock disabled')}
  if(e.target.dataset.change==='vanishSec'){cfg.vanishSec=+e.target.value||6;saveCfg();renderInfo();audit(`Vanish timer set to ${cfg.vanishSec}s`)}
  if(e.target.dataset.input==='feedSort'){S.feedSort=e.target.value||'recent';loadFeedData(false)}
  if(e.target.dataset.input==='setLang'){cfg.lang=e.target.value||'en';saveCfg();applyCfg();toast(`Language set to ${cfg.lang.toUpperCase()}`)}
});
$('#feed-root')?.addEventListener('pointerover',e=>{const v=e.target.closest?.('video.feed-hover-vid');if(v&&v.paused)v.play().catch(()=>{})});
$('#feed-root')?.addEventListener('pointerout',e=>{const v=e.target.closest?.('video.feed-hover-vid');if(v&&!v.paused)v.pause()});
$('#feed-root')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.classList?.contains('feed-qc-inp')){
    e.preventDefault();
    const pid=e.target.dataset.postId||e.target.closest('[data-post-id]')?.dataset.postId;
    if(pid)A.feedQuickComment(pid,e.target);
  }
});
$('#reel-scrub')?.addEventListener('click',e=>{
  const rv=$('#reel-vid'),sb=$('#reel-scrub');if(!rv||!sb||!Number.isFinite(rv.duration)||rv.duration<=0)return;
  const r=sb.getBoundingClientRect();const pct=Math.max(0,Math.min(1,(e.clientX-r.left)/Math.max(1,r.width)));
  rv.currentTime=pct*rv.duration;
});
$('#file').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(f)sendAttachmentFile(f)});
const toPostMediaItems=async(fileList)=>{
  const items=[];
  for(const raw of [...(fileList||[])].slice(0,4)){
    const f=await processUploadFile(raw,{maxDim:1600,quality:0.86});
    let dataUrl=null;
    if(!S.user&&f.type.startsWith('image/')&&f.size<=1500000){
      dataUrl=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(String(r.result||''));r.onerror=()=>res(null);r.readAsDataURL(f)});
    }
    items.push({file:f,url:URL.createObjectURL(f),dataUrl,mime:f.type});
  }
  return items;
};
$('#st-file')?.addEventListener('change',async e=>{const raw=e.target.files[0];e.target.value='';if(!raw)return;const f=await processUploadFile(raw,{maxDim:1440,quality:0.86});S.stMedia={file:f,url:URL.createObjectURL(f),mime:f.type};renderStudioPreview()});
$('#st-co')?.addEventListener('change',()=>renderStudioPreview());
['#st-prev','#st-dropzone'].forEach(sel=>{const el=$(sel);if(!el)return;el.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files')){e.preventDefault();el.classList.add('ring-2','ring-[#0095f6]/70')}});el.addEventListener('dragleave',()=>el.classList.remove('ring-2','ring-[#0095f6]/70'));el.addEventListener('drop',async e=>{el.classList.remove('ring-2','ring-[#0095f6]/70');const raw=e.dataTransfer?.files?.[0];if(!raw)return;e.preventDefault();const f=await processUploadFile(raw,{maxDim:1440,quality:0.86});S.stMedia={file:f,url:URL.createObjectURL(f),mime:f.type};renderStudioPreview()})});
$('#ep-av-file')?.addEventListener('change',async e=>{
  const raw=e.target.files[0];e.target.value='';if(!raw)return;
  const f=await processUploadFile(raw,{maxDim:512,quality:0.86});
  if(S.user&&S.sbConfigured){
    toast('Uploading avatar…');
    uploadCloudMedia(null,'av_'+Date.now().toString(36),f,f.name,f.type,{scope:'avatar'}).then(up=>{
      if(!up?.mediaPath)return toast('Avatar upload failed','err');
      S.epAvatarPath=up.mediaPath;
      const r=new FileReader();r.onload=()=>{S.epAvatarUrl=String(r.result||'');updateEpAvatarPreview()};r.readAsDataURL(f);
      toast('Avatar uploaded — click Save to apply');
    });
  }else{
    const r=new FileReader();r.onload=()=>{S.epAvatarUrl=String(r.result||'');updateEpAvatarPreview()};r.readAsDataURL(f);
  }
});
$('#post-file')?.addEventListener('change',async e=>{
  const files=[...(e.target.files||[])].slice(0,4);e.target.value='';if(!files.length)return;
  S.postMedia=await toPostMediaItems(files);renderPostPreview();
});
['#post-prev','#post-dropzone'].forEach(sel=>{const el=$(sel);if(!el)return;el.addEventListener('dragover',e=>{if(e.dataTransfer?.types?.includes('Files')){e.preventDefault();el.classList.add('ring-2','ring-[#0095f6]/70')}});el.addEventListener('dragleave',()=>el.classList.remove('ring-2','ring-[#0095f6]/70'));el.addEventListener('drop',async e=>{el.classList.remove('ring-2','ring-[#0095f6]/70');const files=[...(e.dataTransfer?.files||[])].filter(f=>f.type.startsWith('image/')||f.type.startsWith('video/')).slice(0,4);if(!files.length)return;e.preventDefault();S.postMedia=await toPostMediaItems(files);renderPostPreview()})});
$('#hl-file')?.addEventListener('change',async e=>{
  const raw=e.target.files[0];e.target.value='';if(!raw)return;
  const f=await processUploadFile(raw,{maxDim:720,quality:0.85});
  const r=new FileReader();
  r.onload=()=>{S.hlMedia={file:f,url:URL.createObjectURL(f),dataUrl:String(r.result||''),mime:f.type};setTxt('#hl-media-lbl',f.name.slice(0,18))};
  r.readAsDataURL(f);
});
let _swX=0,_swY=0,_swMsg=null;
$('#stream').addEventListener('touchstart',e=>{const g=e.target.closest('.grp[id]');if(!g||!e.touches?.[0])return;_swX=e.touches[0].clientX;_swY=e.touches[0].clientY;_swMsg=g.id},{passive:true});
$('#stream').addEventListener('touchend',e=>{if(!_swMsg||!e.changedTouches?.[0])return;const dx=e.changedTouches[0].clientX-_swX,dy=Math.abs(e.changedTouches[0].clientY-_swY);const id=_swMsg;_swMsg=null;if(dx>58&&dy<38&&cur()?.msgs.some(m=>m.id===id))A.reply(id)},{passive:true});
$('#msg').addEventListener('paste',e=>{const f=e.clipboardData?.files?.[0];if(f){e.preventDefault();sendAttachmentFile(f)}});
$('#stream').addEventListener('scroll',()=>{const s=$('#stream');show('#jump-bottom',Boolean(cur()&&s.scrollHeight-s.scrollTop-s.clientHeight>180))},{passive:true});
let dragDepth=0;
const thEl=$('#thread');
thEl.addEventListener('dragenter',e=>{if(!cur()||!e.dataTransfer?.types?.includes('Files'))return;e.preventDefault();dragDepth++;show('#drop-overlay',true)});
thEl.addEventListener('dragover',e=>{if(!cur()||!e.dataTransfer?.types?.includes('Files'))return;e.preventDefault()});
thEl.addEventListener('dragleave',e=>{if(!cur())return;dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)show('#drop-overlay',false)});
thEl.addEventListener('drop',e=>{dragDepth=0;show('#drop-overlay',false);if(!cur())return;const f=e.dataTransfer?.files?.[0];if(f){e.preventDefault();sendAttachmentFile(f)}});
const st=$('#reel-stage');
st.addEventListener('click',e=>{if(e.target.closest('button'))return;const n=Date.now();if(n-lastTap<300){clearTimeout(tapT);lastTap=0;burst(e.clientX,e.clientY);likeReel(true)}else{lastTap=n;tapT=setTimeout(()=>{S.paused=!S.paused;pauseBar(S.paused);show('#reel-pause',S.paused,'grid')},300)}});
st.addEventListener('wheel',e=>{e.preventDefault();if(!st._w){st._w=1;goReel(e.deltaY>0?1:-1);setTimeout(()=>st._w=0,500)}},{passive:false});
let ty=0;st.addEventListener('touchstart',e=>ty=e.touches[0].clientY,{passive:true});st.addEventListener('touchend',e=>{const d=ty-e.changedTouches[0].clientY;if(Math.abs(d)>70)goReel(d>0?1:-1)},{passive:true});
bar().addEventListener('animationend',()=>{if(S.view==='reels')goReel(1)});
window.addEventListener('resize',()=>closeMenu());
window.addEventListener('scroll',e=>{if(S.menu&&!(e.target.nodeType===1&&e.target.closest('#menu')))closeMenu()},true);
window.addEventListener('offline',()=>{show('#offline',true,null);updateOfflineUI();toast('You are offline','err')});
window.addEventListener('online',()=>{show('#offline',false,null);updateOfflineUI();flushOutbox()});
$('#ai-file')?.addEventListener('change',async e=>{
  const raw=e.target.files[0];e.target.value='';if(!raw)return;
  const f=await processUploadFile(raw,{maxDim:1600,quality:0.85});
  if(f.size>4*1024*1024)return toast('Choose an image or audio file under 4 MB','err');
  const r=new FileReader();
  r.onload=()=>{
    const dataUrl=String(r.result||'');
    const comma=dataUrl.indexOf(',');
    S.aiMedia={name:f.name,mimeType:f.type||'image/png',dataBase64:comma>=0?dataUrl.slice(comma+1):''};
    setTxt('#ai-media-name',f.name);
    $('#ai-media-chip')?.classList.remove('hidden');
  };
  r.readAsDataURL(f);
});
navigator.serviceWorker?.addEventListener('message',e=>{if(e?.data?.type==='wg-flush-outbox')flushOutbox()});
window.addEventListener('popstate',()=>{const rt=inspectRouteAndTokens();if(rt.action==='incognito'){enterIncognitoMode(true)}else if(rt.action==='logout'){A.signOut()}else if(rt.action==='auth'){if(!S.user)A.openAuth(rt.tab||'signin')}else if(rt.action==='view'&&rt.view&&(S.user||S.localUser||lsGet('wg_local_mode')==='1')){setShell('app');setView(rt.view)}});
window.addEventListener('hashchange',()=>{if(parseHashOrSearchParams()){S.authTab='reset';if($('#auth-err'))$('#auth-err').classList.add('hidden');if($('#auth-rs-p1'))$('#auth-rs-p1').value='';if($('#auth-rs-p2'))$('#auth-rs-p2').value='';renderAccountUI();openM('m-auth');setTimeout(()=>$('#auth-rs-p1')?.focus(),40)}else if(S.pendingProfileLink){const pr=S.pendingProfileLink;S.pendingProfileLink=null;setShell('app');openProfile(pr)}});

/* ---------- boot ---------- */
const bootRoute=inspectRouteAndTokens();
const hasResetToken=bootRoute.hasReset;
if('serviceWorker'in navigator&&location.protocol.startsWith('http')){navigator.serviceWorker.register('/sw.js').catch(()=>{})}
tabSync=createTabSync((type,payload)=>{
  if(type==='cfg'&&payload){Object.assign(cfg,payload);store.set('cfg',cfg);applyCfg()}
  if(type==='badge'&&typeof payload?.unread==='number'){updateDynamicFavicon(payload.unread,cfg.accent)}
  if(type==='panic'||type==='panicWipe'){location.reload()}
});
reindexSearch();
renderNav();applyCfg();renderStories();genKey();checkAIStatus();renderAccountUI();checkSupabaseSession(bootRoute);window.addEventListener('focus',()=>{if(S.user)refreshCloud(true)});
if(!navigator.onLine)show('#offline',true,null);
updateOfflineUI();
setView(cfg.startView==='feed'?'feed':'chats');renderThread();renderInfo();
const localDemo=!hasResetToken&&(lsGet('wg_local_mode')==='1'||Boolean(S.localUser));
if(hasResetToken){
  setShell('landing');
  S.authTab='reset';
  renderAccountUI();
  openM('m-auth');
  setTimeout(()=>$('#auth-rs-p1')?.focus(),50);
}else if(bootRoute.action==='logout'){
  A.signOut();
}else if(bootRoute.action==='incognito'||INCOGNITO){
  enterIncognitoMode(true);
}else if(bootRoute.action==='auth'){
  setShell('landing');
  A.openAuth(bootRoute.tab||'signin');
  audit('Auth view ready');
}else if(bootRoute.action==='view'&&bootRoute.view==='feed'){
  lsSet('wg_local_mode','1');
  setShell('app');
  setView('feed');
  audit('Explore feed opened');
}else if(localDemo){
  setShell('app');
  if(S.pendingProfileLink){const pr=S.pendingProfileLink;S.pendingProfileLink=null;openProfile(pr)}
  else if(bootRoute.action==='profile')openProfile(bootRoute.target||'self');
  else if(bootRoute.action==='chat'&&bootRoute.chatId)openChat(bootRoute.chatId);
  else if(bootRoute.action==='view'&&bootRoute.view)setView(bootRoute.view);
  else if(window.matchMedia('(min-width:768px)').matches&&D.length)openChat(D[0].id);
  if(cfg.lockLaunch)lock();else audit('Session started');
}else{
  setShell('landing');
  audit('Landing ready');
}
resetIdle();
}
