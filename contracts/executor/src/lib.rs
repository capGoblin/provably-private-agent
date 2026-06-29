#![no_std]
// Provably Private Agent - Executor Contract (Path B: attestation model)
//
// Stores trades with their ZK proofs and signed attestations.
// Does NOT verify proofs on-chain (Path B: off-chain verify, on-chain attest).
// Anyone can re-verify client-side using VK + proof + public_inputs from this contract.
//
// Architecture:
//   Agent (off-chain) -> generates proof via bb.js / local bb
//   Agent (off-chain) -> verifies proof locally
//   Agent (off-chain) -> signs attestation (ed25519)
//   Agent -> submit_trade(this contract)
//   This contract -> verify attestation signature
//   This contract -> store trade + proof + attestation
//   Anyone -> re-verify proof client-side using VK from this contract

use soroban_sdk::{
    contract, contractimpl, contracttype,
    symbol_short, vec, Address, Bytes, BytesN, Env, Vec,
};

#[contracttype]
#[derive(Clone)]
pub struct Trade {
    pub trade_id: u64,
    pub agent_id: Address,
    pub user: Address,
    pub action: u32,           // 0=hold, 1=buy, 2=sell
    pub amount: i128,
    pub market_price: u64,
    pub market_timestamp: u64,
    pub pair_hash: u64,
    pub consecutive_losses: u32,
    pub policy_hash: BytesN<32>,
    pub proof_hash: BytesN<32>,     // keccak256 of proof bytes
    pub new_state_hash: BytesN<32>,
    pub attestation_sig: BytesN<64>,
    pub x402_payment_receipt: BytesN<32>,  // keccak256 of x402 payment receipt
    pub created_at: u64,
}

#[contract]
pub struct Executor;

const MAX_TRADES_PER_AGENT: u32 = 100;
const DEFAULT_RENTAL_FEE_STROOPS: u64 = 1_000_000; // 0.1 XLM (7 decimals)

#[contractimpl]
impl Executor {
    /// Initialize with verifier pubkey (ed25519), VK bytes, and optional rental fee.
    /// Called once at deploy time.
    pub fn __constructor(
        env: Env,
        verifier_pubkey: BytesN<32>,
        vk_bytes: Bytes,
    ) {
        env.storage().instance().set(&symbol_short!("vk_pk"), &verifier_pubkey);
        env.storage().instance().set(&symbol_short!("vk"), &vk_bytes);
        env.storage().instance().set(&symbol_short!("count"), &0u64);
        // Default rental fee (in stroops) - admin can update later
        env.storage().instance().set(&symbol_short!("fee"), &DEFAULT_RENTAL_FEE_STROOPS);
    }

    /// Update the rental fee (admin only).
    pub fn set_rental_fee(env: Env, admin: Address, fee_stroops: u64) {
        admin.require_auth();
        env.storage().instance().set(&symbol_short!("fee"), &fee_stroops);
    }

    /// Get the current rental fee (in stroops).
    pub fn get_rental_fee(env: Env) -> u64 {
        env.storage().instance().get(&symbol_short!("fee")).unwrap_or(DEFAULT_RENTAL_FEE_STROOPS)
    }

