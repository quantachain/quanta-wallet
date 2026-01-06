# QUANTA Wallet

**Quantum-safe wallet for QUANTA blockchain**

Built with Falcon-512 post-quantum signatures for future-proof security.

## Features

 **Quantum-Resistant** - Falcon-512 NIST-approved signatures  
 **Encrypted Storage** - AES-256-GCM + Argon2 key derivation  
 **Mnemonic Backup** - BIP39-compatible 12/24 word phrases  
 **Simple CLI** - Easy to use command-line interface  
 **No Database** - Everything stored locally, encrypted  

## Quick Start

```bash
# Generate new wallet
cargo run -- new

# Check balance
cargo run -- balance

# Send transaction
cargo run -- send --to 0x... --amount 10.5

# Export mnemonic (backup)
cargo run -- export
```

## Security

- Private keys NEVER leave your device
- All storage encrypted with user password
- Argon2id password hashing (industry standard)
- Falcon-512 quantum-resistant signatures

## Installation

```bash
cargo build --release
./target/release/quanta-wallet --help
```

## Node Connection

By default, connects to `http://localhost:3000` (QUANTA node).

Configure with:
```bash
export QUANTA_NODE=http://your-node:3000
```

**License:** MIT  
**Built for:** QUANTA Blockchain  
**Security:** Quantum-resistant from day 1
