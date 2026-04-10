#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Env, String, Symbol, Address};

// Default prices in stroops (1 XLM = 10_000_000)
const DEFAULT_SEARCH:    i128 = 1_000_000; // 0.1 XLM
const DEFAULT_NEWS:      i128 = 2_000_000; // 0.2 XLM
const DEFAULT_FINANCIAL: i128 = 3_000_000; // 0.3 XLM
const DEFAULT_EXTRACT:   i128 = 1_000_000; // 0.1 XLM
const DEFAULT_IMAGE_OCR: i128 = 2_000_000; // 0.2 XLM

#[contracttype]
pub enum DataKey {
    UsedMemo(String),
    Price(Symbol),
    Admin,
}

#[contract]
pub struct PaywallContract;

#[contractimpl]
impl PaywallContract {
    /// One-time initialisation — sets the admin address.
    /// Subsequent calls panic so the admin cannot be overwritten.
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialised");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Admin-only: update the minimum price for a tier.
    pub fn set_price(env: Env, tier: Symbol, amount_stroops: i128) {
        let admin: Address = env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialised");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Price(tier), &amount_stroops);
    }

    /// Read the minimum price (in stroops) for a tier.
    /// Falls back to compile-time defaults if the admin has not overridden them.
    pub fn get_price(env: Env, tier: Symbol) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Price(tier.clone()))
            .unwrap_or_else(|| default_price(tier))
    }

    /// Called by the gateway after verifying a Horizon payment.
    /// Validates the amount covers a tier, records the memo on-chain
    /// to prevent replay attacks, and returns the tier name.
    pub fn record_payment(env: Env, memo: String, amount_stroops: i128) -> Symbol {
        let key = DataKey::UsedMemo(memo);
        if env.storage().persistent().has(&key) {
            panic!("memo already used");
        }
        let tier = resolve_tier(&env, amount_stroops);
        env.storage().persistent().set(&key, &tier);
        env.storage().persistent().extend_ttl(&key, 100_000, 100_000);
        tier
    }

    /// Returns the tier recorded for a memo (panics if not found).
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
}

fn default_price(tier: Symbol) -> i128 {
    if tier == symbol_short!("financial") { DEFAULT_FINANCIAL }
    else if tier == symbol_short!("news")      { DEFAULT_NEWS }
    else if tier == symbol_short!("search")    { DEFAULT_SEARCH }
    else if tier == symbol_short!("extract")   { DEFAULT_EXTRACT }
    else if tier == symbol_short!("image_ocr") { DEFAULT_IMAGE_OCR }
    else { panic!("unknown tier") }
}

fn resolve_tier(env: &Env, amount_stroops: i128) -> Symbol {
    let financial = env.storage().instance()
        .get(&DataKey::Price(symbol_short!("financial")))
        .unwrap_or(DEFAULT_FINANCIAL);
    let news = env.storage().instance()
        .get(&DataKey::Price(symbol_short!("news")))
        .unwrap_or(DEFAULT_NEWS);
    let search = env.storage().instance()
        .get(&DataKey::Price(symbol_short!("search")))
        .unwrap_or(DEFAULT_SEARCH);

    if amount_stroops >= financial      { symbol_short!("financial") }
    else if amount_stroops >= news      { symbol_short!("news") }
    else if amount_stroops >= search    { symbol_short!("search") }
    else { panic!("amount below minimum") }
}
