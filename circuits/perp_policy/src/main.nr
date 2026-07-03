// perp_policy - perps instantiation of the PolicyProof pattern.
// Shared invariants live in the policy_core library; only the
// vertical-specific rules (leverage cap, notional cap, margin floor) are
// defined here.
//
// PRIVATE (witnesses): entry_threshold, exit_threshold, target_leverage,
//                     position_notional_prev, secret
// PUBLIC  (inputs):   mark_price, market_timestamp, funding_rate_bps,
//                     collateral, last_trade_ts,
//                     policy_hash, policy fields (max_leverage,
//                     min_margin_ratio_bps, max_position_notional,
//                     min_time_between_trades)

use dep::policy_core;

fn main(
    // ---- PRIVATE WITNESSES (the strategy's alpha) ----
    entry_threshold: Field,
    exit_threshold: Field,
    target_leverage: Field,
    position_notional_prev: Field,
    secret: Field,

    // ---- PUBLIC INPUTS (market + agent state) ----
    mark_price: pub Field,
    market_timestamp: pub Field,
    funding_rate_bps: pub Field,
    collateral: pub Field,
    last_trade_ts: pub Field,
    policy_hash: pub Field,

    // ---- POLICY (public, bound by policy_hash) ----
    max_leverage: pub Field,
    min_margin_ratio_bps: pub Field,
    max_position_notional: pub Field,
    min_time_between_trades: pub Field,
) -> pub (Field, Field, Field, Field) {
    // Shared invariant 1: policy binding
    policy_core::bind_policy(
        [max_leverage, min_margin_ratio_bps, max_position_notional, min_time_between_trades],
        policy_hash,
    );

    // Shared invariant 2: strategy commitment
    let strategy_commitment = policy_core::commit_strategy_5([
        entry_threshold,
        exit_threshold,
        target_leverage,
        position_notional_prev,
        secret,
    ]);

    // Shared rule: rate limit
    policy_core::assert_rate_limit(market_timestamp, last_trade_ts, min_time_between_trades);

    // Vertical rule: private leverage must not exceed public cap - enforced
    // without revealing the actual leverage (2x and 4.9x both pass a 5x cap).
    policy_core::assert_private_leq_cap(target_leverage, max_leverage, "leverage exceeds policy cap");
    assert(target_leverage as u64 >= 1, "leverage must be >= 1");

    // Shared invariant 3: derived decision (LONG below / SHORT above triggers)
    let action = policy_core::threshold_action(mark_price, entry_threshold, exit_threshold);

    // Vertical rule: position sizing + notional cap
    let notional: u64 = collateral as u64 * target_leverage as u64;
    assert(
        notional <= max_position_notional as u64,
        "position notional exceeds cap",
    );

    // Vertical rule: margin ratio floor
    // collateral / notional >= min_margin_ratio_bps / 10000
    let margin_lhs: u64 = collateral as u64 * 10000;
    let margin_rhs: u64 = notional * (min_margin_ratio_bps as u64);
    assert(margin_lhs >= margin_rhs, "margin ratio below policy floor");

    // Chained state commitment
    let new_notional: Field = if action == policy_core::HOLD {
        position_notional_prev
    } else {
        notional as Field
    };
    let new_state_hash = policy_core::state_hash(
        strategy_commitment,
        new_notional,
        mark_price,
        market_timestamp,
        funding_rate_bps,
    );

    (action, notional as Field, new_state_hash, policy_hash)
}

use dep::poseidon::poseidon::bn254;

// Policy for tests: max_leverage=5, min_margin_ratio_bps=1500 (15%),
// max_position_notional=100_000_000_000, min_time_between_trades=60
fn test_policy_hash() -> Field {
    bn254::hash_4([5, 1500, 100000000000, 60])
}

#[test]
fn test_long_decision() {
    // price 2000 < entry_trigger 3000 -> LONG at 3x leverage
    let result = main(
        30, 70, 3, 0, 42,
        2000, 1700000000, 10,
        10000000000, 0,
        test_policy_hash(),
        5, 1500, 100000000000, 60,
    );
    assert(result.0 == policy_core::ENTER);
    assert(result.1 == 30000000000); // 3x collateral
}

#[test]
fn test_hold_decision() {
    // price 5000 between triggers -> HOLD
    let result = main(
        30, 70, 2, 0, 42,
        5000, 1700000000, 10,
        10000000000, 0,
        test_policy_hash(),
        5, 1500, 100000000000, 60,
    );
    assert(result.0 == policy_core::HOLD);
}

#[test]
fn test_short_decision() {
    // price 8000 > short_trigger 7000 -> SHORT
    let result = main(
        30, 70, 2, 0, 42,
        8000, 1700000000, 10,
        10000000000, 0,
        test_policy_hash(),
        5, 1500, 100000000000, 60,
    );
    assert(result.0 == policy_core::EXIT);
}

#[test(should_fail_with = "leverage exceeds policy cap")]
fn test_leverage_cap() {
    // target_leverage 10 > policy max 5 -> reject at proof time
    let _ = main(
        30, 70, 10, 0, 42,
        2000, 1700000000, 10,
        10000000000, 0,
        test_policy_hash(),
        5, 1500, 100000000000, 60,
    );
}

#[test(should_fail_with = "position notional exceeds cap")]
fn test_notional_cap() {
    // 5x on 30B collateral = 150B notional > 100B cap
    let _ = main(
        30, 70, 5, 0, 42,
        2000, 1700000000, 10,
        30000000000, 0,
        test_policy_hash(),
        5, 1500, 100000000000, 60,
    );
}

#[test(should_fail_with = "margin ratio below policy floor")]
fn test_margin_floor() {
    // Policy floor 2500bps (25%): 5x leverage -> 20% margin -> reject
    let policy_hash = bn254::hash_4([5, 2500, 100000000000, 60]);
    let _ = main(
        30, 70, 5, 0, 42,
        2000, 1700000000, 10,
        10000000000, 0,
        policy_hash,
        5, 2500, 100000000000, 60,
    );
}

#[test(should_fail_with = "rate limit violated")]
fn test_rate_limit() {
    // last_trade_ts == market_timestamp -> reject
    let _ = main(
        30, 70, 2, 0, 42,
        2000, 1700000000, 10,
        10000000000, 1700000000,
        test_policy_hash(),
        5, 1500, 100000000000, 60,
    );
}

#[test(should_fail_with = "policy mismatch")]
fn test_policy_binding() {
    // Claim a looser policy (max_leverage 100) than the hash commits to
    let _ = main(
        30, 70, 2, 0, 42,
        2000, 1700000000, 10,
        10000000000, 0,
        test_policy_hash(),
        100, 1500, 100000000000, 60,
    );
}
