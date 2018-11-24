pragma solidity 0.4.25;

import "./MonereumMath.sol";
import "./MonereumConstants.sol";

contract MonereumMemory is MonereumConstants, MonereumMath {
    // === Internal Memory ===

    // Blockchain state
    mapping(uint256 => Transaction) transactions;
    mapping(uint256 => bool) usedImages;

    // Ethereum balances
    mapping(address => uint256) ethBalances;

    // Precalculated minerFee * H values
    mapping(uint256 => uint256[2]) minerFeeH;

    // Ring group data
    mapping(uint256 => uint256) ringGroupTimes;
    mapping(uint256 => uint256) rangeProofsRemaining;
    mapping(uint256 => mapping(uint256 => uint256)) rangeProofCommitment;
    mapping(uint256 => address) goodRingGroupBountyHolders;
    // Dispute Topic can be any ring, or any range proof
    mapping(uint256 => address) badDisputeTopicBountyHolders;

    // Ring proof data
    mapping(uint256 => ProofStatus) ringStatuses;

    // Range proof data
    mapping(uint256 => ProofStatus) rangeStatuses;
    mapping(uint256 => uint256) rangeToRingGroup;

    // === Data Formats ===
    enum Status {
        NonExistant,
        Pending,
        Accepted,
        Disputed,
        Rejected
    }

    enum ProofStatus {
        Unknown,
        Rejected,
        Accepted
    }

    struct Transaction {
        uint256 commitment;
        Status status;
    }

    struct RangeProof {
        uint256[2] commitment;
        uint256[2][] rangeCommitments;
        uint256[] rangeBorromeans;
        uint256[2][] rangeProofs;
        uint256[] indices;
    }

    struct RingProof {
        uint256[2][MIXIN] funds;
        uint256[2] keyImage;
        uint256[2] commitment;
        uint256 borromean;
        uint256[MIXIN] imageFundProofs;
        uint256[MIXIN] commitmentProofs;
        uint256 outputHash;
    }
}
