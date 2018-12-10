pragma solidity 0.4.25;

contract MonereumConstants {
    uint256 constant MIXIN = 3;
    uint256 constant disputeTime = 2 minutes;
    // Gas prices have hit 200 gWei = (200 / (10^9)) Eth during ICOs
    // We need to maintain disputeRingProof incentives during high network congestion
    uint256 constant badRingBountyAmount = 1 ether / 10;
    uint256 constant goodRingBountyAmount = 1 ether / 10;
    uint256 constant badRingBountyAward = 1 ether / 10;
    uint256 constant goodRingBountyAward = 1 ether / 10;

    // Math Data
    uint256 public constant p = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    uint256 public constant q = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256[2] g = [uint256(1), uint256(2)];

    // Transaction format data
    uint256 constant signBitLocation = 254;
    uint256 constant signBit = uint256(1) << signBitLocation;
    uint256 constant statusBitLocation = 255;
    uint256 constant statusBit = uint256(1) << statusBitLocation;

    // ringGroup format data
    //  255   252   212     0
    // |remaining|timer|check|
    uint256 constant rangeCommitmentCheckBitLocation = 0;
    uint256 constant rangeCommitmentCheckBitMask = (uint256(1) << 212) - 1;
    uint256 constant timerBitLocation = 212;
    uint256 constant timerBitMask = (uint256(1) << 40) - 1;
    uint256 constant rangeProofsRemainingBitLocation = 252;
    uint256 constant rangeProofsRemainingBitMask = (uint256(1) << 4) - 1;
}
