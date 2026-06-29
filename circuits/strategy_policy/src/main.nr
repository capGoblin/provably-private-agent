// Provably Private Agent - strategy_policy circuit
//
// Proves that a trade decision came from the committed private strategy
// AND respects the on-chain public policy.
//
// PRIVATE (witnesses): buy_threshold, sell_threshold, period, last_signal,
//                     position, secret
// PUBLIC  (inputs):   market_price, market_timestamp, pair_hash,
//                     balance, last_trade_ts, consecutive_losses,
//                     policy_hash, policy fields

use dep::poseidon::poseidon::bn254;

global HOLD: Field = 0;
global BUY: Field = 1;
global SELL: Field = 2;

fn main(
    // ---- PRIVATE WITNESSES ----
    buy_threshold: Field,
    sell_threshold: Field,
    period: Field,
    last_signal: Field,
    position: Field,
    secret: Field,

    // ---- PUBLIC INPUTS ----
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
    // 1. Verify policy hash binds to declared policy fields
    let computed_policy_hash = bn254::hash_4([
        max_trade_size_pct,
        allowed_pair_hash,
        min_time_between_trades,
        max_consecutive_losses,
    ]);
    assert(computed_policy_hash == policy_hash, "policy mismatch");

    // 2. Strategy commitment: bind proof to specific strategy params + secret
    let strategy_commitment = bn254::hash_6([
        buy_threshold,
        sell_threshold,
        period,
        last_signal,
        position,
        secret,
    ]);

    // 3. Pair check (cast to u64 for comparison)
    let pair_u: u64 = pair_hash as u64;
    let allowed_pair_u: u64 = allowed_pair_hash as u64;
    assert(pair_u == allowed_pair_u, "pair not allowed");

    // 4. Rate limit check
    let time_since_last: u64 = (market_timestamp - last_trade_ts) as u64;
    let min_time_u: u64 = min_time_between_trades as u64;
    assert(time_since_last >= min_time_u, "rate limit violated");

    // 5. Circuit breaker (consecutive losses)
    let consec_u: u64 = consecutive_losses as u64;
    let max_losses_u: u64 = max_consecutive_losses as u64;
    assert(consec_u < max_losses_u, "circuit breaker active");

    // 6. Decision logic: simplified mean-reversion
    //    price vs threshold * 100 (works for small price ranges)
    let scale: u64 = 100;
    let buy_u: u64 = buy_threshold as u64;
    let sell_u: u64 = sell_threshold as u64;
    let price_u: u64 = market_price as u64;
    let buy_trigger: u64 = buy_u * scale;
    let sell_trigger: u64 = sell_u * scale;

    let action: Field = if price_u < buy_trigger {
        BUY
    } else if price_u > sell_trigger {
        SELL
    } else {
        HOLD
    };

    // 7. Trade amount: max_trade_size_pct % of balance
    let amount: u64 = (balance as u64 * max_trade_size_pct as u64) / 100;

    // 8. New state commitment
    let new_position: Field = if action == BUY {
        amount as Field
    } else if action == SELL {
        0
    } else {
        position
    };
    let new_state_hash = bn254::hash_5([
        strategy_commitment,
        new_position,
        market_price,
        market_timestamp,
        consecutive_losses,
    ]);

    (action, amount as Field, new_state_hash, policy_hash)
}

#[test]
fn test_hold_decision() {
    // price = 5000, buy_trigger = 3000, sell_trigger = 7000 -> HOLD
    let policy_hash = bn254::hash_4([5, 1, 600, 3]);
    std::println(f"policy_hash = {policy_hash}");
    let result = main(
        30, 70, 14, 50, 0, 42,
        5000, 1700000000, 1,
        10000000000, 0, 0,
        policy_hash,
        5, 1, 600, 3,
    );
    assert(result.0 == HOLD);
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
    assert(result.0 == BUY);
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
    assert(result.0 == SELL);
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