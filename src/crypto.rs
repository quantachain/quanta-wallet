use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2, PasswordHash,
};
use serde::{Deserialize, Serialize};
use std::error::Error;

const NONCE_SIZE: usize = 12; // 96 bits for AES-GCM

/// Encrypted data container
#[derive(Serialize, Deserialize)]
pub struct EncryptedData {
    pub ciphertext: Vec<u8>,
    pub nonce: Vec<u8>,
    pub salt: String, // Argon2 salt
}

/// Encrypt data with password
pub fn encrypt(data: &[u8], password: &str) -> Result<EncryptedData, Box<dyn Error>> {
    // Generate salt for password hashing
    let salt = SaltString::generate(&mut OsRng);
    
    // Derive key from password using Argon2id
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Argon2 error: {}", e))?
        .to_string();
    
    // Extract key bytes (first 32 bytes of hash)
    let parsed_hash = PasswordHash::new(&password_hash)
        .map_err(|e| format!("Hash parse error: {}", e))?;
    let hash = parsed_hash.hash.ok_or("No hash generated")?;
    let key_bytes = hash.as_bytes();
    
    let key = &key_bytes[0..32];
    
    // Create cipher
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Cipher error: {}", e))?;
    
    // Generate random nonce
    let nonce_bytes: [u8; NONCE_SIZE] = rand::random();
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    // Encrypt
    let ciphertext = cipher.encrypt(nonce, data)
        .map_err(|e| format!("Encryption error: {}", e))?;
    
    Ok(EncryptedData {
        ciphertext,
        nonce: nonce_bytes.to_vec(),
        salt: salt.to_string(),
    })
}

/// Decrypt data with password
pub fn decrypt(encrypted: &EncryptedData, password: &str) -> Result<Vec<u8>, Box<dyn Error>> {
    // Parse salt
    let salt = SaltString::from_b64(&encrypted.salt)
        .map_err(|e| format!("Salt parsing error: {}", e))?;
    
    // Derive key from password
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Argon2 error: {}", e))?
        .to_string();
    
    // Extract key bytes
    let parsed_hash = PasswordHash::new(&password_hash)
        .map_err(|e| format!("Hash parse error: {}", e))?;
    let hash = parsed_hash.hash.ok_or("No hash generated")?;
    let key_bytes = hash.as_bytes();
    
    let key = &key_bytes[0..32];
    
    // Create cipher
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Cipher error: {}", e))?;
    
    // Decrypt
    let nonce = Nonce::from_slice(&encrypted.nonce);
    let plaintext = cipher.decrypt(nonce, encrypted.ciphertext.as_ref())
        .map_err(|e| format!("Decryption error: {}", e))?;
    
    Ok(plaintext)
}

/// Verify password without decrypting (for login)
pub fn verify_password(encrypted: &EncryptedData, password: &str) -> bool {
    let salt = match SaltString::from_b64(&encrypted.salt) {
        Ok(s) => s,
        Err(_) => return false,
    };
    
    let argon2 = Argon2::default();
    let _password_hash = match argon2.hash_password(password.as_bytes(), &salt) {
        Ok(h) => h.to_string(),
        Err(_) => return false,
    };
    
    // Try to decrypt to verify password
    decrypt(encrypted, password).is_ok()
}
