use pqcrypto_falcon::falcon512;
use pqcrypto_traits::sign::{PublicKey, SecretKey, SignedMessage};
use sha3::{Digest, Sha3_256};
use crate::types::{SignedTransaction, UnsignedTransaction};
use std::error::Error;

/// Sign transaction with Falcon-512
pub fn sign_transaction(
    tx: &UnsignedTransaction,
    private_key_bytes: &[u8],
    public_key_bytes: &[u8],
) -> Result<SignedTransaction, Box<dyn Error>> {
    // Hash transaction
    let tx_hash = hash_transaction(tx);
    
    // Load Falcon-512 secret key
    let sk = falcon512::SecretKey::from_bytes(private_key_bytes)?;
    
    // Sign
    let signed_msg = falcon512::sign(tx_hash.as_bytes(), &sk);
    
    Ok(SignedTransaction {
        sender: tx.sender.clone(),
        recipient: tx.recipient.clone(),
        amount: tx.amount,
        fee: tx.fee,
        nonce: tx.nonce,
        timestamp: tx.timestamp,
        signature: signed_msg.as_bytes().to_vec(),
        public_key: public_key_bytes.to_vec(),
        tx_type: tx.tx_type.clone(),
    })
}

/// Hash transaction (must match blockchain logic)
fn hash_transaction(tx: &UnsignedTransaction) -> String {
    let mut hasher = Sha3_256::new();
    hasher.update(tx.sender.as_bytes());
    hasher.update(tx.recipient.as_bytes());
    hasher.update(&tx.amount.to_le_bytes());
    hasher.update(&tx.fee.to_le_bytes());
    hasher.update(&tx.nonce.to_le_bytes());
    hasher.update(&tx.timestamp.to_le_bytes());
    
    // Include tx type
    match &tx.tx_type {
        crate::types::TransactionType::Transfer => hasher.update(&[0u8]),
        crate::types::TransactionType::Stake { amount } => {
            hasher.update(&[1u8]);
            hasher.update(&amount.to_le_bytes());
        }
        crate::types::TransactionType::Unstake => hasher.update(&[2u8]),
        crate::types::TransactionType::ClaimStakingRewards => hasher.update(&[3u8]),
    }
    
    hex::encode(hasher.finalize())
}

/// Verify signature (for testing)
pub fn verify_signature(
    tx: &SignedTransaction,
    public_key_bytes: &[u8],
) -> Result<bool, Box<dyn Error>> {
    let pk = falcon512::PublicKey::from_bytes(public_key_bytes)?;
    
    // Reconstruct unsigned tx for hashing
    let unsigned = UnsignedTransaction {
        sender: tx.sender.clone(),
        recipient: tx.recipient.clone(),
        amount: tx.amount,
        fee: tx.fee,
        nonce: tx.nonce,
        timestamp: tx.timestamp,
        tx_type: tx.tx_type.clone(),
    };
    
    let tx_hash = hash_transaction(&unsigned);
    
    // Verify signature by comparing recovered hash
    let signed_msg = SignedMessage::from_bytes(&tx.signature)
        .map_err(|e| format!("Invalid signature format: {:?}", e))?;
    
    match falcon512::open(&signed_msg, &pk) {
        Ok(opened_msg) => Ok(opened_msg == tx_hash.as_bytes()),
        Err(_) => Ok(false),
    }
}
