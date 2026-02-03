# Quanta Wallet Extension

A quantum-safe browser wallet for the Quanta Blockchain, featuring Falcon-512 post-quantum signatures implemented in WebAssembly.

## Features

- **Quantum Security**: Uses Falcon-512 digital signatures (NIST standardized).
- **Key Management**: Securely generates and stores keys locally.
- **DApp Integration**: Injects a provider API for decentralized applications to sign transactions.
- **WASM Performance**: Cryptographic operations are handled by a high-performance Rust/WASM module.

## Project Structure

- `src/`: Rust source code for the WASM module (crypto logic).
- `public/`: Extension frontend files (HTML, CSS, JS) and manifest.
- `wasm/`: Cargo project configuration for the WASM module.
- `test-dapp.html`: A simple test page to verify wallet injection and signing.

## building

See [BUILD.md](BUILD.md) for detailed build instructions.

Summary:
1. Install Rust and `wasm-pack`.
2. Navigate to `wasm/`.
3. Run: `wasm-pack build --target web --out-dir ../public/pkg`

## Installation

1. Open your browser (Chrome or Brave).
2. Go to `chrome://extensions`.
3. Enable "Developer mode" in the top right.
4. Click "Load unpacked".
5. Select the `public` folder in this repository.

## Usage

Once installed, the Quanta Wallet icon will appear in your browser toolbar. Click it to create a new wallet or import an existing one.

To test DApp connectivity, open `test-dapp.html` in your browser.
