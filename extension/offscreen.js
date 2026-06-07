import init, { sign_message } from './pkg/quanta_wasm.js';

let wasmReady = false;

const initPromise = init().then(() => {
  wasmReady = true;
  console.log("Offscreen WASM initialized");
}).catch(console.error);

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.target !== 'offscreen') return false;

  if (msg.type === 'SIGN_MESSAGE') {
    initPromise.then(() => {
      try {
        const sigHex = sign_message(msg.message, msg.secretKey);
        respond({ result: sigHex });
      } catch (err) {
        respond({ error: err.toString() });
      }
    });
    return true; // Keep channel open for async response
  }
});
