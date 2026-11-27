import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

let transcriber = null;
let queue = Promise.resolve();
env.useBrowserCache = true;
env.useWasmCache = true;
env.allowRemoteModels = true;
if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;

self.onmessage = event => {
  const data = event.data || {};
  if (data.type === "init") {
    if (transcriber) { self.postMessage({ type: "ready" }); return; }
    queue = queue.then(async () => {
      if (transcriber) return;
      try {
        transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
          dtype: "q8",
          progress_callback: progress => self.postMessage({
            type: "progress",
            progress: {
              status: progress.status || "",
              file: progress.file || "",
              progress: Number.isFinite(progress.progress) ? progress.progress : null,
              loaded: Number.isFinite(progress.loaded) ? progress.loaded : null,
              total: Number.isFinite(progress.total) ? progress.total : null
            }
          })
        });
        self.postMessage({ type: "ready" });
      } catch (error) {
        self.postMessage({ type: "init-error", message: error?.message || String(error) });
      }
    });
    return;
  }
  if (data.type === "transcribe" && transcriber) {
    queue = queue.then(async () => {
      try {
        const audio = new Float32Array(data.audio);
        const result = await transcriber(audio, { sampling_rate: 16000, language: "arabic", task: "transcribe" });
        self.postMessage({ type: "transcript", id: data.id, text: result?.text || "" });
      } catch (error) {
        self.postMessage({ type: "transcribe-error", id: data.id, message: error?.message || String(error) });
      }
    });
  }
};