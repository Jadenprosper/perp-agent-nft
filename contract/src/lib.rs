//! Perp Agent NFT — NEP-171 token that IS a Hyperliquid trading agent.
//!
//! First drop: max supply 100. One unique agent NFT per wallet.
//! Mint in-app on NEAR testnet (not a marketplace). Own the NFT = own the agent.
//! Transfer the NFT → transfer the agent. Old owner loses control.

use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LazyOption, LookupMap, UnorderedMap};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};
use std::collections::HashMap;

/// First-drop hard cap.
pub const MAX_SUPPLY: u64 = 100;

const TITLES: &[&str] = &[
    "Captain Stop-Loss",
    "Lord Leverage",
    "Dame Liquidation",
    "Sir Scalp-a-Lot",
    "Funding Fiona",
    "Margin Marty",
    "The Bid Whisperer",
    "Duke of Drawdown",
    "Baron Break-Even",
    "Queen of Quicksilver",
    "Professor Take-Profit",
    "Count Candlewick",
    "Lady Limit-Order",
    "General Gridlock",
    "Oracle Ollie",
    "Volatility Vince",
    "Miss Mark-to-Market",
    "Chief Chart Goblin",
    "Senpai Short-Squeeze",
    "Auntie Alpha",
];

const HELMS: &[&str] = &[
    "neon visor",
    "tinfoil crown",
    "pilot goggles",
    "degen bandana",
    "laser monocle",
    "chart-print beanie",
];
const BODIES: &[&str] = &[
    "chrome chassis",
    "matte void suit",
    "pastel armor",
    "circuit kimono",
    "carbon trench",
    "hologram hoodie",
];
const GEAR: &[&str] = &[
    "TP/SL twin pistols",
    "funding-rate abacus",
    "liquidation lasso",
    "orderbook shield",
    "candle stick",
    "risk slider wand",
];
const AURAS: &[&str] = &[
    "mint glow",
    "pink panic haze",
    "violet calm",
    "amber tilt",
    "lime degen blaze",
    "ice-cold blue",
];
const CATCHPHRASES: &[&str] = &[
    "size responsibly or i riot",
    "i only long my own bags",
    "stop-loss is a love language",
    "funding paid my rent",
    "charts lied, i believed",
    "paper hands fear me",
];

/// On-chain generated look for the robot trader.
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct AgentTraits {
    pub name: String,
    pub helm: String,
    pub body: String,
    pub gear: String,
    pub aura: String,
    pub catchphrase: String,
    /// seed used for generation (token id + block)
    pub seed: u64,
    /// mood derived from performance: hyped | locked_in | tilt | zen | rugged
    pub mood: String,
    /// simple PnL score the agent service updates (basis points-ish)
    pub performance_bps: i32,
}

/// On-chain agent configuration stored per token.
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct AgentConfig {
    pub rules: String,
    pub status: String,
    pub hl_account: Option<String>,
    pub max_size: String,
    pub last_action: Option<String>,
    pub updated_at: u64,
    pub traits: AgentTraits,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            rules: String::new(),
            status: "idle".to_string(),
            hl_account: None,
            max_size: "0.01".to_string(),
            last_action: None,
            updated_at: 0,
            traits: AgentTraits {
                name: "Rookie Bot".into(),
                helm: "blank visor".into(),
                body: "gray chassis".into(),
                gear: "none".into(),
                aura: "dim".into(),
                catchphrase: "still loading alpha".into(),
                seed: 0,
                mood: "zen".into(),
                performance_bps: 0,
            },
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct AgentEvent {
    pub at: u64,
    pub kind: String,
    pub detail: String,
    pub by: AccountId,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct MintStats {
    pub minted: u64,
    pub max_supply: u64,
    pub remaining: u64,
    pub sold_out: bool,
}

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    NonFungibleToken,
    Metadata,
    TokenMetadata,
    Enumeration,
    Approval,
    AgentConfig,
    AgentHistory,
    OwnerMint,
}

const DATA_IMAGE_SVG: &str = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Crect width='256' height='256' rx='32' fill='%230b0f14'/%3E%3Ctext x='50%25' y='54%25' text-anchor='middle' font-family='monospace' font-size='48' fill='%2300d4aa'%3E⚡%3C/text%3E%3C/svg%3E";

#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct Contract {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    agent_config_by_id: LookupMap<TokenId, AgentConfig>,
    agent_history: LookupMap<TokenId, Vec<AgentEvent>>,
    /// Enforces one mint per wallet for the first drop.
    minted_by_owner: UnorderedMap<AccountId, TokenId>,
    max_supply: u64,
}

