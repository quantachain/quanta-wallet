# Quanta Wallet

A post-quantum browser extension wallet for QuantaChain (QUA).

Built on the NIST-standardised Falcon-512 signature scheme, compiled to WebAssembly via Rust and wasm-pack. No classical elliptic-curve cryptography is used anywhere in the signing path.

---

## Features

- Falcon-512 post-quantum key generation and transaction signing (PQC Level 5)
- BIP-39 24-word mnemonic with deterministic HD key derivation
- Multi-account support with named accounts
- AES-GCM + PBKDF2 encrypted local storage (password-protected)
- Auto-lock with configurable idle timeout
- Send QUA transactions with live gas fee display
- Sign arbitrary messages (QUANTA_MSG_V1 domain-separated)
- dApp RPC interface: connect, sign transaction, sign message
- Testnet / Mainnet network switching
- Activity history per account
- Import wallet by mnemonic phrase or raw private key (sk|pk hex)
- Export private key and mnemonic backup
- Chrome Manifest V3 service worker architecture

---

## Cryptography

Key generation and signing use the falcon-rust pure-Rust implementation of Falcon-512, compiled to WASM. This is the same library used by the QuantaChain node, ensuring byte-identical signature output across all signing paths.

Derivation path:

```
BIP-39 mnemonic
    -> seed = mnemonic.to_seed("")
    -> master_key = HMAC-SHA3-256("Quanta HD Wallet Master Key", seed)
    -> account_key[i] = HMAC-SHA3-256(master_key, i.to_be_bytes())
    -> keypair = falcon512::keygen(account_key[i])   -- deterministic
    -> address = "0x" + hex(SHA3-256(public_key)[0..20])
```

Wallet storage encryption:

```
password -> PBKDF2-SHA256 (600,000 iterations) -> AES-256-GCM key
encrypted blob = AES-GCM(secret_key_bytes || metadata)
```

The session key is stored only in chrome.storage.session and is cleared on lock or service-worker restart.

---

## Installation (Developer / Unpacked)

1. Clone or download this repository.
2. Open Chrome and navigate to chrome://extensions.
3. Enable "Developer mode" in the top-right corner.
4. Click "Load unpacked" and select the `extension/` directory.
5. The Quanta Wallet icon will appear in the browser toolbar.

---

## Building the WASM Module

The WASM module in `extension/pkg/` is pre-built. To rebuild from source:

```bash
# Requires Rust toolchain + wasm-pack
cd quanta-wasm
wasm-pack build --target web --out-dir ../quanta-wallet/extension/pkg
```

---

## dApp RPC API

Pages can communicate with the wallet via window.postMessage. Supported methods:

- quanta_connect -- request account access, returns address and public key
- quanta_sendTransaction -- prompt user to sign and submit a transaction
- quanta_signMessage -- prompt user to sign an arbitrary message

The injected provider is available at window.quanta after the extension loads.

---

## File Structure

```
extension/
    manifest.json       -- Chrome MV3 manifest
    popup.html          -- Main wallet UI
    popup.js            -- Wallet logic (accounts, signing, RPC)
    background.js       -- Service worker (lock, alarm, RPC relay)
    content.js          -- Content script bridge
    injected.js         -- window.quanta provider injected into pages
    style.css           -- UI styles
    offscreen.html/.js  -- Offscreen document for WASM in service worker
    pkg/                -- Compiled WASM module (falcon-rust + HD derivation)
    icons/              -- Extension icons (16, 32, 48, 128 px)
```

---

## Version History

- 1.0.4 -- Session expiry fix (MV3 service worker wake detection); deterministic HD key derivation fix; /transactions page in QuaScan
- 1.0.3 -- dApp RPC sign message support; activity history; auto-lock improvements
- 1.0.2 -- Multi-account HD wallet; account switching; encrypted storage
- 1.0.1 -- Testnet/mainnet switching; send flow improvements
- 1.0.0 -- Initial release; Falcon-512 key generation and signing

---

## License

MIT
