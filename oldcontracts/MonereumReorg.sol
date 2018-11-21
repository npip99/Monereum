pragma solidity 0.4.25;

library Hash {
    function hashP(uint256[2] p1) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(p1)));
    }
}

library ECC {
    // ECC Under BN-Curve y^2 = x^3 + 3 mod p
    // It can be computed that the order of (1, 2) is q
    // Note that both p and q are prime
    uint256 public constant p = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    uint256 public constant q = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    function modulus() public constant returns (uint256) {
        return p;
    }

    function order() public constant returns (uint256) {
        return q;
    }

    function generator() public constant returns (uint256[2]) {
        return [uint256(1), uint256(2)];
    }

    // All points other than the point at infinity will have order q
    function isInf(uint256[2] p1) public constant returns (bool) {
        return p1[0] == 0 && p1[1] == 0;
    }

    function ecadd(uint256[2] p1, uint256[2] p2) public constant returns (uint256[2] ret) {
        // With a public key (x, y), this computes p = scalar * (x, y).
        uint256[4] memory input;
        input[0] = p1[0];
        input[1] = p1[1];
        input[2] = p2[0];
        input[3] = p2[1];
        bool failed = false;
        assembly {
            // call ecmul precompile
            if iszero(call(not(0), 0x06, 0, input, 0x80, ret, 0x40)) {
                failed := 1
            }
        }
        if (failed) {
            // Failures propagate easily this way
            ret[0] = p;
            ret[1] = p;
        }
    }

    function ecmul(uint256[2] p1, uint256 scalar) public constant returns (uint256[2] ret) {
        // With a public key (x, y), this computes p = scalar * (x, y).
        uint256[3] memory input;
        input[0] = p1[0];
        input[1] = p1[1];
        input[2] = scalar;
        bool failed = false;
        assembly {
            // call ecmul precompile
            if iszero(call(not(0), 0x07, 0, input, 0x60, ret, 0x40)) {
                failed := 1
            }
        }
        if (failed) {
            ret[0] = p;
            ret[1] = p;
        }
    }
}

contract MonereumMath {
    using ECC for uint256[2];

    uint256 public constant p = ECC.modulus();
    uint256 public constant q = ECC.order();
    uint256[2] g = ECC.generator();
    uint256[2] h;

    function G() public constant returns (uint256[2] ret) {
        ret = g;
    }

    function H() public constant returns (uint256[2] ret) {
        ret = h;
    }

    function initializeH() public {
        h = generateNextPoint(Hash.hashP(g));
    }

    function getHashval(uint256 i) public constant returns (uint256[2] ret) {
        ret = hashSet[i];
    }

    mapping(uint256 => uint256[2]) hashSet;
    bool hashSetInitialized = false;

    // Generates a valid point from some hash `h`, where discrete log is not known w.r.t any other base
    function generateNextPoint(uint256 h) internal returns (uint256[2] ret) {
        uint256 testX = h % p;
        while (true) {
            uint256 goal = mulmod(mulmod(testX, testX, p), testX, p);
            goal += 3;
            uint256 testY = expMod(goal, (p + 1) / 4, p);
            if (mulmod(testY, testY, p) != goal) {
                testX++;
                continue;
            } else {
                ret[0] = testX;
                ret[1] = testY;
                break;
            }
        }
    }


    function initializeHashVals(uint256 a, uint256 b) public {
        for (uint256 i = a; i < b; i++) {
            initializeHashVal(i);
        }
    }

    function initializeHashVal(uint256 i) public {
        require(hashSet[i][0] == 0);
        require(0 <= i && i < 128);
        uint256[2] memory prevVal;
        if (i == 0) {
            prevVal = h;
        } else {
            prevVal = hashSet[i - 1];
        }
        require(prevVal[0] != 0);
        hashSet[i] = generateNextPoint(Hash.hashP(prevVal));
        if (i == 128) {
            hashSetInitialized = true;
        }
    }

    function expMod(uint256 b, uint256 e, uint256 m) internal pure returns (uint256 o) {
        uint256 ans = 1;
        uint256 n = b;
        for (uint256 i = 0; i < 256; i++) {
            if ((e >> i) & 1 == 1) {
                ans = mulmod(ans, n, m);
            }
            n = mulmod(n, n, m);
        }
        return ans;
    }

    function isInQ(uint256 inp) public pure returns (bool) {
        return inp != 0 && inp < q;
    }

    // If Alice sends two transactions to Bob with public keys P1 and P2, then Alice will know
    // logG(P1 - P2) = s, since Alice generated P_i = x_iG + B to send to Bob over DH exchange.
    // If Alice knows Bob's keyImages will use the same base H, Alice could then correlate
    // Bob's public keyImages I1 and I2 by checking that I1 - I2 = sH, and know that both were from Bob.
    // Here we make it incomputable for Alice to generate two public keys with the same base.
    function hashInP(uint256[2] p1) public constant returns (uint256[2] ret) {
        // 150k gas
        require(hashSetInitialized);
        uint256 pHash = Hash.hashP(p1);
        uint256[2] memory hashGenerator = [uint256(0), uint256(0)];
        for (uint256 i = 0; i < 128; i++) {
            if (((pHash >> i) & 1) == 1) {
                hashGenerator = hashGenerator.ecadd(hashSet[i]);
            }
        }
        ret = hashGenerator;
    }
}

