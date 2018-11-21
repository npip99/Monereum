pragma solidity 0.4.24;
import "./Monereum.sol";

// file name has to end with '_test.sol'
contract test_1 is MonereumBlockchain {
    function generateProof(
    ) internal returns (RingProof) {

    }

    uint256 seed = 1234;

    function generateRandom() returns (uint256) {
        seed = uint256(keccak256(seed));
        return seed % q;
    }

    uint256[] privateKeys;
    uint256[2][] publicKeys;

    event LogPubKey(uint256 i, uint256[2] key);
    event LogPrivKey(uint256 i, uint256 key);

    function getPub(uint256 i) public {
        emit LogPubKey(i, publicKeys[i]);
    }

    function getPriv(uint256 i) public {
        emit LogPrivKey(i, privateKeys[i]);
    }

    MonereumBlockchain m;

    constructor() {
        setMonereumBlockchain(this);
        initializeH();
    }

    function setMonereumBlockchain(address a) public {
        m = MonereumBlockchain(a);
    }

    event LogRingResult(bool res);

    function tryVerify() {
        bool res = verifyRingProof(sr);
        emit LogRingResult(res);
    }

    RingProof sr;

    function setRingProof(
        uint256[2][MIXIN] funds,
        uint256[2] keyImage,
        uint256[2] commitment,
        uint256 borromean,
        uint256[MIXIN] imageFundProofs,
        uint256[MIXIN] commitmentProofs,
        uint256 outputHash
    ) public {
        sr.funds = funds;
        sr.keyImage = keyImage;
        sr.commitment = commitment;
        sr.borromean = borromean;
        sr.imageFundProofs = imageFundProofs;
        sr.commitmentProofs = commitmentProofs;
        sr.outputHash = outputHash;
    }

    function beforeAll () {
        for (uint256 i = 0; i < 10; i++) {
            privateKeys.push(generateRandom());
            publicKeys.push(ecmul(g, privateKeys[i]));
            m.mint(publicKeys[i], 100);
        }
        /*
        RingProof r;
        r.funds = [publicKeys[0], publicKeys[1], publicKeys[2]];
        r.keyImage = hashMul(fundDest, privateKeys[0]);
        r.commitment = ecmul(h, 100);
        r.outputHash = hashP(g);
        uint256 a = generateRandom();
        uint256 b = generateRandom();
        uint256[2] memory fundDest = publicKeys[0];
        uint256[2] memory fundCheck = ecmul(g, a);
        uint256[2] memory imageCheck = hashMul(publicKeys[0], a);
        uint256[2] memory commitmentCheck = ecmul(g, b);
        uint256[MIXIN] memory imageFundProofs;
        uint256[MIXIN] memory commitmentProofs;
        uint256 hash = uint256(keccak256(
            abi.encode(fundCheck, imageCheck, commitmentCheck, r.outputHash)
        ));
        for (i = 1; i < MIXIN; i++) {
            fundDest = publicKeys[i];
            imageFundProofs[i] = generateRandom();
            commitmentProofs[i] = generateRandom();
            fundCheck = ecadd(ecmul(fundDest, hash), ecmul(g, imageFundProofs[i]));
            imageCheck = ecadd(ecmul(r.keyImage, hash), hashMul(fundDest, imageFundProofs[i]));
            commitmentCheck = ecmul(g, commitmentProofs[i]);

            hash = uint256(keccak256(
                abi.encode(fundCheck, imageCheck, commitmentCheck, r.outputHash)
            ));
        }
        imageFundProofs[0] = (a + q - mulmod(hash, privateKeys[0], q)) % q;
        commitmentProofs[0] = b;
        r.borromean = hash;
        emit LogRingProof(
            r.funds,
            r.keyImage,
            r.commitment,
            r.borromean,
            r.imageFundProofs,
            r.commitmentProofs,
            r.outputHash
        );*/
    }

    event LogRingProof(
        uint256[2][MIXIN] funds,
        uint256[2] keyImage,
        uint256[2] commitment,
        uint256 borromean,
        uint256[MIXIN] imageFundProofs,
        uint256[MIXIN] commitmentProofs,
        uint256 outputHash
    );



    function check1 () public {
        // this function is not constant, use 'Assert' to test the contract
    }

    function check2 () public constant returns (bool) {
        // this function is constant, use the return value (true or false) to test the contract
        return true;
    }
}

contract test_2 {
    function beforeAll () {
        // here should instanciate tested contract
    }

    function check1 () public {
        // this function is not constant, use 'Assert' to test the contract
    }

    function check2 () public constant returns (bool) {
      // this function is constant, use the return value (true or false) to test the contract
      return true;
    }
}