#[near]
impl Contract {
    #[init]
    pub fn new_default_meta(owner_id: AccountId) -> Self {
        Self::new(
            owner_id,
            NFTContractMetadata {
                spec: NFT_METADATA_SPEC.to_string(),
                name: "Perp Agent NFT".to_string(),
                symbol: "PAGENT".to_string(),
                icon: Some(DATA_IMAGE_SVG.to_string()),
                base_uri: Some("https://jadenprosper.github.io/perp-agent-nft/".to_string()),
                reference: None,
                reference_hash: None,
            },
        )
    }

    #[init]
    pub fn new(owner_id: AccountId, metadata: NFTContractMetadata) -> Self {
        require!(!env::state_exists(), "Already initialized");
        metadata.assert_valid();
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::NonFungibleToken,
                owner_id,
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            agent_config_by_id: LookupMap::new(StorageKey::AgentConfig),
            agent_history: LookupMap::new(StorageKey::AgentHistory),
            minted_by_owner: UnorderedMap::new(StorageKey::OwnerMint),
            max_supply: MAX_SUPPLY,
        }
    }

    pub fn get_mint_stats(&self) -> MintStats {
        let minted = self.tokens.nft_total_supply().0 as u64;
        let remaining = self.max_supply.saturating_sub(minted);
        MintStats {
            minted,
            max_supply: self.max_supply,
            remaining,
            sold_out: minted >= self.max_supply,
        }
    }

    pub fn max_supply(&self) -> u64 {
        self.max_supply
    }

    /// Token id minted by this wallet during the first drop, if any.
    pub fn agent_of(&self, account_id: AccountId) -> Option<TokenId> {
        self.minted_by_owner.get(&account_id)
    }

    /// All token ids that have been minted (1..100 strings).
    pub fn get_minted_ids(&self) -> Vec<TokenId> {
        self.tokens
            .nft_tokens(None, Some(self.max_supply))
            .into_iter()
            .map(|t| t.token_id)
            .collect()
    }

    /// Mint a CHOSEN agent NFT (token_id 1..=100). One per wallet. Caps at max_supply.
    /// Image for token N lives at agents/N.jpg (see contract base_uri + metadata.json).
    /// Receiver is always the predecessor (connected wallet).
    #[payable]
    pub fn mint_agent(
        &mut self,
        token_id: u64,
        rules: Option<String>,
        max_size: Option<String>,
    ) -> Token {
        let owner = env::predecessor_account_id();
        let storage_before = env::storage_usage();
        require!(
            (1..=self.max_supply).contains(&token_id),
            "token_id out of range — pick an agent from 1 to 100"
        );
        let stats = self.get_mint_stats();
        require!(
            !stats.sold_out,
            "sold out — the first 100 agents already clocked in. try the secondary desk (transfer)."
        );
        require!(
            self.minted_by_owner.get(&owner).is_none(),
            "one agent per wallet — you already hired yours. transfer it if you want a different vibe."
        );
        require!(
            self.tokens.nft_supply_for_owner(owner.clone()).0 == 0,
            "you already hold an agent NFT — one desk per wallet. transfer first if you're swapping mains."
        );

        let token_id_str = token_id.to_string();
        require!(
            self.tokens.nft_token(token_id_str.clone()).is_none(),
            "taken — that agent already clocked in for someone else. pick another."
        );

        let now = env::block_timestamp_ms();
        // Deterministic look from chosen id (catalog art is agents/{id}.jpg off-chain).
        let seed = token_id
            .wrapping_mul(9973)
            .wrapping_add(env::block_height().wrapping_mul(13));
        let mut traits = generate_traits(seed);
        // Prefer stable display name slot from titles list indexed by id.
        let title_idx = ((token_id - 1) as usize) % TITLES.len();
        traits.name = TITLES[title_idx].to_string();
        traits.seed = token_id;

        let mut config = AgentConfig::default();
        config.traits = traits.clone();
        config.rules = rules.unwrap_or_default();
        config.max_size = max_size.unwrap_or_else(|| "0.01".to_string());
        config.updated_at = now;
        if !config.rules.is_empty() {
            config.status = "armed".to_string();
        }

        let extra = near_sdk::serde_json::to_string(&config).unwrap_or_else(|_| "{}".to_string());
        let media = format!(
            "https://jadenprosper.github.io/perp-agent-nft/agents/{}.jpg",
            token_id
        );
        let token_metadata = TokenMetadata {
            title: Some(traits.name.clone()),
            description: Some(format!(
                "Perp trading agent NFT #{}. \"{}\" — ownership = control. Hyperliquid testnet. Art: agents/{}.jpg",
                token_id, traits.catchphrase, token_id
            )),
            media: Some(media),
            media_hash: None,
            copies: Some(1),
            issued_at: Some(now.to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: Some(now.to_string()),
            extra: Some(extra),
            reference: Some(format!(
                "https://jadenprosper.github.io/perp-agent-nft/metadata/{}.json",
                token_id
            )),
            reference_hash: None,
        };

        let token = self
            .tokens
            .internal_mint(token_id_str.clone(), owner.clone(), Some(token_metadata));

        self.agent_config_by_id.insert(&token_id_str, &config);
        self.minted_by_owner.insert(&owner, &token_id_str);
        self.push_event(
            &token_id_str,
            "mint",
            &format!("{} (# {}) hired by {}", traits.name, token_id, owner),
            owner.clone(),
        );
        // Minter pays their own storage; any excess deposit is refunded.
        let used = env::storage_usage().saturating_sub(storage_before);
        let cost = env::storage_byte_cost().saturating_mul(used as u128);
        let attached = env::attached_deposit();
        require!(
            attached >= cost,
            format!("attach at least {} yoctoNEAR for storage", cost.as_yoctonear())
        );
        let refund = attached.saturating_sub(cost);
        if refund.as_yoctonear() > 1 {
            let _ = near_sdk::Promise::new(owner).transfer(refund);
        }
        token
    }

        #[payable]
    pub fn set_agent_rules(
        &mut self,
        token_id: TokenId,
        rules: String,
        max_size: Option<String>,
        status: Option<String>,
    ) -> AgentConfig {
        self.require_owner(&token_id);
        require!(
            env::attached_deposit() >= NearToken::from_yoctonear(1),
            "Requires attached deposit of at least 1 yoctoNEAR"
        );

        let mut config = self.agent_config_by_id.get(&token_id).unwrap_or_default();
        config.rules = rules;
        if let Some(ms) = max_size {
            config.max_size = ms;
        }
        if let Some(st) = status {
            require!(
                st == "idle" || st == "armed" || st == "active" || st == "paused",
                "invalid status"
            );
            config.status = st;
        } else if !config.rules.is_empty() && config.status == "idle" {
            config.status = "armed".to_string();
        }
        config.updated_at = env::block_timestamp_ms();

        self.sync_metadata(&token_id, &config);
        self.agent_config_by_id.insert(&token_id, &config);
        self.push_event(
            &token_id,
            "set_rules",
            &config.rules,
            env::predecessor_account_id(),
        );
        config
    }

    #[payable]
    pub fn set_hl_account(&mut self, token_id: TokenId, hl_account: String) -> AgentConfig {
        self.require_owner(&token_id);
        require!(
            env::attached_deposit() >= NearToken::from_yoctonear(1),
            "Requires attached deposit of at least 1 yoctoNEAR"
        );
        require!(
            hl_account.starts_with("0x") && hl_account.len() == 42,
            "hl_account must be 0x-prefixed 20-byte hex"
        );

        let mut config = self.agent_config_by_id.get(&token_id).unwrap_or_default();
        config.hl_account.replace(hl_account.clone());
        config.updated_at = env::block_timestamp_ms();
        self.sync_metadata(&token_id, &config);
        self.agent_config_by_id.insert(&token_id, &config);
        self.push_event(
            &token_id,
            "bind_hl",
            &hl_account,
            env::predecessor_account_id(),
        );
        config
    }

    /// Record an action and optionally update performance → mood/traits look.
    #[payable]
    pub fn record_action(
        &mut self,
        token_id: TokenId,
        detail: String,
        performance_delta_bps: Option<i32>,
    ) -> AgentConfig {
        self.require_owner(&token_id);
        require!(
            env::attached_deposit() >= NearToken::from_yoctonear(1),
            "Requires attached deposit of at least 1 yoctoNEAR"
        );
        let mut config = self.agent_config_by_id.get(&token_id).unwrap_or_default();
        config.last_action = Some(detail.clone());
        config.status = "active".to_string();
        if let Some(d) = performance_delta_bps {
            config.traits.performance_bps = config.traits.performance_bps.saturating_add(d);
            config.traits.mood = mood_from_perf(config.traits.performance_bps).to_string();
        }
        config.updated_at = env::block_timestamp_ms();
        self.sync_metadata(&token_id, &config);
        self.agent_config_by_id.insert(&token_id, &config);
        self.push_event(
            &token_id,
            "action",
            &detail,
            env::predecessor_account_id(),
        );
        config
    }

    pub fn get_agent_config(&self, token_id: TokenId) -> Option<AgentConfig> {
        self.agent_config_by_id.get(&token_id)
    }

    pub fn get_agent_history(&self, token_id: TokenId) -> Vec<AgentEvent> {
        self.agent_history.get(&token_id).unwrap_or_default()
    }

    fn require_owner(&self, token_id: &TokenId) {
        let token = self
            .tokens
            .nft_token(token_id.clone())
            .unwrap_or_else(|| env::panic_str("token not found"));
        require!(
            token.owner_id == env::predecessor_account_id(),
            "Only the NFT owner can control this agent"
        );
    }

    fn sync_metadata(&mut self, token_id: &TokenId, config: &AgentConfig) {
        if let Some(meta_map) = &mut self.tokens.token_metadata_by_id {
            if let Some(mut meta) = meta_map.get(token_id) {
                meta.extra =
                    Some(near_sdk::serde_json::to_string(config).unwrap_or_else(|_| "{}".into()));
                meta.updated_at = Some(env::block_timestamp_ms().to_string());
                // Keep catalog JPG when present; fall back to mood SVG.
                if meta.media.as_ref().map(|m| m.contains("/agents/")).unwrap_or(false) {
                    // leave catalog art
                } else {
                    meta.media = Some(svg_data_uri(&config.traits));
                }
                meta.title = Some(config.traits.name.clone());
                meta_map.insert(token_id, &meta);
            }
        }
    }

    fn push_event(&mut self, token_id: &TokenId, kind: &str, detail: &str, by: AccountId) {
        let mut hist = self.agent_history.get(token_id).unwrap_or_default();
        hist.push(AgentEvent {
            at: env::block_timestamp_ms(),
            kind: kind.to_string(),
            detail: detail.to_string(),
            by,
        });
        if hist.len() > 32 {
            let drop_n = hist.len() - 32;
            hist.drain(0..drop_n);
        }
        self.agent_history.insert(token_id, &hist);
    }
}

