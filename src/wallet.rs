use pqcrypto_falcon::falcon512;
use pqcrypto_traits::sign::{PublicKey, SecretKey};
use sha3::{Digest, Sha3_256};
use crate::storage::{Storage, WalletFile};
use crate::signing::sign_transaction;
use crate::rpc::RpcClient;
use crate::types::{UnsignedTransaction, TransactionType};
use crate::mnemonic::private_key_to_mnemonic;
use std::error::Error;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct Wallet {
    storage: Storage,
    rpc_client: Option<RpcClient>,
}

impl Wallet {
    pub fn new(node_url: Option<&str>, wallet_dir: Option<&str>) -> Self {
        let rpc_client = node_url.map(|url| RpcClient::new(url));
        let storage = Storage::new(wallet_dir);
        
        Self {
            storage,
            rpc_client,
        }
    }
    
    /// Create new wallet
    pub fn create(&self, password: &str) -> Result<(String, String), Box<dyn Error>> {
        // Generate Falcon-512 keypair
        let (pk, sk) = falcon512::keypair();
        
        // Derive address from public key
        let address = self.public_key_to_address(pk.as_bytes());
        
        // Get mnemonic
        let mnemonic = private_key_to_mnemonic(sk.as_bytes());
        
        // Save wallet
        let wallet_file = WalletFile {
            address: address.clone(),
            encrypted_private_key: crate::crypto::encrypt(sk.as_bytes(), password)?,
            public_key: pk.as_bytes().to_vec(),
            created_at: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64,
        };
        
        self.storage.save_wallet(&wallet_file, password)?;
        
        Ok((address, mnemonic))
    }
    
    /// Import wallet from mnemonic
    pub fn import(&self, mnemonic: &str, password: &str) -> Result<String, Box<dyn Error>> {
        let private_key_bytes = crate::mnemonic::mnemonic_to_private_key(mnemonic)?;
        
        // Recover public key (note: need proper Falcon key derivation)
        let _sk = falcon512::SecretKey::from_bytes(&private_key_bytes)?;
        let (pk, _) = falcon512::keypair(); // In production, derive from SK
        
        let address = self.public_key_to_address(pk.as_bytes());
        
        let wallet_file = WalletFile {
            address: address.clone(),
            encrypted_private_key: crate::crypto::encrypt(&private_key_bytes, password)?,
            public_key: pk.as_bytes().to_vec(),
            created_at: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64,
        };
        
        self.storage.save_wallet(&wallet_file, password)?;
        
        Ok(address)
    }
    
    /// Get balance
    pub async fn get_balance(&self, address: &str) -> Result<u64, Box<dyn Error>> {
        match &self.rpc_client {
            Some(client) => client.get_balance(address).await,
            None => Err("No RPC client configured".into()),
        }
    }
    
    /// Send transaction
    pub async fn send(
        &self,
        from_address: &str,
        to_address: &str,
        amount_qua: f64,
        password: &str,
    ) -> Result<String, Box<dyn Error>> {
        // Load wallet
        let wallet_file = self.storage.load_wallet(from_address, password)?;
        
        // Get nonce
        let rpc = self.rpc_client.as_ref().ok_or("No RPC client")?;
        let nonce = rpc.get_nonce(from_address).await?;
        
        // Convert QUA to microunits
        let amount_microunits = (amount_qua * 1_000_000.0) as u64;
        let fee_microunits = 1_000; // 0.001 QUA minimum
        
        // Create unsigned transaction
        let unsigned_tx = UnsignedTransaction {
            sender: from_address.to_string(),
            recipient: to_address.to_string(),
            amount: amount_microunits,
            fee: fee_microunits,
            nonce: nonce + 1,
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as i64,
            tx_type: TransactionType::Transfer,
        };
        
        // Decrypt private key
        let private_key_bytes = crate::crypto::decrypt(&wallet_file.encrypted_private_key, password)?;
        
        // Sign transaction
        let signed_tx = sign_transaction(&unsigned_tx, &private_key_bytes, &wallet_file.public_key)?;
        
        // Broadcast
        let tx_hash = rpc.broadcast_transaction(&signed_tx).await?;
        
        Ok(tx_hash)
    }
    
    /// List all wallets
    pub fn list(&self) -> Result<Vec<String>, Box<dyn Error>> {
        self.storage.list_wallets()
    }
    
    /// Export mnemonic
    pub fn export_mnemonic(&self, address: &str, password: &str) -> Result<String, Box<dyn Error>> {
        let wallet_file = self.storage.load_wallet(address, password)?;
        let private_key_bytes = crate::crypto::decrypt(&wallet_file.encrypted_private_key, password)?;
        Ok(private_key_to_mnemonic(&private_key_bytes))
    }
    
    /// Derive address from public key
    fn public_key_to_address(&self, public_key: &[u8]) -> String {
        let mut hasher = Sha3_256::new();
        hasher.update(public_key);
        let hash = hasher.finalize();
        format!("Q{}", hex::encode(&hash[0..20]))
    }
}