    /// Submit a trade with proof + attestation signature + x402 payment receipt.
    /// The proof is generated off-chain by the agent and verified locally.
    /// Only the attestation signature is verified on-chain.
    /// The x402_payment_receipt is a hash binding the trade to an x402 payment.
    pub fn submit_trade(
        env: Env,
        user: Address,
        agent_id: Address,
        proof: Bytes,
        public_inputs: Vec<BytesN<32>>,
        action: u32,
        amount: i128,
        new_state_hash: BytesN<32>,
        attestation_sig: BytesN<64>,
        x402_payment_receipt: BytesN<32>,
    ) -> u64 {
        user.require_auth();

        // 1. Verify attestation signature
        let verifier_pk: BytesN<32> = env.storage()
            .instance()
            .get(&symbol_short!("vk_pk"))
            .expect("not initialized");

        // Message = keccak256(proof || public_inputs || action || amount || new_state_hash)
        let mut message = Bytes::new(&env);
        message.append(&proof);
        for pi in public_inputs.iter() {
            message.append(&Bytes::from_slice(&env, &pi.to_array()));
        }
        message.append(&Bytes::from_slice(&env, &action.to_be_bytes()));
        message.append(&Bytes::from_slice(&env, &(amount as u64).to_be_bytes()));
        message.append(&Bytes::from_slice(&env, &new_state_hash.to_array()));
        let message_hash = env.crypto().keccak256(&message);

        env.crypto().ed25519_verify(&verifier_pk, &message_hash.into(), &attestation_sig);

        // 2. Compute proof hash
        let proof_hash: BytesN<32> = env.crypto().keccak256(&proof).into();

        // 3. Extract policy_hash from public_inputs (index 6 in our circuit)
        // Public inputs order: market_price, market_timestamp, pair_hash,
        //                       balance, last_trade_ts, consecutive_losses,
        //                       policy_hash, ...
        let policy_hash = public_inputs.get(6).expect("invalid public inputs");

        // 4. Get next trade ID
        let trade_id: u64 = env.storage()
            .instance()
            .get(&symbol_short!("count"))
            .unwrap_or(0u64);

        // 5. Extract market data from public_inputs (first 7 fields)
        let market_price_bytes = public_inputs.get(0).expect("invalid public inputs");
        let market_price = u64::from_be_bytes({
            let mut buf = [0u8; 8];
            buf.copy_from_slice(&market_price_bytes.to_array()[24..32]);
            buf
        });
        let timestamp_bytes = public_inputs.get(1).expect("invalid public inputs");
        let market_timestamp = u64::from_be_bytes({
            let mut buf = [0u8; 8];
            buf.copy_from_slice(&timestamp_bytes.to_array()[24..32]);
            buf
        });
        let pair_bytes = public_inputs.get(2).expect("invalid public inputs");
        let pair_hash = u64::from_be_bytes({
            let mut buf = [0u8; 8];
            buf.copy_from_slice(&pair_bytes.to_array()[24..32]);
            buf
        });
        let consec_bytes = public_inputs.get(5).expect("invalid public inputs");
        let consecutive_losses = u32::from_be_bytes({
            let mut buf = [0u8; 4];
            buf.copy_from_slice(&consec_bytes.to_array()[28..32]);
            buf
        });

        // 6. Create and store trade
        let trade = Trade {
            trade_id,
            agent_id: agent_id.clone(),
            user: user.clone(),
            action,
            amount,
            market_price,
            market_timestamp,
            pair_hash,
            consecutive_losses,
            policy_hash,
            proof_hash: proof_hash.clone(),
            new_state_hash,
            attestation_sig,
            x402_payment_receipt,
            created_at: env.ledger().timestamp(),
        };
        env.storage().instance().set(
            &(symbol_short!("trade"), trade_id),
            &trade,
        );

        // 7. Store proof bytes (for client re-verification)
        env.storage().instance().set(
            &(symbol_short!("proof"), trade_id),
            &proof,
        );

        // 8. Store agent -> trades mapping
        let agent_trades: Vec<u64> = env.storage()
            .instance()
            .get(&(symbol_short!("at"), agent_id.clone()))
            .unwrap_or(Vec::new(&env));
        let mut new_trades = agent_trades.clone();
        new_trades.push_back(trade_id);
        env.storage().instance().set(
            &(symbol_short!("at"), agent_id),
            &new_trades,
        );

        // 9. Update count
        env.storage().instance().set(&symbol_short!("count"), &(trade_id + 1));

        // 10. Emit event for indexers
        env.events().publish(
            (symbol_short!("Trade"), symbol_short!("submit")),
            (trade_id, proof_hash),
        );

        trade_id
    }

    /// Get trade by ID.
    pub fn get_trade(env: Env, trade_id: u64) -> Option<Trade> {
        env.storage().instance().get(&(symbol_short!("trade"), trade_id))
    }

    /// Get proof bytes for a trade (for client re-verification).
    pub fn get_proof(env: Env, trade_id: u64) -> Bytes {
        env.storage().instance()
            .get(&(symbol_short!("proof"), trade_id))
            .expect("proof not found")
    }

    /// Get the VK bytes (used for client-side re-verification).
    pub fn get_vk(env: Env) -> Bytes {
        env.storage().instance()
            .get(&symbol_short!("vk"))
            .expect("vk not set")
    }

    /// Get total number of trades.
    pub fn get_trade_count(env: Env) -> u64 {
        env.storage().instance().get(&symbol_short!("count")).unwrap_or(0u64)
    }

    /// Get all trade IDs for an agent.
    pub fn get_trades_for_agent(env: Env, agent_id: Address) -> Vec<u64> {
        env.storage().instance()
            .get(&(symbol_short!("at"), agent_id))
            .unwrap_or(Vec::new(&env))
    }
}