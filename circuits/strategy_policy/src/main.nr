// strategy_policy - spot DEX instantiation of the PolicyProof pattern.
// Shared invariants live in the policy_core library; only the
// vertical-specific rules (pair whitelist, loss circuit-breaker, trade
// sizing) are defined here.
//
// PRIVATE (witnesses): buy_threshold, sell_threshold, period, last_signal,
//                     position, secret
// PUBLIC  (inputs):   market_price, market_timestamp, pair_hash,
//                     balance, last_trade_ts, consecutive_losses,
//                     policy_hash, policy fields

use dep::policy_core;

fn main(
    // ---- PRIVATE WITNESSES (the strategy's alpha) ----
    buy_threshold: Field,
    sell_threshold: Field,
    period: Field,
    last_signal: Field,
    position: Field,
    secret: Field,

    // ---- PUBLIC INPUTS (market + agent state) ----
    market_price: pub Field,
    market_timestamp: pub Field,
    pair_hash: pub Field,
    balance: pub Field,
    last_trade_ts: pub Field,
    consecutive_losses: pub Field,
    policy_hash: pub Field,

    // ---- POLICY (public, bound by policy_hash) ----
    max_trade_size_pct: pub Field,
    allowed_pair_hash: pub Field,
    min_time_between_trades: pub Field,
    max_consecutive_losses: pub Field,
) -> pub (Field, Field, Field, Field) {
    // Shared invariant 1: policy binding
    policy_core::bind_policy(
        [max_trade_size_pct, allowed_pair_hash, min_time_between_trades, max_consecutive_losses],
        policy_hash,
    );

    // Shared invariant 2: strategy commitment
    let strategy_commitment = policy_core::commit_strategy_6([
        buy_threshold,
        sell_threshold,
        period,
        last_signal,
        position,
        secret,
    ]);

    // Vertical rule: pair whitelist
    assert(pair_hash as u64 == allowed_pair_hash as u64, "pair not allowed");

    // Shared rule: rate limit
    policy_core::assert_rate_limit(market_timestamp, last_trade_ts, min_time_between_trades);

    // Vertical rule: loss circuit-breaker
    assert(
        (consecutive_losses as u64) < (max_consecutive_losses as u64),
        "circuit breaker active",
    );

    // Shared invariant 3: derived decision (BUY below / SELL above triggers)
    let action = policy_core::threshold_action(market_price, buy_threshold, sell_threshold);

    // Vertical rule: trade amount derived from policy (cannot exceed cap)
    let amount: u64 = (balance as u64 * max_trade_size_pct as u64) / 100;

    // Chained state commitment
    let new_position: Field = if action == policy_core::ENTER {
        amount as Field
    } else if action == policy_core::EXIT {
        0
    } else {
        position
    };
    let new_state_hash = policy_core::state_hash(
        strategy_commitment,
        new_position,
        market_price,
        market_timestamp,
        consecutive_losses,
    );

    (action, amount as Field, new_state_hash, policy_hash)
}

use dep::poseidon::poseidon::bn254;

#[test]
fn test_hold_decision() {
    // price = 5000, buy_trigger = 3000, sell_trigger = 7000 -> HOLD
    let policy_hash = bn254::hash_4([5, 1, 600, 3]);
    let result = main(
        30, 70, 14, 50, 0, 42,
        5000, 1700000000, 1,
        10000000000, 0, 0,
        policy_hash,
        5, 1, 600, 3,
    );
    assert(result.0 == policy_core::HOLD);
}

#[test]
fn test_buy_decision() {
    // price = 2000 < buy_trigger = 3000 -> BUY
    let policy_hash = bn254::hash_4([5, 1, 600, 3]);
    let result = main(
        30, 70, 14, 50, 0, 42,
        2000, 1700000000, 1,
        10000000000, 0, 0,
        policy_hash,
        5, 1, 600, 3,
    );
    assert(result.0 == policy_core::ENTER);
}

#[test]
fn test_sell_decision() {
    // price = 8000 > sell_trigger = 7000 -> SELL
    let policy_hash = bn254::hash_4([5, 1, 600, 3]);
    let result = main(
        30, 70, 14, 50, 0, 42,
        8000, 1700000000, 1,
        10000000000, 0, 0,
        policy_hash,
        5, 1, 600, 3,
    );
    assert(result.0 == policy_core::EXIT);
}

#[test(should_fail_with = "pair not allowed")]
fn test_pair_not_allowed() {
    let policy_hash = bn254::hash_4([5, 1, 600, 3]);
    let _ = main(
        30, 70, 14, 50, 0, 42,
        5000, 1700000000, 999,
        10000000000, 0, 0,
        policy_hash,
        5, 1, 600, 3,
    );
}

#[test(should_fail_with = "circuit breaker active")]
fn test_circuit_breaker() {
    let policy_hash = bn254::hash_4([5, 1, 600, 3]);
    let _ = main(
        30, 70, 14, 50, 0, 42,
        5000, 1700000000, 1,
        10000000000, 0, 4,
        policy_hash,
        5, 1, 600, 3,
    );
}
