/* tslint:disable */
/* eslint-disable */

/**
 * Compute the canonical signing hash for a given payload (debugging helper).
 * Returns 32-byte hash as lowercase hex.
 */
export function compute_signing_hash(tx_data_hex: string): string;

/**
 * Generate a fresh 24-word BIP39 mnemonic.
 */
export function generate_mnemonic(): string;

/**
 * Generate a fresh random Falcon-512 keypair + BIP39 mnemonic.
 *
 * Returns `{ mnemonic, address, public_key, secret_key }` (hex keys).
 * Caller MUST encrypt `secret_key` before storing it anywhere.
 */
export function generate_wallet(): any;

/**
 * Derive a Quanta address from a hex-encoded public key.
 */
export function get_address(pubkey_hex: string): string;

/**
 * Restore a wallet deterministically from a BIP39 mnemonic phrase.
 *
 * Uses `keygen(seed)` from falcon-rust which accepts a 32-byte seed and
 * produces a deterministic keypair — so the same mnemonic always gives the
 * same keys, enabling seedphrase-based recovery without storing the SK.
 *
 * Returns `{ address, public_key, secret_key }`.
 */
export function import_wallet(mnemonic_phrase: string, passphrase: string, index: number): any;

export function init_panic_hook(): void;

/**
 * Sign transaction data with a Falcon-512 secret key.
 *
 * `tx_data_hex`    — hex of the raw transaction payload bytes.
 * `secret_key_hex` — hex of the Falcon-512 secret key.
 *
 * Returns hex of raw Falcon-512 signature bytes.
 * The node's updated verify_signature_strict() calls:
 *   falcon_rust::verify(canonical_hash, &sig, &pk)
 * which expects ONLY the raw sig bytes (no appended message).
 */
export function sign_transaction(tx_data_hex: string, secret_key_hex: string): string;

/**
 * Validate a BIP39 mnemonic phrase. Returns `true` if valid.
 */
export function validate_mnemonic(phrase: string): boolean;

/**
 * Verify a Falcon-512 signature (for local sanity-checking before submission).
 *
 * `hash_hex`       — hex of the 32-byte canonical signing hash.
 * `signed_msg_hex` — hex of the full signed-message blob (sig || hash).
 * `pubkey_hex`     — hex of the 897-byte Falcon-512 public key.
 *
 * Returns `true` only on a strict cryptographic success.
 */
export function verify_signature(hash_hex: string, signed_msg_hex: string, pubkey_hex: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly compute_signing_hash: (a: number, b: number) => [number, number, number, number];
    readonly generate_mnemonic: () => [number, number, number, number];
    readonly generate_wallet: () => [number, number, number];
    readonly get_address: (a: number, b: number) => [number, number, number, number];
    readonly import_wallet: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly init_panic_hook: () => void;
    readonly sign_transaction: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly validate_mnemonic: (a: number, b: number) => number;
    readonly verify_signature: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
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
