/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const init_panic_hook: () => void;
export const generate_wallet: () => [number, number, number];
export const import_wallet: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
export const sign_transaction: (a: number, b: number, c: number, d: number) => [number, number, number, number];
export const verify_signature: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
export const get_address: (a: number, b: number) => [number, number, number, number];
export const generate_mnemonic: () => [number, number, number, number];
export const validate_mnemonic: (a: number, b: number) => number;
export const compute_signing_hash: (a: number, b: number) => [number, number, number, number];
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_exn_store: (a: number) => void;
export const __externref_table_alloc: () => number;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __externref_table_dealloc: (a: number) => void;
export const __wbindgen_start: () => void;
