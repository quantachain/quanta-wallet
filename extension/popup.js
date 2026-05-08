/**
 * Quanta Wallet Extension — popup.js
 *
 * MV3 CSP-compliant (no inline onclick).
 */

'use strict';

const STORAGE_KEY  = 'quanta_wallet_v1';
const ACCOUNTS_KEY = 'quanta_accounts_v1'; // array of {name, encryptedData, address, publicKey}
const SETTINGS_KEY = 'quanta_settings_v1';
const MICROUNITS = 1_000_000;
const MAX_ACCOUNTS = 10;

let activeAccountIndex = 0; // which account is displayed

let state = {
  publicKey: null,
  secretKey: null,
  address: null,
  balance: 0,
  txHistory: [],
  mnemonic: null,
  sessionPassword: null, // kept in memory while wallet is unlocked (like MetaMask)
  settings: {
    rpc_url: 'https://rpc.quantachain.org',
    explorer_url: 'https://scan.quantachain.org',
    network: 'testnet',
  },
};

let wasm = null;

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe).replace(/[&<"'>]/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// ── Storage helpers (chrome.storage.local) ───────────────────────────────────

function storageGet(key) {
  return new Promise(resolve => chrome.storage.local.get([key], r => resolve(r[key])));
}

function storageSet(key, value) {
  return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
}

function storageRemove(key) {
  return new Promise(resolve => chrome.storage.local.remove([key], resolve));
}

// ── WASM ─────────────────────────────────────────────────────────────────────

async function loadWasm() {
  try {
    const url = chrome.runtime.getURL('pkg/quanta_wasm.js');
    const module = await import(url);
    const wasmUrl = chrome.runtime.getURL('pkg/quanta_wasm_bg.wasm');
    await module.default({ module_or_path: wasmUrl });
    wasm = module;
    console.log('[Quanta] WASM loaded');
  } catch (e) {
    console.warn('[Quanta] WASM not loaded:', e.message);
    wasm = null;
  }
}

// ── Activity ping ────────────────────────────────────────────────────────────

function pingActivity() {
  chrome.runtime.sendMessage({ type: 'USER_ACTIVITY' });
}

document.addEventListener('click', pingActivity, { passive: true });
document.addEventListener('keydown', pingActivity, { passive: true });

// ── Screen navigation ─────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); el.scrollTop = 0; }
  closeAllPanels();
}

function switchTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

function showPanel(id) {
  // If opening a new panel, hide others unless it's an overlay panel (export over account)
  if (id !== 'export-panel') closeAllPanels();

  const panel = document.getElementById(id);
  if (panel) panel.classList.add('open');
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.classList.remove('hidden');

  if (id === 'receive-panel') renderQr();
}

function closePanel(id) {
  const panel = document.getElementById(id);
  if (panel) panel.classList.remove('open');

  // Custom reset for Export panel
  if (id === 'export-panel') {
    document.getElementById('export-pw-group').classList.remove('hidden');
    document.getElementById('export-key-result').classList.add('hidden');
    document.getElementById('export-password').value = '';
    document.getElementById('export-error').classList.add('hidden');
  }

  // Restore send panel form (in case it was replaced by confirmation screen)
  if (id === 'send-panel') {
    const pb = document.querySelector('#send-panel .panel-body');
    if (pb && !pb.querySelector('#send-to')) {
      pb.innerHTML = `
        <div class="form-group"><label>Recipient Address</label><input id="send-to" type="text" placeholder="0x..." autocomplete="off"></div>
        <div class="form-group"><label>Amount (QUA)</label><input id="send-amount" type="number" step="0.000001" placeholder="0.00"></div>
        <div class="form-group"><label>Fee (QUA)</label><input id="send-fee" type="number" step="0.000001" value="0.001"></div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="send-timelock-toggle" style="width:14px;height:14px;"> Time Lock Transfer
          </label>
        </div>
        <div id="send-timelock-section" style="display:none;">
          <div class="form-group">
            <label>Lock until block height</label>
            <input id="send-unlock-height" type="number" placeholder="e.g. 100000" min="1">
            <p style="font-size:0.72rem;color:var(--text-muted);margin:4px 0 0;">Recipient cannot spend until this block. Min fee: 0.005 QUA.</p>
          </div>
        </div>
        <div class="form-group"><label>Wallet Password</label><input id="send-password" type="password" placeholder="Enter password"></div>
        <div id="send-error" class="error-msg hidden"></div>
        <div id="send-success" class="success-msg hidden"></div>
        <button id="btn-exec-send" class="btn btn-primary full-width" style="margin-top:10px;">Submit</button>`;
      document.getElementById('btn-exec-send')?.addEventListener('click', sendTransaction);
      document.getElementById('send-timelock-toggle')?.addEventListener('change', handleTimelockToggle);
    }
  }

  // Hide overlay if no panels are open
  if (!document.querySelector('.side-panel.open')) {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.add('hidden');
  }
}

function closeAllPanels() {
  document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('open'));
  const overlay = document.getElementById('overlay');
  if (overlay) overlay.classList.add('hidden');

  // Reset Export panel
  const epw = document.getElementById('export-pw-group');
  if (epw) epw.classList.remove('hidden');
  const ekr = document.getElementById('export-key-result');
  if (ekr) ekr.classList.add('hidden');
  const epwd = document.getElementById('export-password');
  if (epwd) epwd.value = '';
}

// ── Toast ─────────────────────────────────────────────────────────────────────

// Open a URL in a new tab (window.open is blocked in extension popups)
function openTab(url) {
  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank');
  }
}
window.openTab = openTab; // expose for inline onclick

let toastTimer = null;
function toast(msg, ms = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, ms);
}

// ── Create wallet flow ────────────────────────────────────────────────────────

function toggleCreateBtn() {
  const btn = document.getElementById('btn-generate-wallet');
  const chk = document.getElementById('chk-understand');
  if (btn && chk) btn.disabled = !chk.checked;
}

async function createWallet() {
  showScreen('screen-loading');
  const msgEl = document.getElementById('loading-msg');
  if (msgEl) msgEl.textContent = 'Generating Falcon-512 keys…';
  try {
    let mnemonicPhrase, pkHex, skHex, address;
    if (wasm) {
      const result = wasm.generate_wallet();
      mnemonicPhrase = result.mnemonic;
      pkHex = result.public_key;
      skHex = result.secret_key;
      address = result.address;
    } else {
      throw new Error('WASM not loaded');
    }
    state.mnemonic = mnemonicPhrase;
    state.publicKey = pkHex;
    state.secretKey = skHex;
    state.address = address;
    renderMnemonicGrid(mnemonicPhrase);
    showScreen('screen-mnemonic');
  } catch (e) {
    toast('Error: ' + e.message);
    showScreen('screen-create-warn');
  }
}

function renderMnemonicGrid(phrase) {
  const words = phrase.split(' ');
  const grid = document.getElementById('mnemonic-grid');
  if (!grid) return;
  grid.innerHTML = words.map((w, i) => `
    <div class="mnemonic-word">
      <span class="word-num">${i + 1}.</span>
      <span class="word-text">${w}</span>
    </div>`).join('');
}

function copyMnemonic() {
  if (state.mnemonic) {
    navigator.clipboard.writeText(state.mnemonic).then(() => toast('Copied recovery phrase'));
  }
}

// ── Mnemonic confirm ──────────────────────────────────────────────────────────

const confirmPositions = [];
const selectedConfirm = {}; // { positionString: word }

