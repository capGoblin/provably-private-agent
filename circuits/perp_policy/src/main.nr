// Provably Private Agent - perp_policy circuit
//
// Second instantiation of the same PolicyProof pattern used by
// strategy_policy (spot DEX). Proves a leveraged perp order came from the
// committed private strategy AND respects the venue's public risk policy.
//
// PolicyProof pattern (shared across verticals):
//   PRIVATE witnesses  = strategy params + secret salt
//   PUBLIC inputs      = market state + agent state + policy_hash + policy fields
//   OUTPUTS            = (action, size, new_state_hash, policy_hash)
//
// PRIVATE (witnesses): entry_threshold, exit_threshold, target_leverage,
//                     position_notional_prev, secret
// PUBLIC  (inputs):   mark_price, market_timestamp, funding_rate_bps,
//                     collateral, last_trade_ts,
//                     policy_hash, policy fields (max_leverage,
//                     min_margin_ratio_bps, max_position_notional,
//                     min_time_between_trades)

use dep::poseidon::poseidon::bn254;

global HOLD: Field = 0;
global LONG: Field = 1;
global SHORT: Field = 2;

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
    // 1. Verify policy hash binds to declared policy fields
    let computed_policy_hash = bn254::hash_4([
        max_leverage,
        min_margin_ratio_bps,
        max_position_notional,
        min_time_between_trades,
    ]);
    assert(computed_policy_hash == policy_hash, "policy mismatch");

    // 2. Strategy commitment: bind proof to specific strategy params + secret
    let strategy_commitment = bn254::hash_5([
        entry_threshold,
        exit_threshold,
        target_leverage,
        position_notional_prev,
        secret,
    ]);

    // 3. Rate limit check
    let time_since_last: u64 = (market_timestamp - last_trade_ts) as u64;
    let min_time_u: u64 = min_time_between_trades as u64;
    assert(time_since_last >= min_time_u, "rate limit violated");

    // 4. Leverage cap: strategy's private target leverage must not exceed
    //    the public policy cap. The cap is enforced without revealing the
    //    actual target leverage.
    let lev_u: u64 = target_leverage as u64;
    let max_lev_u: u64 = max_leverage as u64;
    assert(lev_u <= max_lev_u, "leverage exceeds policy cap");
    assert(lev_u >= 1, "leverage must be >= 1");

    // 5. Decision logic: private thresholds vs public mark price
    //    (same simplified trigger scheme as strategy_policy)
    let scale: u64 = 100;
    let entry_u: u64 = entry_threshold as u64;
    let exit_u: u64 = exit_threshold as u64;
    let price_u: u64 = mark_price as u64;
    let long_trigger: u64 = entry_u * scale;
    let short_trigger: u64 = exit_u * scale;

    let action: Field = if price_u < long_trigger {
        LONG
    } else if price_u > short_trigger {
        SHORT
    } else {
        HOLD
    };

    // 6. Position sizing: notional = collateral * target_leverage
    let notional: u64 = collateral as u64 * lev_u;

    // 7. Position notional cap (public policy)
    let max_notional_u: u64 = max_position_notional as u64;
    assert(notional <= max_notional_u, "position notional exceeds policy cap");

    // 8. Margin ratio floor: collateral / notional >= min_margin_ratio_bps.
    //    collateral * 10000 >= notional * min_margin_ratio_bps
    let margin_lhs: u64 = collateral as u64 * 10000;
    let margin_rhs: u64 = notional * (min_margin_ratio_bps as u64);
    assert(margin_lhs >= margin_rhs, "margin ratio below policy floor");

    // 9. New state commitment
    let new_notional: Field = if action == HOLD {
        position_notional_prev
    } else {
        notional as Field
    };
    let new_state_hash = bn254::hash_5([
        strategy_commitment,
        new_notional,
        mark_price,
        market_timestamp,
        funding_rate_bps,
    ]);

    (action, notional as Field, new_state_hash, policy_hash)
}

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
    assert(result.0 == LONG);
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
    assert(result.0 == HOLD);
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
    assert(result.0 == SHORT);
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

#[test(should_fail_with = "position notional exceeds policy cap")]
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
    // 5x leverage -> margin ratio 20%... need one that passes notional but
    // fails margin. Policy floor 2500bps (25%): 5x -> 20% margin -> reject.
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
