// SPDX-License-Identifier: MIT
// ============================================================================
//  ParticipationVault — app-level Proof-of-Participation contract for Acki Nacki
// ============================================================================
//  Purpose:
//    Record each miner's daily participation (streak, boost, weight) on-chain
//    so the app has a trustless, queryable history. This is the APP-SIDE
//    participation record. The actual NACKL block-reward mining is handled by
//    the protocol-level Mobile Verifier subsystem contracts, which verify the
//    Bee Engine client's Merkle root independently. This vault complements, it
//    does not replace, that mechanism.
//
//  Language: Solidity compiled to TVM bytecode (Acki Nacki uses Solidity +
//  the TON Virtual Machine; see "Smart Contracts" in the docs). Function
//  signatures here mirror the ABI in src/abi/participation.abi.json.
//
//  Status: ILLUSTRATIVE reference. Acki Nacki's Solidity/TVM dialect has some
//  specifics (TVM instructions, ABI encoding, address format <dapp>::<account>,
//  gas in VMSHELL). Treat this as design-level pseudo-Solidity to be finalized
//  against the TVM-Solidity-Compiler (gosh_0.81.0+) before deploy.
// ============================================================================

pragma ton-solidity >= 0.81.0;
pragma AbiHeader time;
pragma AbiHeader expire;

contract ParticipationVault {
    // ---- Types -------------------------------------------------------------
    struct MinerStats {
        uint256 streakDays;
        uint256 totalWeight; // participation-weighted work, cumulative
        string  lastDay;     // YYYY-MM-DD
    }

    // miner address (uint256) -> stats
    mapping(uint256 => MinerStats) public stats;
    // (miner, day) -> weight submitted that day, to make days idempotent
    mapping(uint256 => mapping(string => uint256)) public dayWeight;

    // ---- External message: submit a participation session ------------------
    // Called by the app (via Block Manager) on behalf of an authorized miner.
    // In a freemium Dapp the gas is paid from the DappConfig credit limit, so
    // the user authorizes the action but does not need SHELL.
    //
    // boostX100 = boost * 100 (integer, fixed-point to avoid floats on TVM)
    // weight    = participation-weighted work for this batch (u64)
    function submitSession(
        address miner,
        string  day,
        uint256 streakDays,
        uint256 boostX100,
        uint256 weight
    ) external {
        // Only accept when the caller is the miner themselves or an app relayer
        // that the miner authorized via Mining Keys. A production version
        // verifies theMining Keys signature here.
        require(weight > 0, 101);
        require(boostX100 <= 1000, 102); // cap boost at 10x

        uint256 key = toUint256(miner);

        // Idempotent per (miner, day): only count the day once toward streak.
        if (dayWeight[key][day] == 0) {
            stats[key].streakDays = streakDays;
            stats[key].lastDay = day;
        }
        dayWeight[key][day] += weight;
        stats[key].totalWeight += weight;

        // Emit an event the app's indexer can subscribe to (dapp_id field is
        // auto-added by the TVM-Solidity-Compiler >= 0.81 for per-Dapp queries).
        emit SessionSubmitted(miner, day, streakDays, boostX100, weight);
    }

    // ---- Get-method: read a miner's aggregate stats (off-chain query) ------
    function getMinerStats(address miner)
        public
        view
        returns (uint256 streakDays, uint256 totalWeight, string lastDay)
    {
        MinerStats memory m = stats[toUint256(miner)];
        return (m.streakDays, m.totalWeight, m.lastDay);
    }

    // ---- Get-method: top-N leaderboard by totalWeight (capped scan) --------
    // A real leaderboard uses an off-chain indexer + GraphQL; this is a simple
    // on-chain fallback for small miner sets.
    function getDayWeight(address miner, string day) public view returns (uint256) {
        return dayWeight[toUint256(miner)][day];
    }

    // ---- Helpers -----------------------------------------------------------
    function toUint256(address a) internal pure returns (uint256) {
        // Acki Nacki addresses are 256-bit; cast for mapping keys.
        return uint256(uint160(a));
    }

    // ---- Event -------------------------------------------------------------
    event SessionSubmitted(address miner, string day, uint256 streakDays, uint256 boostX100, uint256 weight);
}
