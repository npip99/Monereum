pragma solidity 0.4.24;

import "./MonereumInitializer.sol";

contract MonereumMath {
    // ECC Under y^2 = x^3 + 3 mod p
    // It can be computed that the order of (1, 2) is q
    // Note that both p and q are prime
    uint256 public constant p = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    uint256 public constant q = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256[2] g = [uint256(1), uint256(2)];
    uint256[2] h;

    mapping(uint256 => uint256[2]) hashSet;
    bool hashSetInitialized = false;

    MonereumInitializer mi;

    function getMonereumInitializer() public returns (address) {
        return mi;
    }

    constructor(address MI) public {
        mi = MonereumInitializer(MI);
    }

    function initializeH() public {
        h = mi.generateNextPoint(hashP(g), p);
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

    function G() public constant returns (uint256[2] ret) {
        ret = g;
    }

    function H() public constant returns (uint256[2] ret) {
        ret = h;
    }

    function getHashval(uint256 i) public constant returns (uint256[2] ret) {
        ret = hashSet[i];
    }

    // All points other than the point at infinity will have order q
    function isInf(uint256[2] p1) internal pure returns (bool) {
        return p1[0] == 0 && p1[1] == 0;
    }

    function isInQ(uint256 inp) public pure returns (bool) {
        return inp != 0 && inp < q;
    }

    function hashP(uint256[2] p1) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(p1)));
    }

    // If Alice sends two transactions to Bob with public keys P1 and P2, then Alice will know
    // logG(P1 - P2) = s, since Alice generated P_i = x_iG + B to send to Bob over DH exchange.
    // If Alice knows Bob's keyImages will use the same base H, Alice could then correlate
    // Bob's public keyImages I1 and I2 by checking that I1 - I2 = sH, and know that both were from Bob.
    // Here we make it incomputable for Alice to generate two public keys with the same base.
    function hashInP(uint256[2] p1) public constant returns (uint256[2] ret) {
        // 150k gas
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
