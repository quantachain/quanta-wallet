"""
Port multi-account HD derivation to the extension:
1. Add 'Derive' tab to add-account-panel in popup.html
2. Add doDerive() function + wire up in popup.js
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

# ─────────────────────────────────────────────────────────────────────────────
# HTML — replace add-account-panel with 3-tab version (Derive / Mnemonic / Key)
# ─────────────────────────────────────────────────────────────────────────────
html_path = r'e:\temp\quanta-wallet\extension\popup.html'
with open(html_path, encoding='utf-8') as f:
    html = f.read()

OLD_PANEL = '''  <div id="add-account-panel" class="side-panel bottom-up" style="z-index:102;">
    <div class="panel-header">
      <h3>Import Account</h3><button class="close-panel" data-panel="add-account-panel">✕</button>
    </div>
    <div class="panel-body">

      <!-- Mode tabs -->
      <div style="display:flex;gap:0;margin-bottom:12px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
        <button id="add-tab-mnemonic" class="btn btn-ghost" style="flex:1;border-radius:0;border:none;font-size:0.78rem;padding:6px 4px;background:var(--cyan);color:#0b0e14;font-weight:700;">Mnemonic</button>
        <button id="add-tab-privkey" class="btn btn-ghost" style="flex:1;border-radius:0;border:none;font-size:0.78rem;padding:6px 4px;">Private Key</button>
      </div>

      <!-- Mnemonic section -->
      <div id="add-section-mnemonic">
        <p class="subtitle" style="margin-bottom:10px;font-size:0.82rem;color:var(--text-secondary);">Enter the 24-word recovery phrase for the account to add.</p>
        <div class="form-group">
          <label>Recovery Phrase (24 words)</label>
          <textarea id="add-account-phrase" rows="4" placeholder="word1 word2 ... word24" style="font-family:var(--mono);font-size:0.82rem;"></textarea>
        </div>
        <div id="add-account-error" class="error-msg hidden"></div>
        <button id="btn-add-account-go" class="btn btn-primary full-width" style="margin-top:8px;">Import Account</button>
      </div>

      <!-- Private Key section (accepts combined sk|pk format from Export Keys panel) -->
      <div id="add-section-privkey" style="display:none;">
        <p class="subtitle" style="margin-bottom:10px;font-size:0.82rem;color:var(--text-secondary);">Paste the <strong>combined key</strong> exported from the <strong>Export Keys</strong> panel (sk|pk format).</p>
        <div class="form-group">
          <label>Combined Key (sk|pk)</label>
          <textarea id="add-account-sk-hex" rows="4" placeholder="Paste your exported combined key here…" style="font-family:var(--mono);font-size:0.7rem;"></textarea>
        </div>
        <div id="add-account-pk-error" class="error-msg hidden"></div>
        <button id="btn-add-account-pk-go" class="btn btn-primary full-width" style="margin-top:8px;">Import from Key</button>
      </div>

    </div>
  </div>'''

NEW_PANEL = '''  <div id="add-account-panel" class="side-panel bottom-up" style="z-index:102;">
    <div class="panel-header">
      <h3>Add Account</h3><button class="close-panel" data-panel="add-account-panel">&#x2715;</button>
    </div>
    <div class="panel-body">

      <!-- Mode tabs: Derive | Mnemonic | Private Key -->
      <div style="display:flex;gap:0;margin-bottom:14px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
        <button id="add-tab-derive"   class="btn btn-ghost" style="flex:1;border-radius:0;border:none;font-size:0.75rem;padding:7px 4px;background:var(--cyan);color:#0b0e14;font-weight:700;">Derive</button>
        <button id="add-tab-mnemonic" class="btn btn-ghost" style="flex:1;border-radius:0;border:none;font-size:0.75rem;padding:7px 4px;">Mnemonic</button>
        <button id="add-tab-privkey"  class="btn btn-ghost" style="flex:1;border-radius:0;border:none;font-size:0.75rem;padding:7px 4px;">Private Key</button>
      </div>

      <!-- DERIVE section (HD derivation from same mnemonic) -->
      <div id="add-section-derive">
        <p class="subtitle" style="margin-bottom:12px;font-size:0.82rem;color:var(--text-secondary);">
          Derive a new account from your existing mnemonic using HD derivation (index 1, 2, 3&hellip;).
          Same seed phrase, different Falcon-512 keypair.
        </p>
        <div class="form-group">
          <label>Wallet Password</label>
          <input id="derive-password" type="password" placeholder="Enter your wallet password">
        </div>
        <div id="derive-error" class="error-msg hidden"></div>
        <button id="btn-derive-go" class="btn btn-primary full-width" style="margin-top:8px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:6px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          Derive Next Account
        </button>
      </div>

      <!-- MNEMONIC section -->
      <div id="add-section-mnemonic" style="display:none;">
        <p class="subtitle" style="margin-bottom:10px;font-size:0.82rem;color:var(--text-secondary);">Import an account from a different 24-word recovery phrase.</p>
        <div class="form-group">
          <label>Recovery Phrase (24 words)</label>
          <textarea id="add-account-phrase" rows="4" placeholder="word1 word2 ... word24" style="font-family:var(--mono);font-size:0.82rem;"></textarea>
        </div>
        <div id="add-account-error" class="error-msg hidden"></div>
        <button id="btn-add-account-go" class="btn btn-primary full-width" style="margin-top:8px;">Import Account</button>
      </div>

      <!-- PRIVATE KEY section -->
      <div id="add-section-privkey" style="display:none;">
        <p class="subtitle" style="margin-bottom:10px;font-size:0.82rem;color:var(--text-secondary);">Paste the <strong>combined key</strong> exported from the <strong>Export Keys</strong> panel (sk|pk format).</p>
        <div class="form-group">
          <label>Combined Key (sk|pk)</label>
          <textarea id="add-account-sk-hex" rows="4" placeholder="Paste your exported combined key here…" style="font-family:var(--mono);font-size:0.7rem;"></textarea>
        </div>
        <div id="add-account-pk-error" class="error-msg hidden"></div>
        <button id="btn-add-account-pk-go" class="btn btn-primary full-width" style="margin-top:8px;">Import from Key</button>
      </div>

    </div>
  </div>'''

if OLD_PANEL in html:
    html = html.replace(OLD_PANEL, NEW_PANEL)
    print('HTML: replaced add-account-panel')
else:
    print('HTML: PANEL NOT FOUND — check whitespace')

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)

# ─────────────────────────────────────────────────────────────────────────────
# JS — changes to popup.js
# ─────────────────────────────────────────────────────────────────────────────
js_path = r'e:\temp\quanta-wallet\extension\popup.js'
with open(js_path, encoding='utf-8') as f:
    js = f.read()

# 1. Replace addAccount() to default to derive tab and reset all 3 sections
OLD_ADD = """async function addAccount() {
  const accounts = await getAccounts();
  const total = 1 + accounts.length; // 1 primary + extras
  if (total >= MAX_ACCOUNTS) { toast('Maximum 10 accounts reached'); return; }

  // Show the inline add-account panel
  showPanel('add-account-panel');
  closePanel('account-panel');

  // Reset fields
  const phrEl = document.getElementById('add-account-phrase');
  const errEl = document.getElementById('add-account-error');
  const btn   = document.getElementById('btn-add-account-go');
  if (phrEl) phrEl.value = '';
  if (errEl) errEl.classList.add('hidden');
  if (btn)  { btn.disabled = false; btn.textContent = 'Import Account'; }
}"""

NEW_ADD = """async function addAccount() {
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
}"""

if OLD_ADD in js:
    js = js.replace(OLD_ADD, NEW_ADD)
    print('JS: replaced addAccount()')
else:
    print('JS: addAccount NOT FOUND')

# 2. Add doDerive() function right after doAddAccount() closes (before window.switchAccount line)
DERIVE_FN = """
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

