import { AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm";

const MODEL_ID = "Xenova/whisper-tiny";
let model = null, processor = null, tokenizer = null;
let queue = Promise.resolve();
env.useBrowserCache = true;
env.useWasmCache = true;
env.allowRemoteModels = true;
if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;

function makePrompt(contextText) {
  const context = String(contextText || "").replace(/\s+/g, " ").trim().slice(0, 700);
  // Whisper multilingual decoder prefix: Arabic transcription, no timestamps,
  // followed by a short previous-text prompt for domain vocabulary.
  const prompt = context ? "<|startofprev|> " + context : "";
  return { context, ids: tokenizer.encode(prompt, { add_special_tokens: false }) };
}

self.onmessage = event => {
  const data = event.data || {};
  if (data.type === "init") {
    if (model && processor && tokenizer) { self.postMessage({ type: "ready" }); return; }
    queue = queue.then(async () => {
      if (model && processor && tokenizer) return;
      try {
        const progress_callback = progress => self.postMessage({
          type: "progress",
          progress: {
            status: progress.status || "",
            file: progress.file || "",
            progress: Number.isFinite(progress.progress) ? progress.progress : null,
            loaded: Number.isFinite(progress.loaded) ? progress.loaded : null,
            total: Number.isFinite(progress.total) ? progress.total : null
          }
        });
        [model, processor, tokenizer] = await Promise.all([
          WhisperForConditionalGeneration.from_pretrained(MODEL_ID, { dtype: "q8", progress_callback }),
          AutoProcessor.from_pretrained(MODEL_ID, { progress_callback }),
          AutoTokenizer.from_pretrained(MODEL_ID, { progress_callback })
        ]);
        self.postMessage({ type: "ready" });
      } catch (error) {
        model = processor = tokenizer = null;
        self.postMessage({ type: "init-error", message: error?.message || String(error) });
      }
    });
    return;
  }
  if (data.type === "transcribe" && model && processor && tokenizer) {
    queue = queue.then(async () => {
      try {
        const audio = new Float32Array(data.audio);
        const input = await processor(audio);
        const { context, ids } = makePrompt(data.contextText);
        const output = await model.generate({
          inputs: input.input_features,
          decoder_input_ids: [ids],
          language: "arabic",
          task: "transcribe",
          max_new_tokens: 128
        });
        // decoder_input_ids are included in the returned sequence; remove the
        // prompt tokens so the comparison receives only what the model heard.
        const sequences = output?.sequences || output;
        const generated = sequences[0].slice(ids.length);
        const text = (await tokenizer.decode(generated, { skip_special_tokens: true })).trim();
        self.postMessage({ type: "transcript", id: data.id, text, prompted: Boolean(context) });
      } catch (error) {
        self.postMessage({ type: "transcribe-error", id: data.id, message: error?.message || String(error) });
      }
    });
  }
};
