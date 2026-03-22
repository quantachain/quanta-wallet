/* tslint:disable */
/* eslint-disable */

/**
 * Compute the canonical signing hash for a given transaction payload.
 * Useful for hardware wallet integrations.
 * Returns 32-byte hash as hex.
 */
export function compute_signing_hash(tx_data_hex: string): string;

/**
 * Generate a fresh BIP39 24-word mnemonic (for display before key generation).
 */
export function generate_mnemonic(): string;

/**
 * Generate a fresh random Falcon-512 keypair and a fresh BIP39 mnemonic.
 *
 * Returns a JSON object: `{ mnemonic, address, public_key, secret_key }`
 * where `public_key` and `secret_key` are lowercase hex strings.
 *
 * The caller is responsible for:
 * 1. Displaying `mnemonic` ONCE and asking the user to back it up.
 * 2. Encrypting `secret_key` before storing (use `encrypt_secret_key()`).
 * 3. Zeroizing `secret_key` from JS memory as soon as possible.
 */
export function generate_wallet(): any;

/**
 * Derive a Quanta address from a hex-encoded Falcon-512 public key.
 * Formula: `"0x" + hex(SHA3-256(pubkey)[..20])`
 */
export function get_address(pubkey_hex: string): string;

/**
 * Import an existing wallet from a BIP39 mnemonic phrase.
 *
 * Generates the `index`-th account keypair deterministically from the mnemonic.
 * Returns `{ address, public_key, secret_key }`.
 *
 * IMPORTANT: `secret_key` must be encrypted before storing.
 */
export function import_wallet(mnemonic_phrase: string, passphrase: string, index: number): any;

export function init_panic_hook(): void;

/**
 * Sign transaction data with a Falcon-512 secret key.
 *
 * `tx_data_hex`  — hex-encoded raw transaction bytes to sign.
 * `secret_key_hex` — hex-encoded Falcon-512 secret key.
 *
 * Returns the hex-encoded signed-message blob (signature || message),
 * ready to be sent as `signature` in the transaction JSON.
 *
 * The signing hash is `SHA3-256(SIGNING_DOMAIN || tx_data)`, matching
 * `sign_transaction_canonical()` in the chain's signatures.rs.
 */
export function sign_transaction(tx_data_hex: string, secret_key_hex: string): string;

/**
 * Validate a BIP39 mnemonic phrase. Returns `true` if valid.
 */
export function validate_mnemonic(phrase: string): boolean;

/**
 * Verify a Falcon-512 signature.
 *
 * `hash_hex`      — hex of the 32-byte canonical signing hash.
 * `signature_hex` — hex of the signed-message blob.
 * `pubkey_hex`    — hex of the 897-byte Falcon-512 public key.
 *
 * Returns `true` only on a strict cryptographic success.
 */
export function verify_signature(hash_hex: string, signature_hex: string, pubkey_hex: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly init_panic_hook: () => void;
    readonly generate_wallet: () => [number, number, number];
    readonly import_wallet: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly sign_transaction: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly verify_signature: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly get_address: (a: number, b: number) => [number, number, number, number];
    readonly generate_mnemonic: () => [number, number, number, number];
    readonly validate_mnemonic: (a: number, b: number) => number;
    readonly compute_signing_hash: (a: number, b: number) => [number, number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