"""

INSERT_BEFORE = '// Expose for inline onclick\nwindow.switchAccount = switchAccount;'
if INSERT_BEFORE in js:
    js = js.replace(INSERT_BEFORE, DERIVE_FN + INSERT_BEFORE)
    print('JS: inserted doDerive()')
else:
    print('JS: INSERT point not found')

# 3. Wire up the new tab buttons and derive button in the DOMContentLoaded event listener
# Find where btn-add-account-go and btn-add-account-pk-go are wired up
OLD_WIRE = """  document.getElementById('btn-add-account-go')?.addEventListener('click', doAddAccount);"""
NEW_WIRE = """  document.getElementById('btn-add-account-go')?.addEventListener('click', doAddAccount);
  document.getElementById('btn-derive-go')?.addEventListener('click', doDerive);
  document.getElementById('add-tab-derive')?.addEventListener('click', () => switchAddTab('derive'));
  document.getElementById('add-tab-mnemonic')?.addEventListener('click', () => switchAddTab('mnemonic'));
  document.getElementById('add-tab-privkey')?.addEventListener('click', () => switchAddTab('privkey'));"""

if OLD_WIRE in js:
    js = js.replace(OLD_WIRE, NEW_WIRE)
    print('JS: wired up derive button and tabs')
else:
    # Try to find it differently
    print('JS: wire point not found — searching...')
    for i, line in enumerate(js.splitlines(), 1):
        if 'btn-add-account-go' in line and 'addEventListener' in line:
            print(f'  Found at line {i}: {line.strip()}')

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)
print('Done.')