function setupConfirmInputs() {
  if (!state.mnemonic) return;
  const words = state.mnemonic.split(' ');
  Object.keys(selectedConfirm).forEach(k => delete selectedConfirm[k]);
  confirmPositions.length = 0;
  while (confirmPositions.length < 3) {
    const r = Math.floor(Math.random() * 24);
    if (!confirmPositions.includes(r)) confirmPositions.push(r);
  }
  confirmPositions.sort((a, b) => a - b);
  const grid = document.getElementById('confirm-inputs');
  if (!grid) return;
  grid.innerHTML = confirmPositions.map(pos => {
    const correct = words[pos];
    const pool = words.filter((_, i) => i !== pos);
    const wrongs = [];
    const used = new Set([correct]);
    while (wrongs.length < 3) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (!used.has(pick)) { wrongs.push(pick); used.add(pick); }
    }
    const opts = [correct, ...wrongs].sort(() => Math.random() - 0.5);
    return `<div style="margin-bottom:18px;">
      <div style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:8px;">Word #${pos + 1}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${opts.map(w => `<button class="btn btn-ghost word-pick-btn" data-pos="${pos}" data-word="${escapeHtml(w)}" style="font-family:var(--mono);font-size:0.85rem;padding:9px 8px;">${escapeHtml(w)}</button>`).join('')}
      </div></div>`;
  }).join('');
  grid.querySelectorAll('.word-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pos = btn.dataset.pos;
      grid.querySelectorAll(`.word-pick-btn[data-pos="${pos}"]`).forEach(b => {
        b.style.background = ''; b.style.color = ''; b.style.borderColor = '';
      });
      btn.style.background = 'var(--cyan)'; btn.style.color = '#0b0e14';
      selectedConfirm[pos] = btn.dataset.word;
    });
  });
}

function confirmMnemonic() {
  const words = (state.mnemonic || '').split(' ');
  const errEl = document.getElementById('confirm-error');
  const ok = confirmPositions.every(pos => selectedConfirm[String(pos)] === words[pos]);
  if (!ok) { if (errEl) errEl.classList.remove('hidden'); return; }
  if (errEl) errEl.classList.add('hidden');
  showScreen('screen-password');
}

// ── Password ──────────────────────────────────────────────────────────────────

function checkPasswordStrength() {
  const pwEl = document.getElementById('pw-new');
  if (!pwEl) return;
  const pw = pwEl.value;
  const fill = document.getElementById('strength-fill');
  const label = document.getElementById('strength-label');
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const widths = ['0%', '20%', '40%', '65%', '85%', '100%'];
  const colors = ['#ff4d6a', '#ff4d6a', '#ffb830', '#ffb830', '#00ff88', '#00d4ff'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  if (fill) { fill.style.width = widths[score]; fill.style.background = colors[score]; }
  if (label) { label.textContent = labels[score]; label.style.color = colors[score]; }
}

function togglePw(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
  const btn = document.querySelector(`button[id*="${id}"]`);
  if (btn) btn.textContent = el.type === 'password' ? 'Show' : 'Hide';
}

async function setPassword() {
  const pw1El = document.getElementById('pw-new');
  const pw2El = document.getElementById('pw-confirm');
  if (!pw1El || !pw2El) return;
  const pw1 = pw1El.value;
  const pw2 = pw2El.value;
  const errEl = document.getElementById('pw-error');
  if (pw1 !== pw2) { if (errEl) errEl.classList.remove('hidden'); return; }
  if (pw1.length < 8) { toast('Min 8 characters'); return; }
  if (errEl) errEl.classList.add('hidden');
  showScreen('screen-loading');
  const msgEl = document.getElementById('loading-msg');
  if (msgEl) msgEl.textContent = 'Encrypting wallet…';
  try {
    await saveWallet(state.secretKey, state.publicKey, state.address, state.mnemonic, pw1);
    state.secretKey = null; state.mnemonic = null;
    await enterMain();
  } catch (e) {
    toast('Error: ' + e.message); showScreen('screen-password');
  }
}

// ── Import ────────────────────────────────────────────────────────────────────

function validateImportPhrase() {
  const phrEl = document.getElementById('import-phrase');
  if (!phrEl) return;
  const phrase = phrEl.value.trim();
  const words = phrase.split(/\s+/).filter(Boolean);
  const valid = words.length === 24 && (wasm ? wasm.validate_mnemonic(phrase) : true);
  const vEl = document.getElementById('import-valid');
  const invEl = document.getElementById('import-invalid');
  const btn = document.getElementById('btn-import-go');
  if (vEl) vEl.classList.toggle('hidden', !valid);
  if (invEl) invEl.classList.toggle('hidden', valid || phrase === '');
  if (btn) btn.disabled = !valid;
}

async function importWallet() {
  const phrEl = document.getElementById('import-phrase');
  const pwdEl = document.getElementById('import-password');
  if (!phrEl || !pwdEl) return;
  const phrase = phrEl.value.trim();
  const passphrase = document.getElementById('import-passphrase')?.value || '';
  const password = pwdEl.value;
  const errEl = document.getElementById('import-error');
  if (errEl) errEl.classList.add('hidden');
  if (password.length < 8) {
    if (errEl) { errEl.textContent = 'Password must be at least 8 characters'; errEl.classList.remove('hidden'); }
    return;
  }
  showScreen('screen-loading');
  const msgEl = document.getElementById('loading-msg');
  if (msgEl) msgEl.textContent = 'Restoring wallet…';
  try {
    if (!wasm) throw new Error('WASM not loaded');
    const result = wasm.import_wallet(phrase, passphrase, 0);
    await saveWallet(result.secret_key, result.public_key, result.address, phrase, password);
    await enterMain();
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.classList.remove('hidden'); }
    showScreen('screen-import');
  }
}

// ── Encrypted storage (Web Crypto AES-GCM + PBKDF2) ─────────────────────────

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function saveWallet(skHex, pkHex, address, mnemonic, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plain = new TextEncoder().encode(JSON.stringify({ skHex, pkHex, address, mnemonic }));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  await storageSet(STORAGE_KEY, {
    salt: Array.from(salt), iv: Array.from(iv),
    data: Array.from(new Uint8Array(cipher)),
    address, pkHex,
  });
}

async function loadWalletData(password) {
  const stored = await storageGet(STORAGE_KEY);
  if (!stored) throw new Error('No wallet found');
  const salt = new Uint8Array(stored.salt);
  const iv = new Uint8Array(stored.iv);
  const data = new Uint8Array(stored.data);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  const result = JSON.parse(new TextDecoder().decode(plain));
  // Keep password alive in session so Add Account doesn't need to re-ask
  state.sessionPassword = password;
  return result;
}

async function walletExists() {
  const s = await storageGet(STORAGE_KEY);
  return !!s;
}

async function getPublicInfo() {
  const s = await storageGet(STORAGE_KEY);
  return { address: s?.address || null, pkHex: s?.pkHex || null };
}

// ── Main wallet ───────────────────────────────────────────────────────────────

async function enterMain() {
  const { address, pkHex } = await getPublicInfo();
  state.address = address;
  state.publicKey = pkHex;
  await loadSettings();
  updateMainUI();
  showScreen('screen-main');
  await refreshBalance();
  await loadHistory();

  const params = new URLSearchParams(window.location.search);
  if (params.get('flow')) {
    const flow = params.get('flow');
    if (flow === 'import') {
      toast('Account added! You can close this tab.', 4000);
    } else {
      toast('Wallet ready!', 3000);
    }
  }

  // Auto-poll every 30 seconds — balance + activity update automatically
  if (window._quantaPollTimer) clearInterval(window._quantaPollTimer);
  window._quantaPollTimer = setInterval(async () => {
    await refreshBalance();
    await loadHistory();
    // Upgrade pending txs: if confirmed, remove PENDING badge automatically
  }, 30_000);
}

