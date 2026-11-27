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
    const result=align(matn.items.map(item=>item.text || (item.verses || []).map(verse => verse.sadr + " " + verse.ajuz).join(" ")).join(" "),spoken);
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

  function prepareLocalEngine() {
    const button=$("recall-prepare"),status=$("recall-status");
    if(button){button.disabled=true;button.textContent="جارٍ تجهيز المحرك…";}
    window.RiwaqLocalRecitation.prepare(progress=>{
      if(progress?.status==="progress"&&Number.isFinite(progress.progress))status.textContent="تنزيل النموذج المحلي: "+Math.round(progress.progress)+"٪";
      else if(progress?.file)status.textContent="تجهيز ملف النموذج: "+progress.file;
      else status.textContent="يتم تجهيز محرك التعرف العربي محلياً…";
    }).then(()=>{
      status.textContent="المحرك المحلي جاهز. يمكنك الاستظهار دون اتصال بعد اكتمال التجهيز.";
      if(button){button.disabled=false;button.textContent="المحرك جاهز ✓";}
      $("recall-start").disabled=false;
    }).catch(error=>{
      status.textContent="تعذر تجهيز المحرك: "+error.message+" — تحقق من الاتصال ثم أعد المحاولة.";
      if(button){button.disabled=false;button.textContent="إعادة تجهيز المحرك";}
    });
  }
  function stop() { window.RiwaqLocalRecitation?.stop(); }
  async function start() {
    if(active)return;
    if(!window.RiwaqLocalRecitation){$("recall-status").textContent="محرك التسميع المحلي غير محمّل. حدّث الصفحة وحاول مجدداً.";return;}
    const id=++sessionId,current=()=>id===sessionId;
    let finalText="";
    active=true;alerted=new Set();
    $("recall-transcript").innerHTML='<span class="recall-placeholder">أستمع إليك…</span>';
    $("recall-word-count").textContent="0 كلمة";
    $("recall-status").textContent="جارٍ تشغيل الميكروفون المحلي…";
    $("recall-start").disabled=true;$("recall-stop").disabled=false;
    const begin=async()=>{
      try{
        await window.RiwaqLocalRecitation.start({
          getContext:()=>{
            const expected=matn.items.map(item=>item.text || (item.verses || []).map(verse => verse.sadr + " " + verse.ajuz).join(" ")).join(" ").split(/\s+/).filter(Boolean);
            const spokenCount=finalText.trim().split(/\s+/).filter(Boolean).length;
            return expected.slice(spokenCount, spokenCount + 110).join(" ").slice(0, 700);
          },
          onText:chunk=>{
            if(!current()||!chunk)return;
            finalText+=(finalText?" ":"")+chunk;
            render(finalText,"");
          },
          onStatus:value=>{
            if(!current())return;
            if(value==="listening")$("recall-status").textContent="أستمع إليك الآن عبر المحرك المحلي…";
            else if(value==="processing")$("recall-status").textContent="يحلل المحرك المحلي المقطع الصوتي…";
            else if(value==="ended"){
              active=false;$("recall-start").disabled=false;$("recall-stop").disabled=true;
              $("recall-status").textContent=finalText.trim()?"انتهى الاستظهار المحلي. راجع الكلمات الملوّنة.":"انتهى التسجيل دون التقاط كلام واضح.";
            }
          },
          onError:error=>{if(current())$("recall-status").textContent="تعذر تحليل الصوت محلياً: "+error.message;},
          onInitError:error=>{if(current()){active=false;$("recall-start").disabled=false;$("recall-stop").disabled=true;$("recall-status").textContent="تعذر تشغيل المحرك المحلي: "+error.message;}}
        });
      }catch(error){
        if(!current())return;
        active=false;$("recall-start").disabled=false;$("recall-stop").disabled=true;
        $("recall-status").textContent="تعذر بدء الميكروفون: "+error.message;
      }
    };
    if(window.RiwaqLocalRecitation.isReady())begin();
    else{
      $("recall-status").textContent="يتم تجهيز نموذج Whisper العربي محلياً. يلزم تنزيله مرة واحدة أولاً…";
      window.RiwaqLocalRecitation.prepare(progress=>{
        if(progress?.status==="progress"&&Number.isFinite(progress.progress))$("recall-status").textContent="تنزيل النموذج المحلي: "+Math.round(progress.progress)+"٪";
      }).then(begin).catch(error=>{
        if(!current())return;
        active=false;$("recall-start").disabled=false;$("recall-stop").disabled=true;
        $("recall-status").textContent="تعذر تجهيز النموذج: "+error.message;
      });
    }
  }

  $("recall-prepare").addEventListener("click",prepareLocalEngine);
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
      const totalItems=matn.items.length;
      const isAvailable=item=>{
        const text=typeof item.text==="string"?item.text.trim():"";
        const verses=Array.isArray(item.verses)&&item.verses.some(v=>v&&typeof v.sadr==="string"&&v.sadr.trim()&&typeof v.ajuz==="string"&&v.ajuz.trim());
        if(!text&&!verses)return false;
        if(item.reference==="موضع تجريبي")return false;
        return !/^(لم يُضف نص هذا (?:المتن|الحديث) بعد\.?|أضف النص من نسختك المعتمدة\.?|نص غير متوفر\.?)$/u.test(text);
      };
      matn.items=matn.items.filter(isAvailable);
      $("recall-title").textContent=matn.title+" — الاستظهار الكامل";
      $("recall-subtitle").textContent="استظهر المتن كاملاً بصوتك؛ سيظهر كلامك وحده دون عرض النص الأصلي.";
      document.title="استظهار "+matn.title+" | رِواق المتون";
      if(!matn.items.length){
        $("recall-start").disabled=true;
        $("recall-status").textContent="نص هذا المتن غير متاح للحفظ بعد. سيظهر هنا عند اكتمال إضافته ومراجعته.";
        return;
      }
      if(matn.contentStatus==="partial"||matn.items.length<totalItems){
        $("recall-warning").textContent="تنبيه: المتاح حالياً "+matn.items.length+" من "+totalItems+" مقطعاً فقط؛ ستتم المقارنة مع النصوص المتاحة دون البطاقات الفارغة.";
        $("recall-warning").classList.remove("hidden");
      }
    }catch(error){$("recall-title").textContent="تعذر فتح المتن";$("recall-status").textContent=error.message;}
  }
  init();
})();