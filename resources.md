New to ZK on Stellar? Start with the two official docs pages — Privacy on Stellar[https://developers.stellar.org/docs/build/apps/privacy] and ZK Proofs on Stellar[https://developers.stellar.org/docs/build/apps/zk] — then point your AI agent at the Stellar Skills below.

Start Here: ZK & Privacy on Stellar
ZK Proofs on Stellar (docs): https://developers.stellar.org/docs/build/apps/zk — The core reference. Explains the BN254 and Poseidon/Poseidon2 host functions, what they do, and how proof verification works on Stellar. Includes code examples and links to circuit tooling.
Privacy on Stellar (docs): https://developers.stellar.org/docs/build/apps/privacy — Overview of the privacy stack: Privacy Pools, Confidential Tokens, on-chain ZK verifiers, and the underlying cryptographic primitives. The best map of the whole landscape.
Announcing Stellar X-Ray (Protocol 25): https://stellar.org/blog/developers/announcing-stellar-x-ray-protocol-25 — Background on why these primitives were added and the long-term privacy strategy behind them.
Yardstick (Protocol 26) upgrade guide: https://stellar.org/blog/foundation-news/stellar-yardstick-protocol-26-upgrade-guide — What Protocol 26 added for ZK builders and why proof verification got cheaper.
AI Development Assistance
We assume most of you will be building with an AI agent. Give it the right Stellar context first — it dramatically improves the code it writes.

Stellar Skills (start here): https://skills.stellar.org/ — Agent-readable documentation for building on Stellar, with dedicated skills for Soroban, dApps/wallets, assets, data/APIs, agentic payments, and ZK Proofs. Works with any AI agent. The simplest path: tell your agent "Read skills.stellar.org before you start building on Stellar."
ZK Proofs skill (direct): https://skills.stellar.org/skills/zk-proofs/SKILL.md — Verify Groth16 zero-knowledge proofs on Stellar using BLS12-381, BN254, and Poseidon primitives.
Stellar Dev Skill (repo): https://github.com/stellar/stellar-dev-skill — The underlying open-source skill repo. Covers Soroban, SDKs, RPC, wallet integration, passkeys, and security patterns.
Install in Claude Code: /plugin marketplace add stellar/stellar-dev-skill then /plugin install stellar-dev@stellar-dev Cursor: add stellar/stellar-dev-skill Codex: git clone [https://github.com/stellar/stellar-dev-skill](https://github.com/stellar/stellar-dev-skill) ~/.codex/skills/stellar-dev-skill

stellar-build: https://github.com/kaankacar/stellar-build — Stellar development journey installer of 42 skills covering the full journey from idea to mainnet deploy and SCF grant submission, with six DevRel-persona agents.
OpenZeppelin Skills: https://github.com/OpenZeppelin/openzeppelin-skills — Claude Code skills for secure Stellar contract development. Install: /plugin marketplace add OpenZeppelin/openzeppelin-skills and /plugin install openzeppelin-skills
Building with AI (docs): https://developers.stellar.org/docs/build/building-with-ai — Stellar's guidance on AI-assisted development.
llms.txt: https://developers.stellar.org/llms.txt — Machine-readable digest of the Stellar docs, designed to be fed into any LLM.
On-Chain ZK Verifiers (Reference Implementations)
These are the closest thing to "starter code" for this hackathon — deployable verifier contracts you can study, fork, and build on.

RISC Zero (Groth16) verifier: https://github.com/NethermindEth/stellar-risc0-verifier — Verifies Groth16 proofs created with RISC Zero's zkVM (write your provable program in Rust). Built by Nethermind's ZK team. Companion article: https://stellar.org/blog/developers/risc-zero-verifier
UltraHonk verifier (Noir / Barretenberg):
https://github.com/yugocabrio/rs-soroban-ultrahonk
https://github.com/indextree/ultrahonk_soroban_contract — Verifier for circuits built with Aztec's Noir language. A clean pattern for proving valid solutions/state without revealing them.
Stellar Private Payments (Privacy Pools PoC): https://github.com/NethermindEth/stellar-private-payments — Nethermind's proof-of-concept Privacy Pools implementation using Circom circuits, Groth16 proofs, and Stellar smart contracts. Includes a pool contract, on-chain Groth16 verifier, and ASP membership/non-membership contracts. Proofs are generated client-side in the browser via WebAssembly, so secrets never leave the device. Docs: https://nethermindeth.github.io/stellar-private-payments/
Caution: research prototype, not audited. Don't use with real assets.
ZK Circuit Tooling
Noir (Aztec): https://noir-lang.org/docs/ — A friendly, Rust-like DSL for writing ZK circuits. Pairs with the UltraHonk verifier above. Protocol 26 made Noir proof verification on Stellar significantly cheaper.
RISC Zero (zkVM): https://dev.risczero.com/ — Write your provable program in ordinary Rust and prove its execution. Pairs with the RISC Zero verifier above.
Circom: Used by the Stellar Private Payments PoC for Groth16 circuits. (See the privacy-pools repo for a worked example.)
Soroban SDK — BN254 docs: https://docs.rs/soroban-sdk/latest/soroban_sdk/_migrating/v25_bn254/index.html
Soroban SDK — Poseidon docs: https://docs.rs/soroban-sdk/latest/soroban_sdk/_migrating/v25_poseidon/index.html
Protocol CAPs (deep cuts): BN254 — CAP-0074 · Poseidon/Poseidon2 — CAP-0075 · BLS12-381 — CAP-0059
Soroban P25 preview examples: https://github.com/jayz22/soroban-examples/tree/p25-preview/p25-preview
Further Privacy Context
Confidential Token Association: https://www.confidentialtoken.org/ — Open standard (SDF, Nethermind, OpenZeppelin, Zama) for encryption-based on-chain confidentiality compatible with existing token interfaces. Overview/demo video: https://www.youtube.com/watch?v=6NnDqVQYOHM
Privacy Pools whitepaper (Buterin, Illum, Nadler, Schär, Soleimani): https://privacypools.com/whitepaper.pdf — The conceptual basis for compliant privacy pools (deposits/withdrawals visible, in-pool transfers private, with ASP allow/deny lists).
Core Stellar Dev Tools
Stellar Docs: https://developers.stellar.org/ — Core documentation for building on Stellar.
SDKs: https://developers.stellar.org/docs/tools/sdks — Libraries to interact with the network in your preferred language. (Use the latest SDK version for Protocol 26 support.)
Stellar CLI: https://developers.stellar.org/docs/tools/cli — Build, deploy, and interact with Soroban smart contracts from the command line.
Lab: https://developers.stellar.org/docs/tools/lab — Explore, test, and experiment with Stellar tools and APIs in the browser (also handy for generating + funding testnet accounts).
Quickstart: https://developers.stellar.org/docs/tools/quickstart — Run a local Stellar network via Docker for development/testing.
Scaffold Stellar: https://scaffoldstellar.org — CLI for the full Stellar app development lifecycle: contract management, testing, and deployment with best practices baked in.
Stellar Wallets Kit: https://stellarwalletskit.dev/ — Plug-and-play wallet connections with a unified API.
OpenZeppelin on Stellar: https://www.openzeppelin.com/networks/stellar — Audited contract library, Contracts Wizard, Contracts MCP server, Relayer, and Soroban security detectors.
Smart Contract Building Blocks (Docs)
Smart Contracts — Getting Started: https://developers.stellar.org/docs/build/smart-contracts/getting-started
Contract Authorization: https://developers.stellar.org/docs/build/guides/auth
Contract Storage: https://developers.stellar.org/docs/build/guides/storage
Contract Testing: https://developers.stellar.org/docs/build/guides/testing
Community Resources
Stellar Ecosystem Resources: https://github.com/stellar/ecosystem-resources/ — Workshop activations and reference guides for Soroban, wallets, DeFi protocols, OpenZeppelin, tokens, and security.
Stellar Hackathon FAQ: https://github.com/briwylde08/stellar-hackathon-faq — Community-compiled FAQ from building on Stellar.
Stellar Ecosystem DB: https://github.com/lumenloop/stellar-ecosystem-db — Searchable database of Stellar projects — useful for finding existing work before building from scratch.