fn pick<'a>(seed: u64, items: &[&'a str], salt: u64) -> &'a str {
    let i = seed.wrapping_mul(salt) as usize % items.len();
    items[i]
}

fn generate_traits(seed: u64) -> AgentTraits {
    AgentTraits {
        name: pick(seed, TITLES, 3).to_string(),
        helm: pick(seed, HELMS, 5).to_string(),
        body: pick(seed, BODIES, 7).to_string(),
        gear: pick(seed, GEAR, 11).to_string(),
        aura: pick(seed, AURAS, 13).to_string(),
        catchphrase: pick(seed, CATCHPHRASES, 17).to_string(),
        seed,
        mood: "locked_in".to_string(),
        performance_bps: 0,
    }
}

fn mood_from_perf(bps: i32) -> &'static str {
    if bps >= 500 {
        "hyped"
    } else if bps >= 100 {
        "locked_in"
    } else if bps <= -500 {
        "rugged"
    } else if bps <= -100 {
        "tilt"
    } else {
        "zen"
    }
}

fn mood_color(mood: &str) -> &'static str {
    match mood {
        "hyped" => "%2300d4aa",
        "locked_in" => "%23b8ff3c",
        "tilt" => "%23ffb020",
        "rugged" => "%23ff4d9a",
        _ => "%238b5cff",
    }
}

