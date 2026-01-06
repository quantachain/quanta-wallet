use serde::{Deserialize, Serialize};

/// Transaction types (matches QUANTA blockchain)
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum TransactionType {
    Transfer,
    Stake { amount: u64 },
    Unstake,
    ClaimStakingRewards,
}

/// Unsigned transaction
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UnsignedTransaction {
    pub sender: String,
    pub recipient: String,
    pub amount: u64, // microunits (1 QUA = 1,000,000)
    pub fee: u64,
    pub nonce: u64,
    pub timestamp: i64,
    #[serde(default)]
    pub tx_type: TransactionType,
}

/// Signed transaction (ready to broadcast)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SignedTransaction {
    pub sender: String,
    pub recipient: String,
    pub amount: u64,
    pub fee: u64,
    pub nonce: u64,
    pub timestamp: i64,
    pub signature: Vec<u8>,
    pub public_key: Vec<u8>,
    #[serde(default)]
    pub tx_type: TransactionType,
}

impl Default for TransactionType {
    fn default() -> Self {
        TransactionType::Transfer
    }
}

/// Account information from node
#[derive(Debug, Serialize, Deserialize)]
pub struct AccountInfo {
    pub address: String,
    pub balance_microunits: u64,
    pub nonce: u64,
}

impl AccountInfo {
    pub fn balance_qua(&self) -> f64 {
        self.balance_microunits as f64 / 1_000_000.0
    }
}

/// Balance response from API
#[derive(Debug, Serialize, Deserialize)]
pub struct BalanceResponse {
    pub address: String,
    pub balance_microunits: u64,
}

/// Transaction broadcast response
#[derive(Debug, Serialize, Deserialize)]
pub struct BroadcastResponse {
    pub success: bool,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub tx_hash: String,
}
