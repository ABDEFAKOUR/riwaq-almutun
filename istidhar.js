(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const matnId = params.get("matn");
  let matn = null, recognition = null, active = false, sessionId = 0;
  let audioContext = null, alerted = new Set();

  function normalize(value) {
    return String(value || "").normalize("NFD")
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
      .replace(/[\u0610-\u061A\u06D6-\u06ED]/g, "")
      .replace(/[.,،؛:!?؟«»"'()[\]{}]/g, " ")
      .replace(/\s+/g, " ").trim().toLowerCase();
  }

  function align(expected, spoken) {
    const a = normalize(expected).split(" ").filter(Boolean);
    const b = String(spoken || "").trim().split(/\s+/).filter(Boolean);
    const an = a.map(normalize), bn = b.map(normalize);
    const dp = Array.from({length:a.length+1}, () => Array(b.length+1).fill(0));
    for(let i=0;i<=a.length;i++) dp[i][0]=i;
    for(let j=0;j<=b.length;j++) dp[0][j]=j;
    for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++)
      dp[i][j]=an[i-1]===bn[j-1]?dp[i-1][j-1]:Math.min(dp[i-1][j-1]+1,dp[i-1][j]+1,dp[i][j-1]+1);
    let endI=0,best=Infinity;
    for(let i=0;i<=a.length;i++) if(dp[i][b.length]<best){best=dp[i][b.length];endI=i;}
    const spokenStates=b.map(()=>"extra"), issues=[];
    let i=endI,j=b.length;
    while(j>0){
      if(i>0&&an[i-1]===bn[j-1]&&dp[i][j]===dp[i-1][j-1]){spokenStates[j-1]="correct";i--;j--;}
      else if(i>0&&i>0&&dp[i][j]===dp[i-1][j-1]+1){spokenStates[j-1]="wrong";issues.push({type:"changed",expected:a[i-1],spoken:b[j-1],i,j});i--;j--;}
      else if(i>0&&dp[i][j]===dp[i-1][j]+1){issues.push({type:"missing",expected:a[i-1],spoken:"",i,j});i--;}
      else{spokenStates[j-1]="wrong";issues.push({type:"extra",expected:"",spoken:b[j-1],i,j});j--;}
    }
    return {words:b.map((word,k)=>({word,state:spokenStates[k]})),issues:issues.reverse()};
  }

  function loudAlert() {
    try {
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC) return;
      if(!audioContext) audioContext=new AC();
      if(audioContext.state==="suspended") audioContext.resume();
      const ctx=audioContext, now=ctx.currentTime;
      // تنبيه قوي متعدد النغمات؛ يظل مستوى الصوت النهائي خاضعاً للجهاز والمتصفح.
      [0,0.62].forEach(offset=>{
        [[740,0.72],[980,0.55],[1240,0.38]].forEach(([hz,volume])=>{
          const osc=ctx.createOscillator(), gain=ctx.createGain();
          const start=now+offset, duration=0.43;
          osc.type="square"; osc.frequency.setValueAtTime(hz,start);
          gain.gain.setValueAtTime(0.0001,start);
          gain.gain.exponentialRampToValueAtTime(volume,start+0.018);
          gain.gain.setValueAtTime(volume,start+0.25);
          gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(start); osc.stop(start+duration+0.02);
        });
      });
    } catch(error) { console.warn("تعذر تشغيل جرس الاستظهار",error); }
  }

  function render(spoken, interim) {
    const result=align(matn.items.map(item=>item.text).join(" "),spoken);
    const confirmedCount=String(spoken||"").trim().split(/\s+/).filter(Boolean).length;
    const interimWords=String(interim||"").trim().split(/\s+/).filter(Boolean);
    const html=result.words.map((item,index)=>{
      const cls=item.state==="correct"?"recall-word-correct":"recall-word-wrong";
      return '<span class="'+cls+'">'+escapeHTML(item.word)+'</span>';
    });
    interimWords.forEach(word=>html.push('<span class="recall-word-interim">'+escapeHTML(word)+'</span>'));
    $("recall-transcript").innerHTML=html.length?html.join(" "):'<span class="recall-placeholder">سيظهر هنا كلامك كما تنطق به، كلمة بكلمة…</span>';
    $("recall-word-count").textContent=(confirmedCount+interimWords.length)+" كلمة";
    for(const issue of result.issues){
      const key=[issue.type,issue.i,issue.j,issue.expected,issue.spoken].join("|");
      if(!alerted.has(key)){alerted.add(key);loudAlert();$("recall-status").textContent="تنبيه! سُجّل اختلاف محتمل في آخر ما نطقت به. راجع الكلمة الحمراء.";}
    }
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  }

  function stop() {
    if(recognition && active) recognition.stop();
  }

  function start() {
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){$("recall-status").textContent="متصفحك لا يدعم التعرف الصوتي. استعمل Google Chrome.";return;}
    if(active)return;
    const id=++sessionId, current=()=>id===sessionId;
    const rec=new SR(); recognition=rec; alerted=new Set(); active=true;
    let finalText="";
    $("recall-transcript").innerHTML='<span class="recall-placeholder">أستمع إليك…</span>';
    $("recall-word-count").textContent="0 كلمة";
    $("recall-status").textContent="جارٍ تشغيل الميكروفون…";
    $("recall-start").disabled=true; $("recall-stop").disabled=false;
    try {
      const AC=window.AudioContext||window.webkitAudioContext;
      if(AC){if(!audioContext)audioContext=new AC();if(audioContext.state==="suspended")audioContext.resume();}
    } catch {}
    rec.lang="ar-SA"; rec.continuous=true; rec.interimResults=true; rec.maxAlternatives=1;
    rec.onstart=()=>{if(current())$("recall-status").textContent="أستمع إليك الآن… استظهر المتن بصوت واضح."};
    rec.onresult=event=>{
      if(!current())return;
      finalText="";let interim="";
      for(let i=0;i<event.results.length;i++){
        const phrase=event.results[i][0].transcript;
        if(event.results[i].isFinal)finalText+=phrase+" ";else interim+=phrase;
      }
      render(finalText.trim(),interim.trim());
      if(!alerted.size)$("recall-status").textContent="مستمر في الاستماع…";
    };
    rec.onerror=event=>{
      if(!current())return;
      $("recall-status").textContent=event.error==="not-allowed"?"لم تسمح باستعمال الميكروفون. فعّل الإذن من إعدادات المتصفح.":event.error==="no-speech"?"لم نسمع صوتاً. تحدث بوضوح قرب الميكروفون.":"وقع مشكل أثناء التعرف الصوتي: "+event.error;
    };
    rec.onend=()=>{
      if(!current())return;
      active=false; if(recognition===rec)recognition=null;
      $("recall-start").disabled=false; $("recall-stop").disabled=true;
      $("recall-status").textContent=finalText.trim()?"توقف الاستماع. يمكنك متابعة النتيجة أو بدء جلسة جديدة.":"انتهى الاستماع دون التقاط كلام واضح.";
    };
    try{rec.start();}catch(error){active=false;$("recall-start").disabled=false;$("recall-stop").disabled=true;$("recall-status").textContent="تعذر تشغيل الميكروفون. حاول مرة أخرى.";}
  }

  $("recall-start").addEventListener("click",start);
  $("recall-stop").addEventListener("click",stop);
  $("recall-clear").addEventListener("click",()=>{
    if(active)stop();
    sessionId++;active=false;recognition=null;alerted.clear();
    $("recall-transcript").innerHTML='<span class="recall-placeholder">سيظهر هنا كلامك كما تنطق به، كلمة بكلمة…</span>';
    $("recall-word-count").textContent="0 كلمة";$("recall-status").textContent="تم مسح التفريغ. اضغط «ابدأ الاستظهار» للبدء من جديد.";
    $("recall-start").disabled=false;$("recall-stop").disabled=true;
  });

  async function init(){
    if(!matnId){$("recall-title").textContent="لم يتم تحديد المتن";$("recall-status").textContent="ارجع إلى المكتبة واختر متناً.";return;}
    try{
      const response=await fetch("./mutun.json");
      if(!response.ok)throw new Error("تعذر تحميل المكتبة");
      const library=await response.json();matn=library.find(item=>item.id===matnId);
      if(!matn)throw new Error("المتن غير موجود");
      $("recall-title").textContent=matn.title+" — الاستظهار الكامل";
      $("recall-subtitle").textContent="استظهر المتن كاملاً بصوتك؛ سيظهر كلامك وحده دون عرض النص الأصلي.";
      document.title="استظهار "+matn.title+" | رِواق المتون";
      if(matn.contentStatus==="partial"){
        $("recall-warning").textContent="تنبيه: هذا المتن موسوم بأنه غير مكتمل في المكتبة؛ ستتم المقارنة مع المقاطع المتاحة فقط.";
        $("recall-warning").classList.remove("hidden");
      }
    }catch(error){$("recall-title").textContent="تعذر فتح المتن";$("recall-status").textContent=error.message;}
  }
  init();
})();