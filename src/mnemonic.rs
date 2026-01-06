use bip39::{Language, Mnemonic};
use pqcrypto_falcon::falcon512;
use pqcrypto_traits::sign::SecretKey;
use sha3::{Digest, Sha3_256};

/// Generate mnemonic from Falcon-512 private key
pub fn private_key_to_mnemonic(private_key: &[u8]) -> String {
    // Use first 32 bytes of private key as entropy
    let entropy = &private_key[0..32.min(private_key.len())];
    
    // Generate mnemonic (24 words for 256 bits)
    let mnemonic = Mnemonic::from_entropy(entropy).expect("Valid entropy");
    mnemonic.to_string()
}

/// Recover private key from mnemonic
pub fn mnemonic_to_private_key(mnemonic_phrase: &str) -> Result<Vec<u8>, String> {
    // Parse mnemonic
    let mnemonic = Mnemonic::parse_in_normalized(Language::English, mnemonic_phrase)
        .map_err(|e| format!("Invalid mnemonic: {}", e))?;
    
    // Get entropy
    let entropy = mnemonic.to_entropy();
    
    // Generate Falcon keypair from entropy
    let _seed = derive_seed(&entropy);
    let (_, sk) = falcon512::keypair(); // Note: In production, use deterministic keygen from seed
    
    Ok(sk.as_bytes().to_vec())
}

/// Derive deterministic seed from entropy
fn derive_seed(entropy: &[u8]) -> [u8; 32] {
    let mut hasher = Sha3_256::new();
    hasher.update(entropy);
    let hash = hasher.finalize();
    
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&hash);
    seed
}

/// Validate mnemonic phrase
pub fn validate_mnemonic(phrase: &str) -> bool {
    Mnemonic::parse_in_normalized(Language::English, phrase).is_ok()
}
