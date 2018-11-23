pragma solidity 0.4.24;

import "./MonereumMath.sol";
import "./MonereumConstants.sol";

contract MonereumVerifier is MonereumMath, MonereumConstants {
    constructor(address MI) MonereumMath(MI) public {
    }

    event BadRangeProofReason(
      string r
    );

    struct RangeVariables {
        uint256 borromean;
    }

    function verifyRangeProof(
        uint256[2] commitment,
        uint256[2][] rangeCommitments,
        uint256[] rangeBorromeans,
        uint256[2][] rangeProofs,
        uint256[] indices
    ) public constant returns (bool) {
        RangeVariables memory v;
        uint256[2] memory sum = [uint256(0), uint256(0)];
        for (uint256 i = 0; i < indices.length; i++) {
            v.borromean = rangeBorromeans[i];
            uint256[2] memory rangeCheck = ecadd(
                ecmul(rangeCommitments[i], v.borromean),
                ecmul(g, rangeProofs[i][0])
            );
            if (rangeCheck[0] == p) {
                emit BadRangeProofReason("rangeCheck inputs were not all on curve");
                return false;
            }
            uint256 prevHash = hashP(rangeCheck);
            uint256 index = indices[i];
            if (index >= 64) {
                emit BadRangeProofReason("Index is too large");
                return false;
            }
            if (i > 0 && indices[i-1] >= index) {
                emit BadRangeProofReason("Indices must be in order");
                return false;
            }
            uint256[2] memory H2i = ecmul(h, 1 << index);
            rangeCheck = ecadd(
                ecmul(ecadd(rangeCommitments[i], [H2i[0], p - H2i[1]]), prevHash),
                ecmul(g, rangeProofs[i][1])
            );
            if (rangeCheck[0] == p) {
                emit BadRangeProofReason("rangeCheck inputs were not all on curve");
                return false;
            }
            if (hashP(rangeCheck) != v.borromean) {
                emit BadRangeProofReason("Borromean did not match");
                return false;
            }
            sum = ecadd(sum, rangeCommitments[i]);
        }
        if (sum[0] == p) {
            emit BadRangeProofReason("Commitment is not on curve");
            return false;
        }
        if (sum[0] != commitment[0]) {
            emit BadRangeProofReason("Sum of range commitments is not zero");
            return false;
        }
        if (sum[1] != commitment[1]) {
            emit BadRangeProofReason("Sum of range commitments is not zero");
            return false;
        }
        return true;
    }

    event BadRingProofReason(
        string r
    );

    struct RingVariables {
        uint256[2] fundDest;
        uint256[2] fundCommitment;
        uint256[2] negFundCommitment;
        uint256[2] commitmentChallenge;
        uint256[2] fundCheck;
        uint256[2] imageCheck;
        uint256[2] commitmentCheck;
    }

    function verifyRingProof(
        uint256[2][MIXIN] fundDests,
        uint256[2][MIXIN] fundCommitments,
        uint256[2] keyImage,
        uint256[2] commitment,
        uint256 borromean,
        uint256[MIXIN] imageFundProofs,
        uint256[MIXIN] commitmentProofs,
        uint256 outputHash
    ) public constant returns (bool) {
        RingVariables memory v;
        uint256 prevHash = borromean;
        if (isInf(keyImage)) {
            // keyImage = d * Hash(dest_i) must be solveable
            emit BadRingProofReason("Key Image cannot be the point at infinity");
            return false;
        }
        for( uint256 i = 0; i < MIXIN; i++ ) {
            // fundDest and fundCommitment are already validated
            v.fundDest = fundDests[i];
            v.fundCommitment = fundCommitments[i];

            uint256 imageFundProof = imageFundProofs[i];
            uint256 commitmentProof = commitmentProofs[i];
            // commitmentChallenge_i = commitment - fundCommitment_i
            if (isInf(commitment)) {
                emit BadRingProofReason("Ring Commitment is point at infinity");
                return false;
            }
            v.commitmentChallenge = ecadd(commitment, [v.fundCommitment[0], p - v.fundCommitment[1]]);
            if (v.commitmentChallenge[1] == 0) {
                emit BadRingProofReason("Commitment Challenge had a bad input");
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
            v.fundCheck = ecadd(ecmul(v.fundDest, prevHash), ecmul(g, imageFundProof));
            if (v.fundCheck[0] == p) {
                emit BadRingProofReason("fundCheck calculations failed");
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
            v.imageCheck = ecadd(ecmul(keyImage, prevHash), ecmul(hashInP(v.fundDest), imageFundProof));
            if (v.imageCheck[0] == p) {
                emit BadRingProofReason("imageCheck calculations failed");
                return false;
            }

            // commitmentCheck = prevHash * commitmentChallenge + commitmentProof * G
            // => commitmentCheck = prevHash * (commitment - fundCommitment_i) + commitmentProof * G
            // => c * G = prevHash * logG(commitment - fundCommitment_i) * G + commitmentProof * G
            // => commitmentProof = c - prevHash * logG(commitment - fundCommitment_i)
            // For a desired constant c and uncontrollable prevHash, we can only calculate commitmentProof when
            // logG(commitment - fundCommitment_i) is known. Thus, they must have the same commitment a * H.
            v.commitmentCheck = ecadd(ecmul(v.commitmentChallenge, prevHash), ecmul(g, commitmentProof));
            if (v.commitmentCheck[0] == p) {
                emit BadRingProofReason("commitmentCheck calculations failed");
                return false;
            }

            // Includes outputHash confirms that the signer approves of that data
            prevHash = uint256(keccak256(
                abi.encode(v.fundCheck, v.imageCheck, v.commitmentCheck, outputHash)
            ));
        }
        if (borromean != prevHash) {
            emit BadRingProofReason("Borromean was incorrect");
            return false;
        }
        return true;
    }

    // If Alice sends two transactions to Bob with public keys P1 and P2, then Alice will know
    // logG(P1 - P2) = s, since Alice generated P_i = x_iG + B to send to Bob over DH exchange.
    // If Alice knows Bob's keyImages will use the same base H, Alice could then correlate
    // Bob's public keyImages I1 and I2 by checking that I1 - I2 = sH, and know that both were from Bob.
    // Here we make it incomputable for Alice to generate two public keys with the same base.
    function hashInP(uint256[2] p1) public constant returns (uint256[2] ret) {
        require(hashSetInitialized);
        uint256 pHash = hashP(p1);
        uint256[2] memory hashGenerator = [uint256(0), uint256(0)];
        for (uint256 i = 0; i < 128; i++) {
            if (((pHash >> i) & 1) == 1) {
                hashGenerator = ecadd(hashGenerator, hashSet[i]);
            }
        }
        ret = hashGenerator;
    }

    mapping(uint256 => uint256[2]) hashSet;
    bool hashSetInitialized = false;

    function getHashval(uint256 i) public constant returns (uint256[2] ret) {
        ret = hashSet[i];
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
        hashSet[i] = mi.generateNextPoint(hashP(prevVal), p);
        if (i == 128) {
            hashSetInitialized = true;
        }
    }
}