function updateMainUI() {
  const a = state.address || '';
  const addrEl = document.getElementById('wallet-address');
  if (addrEl) addrEl.textContent = a ? a.slice(0, 8) + '...' + a.slice(-6) : '';
  const rAddr = document.getElementById('receive-address-text');
  if (rAddr) rAddr.textContent = a;
  const menuAddr = document.getElementById('menu-wallet-address');
  if (menuAddr) menuAddr.textContent = a;

  const accountLabel = document.querySelector('.account-label');
  if (accountLabel) {
    accountLabel.textContent = `Account ${(typeof activeAccountIndex !== 'undefined' ? activeAccountIndex : 0) + 1}`;
  }

  const balEl = document.getElementById('asset-bal-val');
  if (balEl) balEl.textContent = (state.balance / MICROUNITS).toFixed(6);

  const netBadge = document.getElementById('network-badge');
  if (netBadge) netBadge.textContent = state.settings.network === 'testnet' ? 'Testnet' : 'Mainnet';

  const urlEl = document.getElementById('rpc-url');
  if (urlEl) urlEl.value = state.settings.rpc_url;
  const expEl = document.getElementById('explorer-url');
  if (expEl) expEl.value = state.settings.explorer_url || '';
  const selEl = document.getElementById('network-select');
  if (selEl) selEl.value = state.settings.network;
}

// ── Node API ──────────────────────────────────────────────────────────────────

function rpcUrl(path) {
  return (state.settings.rpc_url || 'http://localhost:3000').replace(/\/$/, '') + path;
}

async function refreshBalance() {
  if (!state.address) return;
  try {
    const r = await fetch(rpcUrl('/api/balance'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: state.address })
    });
    if (!r.ok) throw new Error('Bad response');
    const data = await r.json();
    state.balance = data.balance_microunits ?? data.balance ?? 0;
    const b1 = document.getElementById('balance-val');
    const b2 = document.getElementById('asset-bal-val');
    if (b1) b1.textContent = (state.balance / MICROUNITS).toFixed(6);
    if (b2) b2.textContent = (state.balance / MICROUNITS).toFixed(6);
  } catch {
    const b1 = document.getElementById('balance-val');
    if (b1) b1.textContent = 'Offline';
  }
}

async function loadHistory() {
  if (!state.address) return;
  const base = (state.settings.rpc_url || 'https://rpc.quantachain.org').replace(/\/$/, '');

  // Remember pending txs before fetching (survive page refresh)
  const previousPending = state.txHistory.filter(t => t.pending);

  try {
    const r = await fetch(`${base}/api/address/${state.address}/txs?max_blocks=1000`);
    if (r.ok) {
      const data = await r.json();
      const confirmed = Array.isArray(data.transactions) ? data.transactions : [];
      const confirmedHashes = new Set(confirmed.map(t => t.tx_hash).filter(Boolean));

      // Keep pending txs that haven't been confirmed yet
      const stillPending = previousPending.filter(p => p.tx_hash && !confirmedHashes.has(p.tx_hash));

      // Merge: pending first, then confirmed (most-recent-first)
      state.txHistory = [...stillPending, ...confirmed];
    } else {
      // Keep pending txs even if node returns error
      if (!previousPending.length) state.txHistory = [];
    }
  } catch {
    if (!previousPending.length) state.txHistory = [];
  }
  renderHistory();
}

