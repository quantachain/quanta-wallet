mod types;
mod crypto;
mod signing;
mod mnemonic;
mod rpc;
mod storage;
mod wallet;

use clap::{Parser, Subcommand};
use wallet::Wallet;
use std::error::Error;

#[derive(Parser)]
#[command(name = "quanta-wallet")]
#[command(about = "QUANTA Quantum-Safe Wallet", long_about = None)]
struct Cli {
    /// Node URL (default: http://localhost:3000)
    #[arg(long, default_value = "http://localhost:3000")]
    node: String,
    
    /// Wallet directory (default: ~/.quanta-wallet)
    #[arg(long)]
    wallet_dir: Option<String>,
    
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Create new wallet
    New,
    
    /// Import wallet from mnemonic
    Import {
        /// Mnemonic phrase (24 words)
        #[arg(long)]
        mnemonic: String,
    },
    
    /// List all wallets
    List,
    
    /// Get balance
    Balance {
        /// Wallet address
        address: String,
    },
    
    /// Send QUA
    Send {
        /// From address
        #[arg(long)]
        from: String,
        
        /// To address
        #[arg(long)]
        to: String,
        
        /// Amount in QUA
        #[arg(long)]
        amount: f64,
    },
    
    /// Export mnemonic
    Export {
        /// Wallet address
        address: String,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let cli = Cli::parse();
    
    let wallet = Wallet::new(
        Some(&cli.node),
        cli.wallet_dir.as_deref(),
    );
    
    match cli.command {
        Commands::New => {
            let password = rpassword::prompt_password("Enter password: ")?;
            let confirm = rpassword::prompt_password("Confirm password: ")?;
            
            if password != confirm {
                return Err("Passwords don't match".into());
            }
            
            let (address, mnemonic) = wallet.create(&password)?;
            
            println!("✓ Wallet created!");
            println!("\nAddress: {}", address);
            println!("\nMnemonic (SAVE THIS SECURELY):");
            println!("{}", mnemonic);
            println!("\nWARNING: Store your mnemonic in a safe place. You'll need it to recover your wallet.");
        }
        
        Commands::Import { mnemonic } => {
            let password = rpassword::prompt_password("Enter new password: ")?;
            let confirm = rpassword::prompt_password("Confirm password: ")?;
            
            if password != confirm {
                return Err("Passwords don't match".into());
            }
            
            let address = wallet.import(&mnemonic, &password)?;
            println!("✓ Wallet imported!");
            println!("Address: {}", address);
        }
        
        Commands::List => {
            let wallets = wallet.list()?;
            
            if wallets.is_empty() {
                println!("No wallets found. Create one with: quanta-wallet new");
            } else {
                println!("Wallets:");
                for addr in wallets {
                    println!("  {}", addr);
                }
            }
        }
        
        Commands::Balance { address } => {
            let balance_microunits = wallet.get_balance(&address).await?;
            let balance_qua = balance_microunits as f64 / 1_000_000.0;
            
            println!("Address: {}", address);
            println!("Balance: {:.6} QUA", balance_qua);
            println!("         {} microunits", balance_microunits);
        }
        
        Commands::Send { from, to, amount } => {
            let password = rpassword::prompt_password("Enter wallet password: ")?;
            
            println!("Sending {:.6} QUA from {} to {}", amount, from, to);
            
            let tx_hash = wallet.send(&from, &to, amount, &password).await?;
            
            println!("✓ Transaction broadcast!");
            println!("TX Hash: {}", tx_hash);
        }
        
        Commands::Export { address } => {
            let password = rpassword::prompt_password("Enter wallet password: ")?;
            
            let mnemonic = wallet.export_mnemonic(&address, &password)?;
            
            println!("Mnemonic for {}:", address);
            println!("{}", mnemonic);
            println!("\nWARNING: Keep this secret!");
        }
    }
    
    Ok(())
}
