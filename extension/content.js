/**
 * Quanta Wallet Content Script
 * 
 * Runs in the isolated world of the webpage.
 * Injects `injected.js` into the main world to expose `window.quanta`,
 * and forwards messages between the page and the background worker.
 */

// 1. Injection is handled natively by Chrome via world: "MAIN" in manifest.json

// 2. Setup message bridging
// Listen for requests from injected.js (which runs in the page context)
window.addEventListener("message", (event) => {
  // Only accept messages from the same frame
  if (event.source !== window || !event.data || event.data.source !== "quanta-injected") {
    return;
  }

  const { id, method, params } = event.data;

  // Forward the request to the background service worker
  chrome.runtime.sendMessage(
    { source: "quanta-content", method, params },
    (response) => {
      // Forward the response back to the injected script
      if (chrome.runtime.lastError) {
        window.postMessage({
          source: "quanta-content",
          id,
          error: chrome.runtime.lastError.message
        }, "*");
      } else {
        window.postMessage({
          source: "quanta-content",
          id,
          result: response?.result,
          error: response?.error
        }, "*");
      }
    }
  );
});
