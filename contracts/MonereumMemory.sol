pragma solidity 0.4.25;

import "./MonereumMath.sol";

contract MonereumMemory is MonereumMath {
    // === Internal Memory ===

    // Blockchain state
    mapping(uint256 => uint256) transactions;
    mapping(uint256 => Status) statusData;
    mapping(uint256 => uint256) keyImageToRingGroup;

    // Ethereum balances
    mapping(address => uint256) ethBalances;

    // Precalculated minerFee * H values
    mapping(uint256 => uint256[2]) minerFeeH;

    // Ring group data
    mapping(uint256 => uint256) ringGroupData;
    mapping(uint256 => address) goodRingGroupBountyHolders;

    // Topic data. A Topic can be any ring/range proof hash.
    // ringGroupHash => Dispute Topic => Bounty Holder.
    mapping(uint256 => mapping(uint256 => address)) badDisputeTopicBountyHolders;
    // ringGroupHash => Dispute Topic => Topic Status
    mapping(uint256 => mapping(uint256 => ProofStatus)) topicStatuses;

    // Range proof data
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