fn svg_data_uri(t: &AgentTraits) -> String {
    let color = mood_color(&t.mood);
    // Compact on-chain SVG portrait; media field updates with mood.
    let svg = format!(
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' rx='40' fill='%230b0f14'/%3E%3Ccircle cx='200' cy='150' r='70' fill='{c}' opacity='0.25'/%3E%3Crect x='140' y='110' width='120' height='100' rx='24' fill='%23121821' stroke='{c}' stroke-width='4'/%3E%3Ccircle cx='170' cy='150' r='10' fill='{c}'/%3E%3Ccircle cx='230' cy='150' r='10' fill='{c}'/%3E%3Crect x='175' y='175' width='50' height='8' rx='4' fill='{c}'/%3E%3Ctext x='200' y='280' text-anchor='middle' font-family='monospace' font-size='18' fill='{c}'%3E{name}%3C/text%3E%3Ctext x='200' y='310' text-anchor='middle' font-family='monospace' font-size='12' fill='%23ffffff99'%3E{mood}%3C/text%3E%3C/svg%3E",
        c = color,
        name = urlencoding_lite(&t.name),
        mood = urlencoding_lite(&t.mood),
    );
    svg
}

fn urlencoding_lite(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            ' ' => "%20".to_string(),
            '!' => "%21".to_string(),
            '\'' => "%27".to_string(),
            '-' => "-".to_string(),
            c if c.is_ascii_alphanumeric() => c.to_string(),
            _ => "%3F".to_string(),
        })
        .collect()
}

