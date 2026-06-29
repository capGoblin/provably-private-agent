// Field-friendly hash helpers that match the Noir circuit's `poseidon::bn254::hash_N`.
// The circuit uses the classic Poseidon over BN254 (consistent with Circom),
// so we mirror it off-chain via poseidon-lite so the agent can compute the
// public policy_hash that the circuit asserts on.
//
// Each arity N has its own dedicated permutation in poseidon-lite, and we
// call the matching one. All outputs are reduced mod p for safety.

import { poseidon2 as p2 } from 'poseidon-lite/poseidon2';
import { poseidon3 as p3 } from 'poseidon-lite/poseidon3';
import { poseidon4 as p4 } from 'poseidon-lite/poseidon4';
import { poseidon5 as p5 } from 'poseidon-lite/poseidon5';
import { poseidon6 as p6 } from 'poseidon-lite/poseidon6';

const BN254_FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const hex = (n: bigint) => '0x' + n.toString(16);

/** Poseidon BN254 hash with exactly N inputs (N in 2..6). */
export function poseidonHash(inputs: bigint[]): bigint {
  // Reduce each input mod p (handles negatives by mapping into [0, p)).
  const normalized = inputs.map((n) => {
    const r = n % BN254_FIELD_MODULUS;
    return r < 0n ? r + BN254_FIELD_MODULUS : r;
  });
  if (normalized.length === 2) return p2(normalized.map(hex)) % BN254_FIELD_MODULUS;
  if (normalized.length === 3) return p3(normalized.map(hex)) % BN254_FIELD_MODULUS;
  if (normalized.length === 4) return p4(normalized.map(hex)) % BN254_FIELD_MODULUS;
  if (normalized.length === 5) return p5(normalized.map(hex)) % BN254_FIELD_MODULUS;
  if (normalized.length === 6) return p6(normalized.map(hex)) % BN254_FIELD_MODULUS;
  throw new Error(`poseidonHash: unsupported arity ${normalized.length} (max 6)`);
}

/** Default hash function used off-chain — must match the circuit. */
export function hash(...inputs: bigint[]): bigint {
  return poseidonHash(inputs);
}

export function stringToField(s: string): bigint {
  return BigInt('0x' + Buffer.from(s).toString('hex').padEnd(64, '0').slice(0, 64));
}

export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('sqrt of negative');
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x;
}

export function floatToField(f: number): bigint {
  return BigInt(Math.round(f * 1000));
}
