pragma solidity 0.4.25;

import "./MonereumInitializer.sol";
import "./MonereumConstants.sol";

contract MonereumMath is MonereumConstants {
    // ECC Under y^2 = x^3 + 3 mod p
    // It can be computed that the order of (1, 2) is q
    // Note that both p and q are prime
    uint256[2] h;

    MonereumInitializer mi;

    function getMonereumInitializer() public view returns (address) {
        return mi;
    }

    constructor(address MI) public {
        mi = MonereumInitializer(MI);
    }

    function initializeH() public {
        h = mi.generateNextPoint(hashP(g), p);
    }

    function G() public constant returns (uint256[2] ret) {
        ret = g;
    }

    function H() public constant returns (uint256[2] ret) {
        ret = h;
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

    // Excludes [0, 0]
    function eccvalid(uint256[2] p1) public pure returns (bool) {
        if (p1[0] >= p || p1[1] >= p) {
            return false;
        }
        if (p1[0] == 0 && p1[1] == 0) {
            return false;
        }
        if (mulmod(p1[1], p1[1], p) == addmod(mulmod(p1[0], mulmod(p1[0], p1[0], p), p), 3, p)) {
            return true;
        } else {
            return false;
        }
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
            // call ecadd precompile
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