// --- NEP-171 ---
// On transfer: agent config stays with token_id. minted_by_owner tracks first-drop mint
// (anti multi-mint), NOT current ownership — transfers still move control via owner_id.

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        let prev = self
            .tokens
            .nft_token(token_id.clone())
            .map(|t| t.owner_id)
            .unwrap_or_else(|| env::predecessor_account_id());
        self.tokens
            .nft_transfer(receiver_id.clone(), token_id.clone(), approval_id, memo);
        self.push_event(
            &token_id,
            "transfer",
            &format!("{} -> {}", prev, receiver_id),
            prev,
        );
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.tokens
            .nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.tokens.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id,
            approved_account_ids,
        )
    }
}

#[near]
impl NonFungibleTokenApproval for Contract {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id)
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id)
    }

    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.tokens
            .nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens
            .nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, NearToken};

    const MINT_STORAGE: NearToken = NearToken::from_millinear(50);

    fn ctx(pred: AccountId) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id(accounts(0))
            .signer_account_id(pred.clone())
            .predecessor_account_id(pred);
        b
    }

    #[test]
    fn mint_chosen_id_one_per_wallet_and_stats() {
        let mut context = ctx(accounts(1));
        testing_env!(context.build());
        let mut c = Contract::new_default_meta(accounts(0));

        testing_env!(context
            .attached_deposit(MINT_STORAGE)
            .predecessor_account_id(accounts(1))
            .build());
        let token = c.mint_agent(
            7,
            Some("long ETH at 3200, TP 3500, SL 3100".into()),
            None,
        );
        assert_eq!(token.token_id, "7");
        assert_eq!(token.owner_id, accounts(1));
        assert!(!c.get_agent_config("7".into()).unwrap().traits.name.is_empty());
        assert!(c
            .nft_token("7".into())
            .unwrap()
            .metadata
            .unwrap()
            .media
            .unwrap()
            .contains("/agents/7.jpg"));

        let stats = c.get_mint_stats();
        assert_eq!(stats.minted, 1);
        assert_eq!(stats.max_supply, 100);
        assert_eq!(stats.remaining, 99);
        assert!(!stats.sold_out);
        assert_eq!(c.get_minted_ids(), vec!["7".to_string()]);

        // same id taken
        testing_env!(context
            .attached_deposit(MINT_STORAGE)
            .predecessor_account_id(accounts(2))
            .build());
        let boom = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.mint_agent(7, None, None);
        }));
        assert!(boom.is_err());

        // second mint same wallet fails
        testing_env!(context
            .attached_deposit(MINT_STORAGE)
            .predecessor_account_id(accounts(1))
            .build());
        let boom = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.mint_agent(8, None, None);
        }));
        assert!(boom.is_err());
    }

    #[test]
    fn out_of_range_rejected() {
        let mut context = ctx(accounts(1));
        testing_env!(context.build());
        let mut c = Contract::new_default_meta(accounts(0));
        testing_env!(context
            .attached_deposit(MINT_STORAGE)
            .predecessor_account_id(accounts(1))
            .build());
        let boom = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.mint_agent(0, None, None);
        }));
        assert!(boom.is_err());
        let boom = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.mint_agent(101, None, None);
        }));
        assert!(boom.is_err());
    }

    #[test]
    fn transfer_moves_control_not_remint() {
        let mut context = ctx(accounts(1));
        testing_env!(context.build());
        let mut c = Contract::new_default_meta(accounts(0));

        testing_env!(context
            .attached_deposit(MINT_STORAGE)
            .predecessor_account_id(accounts(1))
            .build());
        c.mint_agent(3, Some("long ETH at 1".into()), None);

        testing_env!(context
            .attached_deposit(NearToken::from_yoctonear(1))
            .predecessor_account_id(accounts(1))
            .build());
        c.nft_transfer(accounts(2), "3".into(), None, None);

        let t = c.nft_token("3".into()).unwrap();
        assert_eq!(t.owner_id, accounts(2));

        // old owner cannot set rules
        testing_env!(context
            .attached_deposit(NearToken::from_yoctonear(1))
            .predecessor_account_id(accounts(1))
            .build());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.set_agent_rules("3".into(), "hacked".into(), None, None);
        }));
        assert!(result.is_err());

        // original minter still blocked from minting another (one per wallet for drop)
        testing_env!(context
            .attached_deposit(MINT_STORAGE)
            .predecessor_account_id(accounts(1))
            .build());
        let boom = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.mint_agent(4, None, None);
        }));
        assert!(boom.is_err());

        // receiver already holds one — cannot mint another
        testing_env!(context
            .attached_deposit(MINT_STORAGE)
            .predecessor_account_id(accounts(2))
            .build());
        let boom = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.mint_agent(5, None, None);
        }));
        assert!(boom.is_err());
    }

    #[test]
    fn sold_out_at_max_supply() {
        let mut context = ctx(accounts(1));
        testing_env!(context.build());
        let mut c = Contract::new_default_meta(accounts(0));
        c.max_supply = 2; // shrink for unit test

        testing_env!(context
            .attached_deposit(MINT_STORAGE)
            .predecessor_account_id(accounts(1))
            .build());
        c.mint_agent(1, None, None);

        testing_env!(context
            .attached_deposit(MINT_STORAGE)
            .predecessor_account_id(accounts(2))
            .build());
        c.mint_agent(2, None, None);

        assert!(c.get_mint_stats().sold_out);
        let mut ids = c.get_minted_ids();
        ids.sort();
        assert_eq!(ids, vec!["1".to_string(), "2".to_string()]);

        testing_env!(context
            .attached_deposit(MINT_STORAGE)
            .predecessor_account_id(accounts(3))
            .build());
        let boom = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.mint_agent(1, None, None); // even a "free" id fails when sold out / taken
        }));
        assert!(boom.is_err());
    }
}
