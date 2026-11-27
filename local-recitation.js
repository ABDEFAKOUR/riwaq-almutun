(() => {
  "use strict";
  const WORKER_URL = "./recitation-worker.js";
  const CHUNK_SECONDS = 5;
  let worker = null, ready = false, loading = null, active = false;
  let callbacks = {}, stream = null, context = null, source = null, processor = null, mute = null;
  let frames = [], frameCount = 0, pending = 0, stopping = false, sampleRate = 0, jobId = 0;

  function status(message) { callbacks.onStatus?.(message); }
  function releaseAudio() {
    try { processor && (processor.onaudioprocess = null); processor?.disconnect(); source?.disconnect(); mute?.disconnect(); } catch {}
    stream?.getTracks().forEach(track => track.stop());
    if (context && context.state !== "closed") context.close().catch(() => {});
    stream = context = source = processor = mute = null;
  }
  function finishIfIdle() {
    if (!stopping || pending) return;
    active = false; stopping = false; releaseAudio(); status("ended");
  }
  function resample(input, fromRate) {
    if (fromRate === 16000) return input;
    const ratio = fromRate / 16000, length = Math.floor(input.length / ratio);
    const output = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const at = i * ratio, left = Math.floor(at), fraction = at - left;
      const right = Math.min(left + 1, input.length - 1);
      output[i] = input[left] * (1 - fraction) + input[right] * fraction;
    }
    return output;
  }
  function takeFrames() {
    const joined = new Float32Array(frameCount);
    let offset = 0;
    for (const part of frames) { joined.set(part, offset); offset += part.length; }
    frames = []; frameCount = 0;
    return resample(joined, sampleRate);
  }
  function sendAudio(audio) {
    if (!audio || audio.length < 8000) return;
    const id = ++jobId, copy = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength);
    pending++;
    worker.postMessage({ type: "transcribe", id, audio: copy, contextText: typeof callbacks.getContext === "function" ? String(callbacks.getContext() || "") : "" }, [copy]);
    status("processing");
  }
  function handleWorkerMessage(event) {
    const data = event.data || {};
    if (data.type === "progress") { callbacks.onProgress?.(data.progress); return; }
    if (data.type === "ready") { ready = true; callbacks.onReady?.(); return; }
    if (data.type === "init-error") {
      const error = new Error(data.message || "تعذر تجهيز محرك التعرف الصوتي.");
      callbacks.onInitError?.(error); return;
    }
    if (data.type === "transcript-partial") {
      callbacks.onPartialText?.(String(data.text || ""), data.id);
      return;
    }
    if (data.type === "transcript") {
      pending = Math.max(0, pending - 1);
      if (data.text) callbacks.onText?.(data.text.trim(), data.id);
      finishIfIdle(); return;
    }
    if (data.type === "transcribe-error") {
      pending = Math.max(0, pending - 1);
      callbacks.onError?.(new Error(data.message || "تعذر تحليل المقطع الصوتي."));
      finishIfIdle();
    }
  }
  function ensureWorker() {
    if (worker) return;
    worker = new Worker(WORKER_URL, { type: "module" });
    worker.addEventListener("message", handleWorkerMessage);
    worker.addEventListener("error", event => callbacks.onInitError?.(new Error(event.message || "تعذر تشغيل محرك الصوت المحلي.")));
  }
  function prepare(onProgress) {
    if (ready) return Promise.resolve(true);
    if (loading) return loading;
    if (typeof onProgress === "function") callbacks.onProgress = onProgress;
    ensureWorker();
    loading = new Promise((resolve, reject) => {
      callbacks.onReady = () => resolve(true);
      callbacks.onInitError = error => { loading = null; reject(error); };
      status("يتم تجهيز نموذج التعرف العربي لأول مرة؛ اترك الصفحة مفتوحة حتى يكتمل التنزيل.");
      worker.postMessage({ type: "init" });
    });
    return loading;
  }
  async function start(options = {}) {
    if (active) return;
    if (!ready) throw new Error("جهّز محرك التسميع المحلي أولاً.");
    callbacks = { ...callbacks, ...options };
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("الميكروفون غير متاح. افتح التطبيق عبر HTTPS واسمح باستعمال الميكروفون.");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    context = new (window.AudioContext || window.webkitAudioContext)();
    await context.resume();
    sampleRate = context.sampleRate;
    source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(4096, 1, 1);
    mute = context.createGain(); mute.gain.value = 0;
    processor.onaudioprocess = event => {
      if (!active || stopping) return;
      const copy = new Float32Array(event.inputBuffer.getChannelData(0));
      frames.push(copy); frameCount += copy.length;
      if (frameCount >= sampleRate * CHUNK_SECONDS) sendAudio(takeFrames());
    };
    source.connect(processor); processor.connect(mute); mute.connect(context.destination);
    frames = []; frameCount = 0; pending = 0; stopping = false; active = true;
    status("listening");
  }
  function stop() {
    if (!active || stopping) return;
    stopping = true;
    try { processor && (processor.onaudioprocess = null); processor?.disconnect(); source?.disconnect(); mute?.disconnect(); } catch {}
    stream?.getTracks().forEach(track => track.stop());
    const remaining = frameCount ? takeFrames() : null;
    if (remaining && remaining.length >= 8000) sendAudio(remaining);
    finishIfIdle();
  }
  function updateSetupUI(message, readyState = false) {
    ["recitation-setup-status","recitation-status","recall-status"].forEach(id => {
      const node = document.getElementById(id);
      if (node) node.textContent = message;
    });
    ["recitation-prepare","recall-prepare"].forEach(id => {
      const button = document.getElementById(id);
      if (button) {
        button.disabled = false;
        button.textContent = readyState ? "المحرك جاهز ✓" : "إعادة تجهيز التسميع";
      }
    });
    ["recitation-start","recall-start"].forEach(id => {
      const button = document.getElementById(id);
      if (button) button.disabled = !readyState;
    });
  }

  function autoPrepareOnFirstOpen() {
    if (window.__riwaqAsrAutoStarted) return;
    window.__riwaqAsrAutoStarted = true;
    updateSetupUI("يتم تجهيز التسميع الصوتي العربي تلقائياً لأول مرة. يلزم الاتصال بالإنترنت حتى يكتمل تنزيل المحرك والنموذج؛ اترك التطبيق مفتوحاً.");
    prepare(progress => {
      if (progress?.status === "progress" && Number.isFinite(progress.progress)) {
        updateSetupUI("تجهيز التسميع الصوتي: تنزيل النموذج " + Math.round(progress.progress) + "٪ — اترك التطبيق مفتوحاً.");
      } else if (progress?.file) {
        updateSetupUI("تجهيز التسميع الصوتي: " + progress.file);
      }
    }).then(() => {
      updateSetupUI("اكتمل تجهيز محرك التسميع العربي. يمكنك الآن استعمال التسميع دون إنترنت.", true);
      window.dispatchEvent(new CustomEvent("riwaq:local-recitation-ready"));
    }).catch(error => {
      updateSetupUI("لم يكتمل تجهيز التسميع تلقائياً: " + error.message + ". اتصل بالإنترنت واضغط «إعادة تجهيز التسميع».");
    });
  }

  window.RiwaqLocalRecitation = { prepare, start, stop, isReady: () => ready };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoPrepareOnFirstOpen, { once: true });
  } else {
    autoPrepareOnFirstOpen();
  }
  window.addEventListener("online", () => {
    if (!ready && !loading) autoPrepareOnFirstOpen();
  });
})();