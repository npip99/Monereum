pragma solidity 0.4.25;

import "./MonereumBlockchain.sol";

contract MonereumDisputeHelper is MonereumConstants {
  MonereumBlockchain mb;

  constructor(address MB) public {
    mb = MonereumBlockchain(MB);
  }

  function resolveAndClaimRingProofBounty(
      // Resolve Ring Proof
      uint256 ringGroupHash,
      uint256[2][MIXIN] funds,
      uint256[2][MIXIN] commitments,
      uint256[2] keyImage,
      uint256[2] commitment,
      uint256 borromean,
      uint256[MIXIN] imageFundProofs,
      uint256[MIXIN] commitmentProofs,
      uint256 outputHash,
      // Claim Ring Proof Bounty
      uint256[] outputIDs,
      uint256[] ringHashes,
      uint256[] rangeHashes,
      uint256[] keyImageHashes,
      uint256 ringHash
  ) public {
    mb.resolveRingProof(
      ringGroupHash,
      funds,
      commitments,
      keyImage,
      commitment,
      borromean,
      imageFundProofs,
      commitmentProofs,
      outputHash
    );
    mb.claimDisputeTopicBounty(
      outputIDs,
      ringHashes,
      rangeHashes,
      keyImageHashes,
      ringHash
    );
  }

  function resolveAndClaimRangeProofBounty(
      // Resolve Range Proof
      uint256 ringGroupHash,
      uint256[2] commitment,
      uint256[2][] rangeCommitments,
      uint256[] rangeBorromeans,
      uint256[2][] rangeProofs,
      uint256[] indices,
      // Claim Range Proof Bounty
      uint256[] outputIDs,
      uint256[] ringHashes,
      uint256[] rangeHashes,
      uint256[] keyImageHashes,
      uint256 rangeHash
  ) public {
    mb.resolveRangeProof(
      ringGroupHash,
      commitment,
      rangeCommitments,
      rangeBorromeans,
      rangeProofs,
      indices
    );
    mb.claimDisputeTopicBounty(
      outputIDs,
      ringHashes,
      rangeHashes,
      keyImageHashes,
      rangeHash
    );
  }
}