library RangeProofLib {
    struct RangeProof {
        uint256[2] commitment;
        uint256[2][] rangeCommitments;
        uint256[] rangeBorromeans;
        uint256[2][] rangeProofs;
        uint256[] indices;
    }

    event BadRangeProofReason(string r);

    struct Variables {
        uint256 index;
        uint256 prevHash;
        uint256[2] sum;
    }

    function verifyRangeProof(RangeProof r, uint256[2] h) internal returns (bool) {
        Variables memory v;
        uint256 p = ECC.modulus();
        uint256[2] memory g = ECC.generator();
        v.sum = [uint256(0), uint256(0)];
        for (uint256 i = 0; i < r.indices.length; i++) {
            uint256 borromean = r.rangeBorromeans[i];
            uint256[2] memory rangeCheck = ECC.ecadd(
                ECC.ecmul(r.rangeCommitments[i], borromean),
                ECC.ecmul(g, r.rangeProofs[i][0])
            );
            if (rangeCheck[0] == p) {
                BadRangeProofReason("rangeCheck inputs were not all on curve");
                return false;
            }
            v.prevHash = Hash.hashP(rangeCheck);
            v.index = r.indices[i];
            if (v.index >= 64) {
                BadRangeProofReason("Index is too large");
                return false;
            }
            if (i > 0 && r.indices[i-1] >= v.index) {
                BadRangeProofReason("Indices must be in order");
                return false;
            }
            uint256[2] memory H2i = ECC.ecmul(h, 1 << v.index);
            rangeCheck = ECC.ecadd(
                ECC.ecmul(ECC.ecadd(r.rangeCommitments[i], [H2i[0], p - H2i[1]]), v.prevHash),
                ECC.ecmul(g, r.rangeProofs[i][1])
            );
            if (rangeCheck[0] == p) {
                BadRangeProofReason("rangeCheck inputs were not all on curve");
                return false;
            }
            if (Hash.hashP(rangeCheck) != borromean) {
                BadRangeProofReason("Borromean did not match");
                return false;
            }
            v.sum = ECC.ecadd(v.sum, r.rangeCommitments[i]);
        }
        if (r.commitment[1] >= p) {
            BadRangeProofReason("Commitment is not on curve");
            return false;
        }
        v.sum = ECC.ecadd(v.sum, [r.commitment[0], p - r.commitment[1]]);
        if (v.sum[0] == p) {
            BadRangeProofReason("Commitment is not on curve");
            return false;
        }
        if (!ECC.isInf(v.sum)) {
            BadRangeProofReason("Sum of range commitments is not zero");
            return false;
        }
        return true;
    }
}

