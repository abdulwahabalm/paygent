#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, String, Symbol};

// Minimum payments per tier (in stroops; 1 XLM = 10_000_000 stroops)
const SEARCH_MIN: i128    = 1_000_000; // 0.1 XLM
const NEWS_MIN: i128      = 2_000_000; // 0.2 XLM
const FINANCIAL_MIN: i128 = 3_000_000; // 0.3 XLM

#[contracttype]
pub enum DataKey {
    UsedMemo(String),
}

#[contract]
pub struct PaywallContract;

#[contractimpl]
impl PaywallContract {
    /// Called by the gateway after verifying a Horizon payment.
    /// Validates the amount covers a tier, records the memo on-chain
    /// to prevent replay attacks, and returns the tier name.
    pub fn record_payment(env: Env, memo: String, amount_stroops: i128) -> Symbol {
        let key = DataKey::UsedMemo(memo);
        if env.storage().persistent().has(&key) {
            panic!("memo already used");
        }
        let tier = resolve_tier(amount_stroops);
        env.storage().persistent().set(&key, &tier);
        env.storage().persistent().extend_ttl(&key, 100_000, 100_000);
        tier
    }

    /// Returns the tier recorded for a memo (errors if not found).
    pub fn get_tier(env: Env, memo: String) -> Symbol {
        env.storage()
            .persistent()
            .get(&DataKey::UsedMemo(memo))
            .expect("memo not found")
    }

    /// Returns true if the memo has already been used.
    pub fn is_memo_used(env: Env, memo: String) -> bool {
        env.storage().persistent().has(&DataKey::UsedMemo(memo))
    }

    /// Returns the tier name for a given amount in stroops.
    /// Useful for on-chain pricing queries.
    pub fn tier_for_amount(_env: Env, amount_stroops: i128) -> Symbol {
        resolve_tier(amount_stroops)
    }
}

fn resolve_tier(amount_stroops: i128) -> Symbol {
    if amount_stroops >= FINANCIAL_MIN {
        symbol_short!("financial")
    } else if amount_stroops >= NEWS_MIN {
        symbol_short!("news")
    } else if amount_stroops >= SEARCH_MIN {
        symbol_short!("search")
    } else {
        panic!("amount below minimum (0.1 XLM)")
    }
}
