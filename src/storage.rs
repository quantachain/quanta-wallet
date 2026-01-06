use std::fs;
use std::path::PathBuf;
use crate::crypto::{encrypt, decrypt, EncryptedData};
use std::error::Error;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct WalletFile {
    pub address: String,
    pub encrypted_private_key: EncryptedData,
    pub public_key: Vec<u8>,
    pub created_at: i64,
}

pub struct Storage {
    wallet_dir: PathBuf,
}

impl Storage {
    pub fn new(wallet_dir: Option<&str>) -> Self {
        let dir = if let Some(custom_dir) = wallet_dir {
            PathBuf::from(custom_dir)
        } else {
            // Default: ~/.quanta-wallet
            dirs::home_dir()
                .expect("Could not find home directory")
                .join(".quanta-wallet")
        };
        
        // Create directory if needed
        fs::create_dir_all(&dir).expect("Failed to create wallet directory");
        
        Self { wallet_dir: dir }
    }
    
    /// Save encrypted wallet
    pub fn save_wallet(&self, wallet: &WalletFile, password: &str) -> Result<(), Box<dyn Error>> {
        let wallet_json = serde_json::to_string(wallet)?;
        let encrypted = encrypt(wallet_json.as_bytes(), password)?;
        
        let file_path = self.wallet_path(&wallet.address);
        let encrypted_json = serde_json::to_string(&encrypted)?;
        fs::write(file_path, encrypted_json)?;
        
        Ok(())
    }
    
    /// Load encrypted wallet
    pub fn load_wallet(&self, address: &str, password: &str) -> Result<WalletFile, Box<dyn Error>> {
        let file_path = self.wallet_path(address);
        
        if !file_path.exists() {
            return Err(format!("Wallet not found: {}", address).into());
        }
        
        let encrypted_json = fs::read_to_string(file_path)?;
        let encrypted: EncryptedData = serde_json::from_str(&encrypted_json)?;
        
        let decrypted = decrypt(&encrypted, password)?;
        let wallet: WalletFile = serde_json::from_slice(&decrypted)?;
        
        Ok(wallet)
    }
    
    /// List all wallets
    pub fn list_wallets(&self) -> Result<Vec<String>, Box<dyn Error>> {
        let mut wallets = Vec::new();
        
        for entry in fs::read_dir(&self.wallet_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.extension().and_then(|s| s.to_str()) == Some("qua") {
                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                    wallets.push(name.to_string());
                }
            }
        }
        
        Ok(wallets)
    }
    
    /// Delete wallet
    pub fn delete_wallet(&self, address: &str) -> Result<(), Box<dyn Error>> {
        let file_path = self.wallet_path(address);
        fs::remove_file(file_path)?;
        Ok(())
    }
    
    /// Check if wallet exists
    pub fn wallet_exists(&self, address: &str) -> bool {
        self.wallet_path(address).exists()
    }
    
    fn wallet_path(&self, address: &str) -> PathBuf {
        self.wallet_dir.join(format!("{}.qua", address))
    }
}
