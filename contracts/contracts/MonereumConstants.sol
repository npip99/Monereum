pragma solidity 0.4.24;

contract MonereumConstants {
    uint256 constant MIXIN = 3;
    uint256 constant disputeTime = 2 minutes;
    // Gas prices have hit 200 gWei = (200 / (10^9)) Eth during ICOs
    // We need to maintain disputeRingProof incentives during high network congestion
    uint256 constant badRingBountyAmount = 1 ether / 10;
    uint256 constant goodRingBountyAmount = 1 ether / 10;
    uint256 constant badRingBountyAward = 1 ether / 10;
    uint256 constant goodRingBountyAward = 1 ether / 10;
}
