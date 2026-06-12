/**
 * Quanta Wallet — background.js (MV3 Service Worker)
 *
 * Handles: auto-lock timer, session state (balance cache),
 *          cross-popup message passing.
 *
 * NOTE: Service workers cannot use WASM directly (MV3 restriction).
 * All crypto (Falcon-512) runs in popup.js. Background only manages
 * timing and lightweight state.
 */

const LOCK_AFTER_MS = 5 * 60 * 1000; // Auto-lock after 5 minutes inactivity

// ── Auto-lock alarm ──────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Quanta Background] Extension installed');
  scheduleAutoLock();
});

function scheduleAutoLock() {
  chrome.alarms.clear('autolock', () => {
    chrome.alarms.create('autolock', { delayInMinutes: 5 });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autolock') {
    // Signal popup to lock (popup reads this on open)
    chrome.storage.session.set({ locked: true });
    chrome.storage.session.remove(['activeAddress', 'activeSecretKey', 'sessionPassword']);
    console.log('[Quanta Background] Auto-locked after inactivity');
  }
});

// ── Web3 Provider RPC Handling ────────────────────────────────────────────────

let creatingOffscreen;

async function setupOffscreenDocument() {
  const path = 'offscreen.html';
  if (await chrome.offscreen.hasDocument()) return;
  
  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: path,
      reasons: ['WORKERS'],
      justification: 'Need DOM to execute WASM for Falcon-512 signatures'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

const rpcResolvers = new Map();

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  // Listen for RPC completion from the popup window
  if (msg.type === 'RPC_RESULT') {
    const resolver = rpcResolvers.get(msg.rpcId);
    if (resolver) {
      rpcResolvers.delete(msg.rpcId);
      if (msg.error) resolver.reject(new Error(msg.error));
      else resolver.resolve(msg.result);
    }
    // Also respond to the popup so it knows it can close
    respond({ ok: true });
    return;
  }
  
  // Existing activity monitor
  if (msg.type === 'USER_ACTIVITY') {
    scheduleAutoLock();
    chrome.storage.session.set({ locked: false });
    respond({ ok: true });
    return;
  }
  if (msg.type === 'GET_LOCK_STATE') {
    chrome.storage.session.get(['locked'], (result) => {
      respond({ locked: result.locked ?? false });
    });
    return true; // async response
  }

  // Handle Web3 Provider RPC from content.js
  if (msg.source === 'quanta-content') {
    handleRpcRequest(msg.method, msg.params).then(result => {
      respond({ result });
    }).catch(err => {
      respond({ error: err.message });
    });
    return true; // async response
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [rpcId, resolver] of rpcResolvers.entries()) {
    if (resolver.windowId === windowId) {
      resolver.reject(new Error("User rejected the request (window closed)."));
      rpcResolvers.delete(rpcId);
    }
  }
});

async function handleRpcRequest(method, params) {
  // ALWAYS open the popup for Web3 requests (MetaMask-style)
  return new Promise(async (resolve, reject) => {
    const rpcId = Date.now() + "_" + Math.random().toString(36).substring(2);
    rpcResolvers.set(rpcId, { resolve, reject });
    
    const url = chrome.runtime.getURL(`popup.html?rpcMethod=${method}&rpcParams=${encodeURIComponent(JSON.stringify(params))}&rpcId=${rpcId}`);
    
    const width = 360;
    const height = 600;
    let left;
    let top;
    
    try {
      const currentWindow = await chrome.windows.getLastFocused();
      if (currentWindow && currentWindow.left !== undefined && currentWindow.width !== undefined) {
        // Position at the top right of the current window, like MetaMask
        left = Math.round(currentWindow.left + currentWindow.width - width - 20);
        top = Math.round(currentWindow.top || 0);
      }
    } catch (e) {
      console.warn("Could not get focused window position", e);
    }
    
    chrome.windows.create({
      url,
      type: 'popup',
      width,
      height,
      left,
      top
    }, (win) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        rpcResolvers.delete(rpcId);
        return;
      }
      const resolver = rpcResolvers.get(rpcId);
      if (resolver) resolver.windowId = win.id;
    });
  });
}