function renderHistory() {
  const list = document.getElementById('tx-list');
  if (!list) return;

  if (!state.txHistory.length) {
    const explorerAddr = `${state.settings.explorer_url || 'https://scan.quantachain.org'}/address/${state.address || ''}`;
    list.innerHTML = `
      <div class="tx-empty">
        <div>No transactions yet</div>
        <button data-url="${explorerAddr}" style="margin-top:12px;background:none;border:none;color:var(--cyan);font-size:0.8rem;cursor:pointer;font-family:var(--font);">View on Explorer ↗</button>
      </div>`;
    list.querySelectorAll('[data-url]').forEach(el =>
      el.addEventListener('click', () => openTab(el.dataset.url)));
    return;
  }

  const explorerBase = state.settings.explorer_url || 'https://scan.quantachain.org';
  list.innerHTML = state.txHistory.slice(0, 30).map(tx => {
    const out = tx.sender?.toLowerCase() === state.address?.toLowerCase();
    const amount = ((tx.amount_microunits ?? tx.amount ?? 0) / MICROUNITS).toFixed(6);
    const rawPeer = (out ? tx.recipient : tx.sender) || '—';
    const isCoinbase = !rawPeer || rawPeer === '—' || rawPeer.toLowerCase() === 'coinbase';
    const peerLabel = isCoinbase ? 'Mining Reward' : (rawPeer.length > 14 ? rawPeer.slice(0, 8) + '…' + rawPeer.slice(-6) : rawPeer);
    const ts = tx.block_time ?? tx.timestamp;
    const time = ts ? new Date(ts * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
    const date = ts ? new Date(ts * 1000).toLocaleDateString() : '';
    const txHash = tx.tx_hash || tx.hash || '';
    const explorerTxLink = txHash
      ? `${explorerBase}/tx/${txHash}`
      : (tx.block_height != null ? `${explorerBase}/block/${tx.block_height}` : '');
    const isPending = !!tx.pending;
    return `
      <div class="tx-item${isPending ? ' tx-pending' : ''}" style="cursor:${explorerTxLink ? 'pointer' : 'default'}" ${explorerTxLink ? `data-url="${explorerTxLink}"` : ''}>
        <div class="tx-icon ${out ? 'tx-out' : 'tx-in'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            ${out ? '<path d="M5 12h14M12 5l7 7-7 7"/>' : '<path d="M19 12H5M12 19l-7-7 7-7"/>'}
          </svg>
        </div>
        <div class="tx-info">
          <div class="tx-label" style="display:flex;align-items:center;gap:6px;">
            ${out ? 'Sent' : (isCoinbase ? 'Mining Reward' : 'Received')}
            ${isPending ? '<span style="font-size:0.65rem;font-weight:700;color:#f59e0b;background:rgba(245,158,11,0.12);padding:1px 6px;border-radius:99px;">PENDING</span>' : ''}
          </div>
          <div class="tx-peer">${escapeHtml(peerLabel)}</div>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${out ? 'tx-amount-out' : 'tx-amount-in'}">${out ? '−' : '+'}${escapeHtml(amount)} <span style="font-size:0.75em;opacity:0.7">QUA</span></div>
          <div class="tx-time">${escapeHtml(date)} ${escapeHtml(time)} ${explorerTxLink ? '<span style="color:var(--cyan)">↗</span>' : ''}</div>
        </div>
      </div>`;
  }).join('');

  // Attach listeners via event delegation (CSP blocks inline onclick)
  list.querySelectorAll('[data-url]').forEach(el =>
    el.addEventListener('click', () => openTab(el.dataset.url)));
}

// ── Send ──────────────────────────────────────────────────────────────────────


async function sendTransaction() {
  const toEl = document.getElementById('send-to');
  const amEl = document.getElementById('send-amount');
  const feeEl = document.getElementById('send-fee');
  const pwdEl = document.getElementById('send-password');
  if (!toEl || !amEl || !feeEl || !pwdEl) return;
  const to = toEl.value.trim();
  const amount = parseFloat(amEl.value);
  const fee = parseFloat(feeEl.value);
  const password = pwdEl.value;
  const errEl = document.getElementById('send-error');
  const succEl = document.getElementById('send-success');
  const btn = document.getElementById('btn-exec-send');
  if (errEl) errEl.classList.add('hidden');
  if (succEl) succEl.classList.add('hidden');

  if (!to.startsWith('0x') && !to.startsWith('ms')) {
    if (errEl) { errEl.textContent = 'Invalid address'; errEl.classList.remove('hidden'); }
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    if (errEl) { errEl.textContent = 'Invalid amount'; errEl.classList.remove('hidden'); }
    return;
  }

  // Show loading state
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Submitting…'; }

  try {
    let walletSkHex;
    if (typeof activeAccountIndex === 'undefined' || activeAccountIndex === 0) {
      const wallet = await loadWalletData(password);
      walletSkHex = wallet.skHex;
    } else {
      const accounts = await getAccounts();
      const acc = accounts[activeAccountIndex - 1];
      if (!acc) throw new Error('Account not found');
      const salt  = new Uint8Array(acc.salt);
      const iv    = new Uint8Array(acc.iv);
      const data  = new Uint8Array(acc.data);
      const key   = await deriveKey(password, salt);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
      const w = JSON.parse(new TextDecoder().decode(plain));
      walletSkHex = w.skHex;
    }
    if (!wasm) throw new Error('WASM not loaded');
    const timestamp = Math.floor(Date.now() / 1000);

    // Fetch nonce from POST /api/balance (known to work from extension context)
    // BalanceResponse.nonce = last confirmed nonce; next tx must use nonce + 1
    let fetchedNonce = 1;
    try {
      const balR = await fetch(rpcUrl('/api/balance'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: state.address }),
      });
      if (balR.ok) {
        const balD = await balR.json();
        fetchedNonce = (typeof balD.nonce === 'number' ? balD.nonce : 0) + 1;
        console.log(`[Quanta] nonce from node: ${balD.nonce} → base next nonce: ${fetchedNonce}`);
      }
    } catch (e) { console.warn('Could not fetch nonce', e); }

    const maxPendingNonce = Math.max(0, ...state.txHistory
      .filter(t => t.pending && t.sender?.toLowerCase() === state.address?.toLowerCase())
      .map(t => typeof t.nonce === 'number' ? t.nonce : 0)
    );
    if (maxPendingNonce >= fetchedNonce) {
      fetchedNonce = maxPendingNonce + 1;
      console.log(`[Quanta] overriding nonce from pending txs → submitting nonce: ${fetchedNonce}`);
    }

    const timelockEl = document.getElementById('send-timelock-toggle');
    const unlockHEl  = document.getElementById('send-unlock-height');
    const isTimeLock = !!(timelockEl?.checked && unlockHEl?.value);
    const unlockHeight = isTimeLock ? Math.max(0, parseInt(unlockHEl.value) || 0) : 0;
    const networkId = state.settings.network === 'mainnet' ? 1 : 0;
    const feeMicro = isTimeLock
      ? Math.max(5000, Math.round(fee * MICROUNITS))
      : Math.round(fee * MICROUNITS);
    const tx = {
      sender: state.address, recipient: to,
      amount: Math.round(amount * MICROUNITS),
      fee: feeMicro, nonce: fetchedNonce, timestamp,
      lock_time: 0,
      tx_type: isTimeLock ? { TimeLockTransfer: { unlock_height: unlockHeight } } : 'Transfer',
      sig_scheme: 'Falcon512', network_id: networkId,
    };
    const encoder = new TextEncoder();
    function toLeBytes(num) {
      const arr = new Uint8Array(8);
      new DataView(arr.buffer).setBigUint64(0, BigInt(num), true);
      return Array.from(arr);
    }
    const pkBytes = Array.from(new Uint8Array((state.publicKey.match(/.{1,2}/g) || []).map(b => parseInt(b, 16))));
    const payloadBytes = [
      ...Array.from(encoder.encode(tx.sender)),
      ...Array.from(encoder.encode(tx.recipient)),
      ...toLeBytes(tx.amount),
      ...toLeBytes(tx.timestamp),
      ...toLeBytes(feeMicro),
      ...toLeBytes(tx.nonce),
      ...toLeBytes(tx.lock_time),
      ...pkBytes,
      0, // sig_scheme: Falcon512 = 0
      networkId & 0xff, (networkId >> 8) & 0xff, (networkId >> 16) & 0xff, (networkId >> 24) & 0xff,
    ];
    if (isTimeLock) {
      payloadBytes.push(1); // tx_type byte: TimeLockTransfer
      payloadBytes.push(...toLeBytes(unlockHeight));
    } else {
      payloadBytes.push(0); // tx_type byte: Transfer
    }
    const hexPayload = payloadBytes.map(b => b.toString(16).padStart(2, '0')).join('');
    const hexSig = wasm.sign_transaction(hexPayload, walletSkHex);
    const hexToBytes = (hex) => Array.from(new Uint8Array((hex.match(/.{1,2}/g) || []).map(b => parseInt(b, 16))));
    tx.signature = hexToBytes(hexSig);
    tx.public_key = hexToBytes(state.publicKey);

    const resp = await fetch(rpcUrl('/api/transactions/submit'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tx),
    });
    const result = await resp.json();
    if (!resp.ok || result.success === false) throw new Error(result.error || JSON.stringify(result));

    const txHash = result.tx_hash || '';
    const explorerBase = state.settings.explorer_url || 'https://scan.quantachain.org';
    const explorerUrl = txHash ? `${explorerBase}/tx/${txHash}` : '';

    // Transform the send panel into a clean confirmation screen (MetaMask-style)
    const panelBody = document.querySelector('#send-panel .panel-body');
    if (panelBody) {
      panelBody.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px 20px;text-align:center;gap:20px;">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(0,212,170,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <div>
            <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary);margin-bottom:6px;">Transaction Submitted</div>
            <div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--mono);word-break:break-all;max-width:280px;margin:0 auto;">${escapeHtml(txHash || '—')}</div>
          </div>
        </div>`;
    }
    toast('Transaction submitted');

    // Inject pending tx into activity immediately so user sees it without waiting for confirmation
    const pendingTx = {
      tx_hash: txHash,
      sender: state.address,
      recipient: to,
      amount_microunits: Math.round(amount * MICROUNITS),
      fee_microunits: Math.round(fee * MICROUNITS),
      nonce: fetchedNonce,
      block_time: Math.floor(Date.now() / 1000),
      pending: true,
    };
    state.txHistory = [pendingTx, ...state.txHistory];

    // Switch to Activity tab right away so user can see + click the pending tx
    const actTab = document.getElementById('tab-btn-history');
    const actContent = document.getElementById('tab-history');
    const assetTab = document.getElementById('tab-btn-assets');
    const assetContent = document.getElementById('tab-assets');
    if (actTab && actContent) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      actTab.classList.add('active');
      actContent.classList.add('active');
    }
    renderHistory();
    refreshBalance();
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.name === 'OperationError' ? 'Wrong password' : 'Error: ' + e.message;
      errEl.classList.remove('hidden');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
  }
}

// ── QR ────────────────────────────────────────────────────────────────────────

function renderQr() {
  const c = document.getElementById('qr-container');
  if (!c) return;
  const addr = state.address || '';
  c.innerHTML = `<div style="padding:16px;text-align:center;font-size:0.68rem;font-family:monospace;color:#333;word-break:break-all;max-width:180px">${escapeHtml(addr)}</div>`;
}

// ── Security & Export Keys ────────────────────────────────────────────────────

async function revealPrivateKey() {
  const pwdEl = document.getElementById('export-password');
  const errEl = document.getElementById('export-error');
  if (!pwdEl || !errEl) return;
  const password = pwdEl.value;
  errEl.classList.add('hidden');

  if (!password) { errEl.textContent = 'Enter password'; errEl.classList.remove('hidden'); return; }

  try {
    const wallet = await loadWalletData(password);
    document.getElementById('export-pw-group').classList.add('hidden');
    const resultBox = document.getElementById('export-key-result');
    resultBox.classList.remove('hidden');
    // Export combined sk|pk so the import panel can work with just this one blob
    const combined = wallet.skHex + '|' + wallet.pkHex;
    document.getElementById('export-key-text').textContent = combined;
    // Add a note to tell the user what this is
    const noteEl = document.getElementById('export-key-note');
    if (noteEl) {
      noteEl.textContent = 'Copy this combined key (sk|pk). Paste it in "Import from Private Key" to restore your wallet on any device.';
      noteEl.classList.remove('hidden');
    }
  } catch (e) {
    errEl.textContent = 'Incorrect Password';
    errEl.classList.remove('hidden');
  }
}

function copyPrivateKey() {
  const keyEl = document.getElementById('export-key-text');
  if (keyEl && keyEl.textContent) {
    navigator.clipboard.writeText(keyEl.textContent).then(() => toast('Private Key Copied!'));
  }
}

// ── Lock / delete ─────────────────────────────────────────────────────────────

function lockWallet() {
  state.secretKey = null; state.publicKey = null;
  state.address = null; state.balance = 0; state.txHistory = [];
  showScreen('screen-welcome'); toast('Locked');
}

function deleteWallet() {
  if (!confirm('Remove account permanently? Make sure you have your mnemonic or private key backed up!')) return;
  storageRemove(STORAGE_KEY);
  lockWallet(); toast('Account removed');
}

function copyAddress() {
  if (!state.address) return;
  navigator.clipboard.writeText(state.address).then(() => toast('Address copied'));
}

// ── Multi-Account Management ──────────────────────────────────────────────────

async function getAccounts() {
  const list = await storageGet(ACCOUNTS_KEY);
  return Array.isArray(list) ? list : [];
}

/// Save a NEW additional account (not the primary wallet).
/// Uses the current session password so no re-prompt needed.
async function saveAccountToList(skHex, pkHex, address, name) {
  const password = state.sessionPassword;
  if (!password) throw new Error('Session expired — please lock and unlock the wallet first');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const plain = new TextEncoder().encode(JSON.stringify({ skHex, pkHex, address }));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);

  const accounts = await getAccounts();
  accounts.push({
    name,
    address,
    pkHex,
    salt: Array.from(salt),
    iv:   Array.from(iv),
    data: Array.from(new Uint8Array(cipher)),
  });
  await storageSet(ACCOUNTS_KEY, accounts);
}

async function renderAccountsList() {
  const container = document.getElementById('accounts-list');
  if (!container) return;
  const accounts = await getAccounts();

  // Always read Account 1's address from storage — NOT state.address,
  // which may have already been updated to a different account's address.
  const { address: primaryAddress, pkHex: primaryPk } = await getPublicInfo();
  const primary = { name: 'Account 1', address: primaryAddress || '0x...', primary: true };
  const display = [primary, ...accounts];

  container.innerHTML = display.map((acc, i) => {
    const addr = acc.address || '0x...';
    const short = addr.slice(0, 10) + '\u2026' + addr.slice(-6);
    const isActive = i === activeAccountIndex;
    return `
      <div class="account-card" style="margin-bottom:8px;${isActive ? 'border:1px solid var(--cyan);background:rgba(0,212,255,0.04);' : ''}">
        <div class="account-details" style="cursor:pointer;flex:1;" data-switch-idx="${i}">
          <div class="account-name" style="display:flex;align-items:center;gap:6px;">
            ${escapeHtml(acc.name || 'Account ' + (i + 1))}
            ${isActive ? '<span style="font-size:0.7rem;color:var(--cyan);font-weight:600;">Active</span>' : ''}
          </div>
          <div class="account-addr-full" style="font-size:0.72rem;color:var(--text-muted);font-family:var(--mono);">${escapeHtml(short)}</div>
        </div>
        <button class="icon-btn" data-copy-addr="${escapeHtml(addr)}" title="Copy">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        </button>
      </div>`;
  }).join('');

  // Event delegation — CSP-safe (no inline onclick)
  container.querySelectorAll('[data-switch-idx]').forEach(el =>
    el.addEventListener('click', () => switchAccount(parseInt(el.dataset.switchIdx))));
  container.querySelectorAll('[data-copy-addr]').forEach(el =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(el.dataset.copyAddr).then(() => toast('Copied'));
    }));

  const addBtn = document.getElementById('btn-add-account');
  if (addBtn) addBtn.style.display = display.length >= MAX_ACCOUNTS ? 'none' : '';
}


async function switchAccount(idx) {
  activeAccountIndex = idx;
  try {
    if (idx === 0) {
      const { address, pkHex } = await getPublicInfo();
      state.address   = address;
      state.publicKey = pkHex;
    } else {
      if (!state.sessionPassword) { toast('Session expired — lock and unlock the wallet first.'); return; }
      const accounts = await getAccounts();
      const acc = accounts[idx - 1];
      if (!acc) { toast('Account not found'); return; }
      const salt  = new Uint8Array(acc.salt);
      const iv    = new Uint8Array(acc.iv);
      const data  = new Uint8Array(acc.data);
      const key   = await deriveKey(state.sessionPassword, salt);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
      const wallet = JSON.parse(new TextDecoder().decode(plain));
      state.address   = wallet.address;
      state.publicKey = wallet.pkHex;
    }
    state.balance   = 0;
    state.txHistory = [];
    updateMainUI();
    // Re-render the account list with correct addresses + active indicator
    await renderAccountsList();
    closePanel('account-panel');
    toast('Switched to ' + (idx === 0 ? 'Account 1' : (await getAccounts())[idx - 1]?.name || 'Account ' + (idx + 1)));
    await refreshBalance();
    await loadHistory();
  } catch (e) {
    toast('Error switching account: ' + e.message);
  }
}


async function addAccount() {
  const accounts = await getAccounts();
  const total = 1 + accounts.length;
  if (total >= MAX_ACCOUNTS) { toast('Maximum 10 accounts reached'); return; }

  showPanel('add-account-panel');
  closePanel('account-panel');

  // Reset all sections — default to Derive tab
  ['add-account-phrase','add-account-sk-hex','derive-password'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['add-account-error','add-account-pk-error','derive-error'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.add('hidden');
  });
  // Show derive tab by default
  switchAddTab('derive');
}

function switchAddTab(tab) {
  const sections = { derive: 'add-section-derive', mnemonic: 'add-section-mnemonic', privkey: 'add-section-privkey' };
  const tabs     = { derive: 'add-tab-derive',     mnemonic: 'add-tab-mnemonic',     privkey: 'add-tab-privkey' };
  const activeStyle   = 'background:var(--cyan);color:#0b0e14;font-weight:700;';
  const inactiveStyle = 'background:;color:;font-weight:;';
  Object.entries(sections).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = key === tab ? '' : 'none';
  });
  Object.entries(tabs).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (key === tab) {
      el.style.background = 'var(--cyan)'; el.style.color = '#0b0e14'; el.style.fontWeight = '700';
    } else {
      el.style.background = ''; el.style.color = ''; el.style.fontWeight = '';
    }
  });
}

async function doAddAccount() {
  const phrEl = document.getElementById('add-account-phrase');
  const errEl = document.getElementById('add-account-error');
  const btn   = document.getElementById('btn-add-account-go');
  if (!phrEl) return;

  const phrase = phrEl.value.trim();
  if (errEl) errEl.classList.add('hidden');

  if (!wasm) { if (errEl) { errEl.textContent = 'WASM not loaded'; errEl.classList.remove('hidden'); } return; }
  if (!wasm.validate_mnemonic(phrase)) {
    if (errEl) { errEl.textContent = 'Invalid mnemonic phrase'; errEl.classList.remove('hidden'); } return;
  }

  // Check for session password
  if (!state.sessionPassword) {
    if (errEl) { errEl.textContent = 'Session expired. Lock and unlock your wallet first.'; errEl.classList.remove('hidden'); } return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Importing…'; }

  try {
    const result = wasm.import_wallet(phrase, '', 0);

    // Duplicate check: reject if address matches any existing account
    const accounts = await getAccounts();
    const allAddresses = [state.address, ...accounts.map(a => a.address)].map(a => a?.toLowerCase());
    if (allAddresses.includes(result.address?.toLowerCase())) {
      if (errEl) { errEl.textContent = 'This account is already in your wallet.'; errEl.classList.remove('hidden'); }
      if (btn) { btn.disabled = false; btn.textContent = 'Import Account'; }
      return;
    }

    const name = 'Account ' + (accounts.length + 2);
    await saveAccountToList(result.secret_key, result.public_key, result.address, name);

    phrEl.value = '';
    toast('Account added: ' + name);
    closePanel('add-account-panel');
    showPanel('account-panel');
    renderAccountsList();
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.classList.remove('hidden'); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Import Account'; }
  }
}


// ── Derive account from same mnemonic (HD derivation) ────────────────────────

async function doDerive() {
  const pwEl  = document.getElementById('derive-password');
  const errEl = document.getElementById('derive-error');
  const btn   = document.getElementById('btn-derive-go');
  if (!pwEl) return;

  const password = pwEl.value;
  if (!password) {
    if (errEl) { errEl.textContent = 'Enter your wallet password'; errEl.classList.remove('hidden'); }
    return;
  }
  if (errEl) errEl.classList.add('hidden');

  if (!wasm) {
    if (errEl) { errEl.textContent = 'WASM not loaded'; errEl.classList.remove('hidden'); }
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Deriving…'; }

  try {
    // Decrypt primary wallet to get mnemonic
    const walletData = await loadWalletData(password);
    if (!walletData.mnemonic) throw new Error('No mnemonic stored — cannot derive. Restore your wallet from mnemonic first.');

    // Find next unused HD index
    const existingAccounts = await getAccounts();
    // Existing accounts may have hdIndex stored; if not, use sequential
    const usedIndices = new Set(existingAccounts.map(a => a.hdIndex).filter(x => typeof x === 'number'));
    let nextIndex = 1; // index 0 is always the primary
    while (usedIndices.has(nextIndex)) nextIndex++;

    // Derive keypair
    const result = wasm.import_wallet(walletData.mnemonic, '', nextIndex);

    // Duplicate check
    const allAddresses = [state.address, ...existingAccounts.map(a => a.address)].map(a => a?.toLowerCase());
    if (allAddresses.includes(result.address?.toLowerCase())) {
      if (errEl) { errEl.textContent = 'This account already exists in your wallet.'; errEl.classList.remove('hidden'); }
      return;
    }

    const name = 'Account ' + (existingAccounts.length + 2);
    // Save with hdIndex so we can always re-derive without storing the SK encrypted twice
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(password, salt);
    const plain = new TextEncoder().encode(JSON.stringify({ skHex: result.secret_key, pkHex: result.public_key, address: result.address }));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);

    const newAccounts = [...existingAccounts, {
      name,
      address:  result.address,
      pkHex:    result.public_key,
      hdIndex:  nextIndex,
      salt: Array.from(salt),
      iv:   Array.from(iv),
      data: Array.from(new Uint8Array(cipher)),
    }];
    await storageSet(ACCOUNTS_KEY, newAccounts);

    pwEl.value = '';
    toast(name + ' derived successfully');
    closePanel('add-account-panel');
    showPanel('account-panel');
    await renderAccountsList();
    // Auto-switch to the new account
    await switchAccount(newAccounts.length); // index = length (0-based primary + extras)
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.name === 'OperationError' ? 'Wrong password' : 'Error: ' + e.message;
      errEl.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Derive Next Account';
    }
  }
}

// Expose for inline onclick
window.switchAccount = switchAccount;



// ── Import from Private Key (full wallet) ────────────────────────────────────

async function importWalletPrivateKey() {
  const skEl  = document.getElementById('import-sk-hex');
  const pwdEl = document.getElementById('import-pk-password');
  const errEl = document.getElementById('import-pk-error');
  const btn   = document.getElementById('btn-import-pk-go');
  if (!skEl || !pwdEl) return;

  // Accept "sk_hex|pk_hex" combined format (exported by the wallet's Export Key panel)
  const raw      = skEl.value.trim().replace(/\s+/g, '');
  const password = pwdEl.value;

  if (errEl) errEl.classList.add('hidden');

  if (!raw || raw.length < 200) {
    if (errEl) { errEl.textContent = 'Paste your exported combined key (from the Export Key panel)'; errEl.classList.remove('hidden'); } return;
  }
  if (password.length < 8) {
    if (errEl) { errEl.textContent = 'Password must be at least 8 characters'; errEl.classList.remove('hidden'); } return;
  }
  if (!wasm) { if (errEl) { errEl.textContent = 'WASM not loaded'; errEl.classList.remove('hidden'); } return; }

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Importing\u2026'; }
  showScreen('screen-loading');
  const msgEl = document.getElementById('loading-msg');
  if (msgEl) msgEl.textContent = 'Importing wallet from private key\u2026';

  try {
    let skHex, pkHex, address;

    if (raw.includes('|')) {
      // Combined sk|pk format (exported by the wallet extension)
      const pipe = raw.indexOf('|');
      skHex = raw.slice(0, pipe);
      pkHex = raw.slice(pipe + 1);
      if (!pkHex || pkHex.length < 200) {
        throw new Error('Combined key is malformed \u2014 missing public key after the | separator');
      }
      address = wasm.get_address(pkHex);
    } else {
      // Plain SK hex — try WASM derivation
      pkHex = wasm.derive_pubkey_from_sk(raw); // will error with helpful message if not supported
      skHex = raw;
      address = wasm.get_address(pkHex);
    }

    await saveWallet(skHex, pkHex, address, null, password);
    await enterMain();
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.classList.remove('hidden'); }
    showScreen('screen-import');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Import from Private Key'; }
  }
}


// ── Add Account from Private Key ──────────────────────────────────────────────

async function doAddAccountPrivateKey() {
  const skEl  = document.getElementById('add-account-sk-hex');
  const errEl = document.getElementById('add-account-pk-error');
  const btn   = document.getElementById('btn-add-account-pk-go');
  if (!skEl) return;

  const raw = skEl.value.trim().replace(/\s+/g, '');
  if (errEl) errEl.classList.add('hidden');

  if (!raw || raw.length < 200) {
    if (errEl) { errEl.textContent = 'Paste your exported combined key (from the Export Key panel)'; errEl.classList.remove('hidden'); } return;
  }
  if (!wasm) { if (errEl) { errEl.textContent = 'WASM not loaded'; errEl.classList.remove('hidden'); } return; }
  if (!state.sessionPassword) {
    if (errEl) { errEl.textContent = 'Session expired. Lock and unlock your wallet first.'; errEl.classList.remove('hidden'); } return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Importing\u2026'; }

  try {
    let skHex, pkHex, address;

    if (raw.includes('|')) {
      // Combined sk|pk format (exported by the wallet extension)
      const pipe = raw.indexOf('|');
      skHex = raw.slice(0, pipe);
      pkHex = raw.slice(pipe + 1);
      if (!pkHex || pkHex.length < 200) throw new Error('Combined key malformed \u2014 missing public key after |');
      address = wasm.get_address(pkHex);
    } else {
      // Plain SK — attempt WASM derivation (will give helpful error if unsupported)
      pkHex = wasm.derive_pubkey_from_sk(raw);
      skHex = raw;
      address = wasm.get_address(pkHex);
    }

    // Duplicate check
    const accounts = await getAccounts();
    const allAddresses = [state.address, ...accounts.map(a => a.address)].map(a => a?.toLowerCase());
    if (allAddresses.includes(address?.toLowerCase())) {
      if (errEl) { errEl.textContent = 'This account is already in your wallet.'; errEl.classList.remove('hidden'); }
      if (btn) { btn.disabled = false; btn.textContent = 'Import from Private Key'; }
      return;
    }

    const name = 'Account ' + (accounts.length + 2);
    await saveAccountToList(skHex, pkHex, address, name);

    skEl.value = '';
    toast('Account added: ' + name);
    closePanel('add-account-panel');

    showPanel('account-panel');
    renderAccountsList();
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.classList.remove('hidden'); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Import from Private Key'; }
  }
}

// ── Import mode tab toggle helpers ────────────────────────────────────────────

function switchImportTab(mode) {
  const mnemonicSection = document.getElementById('import-section-mnemonic');
  const privkeySection  = document.getElementById('import-section-privkey');
  const mnemonicTab     = document.getElementById('import-tab-mnemonic');
  const privkeyTab      = document.getElementById('import-tab-privkey');
  const activeStyle = { background: 'var(--cyan)', color: '#0b0e14', fontWeight: '700' };
  const inactiveStyle = { background: '', color: '', fontWeight: '' };
  if (mode === 'mnemonic') {
    if (mnemonicSection) mnemonicSection.style.display = '';
    if (privkeySection)  privkeySection.style.display  = 'none';
    if (mnemonicTab) Object.assign(mnemonicTab.style, activeStyle);
    if (privkeyTab)  Object.assign(privkeyTab.style,  inactiveStyle);
  } else {
    if (mnemonicSection) mnemonicSection.style.display = 'none';
    if (privkeySection)  privkeySection.style.display  = '';
    if (mnemonicTab) Object.assign(mnemonicTab.style, inactiveStyle);
    if (privkeyTab)  Object.assign(privkeyTab.style,  activeStyle);
  }
}

function switchAddAccountTab(mode) {
  const mnemonicSection = document.getElementById('add-section-mnemonic');
  const privkeySection  = document.getElementById('add-section-privkey');
  const mnemonicTab     = document.getElementById('add-tab-mnemonic');
  const privkeyTab      = document.getElementById('add-tab-privkey');
  const activeStyle = { background: 'var(--cyan)', color: '#0b0e14', fontWeight: '700' };
  const inactiveStyle = { background: '', color: '', fontWeight: '' };
  if (mode === 'mnemonic') {
    if (mnemonicSection) mnemonicSection.style.display = '';
    if (privkeySection)  privkeySection.style.display  = 'none';
    if (mnemonicTab) Object.assign(mnemonicTab.style, activeStyle);
    if (privkeyTab)  Object.assign(privkeyTab.style,  inactiveStyle);
  } else {
    if (mnemonicSection) mnemonicSection.style.display = 'none';
    if (privkeySection)  privkeySection.style.display  = '';
    if (mnemonicTab) Object.assign(mnemonicTab.style, inactiveStyle);
    if (privkeyTab)  Object.assign(privkeyTab.style,  activeStyle);
  }
}


// ── Sign Message ──────────────────────────────────────────────────────────────

async function signMessage() {
  const msgEl = document.getElementById('sign-msg-text');
  const pwdEl = document.getElementById('sign-msg-password');
  const errEl = document.getElementById('sign-msg-error');
  const resEl = document.getElementById('sign-msg-result');
  const outEl = document.getElementById('sign-msg-output');
  const btn   = document.getElementById('btn-exec-sign-msg');
  if (!msgEl || !pwdEl) return;

  const message  = msgEl.value.trim();
  const password = pwdEl.value;
  if (errEl) errEl.classList.add('hidden');
  if (resEl) resEl.classList.add('hidden');

  if (!message) {
    if (errEl) { errEl.textContent = 'Enter a message to sign'; errEl.classList.remove('hidden'); } return;
  }
  if (!password) {
    if (errEl) { errEl.textContent = 'Enter your wallet password'; errEl.classList.remove('hidden'); } return;
  }
  if (!wasm) {
    if (errEl) { errEl.textContent = 'WASM not loaded'; errEl.classList.remove('hidden'); } return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Signing\u2026'; }

  try {
    let walletSkHex;
    if (!activeAccountIndex) {
      const wallet = await loadWalletData(password);
      walletSkHex = wallet.skHex;
    } else {
      const accounts = await getAccounts();
      const acc = accounts[activeAccountIndex - 1];
      if (!acc) throw new Error('Account not found');
      const key   = await deriveKey(password, new Uint8Array(acc.salt));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(acc.iv) }, key, new Uint8Array(acc.data));
      walletSkHex = JSON.parse(new TextDecoder().decode(plain)).skHex;
    }

    const sigHex = wasm.sign_message(message, walletSkHex);
    if (outEl) outEl.textContent = sigHex;
    if (resEl) resEl.classList.remove('hidden');
    toast('Message signed');
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.name === 'OperationError' ? 'Wrong password' : 'Error: ' + e.message;
      errEl.classList.remove('hidden');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Sign Message'; }
  }
}

// ── TimeLock toggle helper ──────────────────────────────────────────────

function handleTimelockToggle() {
  const section = document.getElementById('send-timelock-section');
  if (section) section.style.display = this.checked ? '' : 'none';
  if (this.checked) {
    const feeEl = document.getElementById('send-fee');
    if (feeEl && parseFloat(feeEl.value) < 0.005) feeEl.value = '0.005';
  }
}

async function loadSettings() {
  const s = await storageGet(SETTINGS_KEY);
  if (s) {
    state.settings.rpc_url = s.rpc_url || 'https://rpc.quantachain.org';
    state.settings.explorer_url = s.explorer_url || 'https://scan.quantachain.org';
    state.settings.network = s.network || 'testnet';
  }
}

async function saveSettings() {
  const urlEl = document.getElementById('rpc-url');
  const expEl = document.getElementById('explorer-url');
  const selEl = document.getElementById('network-select');
  if (urlEl) state.settings.rpc_url = urlEl.value.trim() || 'https://rpc.quantachain.org';
  if (expEl) state.settings.explorer_url = expEl.value.trim() || 'https://scan.quantachain.org';
  if (selEl) state.settings.network = selEl.value;
  await storageSet(SETTINGS_KEY, state.settings);
  updateMainUI(); closePanel('settings-panel');
  toast('Settings saved'); refreshBalance();
}

// ── Boot & Event Binders ──────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  await loadWasm();

  const b = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

  const isPopup = window.innerWidth <= 400 && document.body.clientHeight < window.screen.height;

  b('btn-create', () => {
    if (isPopup) chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?flow=create') });
    else showScreen('screen-create-warn');
  });

  b('btn-import', () => {
    if (isPopup) chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?flow=import') });
    else showScreen('screen-import');
  });

  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', (e) => showScreen(e.target.dataset.target));
  });

  const chk = document.getElementById('chk-understand');
  if (chk) chk.addEventListener('change', toggleCreateBtn);

  b('btn-generate-wallet', createWallet);
  b('btn-copy-mnemonic', copyMnemonic);
  b('btn-toggle-mnemonic', () => {
    const grid = document.getElementById('mnemonic-grid');
    if (grid) grid.classList.toggle('blur-words');
  });
  b('btn-written-down', () => { showScreen('screen-confirm'); setupConfirmInputs(); });
  b('btn-verify-continue', confirmMnemonic);

  const pw1El = document.getElementById('pw-new');
  if (pw1El) pw1El.addEventListener('input', checkPasswordStrength);
  b('btn-toggle-pw1', () => togglePw('pw-new'));
  b('btn-toggle-pw2', () => togglePw('pw-confirm'));
  b('btn-set-password', setPassword);

  const impPhr = document.getElementById('import-phrase');
  if (impPhr) impPhr.addEventListener('input', validateImportPhrase);
  b('btn-import-go', importWallet);

  // Import screen — mode tabs
  b('import-tab-mnemonic', () => switchImportTab('mnemonic'));
  b('import-tab-privkey',  () => switchImportTab('privkey'));
  b('btn-import-pk-go', importWalletPrivateKey);

  // New UI binds
  b('btn-show-account', () => { showPanel('account-panel'); renderAccountsList(); });
  b('btn-add-account', addAccount);
  b('btn-add-account-go', doAddAccount);
  // Add Account panel — 3 mode tabs
  b('add-tab-derive',   () => switchAddTab('derive'));
  b('add-tab-mnemonic', () => switchAddTab('mnemonic'));
  b('add-tab-privkey',  () => switchAddTab('privkey'));
  b('btn-derive-go', doDerive);
  b('btn-add-account-pk-go', doAddAccountPrivateKey);
  b('header-btn-settings', () => showPanel('settings-panel'));
  b('btn-network-toggle', () => showPanel('settings-panel'));

  b('btn-main-copy-addr', copyAddress);
  b('btn-menu-copy', copyAddress);

  b('btn-action-send', () => showPanel('send-panel'));
  b('btn-action-receive', () => showPanel('receive-panel'));
  b('btn-action-refresh', refreshBalance);

  b('btn-show-export', () => showPanel('export-panel'));
  b('btn-reveal-key', revealPrivateKey);
  b('btn-copy-export', copyPrivateKey);

  // Sign Message panel
  b('btn-action-sign', () => showPanel('sign-msg-panel'));
  b('btn-exec-sign-msg', signMessage);
  b('btn-copy-sig', () => {
    const outEl = document.getElementById('sign-msg-output');
    if (outEl?.textContent) navigator.clipboard.writeText(outEl.textContent).then(() => toast('Signature copied'));
  });

  b('btn-lock-wallet', lockWallet);
  b('btn-delete-wallet', deleteWallet);
  b('btn-save-settings', saveSettings);
  b('btn-exec-send', sendTransaction);
  b('btn-receive-copy', copyAddress);
  // TimeLock toggle on initial panel load
  document.getElementById('send-timelock-toggle')?.addEventListener('change', handleTimelockToggle);

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', (e) => switchTab(e.target.dataset.target, e.target));
  });

  document.querySelectorAll('.close-panel').forEach(btn => {
    btn.addEventListener('click', (e) => closePanel(e.target.dataset.panel));
  });

  const overlay = document.getElementById('overlay');
  if (overlay) overlay.addEventListener('click', closeAllPanels);

  const paramFlow = new URLSearchParams(window.location.search).get('flow');

  chrome.runtime.sendMessage({ type: 'GET_LOCK_STATE' }, async (resp) => {
    if (resp?.locked && !paramFlow) { showUnlockScreen(''); return; }

    if (paramFlow === 'create') {
      showScreen('screen-create-warn');
    } else if (paramFlow === 'import') {
      showScreen('screen-import');
    } else if (await walletExists()) {
      const { address } = await getPublicInfo();
      showUnlockScreen(address || '');
    } else {
      showScreen('screen-welcome');
    }
  });
});

// ── Unlock ────────────────────────────────────────────────────────────────────

function showUnlockScreen(address) {
  let s = document.getElementById('screen-unlock');
  if (!s) {
    s = document.createElement('div');
    s.id = 'screen-unlock'; s.className = 'screen';
    s.innerHTML = `
      <div class="card-page" style="text-align:center">
        <div class="logo-wrap" style="margin:0 auto 16px;width:52px;height:52px;display:flex;align-items:center;justify-content:center;">
          <img src="icons/quanta-transparent-bg-logo.png" style="width:50px;height:50px;object-fit:contain; filter: drop-shadow(0 0 10px rgba(255,255,255,0.2));">
        </div>
        <h2>Quanta Wallet</h2>
        <p class="subtitle">Welcome back</p>
        <p style="font-family:var(--mono);font-size:0.75rem;color:var(--text-muted);margin-bottom:24px;word-break:break-all">
          ${address ? escapeHtml(address.slice(0, 12) + '…' + address.slice(-6)) : ''}
        </p>
        <div class="form-group" style="text-align:left">
          <label>Password</label>
          <div class="input-wrap">
            <input id="unlock-pw" type="password" placeholder="Your wallet password">
            <button id="btn-toggle-unlock" class="eye-btn">Show</button>
          </div>
        </div>
        <div id="unlock-error" class="error-msg hidden">Wrong password</div>
        <button id="btn-unlock-exec" class="btn btn-primary full-width" style="margin-top:10px;">Unlock</button>
        <hr class="divider" style="margin:20px 0">
        <button id="btn-unlock-diff" class="btn btn-ghost btn-sm" style="width:100%;">Use Different Wallet</button>
      </div>`;
    document.body.appendChild(s);

    const pw = document.getElementById('unlock-pw');
    if (pw) pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlockWallet(); });
    const bToggle = document.getElementById('btn-toggle-unlock');
    if (bToggle) bToggle.addEventListener('click', () => togglePw('unlock-pw'));
    const bExec = document.getElementById('btn-unlock-exec');
    if (bExec) bExec.addEventListener('click', unlockWallet);
    const bDiff = document.getElementById('btn-unlock-diff');
    if (bDiff) bDiff.addEventListener('click', () => {
      if (confirm('Are you sure? Unlocking a different wallet will discard your current keys on this device setup. You MUST have the private key or mnemonic saved.')) {
        showScreen('screen-welcome');
      }
    });
  }
  showScreen('screen-unlock');
}

async function unlockWallet() {
  const pwEl = document.getElementById('unlock-pw');
  if (!pwEl) return;
  const pw = pwEl.value;
  const errEl = document.getElementById('unlock-error');
  if (errEl) errEl.classList.add('hidden');
  try {
    await loadWalletData(pw);
    pingActivity();
    await enterMain();
  } catch {
    if (errEl) errEl.classList.remove('hidden');
  }
}
