#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Address, BytesN, Env, Vec};

#[contract]
pub struct Policy;

#[contractimpl]
impl Policy {
    /// Set (or overwrite) the policy for an agent. Stores all 4 policy fields + their hash.
    pub fn set_policy(
        env: Env,
        agent_id: Address,
        policy_hash: BytesN<32>,
        max_trade_size_pct: u32,
        allowed_pair_hash: u64,
        min_time_between_trades: u64,
        max_consecutive_losses: u32,
    ) {
        agent_id.require_auth();
        env.storage().instance().set(
            &(symbol_short!("pol"), agent_id),
            &(policy_hash, max_trade_size_pct, allowed_pair_hash, min_time_between_trades, max_consecutive_losses),
        );
    }

    /// Get the stored policy for an agent. Returns (policy_hash, max_pct, pair_hash, min_time, max_losses).
    pub fn get_policy(env: Env, agent_id: Address) -> (BytesN<32>, u32, u64, u64, u32) {
        env.storage().instance()
            .get(&(symbol_short!("pol"), agent_id))
            .expect("policy not set for agent")
    }

    /// Get only the policy_hash for an agent.
    pub fn get_hash(env: Env, agent_id: Address) -> BytesN<32> {
        let (hash, _, _, _, _): (BytesN<32>, u32, u64, u64, u32) = env.storage().instance()
            .get(&(symbol_short!("pol"), agent_id))
            .expect("policy not set for agent");
        hash
    }
}