contract MonereumMemory is MonereumMath {
    // === Constants ===
    uint256 constant MIXIN = 3;
    uint256 constant disputeTime = 2 minutes;
    // Gas prices have hit 200 gWei = (200 / (10^9)) Eth during ICOs
    // We need to maintain disputeRingProof incentives during high network congestion
    uint256 constant badRingBountyAmount = 1 ether / 10;
    uint256 constant goodRingBountyAmount = 1 ether / 10;
    uint256 constant badRingBountyAward = 1 ether / 10;
    uint256 constant goodRingBountyAward = 1 ether / 10;

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

    // Data Formats
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
        uint256[2] commitment;
        Status status;
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

contract MonereumVerifier is MonereumMemory {
    event BadRingProofReason(
        string r
    );

    function verifyRingProof(RingProof r) internal view returns (bool) {
        uint256 prevHash = r.borromean;
        if (ECC.isInf(r.keyImage)) {
            // keyImage = d * Hash(dest_i) must be solveable
            BadRingProofReason("Key Image cannot be the point at infinity");
            return false;
        }
        for( uint256 i = 0; i < MIXIN; i++ ) {
            // fundDest and fundCommitment are already validated
            uint256[2] memory fundDest = r.funds[i];
            uint256[2] memory fundCommitment = transactions[Hash.hashP(fundDest)].commitment;

            uint256 imageFundProof = r.imageFundProofs[i];
            uint256 commitmentProof = r.commitmentProofs[i];
            // commitmentChallenge_i = commitment - fundCommitment_i
            if (ECC.isInf(r.commitment)) {
                BadRingProofReason("Ring Commitment is point at infinity");
                return false;
            }
            uint256[2] memory commitmentChallenge = ECC.ecadd(r.commitment, [fundCommitment[0], p - fundCommitment[1]]);
            if (commitmentChallenge[1] == 0) {
                BadRingProofReason("Commitment Challenge had a bad input");
                return false;
            }

            // (All indices are mod MIXIN)
            // (All points mentioned are under the group generated by k*g mod p for all positive k in Z/pZ)
            // (Thus any point P can be equivalently represented by P = x * J, with J any point in that group)

            // The only way the following ring proof may be generated, is if the signer was able to hold at least
            // one of the keccak256's constant (Say, at index `j`), so that the keccak256 at index `i - 1`
            // could be predicted with accuracy. If the keccak256 at `j - 1` is not known, the keccak256
            // at index `j` cannot be controlled. Thusly, `j` must equal `i`, and we may ignore `j` in favor of `i`.

            // The only way the keccak256 of `i - 1` could be predicted, knowing that the keccak256 of `i` is constnat,
            // would be if fundCheck_i, imageCheck_i, commitmentCheck_i, keyImage, and commitment, were all constant.
            // Since the signer can control all of these variables, we will see that the signer must choose that
            // fundCheck_i = a * G, imageCheck_i = b * Hash(dest_i), commitmentCheck_i = c * G,
            // keyImage = d * Hash(dest_i), and commitment = eG + gH

            // We calculate fundCheck = prevHash * dest_i + imageFundProof * G
            // => a * G = prevHash * logG(dest_i) * G + imageFundProof * G
            // => a = prevHash * logG(dest_i) + imageFundProof
            // => imageFundProof = a - prevHash * logG(dest_i)
            uint256[2] memory fundCheck = ECC.ecadd(ECC.ecmul(fundDest, prevHash), ECC.ecmul(g, imageFundProof));
            if (fundCheck[0] == p) {
                BadRingProofReason("fundCheck calculations failed");
                return false;
            }

            // We calculate imageCheck = prevHash * keyImage + (a - prevHash * logG(dest_i)) * Hash(dest_i)
            // => b * Hash(dest_i) = prevHash * d * Hash(dest_i) + (a - prevHash * logG(dest_i)) * Hash(dest_i)
            // => b = prevHash * d + (a - prevHash * logG(dest_i))
            // => b = a - prevHash * (d - logG(dest_i))
            // Since a, b, and d are constant, and prevHash is uncontrollable, we know d = logG(dest_i)
            // Since keyImage = d * Hash(dest_i),
            // => keyImage = logG(dest_i) * Hash(dest_i)
            // We take care to remember that all exponent calculations are mod q, to deduce that the
            // keyImage is unique for each dest_i by q being prime. (As prevHash * d1 = prevHash * d2 => d1 = d2 mod q)
            uint256[2] memory imageCheck = ECC.ecadd(ECC.ecmul(r.keyImage, prevHash), ECC.ecmul(hashInP(fundDest), imageFundProof));
            if (imageCheck[0] == p) {
                BadRingProofReason("imageCheck calculations failed");
                return false;
            }

            // commitmentCheck = prevHash * commitmentChallenge + commitmentProof * G
            // => commitmentCheck = prevHash * (commitment - fundCommitment_i) + commitmentProof * G
            // => c * G = prevHash * logG(commitment - fundCommitment_i) * G + commitmentProof * G
            // => commitmentProof = c - prevHash * logG(commitment - fundCommitment_i)
            // For a desired constant c and uncontrollable prevHash, we can only calculate commitmentProof when
            // logG(commitment - fundCommitment_i) is known. Thus, they must have the same commitment a * H.
            uint256[2] memory commitmentCheck = ECC.ecadd(ECC.ecmul(commitmentChallenge, prevHash), ECC.ecmul(g, commitmentProof));
            if (commitmentCheck[0] == p) {
                BadRingProofReason("commitmentCheck calculations failed");
                return false;
            }

            // Includes outputHash confirms that the signer approves of that data
            prevHash = uint256(keccak256(
                abi.encode(fundCheck, imageCheck, commitmentCheck, r.outputHash)
            ));
        }
        if (r.borromean != prevHash) {
            BadRingProofReason("Borromean was incorrect");
            return false;
        }
        return true;
    }
}

contract MonereumBlockchain is MonereumVerifier {
    function mint(
        uint256[2] dest,
        uint256 amount
    ) public {
        uint256 transactionID = Hash.hashP(dest);
        require(transactions[transactionID].status == Status.NonExistant, "Transaction already exists");
        transactions[transactionID].commitment = ECC.ecmul(h, amount);
        transactions[transactionID].status = Status.Accepted;
        emit LogTransaction(
            [uint256(0), uint256(0)],
            dest,
            transactions[transactionID].commitment
        );
    }

    function getBalance(address addr) public view returns (uint256) {
        return ethBalances[addr];
    }

    function withdrawEthereum(uint256 amount) public {
        address sender = msg.sender;
        require(ethBalances[sender] >= amount, "Not enough funds");
        ethBalances[sender] -= amount;
        sender.send(amount);
    }

    function depositEthereum(
        address addr,
        uint256 amount
    ) public payable {
        ethBalances[addr] += amount;
    }

    function disputeRingGroup(
        uint256 ringGroupHash,
        uint256 disputedTopicHash,
        uint256[] outputIDs
    ) internal {
        require(ringGroupTimes[ringGroupHash] != 0, "ringGroup does not exist");
        require(rangeProofsRemaining[ringGroupHash] == 0, "ringGroup range proofs have not been submitted yet");
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
        if (disputedProofStatus == ProofStatus.Accepted) {
            for(uint256 i = 0; i < outputIDs.length; i++) {
               transactions[outputIDs[i]].status = Status.Pending;
            }
            ringGroupTimes[ringGroupHash] = block.timestamp + disputeTime;
            address goodRingGroupBountyHolder = goodRingGroupBountyHolders[ringGroupHash];
            ethBalances[goodRingGroupBountyHolder] += goodRingBountyAward;
        } else if (disputedProofStatus == ProofStatus.Rejected) {
            for(i = 0; i < outputIDs.length; i++) {
               transactions[outputIDs[i]].status = Status.Rejected;
            }
            ethBalances[badRingBountyHolder] += badRingBountyAward;
        } else {
            require(false, "Proof status is still unknown");
        }
    }

    function claimRangeProofBounty(
        uint256[] outputIDs,
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    ) public {
        uint256 rangeProofHash = uint256(keccak256(abi.encode(
            outputIDs,
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        )));
        uint256 ringGroupHash = rangeToRingGroup[rangeProofHash];
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
        uint256[] outputIDs,
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    ) public {
        uint256 rangeProofHash = uint256(keccak256(abi.encode(
            outputIDs,
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        )));
        require(rangeStatuses[rangeProofHash] != ProofStatus.Unknown);
        uint256 ringGroupHash = rangeToRingGroup[rangeProofHash];
        disputeRingGroup(
            ringGroupHash,
            rangeProofHash,
            outputIDs
        );
    }

    function resolveRangeProof(
        uint256[] outputIDs,
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    ) public {
        RangeProofLib.RangeProof r;
        r.commitment = commitment;
        r.rangeCommitments = rangeCommitments;
        r.rangeProofs = rangeProofs;
        r.rangeBorromeans = rangeBorromeans;
        r.indices = indices;
        uint256 rangeProofHash = uint256(keccak256(abi.encode(
            outputIDs,
            r.commitment,
            r.rangeCommitments,
            r.rangeBorromeans,
            r.rangeProofs,
            r.indices
        )));
        bool isValid = RangeProofLib.verifyRangeProof(r, h);

        if (isValid) {
            rangeStatuses[rangeProofHash] = ProofStatus.Accepted;
        } else {
            rangeStatuses[rangeProofHash] = ProofStatus.Rejected;
        }
    }

    function commitRingGroup(
        uint256[] outputIDs,
        uint256[] ringHashes
    ) public {
        uint256 ringGroupHash = uint256(keccak256(abi.encode(
            outputIDs,
            ringHashes
        )));
        require(ringGroupTimes[ringGroupHash] != 0, "ringGroup doesnt exist");
        require(ringGroupTimes[ringGroupHash] <= block.timestamp, "Not enough time has passed");
        require(transactions[outputIDs[0]].status == Status.Pending, "Transaction is not pending");
        for (uint256 i = 0; i < outputIDs.length; i++) {
            transactions[outputIDs[i]].status = Status.Accepted;
        }

        ethBalances[goodRingGroupBountyHolders[ringGroupHash]] += goodRingBountyAmount;

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
        require(ringGroupTimes[ringGroupHash] != 0, "ringGroup does not exist");
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
        uint256[2] keyImage,
        uint256[2] commitment,
        uint256 borromean,
        uint256[MIXIN] imageFundProofs,
        uint256[MIXIN] commitmentProofs,
        uint256 outputHash
    ) public {
        RingProof memory r;
        r.funds = funds;
        r.keyImage = keyImage;
        r.commitment = commitment;
        r.borromean = borromean;
        r.imageFundProofs = imageFundProofs;
        r.commitmentProofs = commitmentProofs;
        r.outputHash = outputHash;
        uint256 ringHash = uint256(keccak256(abi.encode(
            r.funds,
            r.keyImage,
            r.commitment,
            r.borromean,
            r.imageFundProofs,
            r.commitmentProofs,
            r.outputHash
        )));
        bool isValid = verifyRingProof(r);

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
        uint256 bits = indices.length;
        require(rangeCommitments.length == bits);
        require(rangeBorromeans.length == bits);
        require(rangeProofs.length == bits);
        require(bits > 0 && bits < 5);
        uint256 rangeProofHash = uint256(keccak256(abi.encode(
            outputIDs,
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        )));
        emit LogRangeProof(
            ringGroupHash,
            outputIDs,
            commitment,
            rangeCommitments,
            rangeBorromeans,
            rangeProofs,
            indices
        );
        require(rangeProofCommitment[ringGroupHash][rangeProofHash] == Hash.hashP(commitment));
        rangeProofCommitment[ringGroupHash][rangeProofHash] = 0;
        rangeProofsRemaining[ringGroupHash]--;
        if (rangeProofsRemaining[ringGroupHash] == 0) {
            ringGroupTimes[ringGroupHash] = block.timestamp + disputeTime;
        }
    }

    event LogRangeProof(
        uint256 ringGroupHash,
        uint256[] outputIDs,
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

    function saveMinerFee(uint256 fee) {
        require(fee < (uint256(1) << 64));
        require(fee != 0);
        minerFeeH[fee] = ECC.ecmul(h, fee);
    }

    // A point is "okay" when it is not the point at infinity, and coordinates are < p

    // Maps N input rings, to M output transactions
    // All lengths are verified to be consistent
    // outputHash = hash(outputDest, outputSrc, outputCommitments, minerFee)
    // Each ringHash is a hash of a ringProof:
    //     funds <- Verified: Status of Hash(funds_i) is Accepted
    //     keyImage <- Verified: usedImages[hash(keyImage)] is false. It is then updated to true.
    //     commitment <- Verified: okay
    //     borromean
    //     imagefundProofs
    //     commitmentProofs
    //     outputHash
    // Verified okay: outputCommitment_i
    // Verified: Sum_i(commitment_i) = Sum_i(outputCommitment_i) + minerFee*H
    // Each ringProof is logged
    // ringHashes = [ringHash_0, ..., ringHash_{N-1}]
    // outputIDs = [hash(outputDest_0), ..., hash(outputDest_{M-1}), hash(minerDest)] <- All verified don't exist yet. All now set to Pending
    // ringGroupHash = hash(outputIDs, ringHashes)
    // Verified ringGroupTimes[ringGroupHash] != 0
    // ringGroupTimes[ringGroupHash] = 2^250
    // Verified rangeProofHashes_i < rangeProofHashes_{i+1} for each i, for uniqueness
    // rangeProofCommitment[ringGroupHash][rangeProofHashes_i] = hash(ringProof_i.commitment) for all i
    // rangeProofsRemaining[ringGroupHash] = M
    // ethBalances[msg.sender] -= goodRingBountyAmount (Overflow checked)

    function send(
        // N Inputs
        uint256[2][MIXIN][] funds,
        // N Ring Proofs
        uint256[2][] keyImages,
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
        uint256 minerFee,
        // Miner
        uint256[2] minerDest
    ) public {
        // Can't declare variables as memory, so group them into a struct
        // (We're already at stack limits for this function)
        Variables memory v;

        v.R = funds.length;
        require(keyImages.length == v.R);
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
            // Else outputsDests[-1] could be shifted into outputSrcs[0] with same hash
            abi.encode(outputDests, outputSrcs, outputCommitments, minerFee)
        ));

        v.ringHashes = new uint256[](v.R);

        v.commitmentSum = [uint256(0), uint256(0)];
        for (v.ring = 0; v.ring < v.R; v.ring++) {
            v.keyImage = keyImages[v.ring];
            require(!usedImages[Hash.hashP(v.keyImage)], "keyImage is already used");
            for ( v.i = 0; v.i < MIXIN; v.i++ ) {
                v.transactionID = Hash.hashP(funds[v.ring][v.i]);
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
                funds[v.ring],
                v.keyImage,
                commitment[v.ring],
                borromean[v.ring],
                imageFundProofs[v.ring],
                commitmentProofs[v.ring],
                v.outputHash
            );
            require(!ECC.isInf(commitment[v.ring]), "Input commitment cannot be point at infinity");
            v.commitmentSum = ECC.ecadd(v.commitmentSum, commitment[v.ring]);
            require(v.commitmentSum[0] < p, "Commitment sum failed; Not all input commitments are on the curve");
            v.ringHashes[v.ring] = v.ringHash;
            usedImages[Hash.hashP(v.keyImage)] = true;
        }

        v.outputIDs = new uint256[](v.numOutputs + 1);
        for (v.i = 0; v.i < v.numOutputs; v.i++) {
            v.outputIDs[v.i] = Hash.hashP(outputDests[v.i]);
        }
        v.outputIDs[v.numOutputs] = Hash.hashP(minerDest);

        v.ringGroupHash = uint256(keccak256(abi.encode(
            v.outputIDs,
            v.ringHashes
        )));
        require(ringGroupTimes[v.ringGroupHash] == 0, "Ring Group has already been submitted");
        ringGroupTimes[v.ringGroupHash] = uint256(1) << 250;
        emit LogRingGroup(
            v.outputIDs,
            v.ringHashes
        );

        require(rangeProofHashes.length == v.numOutputs);
        for( v.i = 0; v.i < v.numOutputs; v.i++ ) {
            v.outputID = v.outputIDs[v.i];
            require(transactions[v.outputID].status == Status.NonExistant, "Output transaction already exists");
            transactions[v.outputID].commitment = outputCommitments[v.i];
            transactions[v.outputID].status = Status.Pending;
            emit LogTransaction(
                outputSrcs[v.i],
                outputDests[v.i],
                outputCommitments[v.i]
            );
            require(v.i == 0 || rangeProofHashes[v.i - 1] < rangeProofHashes[v.i], "Range hashes must be in order");
            rangeProofCommitment[v.ringGroupHash][rangeProofHashes[v.i]] = Hash.hashP(outputCommitments[v.i]);
            require(!ECC.isInf(outputCommitments[v.i]), "Output Commitment cannot be point at infinity");
            require(outputCommitments[v.i][1] < p, "Commitment sum failed; not all output commitments are on curve");
            v.commitmentSum = ECC.ecadd(v.commitmentSum, [outputCommitments[v.i][0], p - outputCommitments[v.i][1]]);
            require(v.commitmentSum[0] < p, "Commitment sum failed; not all output commitments are on curve");
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
        transactions[v.outputID].commitment = v.minerFeeCommitment;
        transactions[v.outputID].status = Status.Pending;

        rangeProofsRemaining[v.ringGroupHash] = v.numOutputs;

        v.sender = msg.sender;
        require(ethBalances[v.sender] >= goodRingBountyAmount, "Not enough funds for bounty");
        ethBalances[v.sender] -= goodRingBountyAmount;
    }

    event LogTransaction(
        uint256[2] src,
        uint256[2] dest,
        uint256[2] commitment
    );

    event LogRingGroup(
        uint256[] outputIDs,
        uint256[] ringHashes
    );

    event LogRingProof(
        uint256[2][MIXIN] funds,
        uint256[2] keyImage,
        uint256[2] commitment,
        uint256 borromean,
        uint256[MIXIN] imageFundProofs,
        uint256[MIXIN] commitmentProofs,
        uint256 outputHash
    );
}
