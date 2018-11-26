pragma solidity 0.4.25;

import "./MonereumMemory.sol";
import "./MonereumVerifier.sol";

/*
Transaction Format
==================

LogTransaction
---------------
1. Sending to (A, B)
2. Generate random r
Src = rG = R
Dest = hash(rA)G + B = hash(aR)G + B, with s = aR = rA
Commitment = hash^2(s)G + bH
CommitmentAmount = (hash^3(s) + b) mod q

Alternatively, (Commitment, CommitmentAmount) = (bH, b), which means the amount is public.

Alternatively, Dest = P, where P is a public key you were given.
It is important to still generate Src so that you can sign the transaction.

TransactionID = hash(Dest)

LogRingProof
------------
funds[]
keyImage
commitment
borromean
imageFundProofs[]
commitmentProofs[]
outputHash

LogRingGroup
------------
outputIDs
ringHashes

LogRingGroup connects LogTransaction's hashes (outputIDs), to LogRingProof's hashes (ringHashes)

LogRangeProof
-------------
ringGroupHash
outputIDs
commitment
rangeCommitments
rangeBorromeans
rangeProofs
indices

*/

contract MonereumBlockchain is MonereumMemory {
    MonereumVerifier mv;

    function getMonereumVerifier() public view returns (address) {
        return mv;
    }

    constructor(address MI, address MV) MonereumMath(MI) public {
        mv = MonereumVerifier(MV);
    }

    function mint(
        uint256[2] src,
        uint256[2] dest,
        uint256 amount
    ) public {
        require(eccvalid(dest), "Dest is not on curve");
        require(isInf(src) || eccvalid(src), "Src is not on curve");
        uint256 transactionID = hashP(dest);
        require(transactions[transactionID].status == Status.NonExistant, "Transaction already exists");
        uint256[2] memory commitment = ecmul(h, amount);
        transactions[transactionID].commitment = compress(commitment);
        transactions[transactionID].status = Status.Accepted;
        emit LogTransaction(
            transactionID,
            src,
            dest,
            commitment,
            amount
        );
    }

    function getBalance(address addr) public view returns (uint256) {
        return ethBalances[addr];
    }

    function withdrawEthereum(uint256 amount) public {
        address sender = msg.sender;
        require(ethBalances[sender] >= amount, "Not enough funds");
        ethBalances[sender] -= amount;
        sender.transfer(amount);
    }

    function depositEthereum(
        address addr,
        uint256 amount
    ) public payable {
        ethBalances[addr] += amount;
    }
    
    function isValidRingGroup(uint256 ringGroupHash) public constant returns (bool) {
        uint256 ringGroupTime = ringGroupTimes[ringGroupHash];
        return ringGroupTime != 0 && ringGroupTime != frozenTime;
    }

    function disputeRingGroup(
        uint256 ringGroupHash,
        uint256 disputedTopicHash,
        uint256[] outputIDs
    ) internal {
        require(isValidRingGroup(ringGroupHash), "ringGroup does not exist");
        require(transactions[outputIDs[0]].status == Status.Pending, "Transaction is not pending");
        for (uint256 i = 0; i < outputIDs.length; i++) {
            transactions[outputIDs[i]].status = Status.Disputed;
        }
        address sender = msg.sender;
        require(ethBalances[sender] >= badRingBountyAmount, "cannot afford bounty");
        ethBalances[sender] -= badRingBountyAmount;
        badDisputeTopicBountyHolders[disputedTopicHash] = sender;
    }

    function resolveClaim(
        uint256[] outputIDs,
        uint256 ringGroupHash,
        address badRingBountyHolder,
        ProofStatus disputedProofStatus
    ) internal {
        require(isValidRingGroup(ringGroupHash), "ringGroup does not exist");
        if (disputedProofStatus == ProofStatus.Accepted) {
            for(uint256 i = 0; i < outputIDs.length; i++) {
               transactions[outputIDs[i]].status = Status.Pending;
            }
            ringGroupTimes[ringGroupHash] = block.timestamp + disputeTime;
            ethBalances[msg.sender] += goodRingBountyAward;
        } else if (disputedProofStatus == ProofStatus.Rejected) {
            for(i = 0; i < outputIDs.length; i++) {
               transactions[outputIDs[i]].status = Status.Rejected;
            }
            ethBalances[badRingBountyHolder] += badRingBountyAward;
            ringGroupTimes[ringGroupHash] = 0;
        } else {
            require(false, "Proof status is still unknown");
        }
    }

    function claimRangeProofBounty(
        uint256 ringGroupHash,
        uint256[] outputIDs,
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    ) public {
        uint256 rangeProofHash = uint256(keccak256(abi.encode(
            ringGroupHash,
            outputIDs,
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        )));
        address badRingBountyHolder = badDisputeTopicBountyHolders[rangeProofHash];
        require(badRingBountyHolder != 0, "range proof is not contested");
        ProofStatus disputedRingStatus = rangeStatuses[rangeProofHash];
        resolveClaim(
            outputIDs,
            ringGroupHash,
            badRingBountyHolder,
            disputedRingStatus
        );
        badDisputeTopicBountyHolders[rangeProofHash] = 0;
    }

    function disputeRangeProof(
        uint256 ringGroupHash,
        uint256[] outputIDs,
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    ) public {
        uint256 rangeProofHash = uint256(keccak256(abi.encode(
            ringGroupHash,
            outputIDs,
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        )));
        require(rangeStatuses[rangeProofHash] == ProofStatus.Unknown);
        disputeRingGroup(
            ringGroupHash,
            rangeProofHash,
            outputIDs
        );
    }

    function resolveRangeProof(
        uint256 ringGroupHash,
        uint256[] outputIDs,
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    ) public {
        uint256 rangeProofHash = uint256(keccak256(abi.encode(
            ringGroupHash,
            outputIDs,
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        )));
        bool isValid = mv.verifyRangeProof(
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        );

        if (isValid) {
            rangeStatuses[rangeProofHash] = ProofStatus.Accepted;
        } else {
            rangeStatuses[rangeProofHash] = ProofStatus.Rejected;
        }
    }
    
    event RingGroupCommitted(uint256 ringGroupHash);
    
    function commitRingGroup(
        uint256[] outputIDs,
        uint256[] ringHashes
    ) public {
        uint256 ringGroupHash = uint256(keccak256(abi.encode(
            outputIDs,
            ringHashes
        )));
        require(isValidRingGroup(ringGroupHash), "ringGroup does not exist");
        uint256 ringGroupTime = ringGroupTimes[ringGroupHash];
        require(ringGroupTime <= block.timestamp, "Not enough time has passed");
        require(transactions[outputIDs[0]].status == Status.Pending, "Transaction is not pending");
        for (uint256 i = 0; i < outputIDs.length; i++) {
            transactions[outputIDs[i]].status = Status.Accepted;
        }
        if (ringGroupTime + disputeTime <= block.timestamp) {
            ethBalances[msg.sender] += goodRingBountyAmount;
        } else {
            ethBalances[goodRingGroupBountyHolders[ringGroupHash]] += goodRingBountyAmount;
        }
        
        emit RingGroupCommitted(ringGroupHash);

        // Claim gas
        goodRingGroupBountyHolders[ringGroupHash] = 0;
        ringGroupTimes[ringGroupHash] = 0;
    }

    function isInSet(uint256 val, uint256[] set) internal pure returns (bool) {
        bool found = false;
        for(uint256 i = 0; i < set.length; i++) {
            if (set[i] == val) {
                found = true;
            }
        }
        return found;
    }

    function claimRingBounty(
        uint256[] outputIDs,
        uint256[] ringHashes,
        uint256 ringHash
    ) public {
        uint256 ringGroupHash = uint256(keccak256(abi.encode(
            outputIDs,
            ringHashes
        )));
        require(isValidRingGroup(ringGroupHash), "ringGroup does not exist");
        require(isInSet(ringHash, ringHashes), "ringHash is not in ringGroup");
        address badRingBountyHolder = badDisputeTopicBountyHolders[ringHash];
        // Checks if this is the disputed ring
        require(badRingBountyHolder != 0, "ring is not disputed");
        ProofStatus disputedRingStatus = ringStatuses[ringHash];
        resolveClaim(
            outputIDs,
            ringGroupHash,
            badRingBountyHolder,
            disputedRingStatus
        );

        // Ring is no longer being disputed
        badDisputeTopicBountyHolders[ringHash] = 0;
    }

    function disputeRingProof(
        uint256[] outputIDs,
        uint256[] ringHashes,
        uint256 ringHash
    ) public {
        uint256 ringGroupHash = uint256(keccak256(abi.encode(
            outputIDs,
            ringHashes
        )));
        require(isInSet(ringHash, ringHashes), "ringHash is not in ringGroup");
        require(ringStatuses[ringHash] == ProofStatus.Unknown, "ring has already been contested");
        disputeRingGroup(
            ringGroupHash,
            ringHash,
            outputIDs
        );
    }

    function resolveRingProof(
        uint256[2][MIXIN] funds,
        uint256[2][MIXIN] commitments,
        uint256[2] keyImage,
        uint256[2] commitment,
        uint256 borromean,
        uint256[MIXIN] imageFundProofs,
        uint256[MIXIN] commitmentProofs,
        uint256 outputHash
    ) public {
        uint256 ringHash = uint256(keccak256(abi.encode(
            funds,
            keyImage,
            commitment,
            borromean,
            imageFundProofs,
            commitmentProofs,
            outputHash
        )));
        for (uint256 i = 0; i < MIXIN; i++) {
            // Sqrt exists since transactions are validated
            uint256 commitmentX = transactions[hashP(funds[i])].commitment;
            uint256 ySign = (commitmentX & signBit) >> 255;
            commitmentX &= ~signBit;
            require((commitments[i][1] & 1) != ySign, "Wrong square root for y");
            require(commitments[i][0] == commitmentX, "Wrong commitment value");
            require(isInf(commitments[i]) || eccvalid(commitments[i]), "commitment is not on curve");
        }
        bool isValid = mv.verifyRingProof(
            funds,
            commitments,
            keyImage,
            commitment,
            borromean,
            imageFundProofs,
            commitmentProofs,
            outputHash
        );

        if (isValid) {
            ringStatuses[ringHash] = ProofStatus.Accepted;
        } else {
            ringStatuses[ringHash] = ProofStatus.Rejected;
        }
    }

    // We check all lengths are the same and reasonable
    // Verified: rangeProofCommitment[ringGroupHash][rangeProofHash] == Commitment
    // rangeProofCommitment[ringGroupHash][rangeProofHash] = 0
    // rangeProofsRemaining[ringGroupHash]--
    // If rangeProofsRemaining == 0
    //     ringGroupTimes[ringGroupHash] = block.timestamp + disputeTime

    function logRangeProof(
        // Used to get ringGroupHash and connect to outputIDs
        uint256[] ringHashes,
        // Range Proof Hash
        uint256[] outputIDs,
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    ) public {
        uint256 ringGroupHash = uint256(keccak256(abi.encode(
            outputIDs,
            ringHashes
        )));
        require(ringGroupTimes[ringGroupHash] == frozenTime, "ringGroup does not exist");
        uint256 bits = indices.length;
        require(rangeCommitments.length == bits);
        require(rangeBorromeans.length == bits);
        require(rangeProofs.length == bits);
        require(1 <= bits && bits <= 16);
        uint256 rangeProofHash = uint256(keccak256(abi.encode(
            ringGroupHash,
            outputIDs,
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        )));
        emit LogRangeProof(
            ringGroupHash,
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        );
        require(rangeProofCommitment[ringGroupHash][rangeProofHash] == hashP(commitment));
        rangeProofCommitment[ringGroupHash][rangeProofHash] = 0;
        rangeProofsRemaining[ringGroupHash]--;
        if (rangeProofsRemaining[ringGroupHash] == 0) {
            ringGroupTimes[ringGroupHash] = block.timestamp + disputeTime;
        }
    }

    event LogRangeProof(
        uint256 ringGroupHash,
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    );

    struct Variables {
        uint256[2] keyImage;
        uint256[2] commitmentSum;
        uint256[2] minerFeeCommitment;
        uint256 numOutputs;
        uint256 numRangeProofs;
        uint256 outputHash;
        uint256 ringHash;
        uint256 transactionID;
        uint256 R;
        uint256 i;
        uint256 ring;
        uint256 bounty;
        uint256 ringGroupHash;
        uint256 outputID;
        address sender;
        uint256[] ringHashes;
        uint256[] outputIDs;
    }

    function saveMinerFee(uint256 fee) public {
        require(fee < (uint256(1) << 64));
        require(fee != 0);
        minerFeeH[fee] = ecmul(h, fee);
    }

    // Maps N input rings, to M output transactions
    // All lengths are verified to be consistent
    // outputHash = hash(outputDest, outputSrc, outputCommitments, commitmentAmounts, minerFee)
    // commitmentAmounts is known to be < q
    // Each ringHash is a hash of a ringProof:
    //     funds <- Verified: Status of Hash(funds_i) is Accepted
    //     keyImage <- Verified: usedImages[hash(keyImage)] is false. It is then updated to true.
    //     commitment <- Verified: Inf or on curve
    //     borromean
    //     imageFundProofs
    //     commitmentProofs
    //     outputHash
    // Verified: outputCommitment_i is Inf or on curve
    // Verified: Sum_i(commitment_i) = Sum_i(outputCommitment_i) + minerFee*H
    // Each ringProof is logged
    // ringHashes = [ringHash_0, ..., ringHash_{N-1}]
    // outputIDs = [hash(outputDest_0), ..., hash(outputDest_{M-1}), hash(minerDest)] <- All verified don't exist yet. All now set to Pending
    // ringGroupHash = hash(outputIDs, ringHashes)
    // ringGroupTimes[ringGroupHash] = 2^250
    // Verified: rangeProofHashes are unique
    // rangeProofCommitment[ringGroupHash][rangeProofHashes_i] = hash(ringProof_i.commitment) for all i
    // rangeProofsRemaining[ringGroupHash] = M
    // ethBalances[msg.sender] -= goodRingBountyAmount (Overflow checked)
    
    uint256 frozenTime = uint256(1) << 255;

    function submit(
        // N Input Rings
        uint256[2][MIXIN][] funds,
        // N Ring Proofs
        uint256[2][] keyImage,
        uint256[2][] commitment,
        uint256[] borromean,
        uint256[MIXIN][] imageFundProofs,
        uint256[MIXIN][] commitmentProofs,
        // M Range Proofs
        uint256[] rangeProofHashes,
        // M Outputs
        uint256[2][] outputDests,
        uint256[2][] outputSrcs,
        uint256[2][] outputCommitments,
        uint256[] commitmentAmounts,
        uint256 minerFee,
        // Miner
        uint256[2] minerDest
    ) public {
        // Can't declare variables as memory, so group them into a struct
        // (We're already at stack limits for this function)
        Variables memory v;

        v.R = funds.length;
        require(keyImage.length == v.R);
        require(commitment.length == v.R);
        require(borromean.length == v.R);
        require(imageFundProofs.length == v.R);
        require(commitmentProofs.length == v.R);
        require(v.R > 0 && v.R < 5, "Only 1...4 rings are allowed");

        v.numOutputs = outputDests.length;
        require(outputSrcs.length == v.numOutputs);
        require(outputCommitments.length == v.numOutputs);
        require(v.numOutputs > 0 && v.numOutputs < 5, "Only 1...4 outputs are allowed");

        v.outputHash = uint256(keccak256(
            // encodePacked loses length information so we must use .encode everywhere
            // otherwise outputsDests[-1] could be shifted into outputSrcs[0] with same hash
            abi.encode(outputDests, outputSrcs, outputCommitments, commitmentAmounts, minerFee)
        ));

        v.ringHashes = new uint256[](v.R);

        v.commitmentSum = [uint256(0), uint256(0)];
        for (v.ring = 0; v.ring < v.R; v.ring++) {
            v.keyImage = keyImage[v.ring];
            require(!usedImages[hashP(v.keyImage)], "keyImage is already used");
            for ( v.i = 0; v.i < MIXIN; v.i++ ) {
                v.transactionID = hashP(funds[v.ring][v.i]);
                require(transactions[v.transactionID].status == Status.Accepted, "Transaction has not been accepted yet");
            }
            v.ringHash = uint256(keccak256(abi.encode(
                funds[v.ring],
                v.keyImage,
                commitment[v.ring],
                borromean[v.ring],
                imageFundProofs[v.ring],
                commitmentProofs[v.ring],
                v.outputHash
            )));
            emit LogRingProof(
                v.ringHash,
                funds[v.ring],
                v.keyImage,
                commitment[v.ring],
                borromean[v.ring],
                imageFundProofs[v.ring],
                commitmentProofs[v.ring],
                v.outputHash
            );
            require(isInf(commitment[v.ring]) || eccvalid(commitment[v.ring]), "Input commitments must be on curve");
            v.commitmentSum = ecadd(v.commitmentSum, commitment[v.ring]);
            v.ringHashes[v.ring] = v.ringHash;
            usedImages[hashP(v.keyImage)] = true;
        }

        v.outputIDs = new uint256[](v.numOutputs + 1);
        for (v.i = 0; v.i < v.numOutputs; v.i++) {
            require(eccvalid(outputDests[v.i]), "Not all output dests are on curve");
            v.outputIDs[v.i] = hashP(outputDests[v.i]);
        }
        require(eccvalid(minerDest), "Miner destination is not on curve");
        v.outputIDs[v.numOutputs] = hashP(minerDest);

        v.ringGroupHash = uint256(keccak256(abi.encode(
            v.outputIDs,
            v.ringHashes
        )));
        ringGroupTimes[v.ringGroupHash] = frozenTime;
        emit LogRingGroup(
            v.ringGroupHash,
            v.outputIDs,
            v.ringHashes
        );

        require(rangeProofHashes.length == v.numOutputs);
        for( v.i = 0; v.i < v.numOutputs; v.i++ ) {
            v.outputID = v.outputIDs[v.i];
            require(transactions[v.outputID].status == Status.NonExistant, "Output transaction already exists");
            transactions[v.outputID].commitment = compress(outputCommitments[v.i]);
            transactions[v.outputID].status = Status.Pending;
            emit LogTransaction(
                v.outputID,
                outputSrcs[v.i],
                outputDests[v.i],
                outputCommitments[v.i],
                commitmentAmounts[v.i]
            );
            require(commitmentAmounts[v.i] < q, "commitmentAmount is not in Q");
            require(rangeProofCommitment[v.ringGroupHash][rangeProofHashes[v.i]] == 0, "rangeHash was given twice");
            rangeProofCommitment[v.ringGroupHash][rangeProofHashes[v.i]] = hashP(outputCommitments[v.i]);
            require(isInf(outputCommitments[v.i]) || eccvalid(outputCommitments[v.i]), "Commitment sum failed; not all output commitments are on curve");
            v.commitmentSum = ecadd(v.commitmentSum, [outputCommitments[v.i][0], p - outputCommitments[v.i][1]]);
        }

        if (minerFee == 0) {
            v.minerFeeCommitment = [uint256(0), uint256(0)];
        } else {
            v.minerFeeCommitment = minerFeeH[minerFee];
            require(v.minerFeeCommitment[0] != 0, "Miner Fee has not been calculated yet");
        }
        require(v.commitmentSum[0] == v.minerFeeCommitment[0], "Commitment sum failed; Does not sum to zero");
        require(v.commitmentSum[1] == v.minerFeeCommitment[1], "Commitment sum failed; Does not sum to zero");

        v.outputID = v.outputIDs[v.numOutputs];
        require(transactions[v.outputID].status == Status.NonExistant, "Miner transaction already exists");
        transactions[v.outputID].commitment = compress(v.minerFeeCommitment);
        transactions[v.outputID].status = Status.Pending;
        emit LogTransaction(
            v.outputID,
            [uint256(0), uint256(0)],
            minerDest,
            v.minerFeeCommitment,
            minerFee
        );

        rangeProofsRemaining[v.ringGroupHash] = v.numOutputs;

        v.sender = msg.sender;
        require(ethBalances[v.sender] >= goodRingBountyAmount, "Not enough funds for bounty");
        ethBalances[v.sender] -= goodRingBountyAmount;
    }

    event LogTransaction(
        uint256 outputID,
        uint256[2] src,
        uint256[2] dest,
        uint256[2] commitment,
        uint256 commitmentAmount
    );

    event LogRingGroup(
        uint256 ringGroupHash,
        uint256[] outputIDs,
        uint256[] ringHashes
    );

    event LogRingProof(
        uint256 ringHash,
        uint256[2][MIXIN] funds,
        uint256[2] keyImage,
        uint256[2] commitment,
        uint256 borromean,
        uint256[MIXIN] imageFundProofs,
        uint256[MIXIN] commitmentProofs,
        uint256 outputHash
    );
}
