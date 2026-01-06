use reqwest::Client;
use crate::types::{AccountInfo, BalanceResponse, SignedTransaction};
use std::error::Error;

pub struct RpcClient {
    base_url: String,
    client: Client,
}

impl RpcClient {
    pub fn new(node_url: &str) -> Self {
        Self {
            base_url: node_url.trim_end_matches('/').to_string(),
            client: Client::new(),
        }
    }
    
    /// Get account balance
    pub async fn get_balance(&self, address: &str) -> Result<u64, Box<dyn Error>> {
        let url = format!("{}/api/balance/{}", self.base_url, address);
        let response: BalanceResponse = self.client.get(&url).send().await?.json().await?;
        Ok(response.balance_microunits)
    }
    
    /// Get full account info
    pub async fn get_account_info(&self, address: &str) -> Result<AccountInfo, Box<dyn Error>> {
        let url = format!("{}/api/account/{}", self.base_url, address);
        let info: AccountInfo = self.client.get(&url).send().await?.json().await?;
        Ok(info)
    }
    
    /// Get current nonce for address
    pub async fn get_nonce(&self, address: &str) -> Result<u64, Box<dyn Error>> {
        let info = self.get_account_info(address).await?;
        Ok(info.nonce)
    }
    
    /// Broadcast signed transaction
    pub async fn broadcast_transaction(&self, tx: &SignedTransaction) -> Result<String, Box<dyn Error>> {
        let url = format!("{}/api/transaction/broadcast", self.base_url);
        
        let response = self.client
            .post(&url)
            .json(tx)
            .send()
            .await?;
        
        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Broadcast failed: {}", error_text).into());
        }
        
        let result: serde_json::Value = response.json().await?;
        Ok(result["tx_hash"].as_str().unwrap_or("unknown").to_string())
    }
    
    /// Check node health
    pub async fn health_check(&self) -> Result<bool, Box<dyn Error>> {
        let url = format!("{}/api/stats", self.base_url);
        let response = self.client.get(&url).send().await?;
        Ok(response.status().is_success())
    }
}
