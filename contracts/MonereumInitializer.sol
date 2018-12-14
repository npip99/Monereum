pragma solidity 0.4.25;

contract MonereumInitializer {
    // Generates a valid point from some hash `h`, where discrete log is not known w.r.t any other base
    function generateNextPoint(uint256 h, uint256 p) public pure returns (uint256[2] ret) {
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
}
