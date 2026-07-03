// policy_core - the PolicyProof library.
//
// Shared primitives every trading-vertical circuit is built from.
// A vertical circuit (spot DEX, perps, RWA mandate, MM exposure) is a thin
// instantiation: it declares its private strategy witnesses and public
// policy fields, then composes these primitives plus its own
// vertical-specific asserts.
//
// The PolicyProof contract shared by all verticals:
//   PRIVATE witnesses  = strategy params + secret salt
//   PUBLIC inputs      = market state + agent state + policy_hash + policy fields
//   OUTPUTS            = (action, size, new_state_hash, policy_hash)

use dep::poseidon::poseidon::bn254;

pub global HOLD: Field = 0;
pub global ENTER: Field = 1; // BUY (spot) / LONG (perp)
pub global EXIT: Field = 2; // SELL (spot) / SHORT (perp)

/// Invariant 1 - policy binding.
/// The prover cannot claim a looser policy than the one committed on-chain:
/// the declared policy fields must hash to the public policy_hash.
pub fn bind_policy(fields: [Field; 4], policy_hash: Field) {
    let computed = bn254::hash_4(fields);
    assert(computed == policy_hash, "policy mismatch");
}

/// Invariant 2 - strategy commitment.
/// Binds the proof to one specific private strategy. The salt prevents
/// brute-forcing the params from the commitment.
pub fn commit_strategy_5(params: [Field; 5]) -> Field {
    bn254::hash_5(params)
}

pub fn commit_strategy_6(params: [Field; 6]) -> Field {
    bn254::hash_6(params)
}

/// Shared policy rule - rate limit between trades.
pub fn assert_rate_limit(market_timestamp: Field, last_trade_ts: Field, min_time: Field) {
    let time_since_last: u64 = (market_timestamp - last_trade_ts) as u64;
    assert(time_since_last >= min_time as u64, "rate limit violated");
}

/// Shared policy rule - private value must not exceed a public cap.
/// Enforces the cap without revealing the private value (e.g. "my leverage
/// is <= the venue's 5x cap" without revealing if it is 2x or 4.9x).
pub fn assert_private_leq_cap<let N: u32>(private_value: Field, public_cap: Field, msg: str<N>) {
    assert((private_value as u64) <= (public_cap as u64), msg);
}

/// Invariant 3 - derived decision.
/// The action is COMPUTED in-circuit from private thresholds vs public
/// price - never claimed by the prover. Returns ENTER below the low
/// trigger, EXIT above the high trigger, HOLD between.
pub fn threshold_action(price: Field, low_threshold: Field, high_threshold: Field) -> Field {
    let scale: u64 = 100;
    let p: u64 = price as u64;
    let low_trigger: u64 = (low_threshold as u64) * scale;
    let high_trigger: u64 = (high_threshold as u64) * scale;
    if p < low_trigger {
        ENTER
    } else if p > high_trigger {
        EXIT
    } else {
        HOLD
    }
}

/// Chained state commitment: links this decision's resulting state to the
/// strategy commitment so consecutive proofs form a verifiable history.
pub fn state_hash(
    strategy_commitment: Field,
    new_position: Field,
    price: Field,
    timestamp: Field,
    extra: Field,
) -> Field {
    bn254::hash_5([strategy_commitment, new_position, price, timestamp, extra])
}
