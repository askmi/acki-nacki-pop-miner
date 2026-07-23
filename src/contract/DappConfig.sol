// SPDX-License-Identifier: MIT
// ============================================================================
//  DappConfig — freemium fee-subsidy service contract for this Dapp ID
// ============================================================================
//  Purpose (from "Fee System" docs):
//    "To enable the fee-factory mechanism for your Dapp ID, deploy the special
//     DappConfig contract. DappConfig is not the main contract of your Dapp. It
//     is a service contract that manages the Dapp credit limit and automatically
//     replenishes its contracts."
//
//  Flow:
//    1) Deploy DappConfig once per Dapp ID and top up its balance with SHELL.
//    2) When your Dapp contracts run low, they call the TVM instruction
//       `gosh.mintshell` / `gosh.mintshellq` to mint VMSHELL 1:1 from the
//       DappConfig available limit and credit it to their own balance.
//    3) During block production the Block Keeper adjusts: the DappConfig limit
//       is charged only for the remainder (generated VMSHELL minus gas actually
//       spent on internal messages inside the Dapp). Net effect: fees paid for
//       messages WITHIN the same thread are compensated, so they circulate
//       inside the Dapp instead of becoming user expenses.
//
//  Properties (from docs):
//    - Deployed once per Dapp ID. Can be deployed at any time.
//    - Has NO owner — any user can top up its balance.
//    - `available_balance` = max SHELL credit within which Dapp contracts can
//      mint VMSHELL.
//    - System contracts use a system DappConfig with is_unlimit = true.
//
//  Status: ILLUSTRATIVE. The real DappConfig is a documented protocol contract
//  you deploy via the "Dapp ID Full Guide"; this file sketches the interface so
//  the architecture is complete. You typically do NOT hand-write DappConfig —
//  you deploy the canonical one and just top it up.
// ============================================================================

pragma ton-solidity >= 0.81.0;
pragma AbiHeader time;
pragma AbiHeader expire;

contract DappConfig {
    // Maximum SHELL credit available for this Dapp ID's contracts to mint
    // VMSHELL from. Reduced as VMSHELL is minted; topped up by anyone.
    uint128 public available_balance;

    // System configs set this true to bypass the available_balance limit.
    bool    public is_unlimit;

    /// Top up the credit limit. Anyone may call (no owner by design).
    function topUp(uint128 amount) external {
        // Accept incoming SHELL (msg.value in VMSHELL) and increase the limit.
        available_balance += amount;
    }

    /// View the current credit limit.
    function getAvailable() public view returns (uint128) {
        return available_balance;
    }
}
