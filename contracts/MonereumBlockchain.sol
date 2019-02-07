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
        initializeH();
    }

    // Save miner fee so it doesn't have to be computed each time
    function saveMinerFee(uint256 fee) public {
        require(fee < (uint256(1) << 64));
        require(fee != 0);
        minerFeeH[fee] = ecmul(h, fee);
    }

    // Mint Monereum
    function mint(
        uint256[2] src,
        uint256[2] dest,
        uint256 amount
    ) public {
        require(eccvalid(dest)); // "Dest is not on curve"
        require(isInf(src) || eccvalid(src)); // "Src is not on curve"
        uint256 transactionID = hashP(dest);
        require(getStatus(transactionID) == Status.NonExistant); // "Transaction already exists"
        uint256[2] memory commitment = ecmul(h, amount);
        transactions[transactionID] = hashP(commitment) | statusBit;

        emit LogTransaction(
            transactionID,
            src,
            dest,
            commitment,
            amount
        );
        emit LogMintTransaction(transactionID);
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
    // rangeProofCommitment[ringGroupHash] = hash(ringProof_i.commitment) ^ ... for all i
    // Verified: Each ringProof commitment is unique
    // rangeProofsRemaining[ringGroupHash] = M
    // ethBalances[msg.sender] -= goodRingBountyAmount (Overflow checked)

    // Submits a new ring group
    // =====================
    // Requires 1 <= N, M <= 4
    // Requires Funds/keyImage/Commitments to be ECC Points
    // Requires imageFundProofs/commitmentProofs to be in Q
    // Requires outputDests to be ECC Points
    // Requires outputSrcs to be ECC Points
    // Requires amounts to be in Q
    // Requires minerDest to be an ECC Point
    // Requires all Funds to be accepted
    // Requires Sum(inputCommitments) = Sum(outputCommitments) + minerFee*H
    // Requires keyImage to have not been used before
    // Requires outputDests and minerDest to have not been used before
    // Requires submitter to have enough ETH for bounty on good ring
    // ------------------------------------------------
    // Logs each ring proof
    // Calculates ringGroupHash
    // Logs ring group
    // Sets the ring group's commitment check to XOR(HashP(outputCommitment_i))
    // Sets the ring group's range proof remaining to M
    // Sets the ring group's late range proof timer to now + disputeTime
    // Sets each transaction to hash(commitment)
    // Sets each transaction status to pending
    // Logs each transaction
    // Takes bounty on good ring
    // Sets bounty holder to msg.sender
    // ================================
    function submitRingGroup(
        // N Input Rings
        uint256[2][MIXIN][] funds,
        // N Ring Proofs
        uint256[2][] keyImage,
        uint256[2][] commitment,
        uint256[] borromean,
        uint256[MIXIN][] imageFundProofs,
        uint256[MIXIN][] commitmentProofs,
        // M Range Proofs
        uint256[] rangeHashes,
        // M Outputs
        uint256[2][] outputDests,
        uint256[2][] outputSrcs,
        uint256[2][] outputCommitments,
        uint256[] outputAmounts, // Size M + 1, including minerFee
        bytes outputMsgs,
        // Miner
        uint256[2] minerDest
    ) public {
        SubmitVariables memory v;

        // Validate number of rings
        v.R = funds.length;
        require(v.R > 0 && v.R < 5); // "Only 1...4 rings are allowed"
        require(keyImage.length == v.R);
        require(commitment.length == v.R);
        require(borromean.length == v.R);
        require(imageFundProofs.length == v.R);
        require(commitmentProofs.length == v.R);

        // Validate number of range proofs
        v.numOutputs = rangeHashes.length;
        require(v.numOutputs > 0 && v.numOutputs < 5); // "Only 1...4 outputs are allowed"
        require(outputDests.length == v.numOutputs);
        require(outputSrcs.length == v.numOutputs);
        require(outputCommitments.length == v.numOutputs);
        require(outputAmounts.length == v.numOutputs + 1);

        // Miner fee is last output
        v.minerFee = outputAmounts[v.numOutputs];

        // Get outputHash (It's required that the proofs sign all of this data)
        v.outputHash = uint256(keccak256(
            // encodePacked loses length information so we must use .encode everywhere
            // otherwise outputsDests[-1] could be shifted into outputSrcs[0] with same hash
            abi.encode(outputDests, outputSrcs, outputCommitments, outputAmounts, outputMsgs)
        ));

        // Checking Inputs = Outputs + MinerFee
        v.commitmentSum = [uint256(0), uint256(0)];

        v.ringHashes = new uint256[](v.R);

        for (v.ring = 0; v.ring < v.R; v.ring++) {
            // Check that all inputs have been accepted
            for ( v.i = 0; v.i < MIXIN; v.i++ ) {
                v.transactionID = hashP(funds[v.ring][v.i]);
                require(getStatus(v.transactionID) == Status.Accepted); // "Transaction has not been accepted yet"
            }

            // Check that proofs are in Q
            for ( v.i = 0; v.i < MIXIN; v.i++ ) {
                require(imageFundProofs[v.ring][v.i] < q && commitmentProofs[v.ring][v.i] < q);
            }

            // Check and save commitmentSum for this input
            require(eccvalid(commitment[v.ring])); // "Input commitments must be on curve"
            v.commitmentSum = ecadd(v.commitmentSum, commitment[v.ring]);

            // Calculate ringHash
            v.ringHashes[v.ring] = uint256(keccak256(abi.encode(
                funds[v.ring],
                keyImage[v.ring],
                commitment[v.ring],
                borromean[v.ring],
                imageFundProofs[v.ring],
                commitmentProofs[v.ring],
                v.outputHash
            )));

            // Log ring proof
            emit LogRingProof(
                v.ringHashes[v.ring],
                funds[v.ring],
                keyImage[v.ring],
                commitment[v.ring],
                borromean[v.ring],
                imageFundProofs[v.ring],
                commitmentProofs[v.ring],
                v.outputHash
            );
        }

        // Create and validate outputID list
        v.outputIDs = new uint256[](v.numOutputs + 1);
        for (v.i = 0; v.i < v.numOutputs; v.i++) {
            require(eccvalid(outputDests[v.i])); // "Not all output dests are on curve"
            v.outputIDs[v.i] = hashP(outputDests[v.i]);
            require(getStatus(v.outputIDs[v.i]) == Status.NonExistant); // "Output transaction already exists"
        }
        require(eccvalid(minerDest)); // "Miner destination is not on curve"
        v.outputIDs[v.numOutputs] = hashP(minerDest);
        require(getStatus(v.outputIDs[v.numOutputs]) == Status.NonExistant); // "Output transaction already exists"

        // Calculate ringGroupHash
        v.ringGroupHash = uint256(keccak256(abi.encode(
            v.outputIDs,
            v.ringHashes,
            rangeHashes
        )));

        // Log ring group
        emit LogRingGroup(
            v.ringGroupHash,
            v.outputIDs,
            v.ringHashes,
            rangeHashes,
            outputMsgs
        );

        // Validate key images as unused, and save associated ring group
        for ( v.ring = 0; v.ring < v.R; v.ring++ ) {
          v.keyImage = keyImage[v.ring];
          require(eccvalid(v.keyImage));
          v.keyImageHash = hashP(v.keyImage);
          require(keyImageToRingGroup[v.keyImageHash] == 0); // "keyImage is already used"
          keyImageToRingGroup[v.keyImageHash] = v.ringGroupHash;
        }

        // commitmentCheck is the cummulative xor of each output commitment
        v.rangeProofCommitmentCheck = 0;
        for( v.i = 0; v.i < v.numOutputs; v.i++ ) {
            // Get outputID
            v.outputID = v.outputIDs[v.i];

            // Validate transaction information
            require(eccvalid(outputSrcs[v.i]));
            // outputDest already validated
            require(outputAmounts[v.i] < q); // "commitmentAmount is not in Q"
            require(eccvalid(outputCommitments[v.i])); // "Commitment sum failed; not all output commitments are on curve"

            v.commitmentHash = hashP(outputCommitments[v.i]);
            // Require unique outputCommitments
            for ( v.j = 0; v.j < v.i; v.j++) {
                require(v.commitmentHash != hashP(outputCommitments[v.j])); // "Each output commitment must be unique"
            }
            // Update commitmentCheck
            v.rangeProofCommitmentCheck ^= v.commitmentHash;

            // Subtract outputs from inputs
            v.commitmentSum = ecadd(v.commitmentSum, [outputCommitments[v.i][0], p - outputCommitments[v.i][1]]);

            // Save and Log output transaction
            transactions[v.outputID] = hashP(outputCommitments[v.i]) & ~statusBit;
            emit LogTransaction(
                v.outputID,
                outputSrcs[v.i],
                outputDests[v.i],
                outputCommitments[v.i],
                outputAmounts[v.i]
            );
        }

        // Save commitmentCheck, number of needed range proofs, and late range proof timer
        v.rangeProofCommitmentCheck &= rangeCommitmentCheckBitMask;
        setRingGroupInfo(v.ringGroupHash, v.rangeProofCommitmentCheck, v.numOutputs, block.number + disputeTime);

        // Get minerFeeCommitment (Validates minerFee)
        if (v.minerFee == 0) {
            v.minerFeeCommitment = [uint256(0), uint256(0)];
        } else {
            v.minerFeeCommitment = minerFeeH[v.minerFee];
            if (v.minerFeeCommitment[0] == 0) {
                saveMinerFee(v.minerFee);
                v.minerFeeCommitment = minerFeeH[v.minerFee];
            }
        }

        // Checking: Inputs - Outputs = MinerFee (Inputs = Outputs + MinerFee)
        require(v.commitmentSum[0] == v.minerFeeCommitment[0]); // "Commitment sum failed; Does not sum to zero"
        require(v.commitmentSum[1] == v.minerFeeCommitment[1]); // "Commitment sum failed; Does not sum to zero"

        // Get minerFee outputID
        v.outputID = v.outputIDs[v.numOutputs];

        // Save and log minerFee transaction
        transactions[v.outputID] = hashP(v.minerFeeCommitment) & ~statusBit;
        emit LogTransaction(
            v.outputID,
            [uint256(0), uint256(0)],
            minerDest,
            v.minerFeeCommitment,
            v.minerFee
        );

        // Collect bounty on good ring
        v.sender = msg.sender;
        require(ethBalances[v.sender] >= goodRingBountyAmount); // "Not enough funds for bounty"
        ethBalances[v.sender] -= goodRingBountyAmount;

        // Set as good ring bounty holder
        goodRingGroupBountyHolders[v.ringGroupHash] = v.sender;
    }

    // We check all lengths are the same and reasonable
    // Verified: rangeProofCommitment[ringGroupHash][rangeProofHash] == Commitment
    // rangeProofCommitment[ringGroupHash][rangeProofHash] = 0
    // rangeProofsRemaining[ringGroupHash]--
    // If rangeProofsRemaining == 0
    //     ringGroupTimes[ringGroupHash] = block.number + disputeTime

    function submitRangeProof(
        // Used to get ringGroupHash and connect to outputIDs
        uint256[] outputIDs,
        uint256[] ringHashes,
        uint256[] rangeHashes,
        // Range Proof Hash
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    ) public {
        // Associate rangeHashes with ringGroupHash
        uint256 ringGroupHash = uint256(keccak256(abi.encode(
            outputIDs,
            ringHashes,
            rangeHashes
        )));

        // Validate ringGroupHash and submitter
        (uint256 rangeCommitmentCheck, uint256 rangeProofsRemaining, uint256 ringGroupTime) = getRingGroupInfo(ringGroupHash);
        require(rangeProofsRemaining > 0, "Not enough range proofs remaining");
        require(msg.sender == goodRingGroupBountyHolders[ringGroupHash], "Wrong submitter");

        // Validate rangeProofHash
        uint256 rangeProofHash = uint256(keccak256(abi.encode(
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        )));
        require(isInSet(rangeProofHash, rangeHashes), "Range Hash does not match Ring Group");

        // Validate bitlength
        uint256 bits = indices.length;
        require(1 <= bits && bits <= 16);
        require(rangeCommitments.length == bits);

        // Calculate next iteration's parameters
        rangeCommitmentCheck = (rangeCommitmentCheck ^ hashP(commitment)) & rangeCommitmentCheckBitMask;
        rangeProofsRemaining--;

        if (rangeProofsRemaining == 0) {
            if (rangeCommitmentCheck == 0) {
                // Begin accepting disputes
                setRingGroupInfo(ringGroupHash, 0, 0, block.number + disputeTime);
            } else {
                // xors of hashP(commitment_i) must match the original submission
                require(false, "Ring Commitments did not match");
            }
        } else {
            // Prepare next iteration
            setRingGroupInfo(ringGroupHash, rangeCommitmentCheck, rangeProofsRemaining, ringGroupTime);
        }

        // Log range proof
        emit LogRangeProof(
            ringGroupHash,
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        );
    }

    // Commits Ring Group
    // ==================
    // Requires a link between outputIDs and ringGroupHash
    // Requires latePendingTime + disputeTime <= commitTime
    // ----------------------------------------------------
    // Sets all outputIDs to accepted
    // Wipes ringGroup info
    // Awards bounty to submitter (Or anyone, if the commitment is too delayed)
    // ====================
    function commitRingGroup(
        uint256[] outputIDs,
        uint256[] ringHashes,
        uint256[] rangeHashes
    ) public {
        uint256 ringGroupHash = uint256(keccak256(abi.encode(
            outputIDs,
            ringHashes,
            rangeHashes
        )));
        require(isValidRingGroup(ringGroupHash), "ringGroup is not valid");
        (,, uint256 ringGroupTime) = getRingGroupInfo(ringGroupHash);
        require(block.number >= ringGroupTime, "Not enough time has passed");

        require(getStatus(outputIDs[0]) == Status.Pending, "Transaction is not pending");
        for (uint256 i = 0; i < outputIDs.length; i++) {
            transactions[outputIDs[i]] |= statusBit;
        }

        if (block.number >= ringGroupTime + disputeTime) {
            // Award bounty to anyone when commitment is late
            ethBalances[msg.sender] += goodRingBountyAmount;
        } else {
            // Return bounty to submitter
            ethBalances[goodRingGroupBountyHolders[ringGroupHash]] += goodRingBountyAmount;
        }

        // Clear ring group
        setRingGroupInfo(ringGroupHash, 0, 0, 0);

        // Log commitment
        emit LogRingGroupCommitted(ringGroupHash);

        // Claim gas
        goodRingGroupBountyHolders[ringGroupHash] = 0;
    }

    // ===
    // Dispute Handling
    // ===

    // Disputes late range proof submissions
    // =====================================
    // Requires ringGroup to not have been fully submitted (With range proofs)
    // Requires disputeTime to have passed since initial submission
    // ------------------------------------------------------------
    // Rejects the ring group
    // Awards bounty to disputer
    // =========================
    function disputeLateRangeProof(
        uint256[] outputIDs,
        uint256[] ringHashes,
        uint256[] rangeHashes,
        uint256[] keyImageHashes
    ) public {
        // Match outputIDs with ringGroupHash
        uint256 ringGroupHash = uint256(keccak256(abi.encode(
            outputIDs,
            ringHashes,
            rangeHashes
        )));

        // If not yet submitted, but range proofs are late,
        (, uint256 rangeProofsRemaining, uint256 timer) = getRingGroupInfo(ringGroupHash);
        require(rangeProofsRemaining != 0 && block.number >= timer);

        // Check for enough keyImageHashes, and then reject the ring group
        require(keyImageHashes.length == ringHashes.length);
        rejectRingGroup(ringGroupHash, outputIDs, keyImageHashes);

        // Award bounty for bad ring
        ethBalances[msg.sender] += badRingBountyAward;
    }

    // Disputes a rangeProofHash
    // =========================
    // Requires a link between outputIDs and ringGroupHash, and between rangeProofHash and ringGroupHash
    // Requires the range proof to be unproven
    // Requires ringGroupHash to exist and be pending
    // Requires rangeProofHash to be not actively disputed
    // ---------------------------------------------------
    // Sets ringGroupHash to disputed
    // Sets rangeProof's disputer to msg.sender (It is now 'actively disputed')
    // Reduces disputer's balance by badRingBountyAmount
    // =================================================
    function disputeTopic(
        uint256[] outputIDs,
        uint256[] ringHashes,
        uint256[] rangeHashes,
        uint256 disputedTopicHash
    ) public {
        // Calculate and validate ringGroupHash and disputedTopicHash
        uint256 ringGroupHash = uint256(keccak256(abi.encode(
            outputIDs,
            ringHashes,
            rangeHashes
        )));
        require(isValidRingGroup(ringGroupHash), "ringGroup does not exist");
        require(isInSet(disputedTopicHash, ringHashes) || isInSet(disputedTopicHash, rangeHashes), "Incorrect Proof Hash");

        // Prevent infinite disputing
        require(topicStatuses[ringGroupHash][disputedTopicHash] == ProofStatus.Unknown);

        // Set ringGroup to be disputed
        require(getStatus(outputIDs[0]) == Status.Pending, "Transaction is not pending");
        for (uint256 i = 0; i < outputIDs.length; i++) {
            statusData[outputIDs[i]] = Status.Disputed;
        }

        // Check if already disputed, and if not then assign disputer
        require(badDisputeTopicBountyHolders[ringGroupHash][disputedTopicHash] == 0, "Already disputed");
        badDisputeTopicBountyHolders[ringGroupHash][disputedTopicHash] = msg.sender;

        // Take bounty on bad ring
        require(ethBalances[msg.sender] >= badRingBountyAmount, "Cannot afford bounty");
        ethBalances[msg.sender] -= badRingBountyAmount;

        // Log dispute
        emit LogRingGroupDisputed(
            ringGroupHash,
            disputedTopicHash
        );
    }

    // Sets a given rangeProofHash from Unknown to True/False
    // ======================================================
    // Requires topic to be actively disputed
    // --------------------------------------
    // Proves or Disproves rangeProofHash (Saves the result)
    // =====================================================
    function resolveRangeProof(
        uint256 ringGroupHash,
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    ) public {
        uint256 rangeProofHash = uint256(keccak256(abi.encode(
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        )));

        // Save gas if it's called many times
        if(topicStatuses[ringGroupHash][rangeProofHash] != ProofStatus.Unknown) {
            return;
        }

        // Guarantees dispute comes before proving
        require(badDisputeTopicBountyHolders[ringGroupHash][rangeProofHash] != 0, "Range Proof is not disputed");

        bool isValid = mv.verifyRangeProof(
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        );

        if (isValid) {
            topicStatuses[ringGroupHash][rangeProofHash] = ProofStatus.Accepted;
        } else {
            topicStatuses[ringGroupHash][rangeProofHash] = ProofStatus.Rejected;
        }
    }

    function resolveRingProof(
        uint256 ringGroupHash,
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

        // Save gas if it's called many times
        if(topicStatuses[ringGroupHash][ringHash] != ProofStatus.Unknown) {
            return;
        }

        require(badDisputeTopicBountyHolders[ringGroupHash][ringHash] != 0, "Ring Proof is not disputed");

        // Check commitmentHash
        for (uint256 i = 0; i < MIXIN; i++) {
            require(hashP(commitments[i]) & ~statusBit == transactions[hashP(funds[i])] & ~statusBit, "Wrong commitment value");
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
            topicStatuses[ringGroupHash][ringHash] = ProofStatus.Accepted;
        } else {
            topicStatuses[ringGroupHash][ringHash] = ProofStatus.Rejected;
        }
    }

    // Claims dispute topic bounty
    // ========================
    // Requires outputIDs linked to ringGroupHash
    // Requires the rangeProof to be actively disputed
    // Requires the rangeProof to be proven or disproven
    // -------------------------------------------------
    // If Proof Accepted:
    //   Sets outputIDs to pending
    //   Sets ringGroupHash's timer to Now + disputeTime
    //   Raises submitter's balance by goodRingBountyAward
    // If Proof Rejected:
    //   Sets outputIDs to Rejected
    //   Sets ringGroupHash's timer to 0
    //   Raises disputer's balance by badRingBountyAward
    // Sets the rangeProof's disputer to null (Not actively disputed anymore)
    // ======================================================================
    function claimDisputeTopicBounty(
        uint256[] outputIDs,
        uint256[] ringHashes,
        uint256[] rangeHashes,
        uint256[] keyImageHashes,
        uint256 disputedTopicHash
    ) public {
        // Associate outputIDs with ringGroupHash
        uint256 ringGroupHash = uint256(keccak256(abi.encode(
            outputIDs,
            ringHashes,
            rangeHashes
        )));
        require(isValidRingGroup(ringGroupHash), "ringGroup does not exist");

        address badRingBountyHolder = badDisputeTopicBountyHolders[ringGroupHash][disputedTopicHash];
        require(badRingBountyHolder != 0, "Disputed topic is not disputed");

        ProofStatus disputedProofStatus = topicStatuses[ringGroupHash][disputedTopicHash];
        if (disputedProofStatus == ProofStatus.Accepted) {
            // Resets ringGroup to Pending
            for(uint256 i = 0; i < outputIDs.length; i++) {
               statusData[outputIDs[i]] = Status.NonExistant;
            }
            setRingGroupInfo(ringGroupHash, 0, 0, block.number + disputeTime);

            // Award bounty for good ring
            ethBalances[msg.sender] += goodRingBountyAward;

            // Log resolution
            emit LogRingGroupDisputeResolved(ringGroupHash, disputedTopicHash);
        } else if (disputedProofStatus == ProofStatus.Rejected) {
            // Reject ring and Log rejection
            require(keyImageHashes.length == ringHashes.length);
            rejectRingGroup(ringGroupHash, outputIDs, keyImageHashes);

            // Award bounty for bad ring
            ethBalances[badRingBountyHolder] += badRingBountyAward;
        } else {
            require(false, "Proof status is still unknown");
        }

        // Resolve dispute
        badDisputeTopicBountyHolders[ringGroupHash][disputedTopicHash] = 0;
    }

    // Ethereum Balance Handler

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
        // ethBalances[addr] += msg.value;
        ethBalances[addr] += amount;
    }

    // ===
    // Helpers
    // ===

    // Check if val is a member of set

    function isInSet(uint256 val, uint256[] set) internal pure returns (bool) {
        bool found = false;
        for(uint256 i = 0; i < set.length; i++) {
            if (set[i] == val) {
                found = true;
            }
        }
        return found;
    }

    // Parse compressed status from txID

    function getStatus(uint256 transactionID) public view returns (Status) {
        uint256 txData = transactions[transactionID];
        if (txData == 0) {
            return Status.NonExistant;
        }
        Status txStatus = statusData[transactionID];
        if (txStatus == Status.NonExistant) {
            if ((txData & statusBit) != 0) {
                return Status.Accepted;
            } else {
                return Status.Pending;
            }
        } else {
            return txStatus;
        }
    }

    // Ring Group Formatting Helpers

    function isValidRingGroup(uint256 ringGroupHash) public view returns (bool) {
        (, uint256 remaining, uint256 ringGroupTime) = getRingGroupInfo(ringGroupHash);
        return ringGroupTime != 0 && remaining == 0;
    }

    function getRingGroupInfo(uint256 ringGroupHash) public view returns (uint256, uint256, uint256) {
        uint256 compactRingGroupData = ringGroupData[ringGroupHash];
        uint256 rangeCommitmentCheck = (compactRingGroupData >> rangeCommitmentCheckBitLocation) & rangeCommitmentCheckBitMask;
        uint256 rangeProofsRemaining = (compactRingGroupData >> rangeProofsRemainingBitLocation) & rangeProofsRemainingBitMask;
        uint256 time = (compactRingGroupData >> timerBitLocation) & timerBitMask;
        return (rangeCommitmentCheck, rangeProofsRemaining, time);
    }

    function setRingGroupInfo(uint256 ringGroup, uint256 rangeCommitmentCheck, uint256 rangeProofsRemaining, uint256 time) internal {
        ringGroupData[ringGroup] =
            (time << timerBitLocation) |
            (rangeProofsRemaining << rangeProofsRemainingBitLocation) |
            (rangeCommitmentCheck << rangeCommitmentCheckBitLocation);
    }

    // Ring Group Rejected helper

    // Rejects the given ringGroupHash
    // Assumes outputIDs is all outputs of the given ringGroupHash
    // Assumes keyImageHashes is the correct length
    // ============================================
    // Requires that keyImageHashes is in order
    // Requires that each keyImage maps to this Ring Group
    // ---------------------------------------------------
    // Sets transaction status to rejected, and clears ring group info
    // Emits LogRingGroupRejected
    // ==========================
    function rejectRingGroup(
        uint256 ringGroupHash,
        uint256[] outputIDs,
        uint256[] keyImageHashes
    ) internal {
        for (uint256 i = 0; i < keyImageHashes.length; i++) {
            if (i > 0) {
                require(keyImageHashes[i-1] < keyImageHashes[i]);
            }
            require(keyImageToRingGroup[keyImageHashes[i]] == ringGroupHash);
            keyImageToRingGroup[keyImageHashes[i]] = 0;
        }
        emit LogRingGroupRejected(ringGroupHash);
        for (i = 0; i < outputIDs.length; i++) {
            statusData[outputIDs[i]] = Status.Rejected;
        }
        setRingGroupInfo(ringGroupHash, 0, 0, 0);
    }

    event LogTransaction(
        uint256 outputID,
        uint256[2] src,
        uint256[2] dest,
        uint256[2] commitment,
        uint256 commitmentAmount
    );

    event LogMintTransaction(
        uint256 transactionID
    );

    event LogRingGroupRejected(
        uint256 ringGroupHash
    );

    event LogRingGroup(
        uint256 ringGroupHash,
        uint256[] outputIDs,
        uint256[] ringHashes,
        uint256[] rangeHashes,
        bytes outputMsgs
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

    event LogRangeProof(
        uint256 ringGroupHash,
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    );

    event LogRingGroupCommitted(
      uint256 ringGroupHash
    );

    event LogRingGroupDisputed(
        uint256 ringGroupHash,
        uint256 disputedTopicHash
    );

    event LogRingGroupDisputeResolved(
        uint256 ringGroupHash,
        uint256 disputedTopicHash
    );
}
