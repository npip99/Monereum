contract MonereumHelper {
    uint256 public constant MIXIN = 3;
    uint256 public constant p = 0x83efdbcbb2884023e9c8c563dc090e57;
    uint256 public constant order = p - 1;
    // order = 2 * 0x41f7ede5d9442011f4e462b1ee04872b
    uint256 public constant g = 0x455a91581e4e2150b41cf8e9e153e7ad;
}


contract MonereumTest is MonereumHelper {

    struct Transaction {
        uint256 src;
        uint256 dest;
        uint256 amount;
    }

    struct Signature {
        // Proves he has x, assuming paymentsProof was uncontrollable and random
        uint256[MIXIN] fundsProof;
        // Proves he signed the payments with sum(paymentsProof) == hash(payments ^ salt)
        uint256[MIXIN] paymentsProof;
        uint256 image;
    }

    function getPublic(uint256 priv) public view returns (uint256) {
        return exp(g, priv);
    }

    function mult(uint256 a, uint256 b) public view returns (uint256) {
        return (a * b) % p;
    }

    function exp(uint256 b, uint256 e) public view returns (uint256) {
        uint256 ans = 1;
        for ( uint256 i = 0; i < 128; i++ ) {
            if ( ((e >> i) & 1) == 1 ) {
                ans = (ans * b) % p;
            }
            b = (b * b) % p;
        }
        return ans;
    }

    function permuteInP(uint256 a) public view returns (uint256) {
        return uint256(keccak256(abi.encode(a))) % p;
    }

    function permuteInOrder(uint256 a) public view returns (uint256) {
        return uint256(keccak256(abi.encode(a))) % order;
    }


    uint256 public rand = uint256(keccak256(1));

    function nextRand() returns (uint256) {
        rand = uint256(keccak256(rand + 1));
        return rand;
    }

    function nextRandInP() returns (uint256) {
        return nextRand() % p;
    }

    function nextRandInOrder() returns (uint256) {
        return nextRand() % order;
    }

    MonereumBlockchain public blk;

    function resetBlockchain() public {
        blk = new MonereumBlockchain();
    }

    function expmult(uint256 a, uint256 b) returns (uint256) {
        return (a * b) % order;
    }

    function combine(uint256 b1, uint256 e1, uint256 b2, uint256 e2) returns (uint256) {
        return mult(exp(b1, e1), exp(b2, e2));
    }

    uint256[50] priv;
    uint256[50] pub;

    function getPub(uint256 a) view returns (uint256) {
        return pub[a];
    }

    function getPriv(uint256 a) view returns (uint256) {
        return priv[a];
    }

    constructor() {
        for (uint256 i = 0; i < 10; i++) {
            priv[i] = nextRandInP();
            pub[i] = getPublic(priv[i]);
        }
    }

    function mintMe(uint256 a) public {
        uint256[MIXIN] give;
        give[0] = pub[a];
        blk.mint(5, give);
    }

    function MintAll() public {
        for( uint256 i = 0; i < MIXIN; i++ ) {
            mintMe(i);
        }
    }

    function test() public {
        uint256[MIXIN] memory q;
        uint256[MIXIN] memory w;
        for (uint256 i = 0; i < MIXIN; i++ ) {
            q[i] = nextRandInOrder();
            w[i] = nextRandInOrder() | 1;
        }
        w[0] = 0;

        Transaction memory payment;
        payment.src = pub[6];
        payment.dest = exp(pub[7], permuteInOrder(exp(pub[8], priv[6])));
        payment.amount = 5;

        uint256 image = exp(permuteInP(pub[0]), priv[0]);
        uint256[MIXIN] memory LR;

        for (i = 0; i < MIXIN; i++) {
            LR[i] = combine(
                g, q[i],
                pub[i], w[i]
            ) << 128;
            LR[i] |= combine(
                permuteInP(pub[i]), q[i],
                image, w[i]
            );
        }

        uint256 hash = uint256(keccak256(
            abi.encode(payment.src, payment.dest, payment.amount, LR
        ))) % order;
        if ((hash & 1) == 0) {
            hash += 1;
        }

        Signature memory sig;
        sig.image = image;
        sig.paymentsProof[0] = (2 * order + hash - (w[1] + w[2])) % order;
        sig.fundsProof[0] = (order + q[0] - ((sig.paymentsProof[0] * priv[0]) % order)) % order;
        for (i = 1; i < MIXIN; i++) {
            sig.fundsProof[i] = q[i];
            sig.paymentsProof[i] = w[i];
        }

        uint256[MIXIN] memory fundsIndices;
        for (i = 0; i < MIXIN; i++) {
            fundsIndices[i] = pub[i];
        }

        uint256[MIXIN] memory sigProof;
        for (i = 0; i < MIXIN; i++) {
            sigProof[i] = (sig.fundsProof[i] << 128) | sig.paymentsProof[i];
        }

        emit TrySend(
            fundsIndices,
            sigProof,
            sig.image,
            payment.src,
            payment.dest,
            payment.amount
        );
    }

    event TrySend(
        uint256[MIXIN] fundsIndices,
        uint256[MIXIN] sigProof,
        uint256 sigImage,
        uint256 paymentSrc,
        uint256 paymentDest,
        uint256 amount
    );
}

contract MonereumBlockchain is MonereumHelper {
    // First half is src, second half is the amount
    mapping(uint256 => uint256) compactStorage;
    mapping(uint256 => bool) usedImage;

    uint256 constant lowerMask = ~uint256(0) >> 128;

    function mult(uint256 a, uint256 b) private pure returns (uint256) {
        return (a * b) % p;
    }

    function exp(uint256 b, uint256 e) private returns (uint256 out) {
        uint256 pp = p; // No support for const

        // Creds @ https://medium.com/@rbkhmrcr/precompiles-solidity-e5d29bd428c4
        assembly {
            // define pointer
            let ptr := mload(0x40)
            // store data assembly-favouring ways
            mstore(ptr, 0x20)             // Length of Base
            mstore(add(ptr, 0x20), 0x20)  // Length of Exponent
            mstore(add(ptr, 0x40), 0x20)  // Length of Modulus
            mstore(add(ptr, 0x60), b)  // Base
            mstore(add(ptr, 0x80), e)     // Exponent
            mstore(add(ptr, 0xa0), pp)     // Modulus
            // call modexp precompile! -- old school gas handling
            let success := call(sub(gas, 2000), 0x05, 0, ptr, 0xc0, ptr, 0x20)
            // gas fiddling
            switch success case 0 {
                revert(0, 0)
            }
            // data
            out := mload(ptr)
        }
    }

    function combine(uint256 b1, uint256 e1, uint256 b2, uint256 e2) returns (uint256) {
        return mult(
            exp(b1, e1),
            exp(b2, e2)
        );
    }

    function permuteInP(uint256 a) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(a))) % p;
    }

    function isInP(uint256 a) pure returns (bool) {
        return (a % p) == a && a != 0;
    }

    function isInOrder(uint256 a) pure returns (bool) {
        return (a % order) == a && a != 0;
    }

    function send(
        uint256[MIXIN] fundsPublicKeys,
        uint256[MIXIN] sigProof,
        uint256 sigImage,
        uint256 paymentSrc,
        uint256 paymentDest,
        uint256 amount
    ) public {
        // Verify payment
        require(isInP(paymentSrc));
        require(isInP(paymentDest));
        require(amount != 0);
        require(uint128(amount) == amount);

        // Verify signature
        require(isInP(sigImage));
        require(!usedImage[sigImage]);

        // Calculate checks and verification
        uint256[MIXIN] memory fundsImageCheck;
        uint256 verification = 0;
        for( uint256 i = 0; i < MIXIN; i++ ) {
            uint256 fundDest = fundsPublicKeys[i];
            require(isInP(fundDest));
            require((compactStorage[fundDest] & lowerMask) == amount);

            uint256 fundsProof = sigProof[i];
            uint256 paymentsProof = fundsProof & lowerMask;
            fundsProof = fundsProof >> 128;

            require(isInOrder(fundsProof));
            require(isInOrder(paymentsProof));

            // exp(sig.image, sig.paymentsProof[i]) must be secure mod phi
            // Note that phi = 2 * prime
            require((paymentsProof & 1) == 1);

            uint256 check = mult(
                exp(g, fundsProof),
                exp(fundDest, paymentsProof)
            ) << 128;
            check |= mult(
                // He must know permuteInP(fund.dest) ** x
                // In order to figure out sigImage after sigFundsProof is frozen
                exp(permuteInP(fundDest), fundsProof),
                exp(sigImage, paymentsProof)
            );
            fundsImageCheck[i] = check;
            verification += paymentsProof;
        }
        verification = verification % order;

        // Salt the hash with fundsCheck and imageCheck to prove
        //   that he could calculate funds and payments proofs
        //   after commiting to a specific fundsCheck and imageCheck
        //   (fundsCheck and imageCheck are then recursively uncontrollable and random)
        // Include payment to show that he signed it
        uint256 hash = uint256(keccak256(abi.encode(
            paymentSrc, paymentDest, amount, fundsImageCheck
        ))) % order;
        if ((hash & 1) == 0) {
            hash += 1;
        }

        require(hash == verification);

        // Save used image
        usedImage[sigImage] = true;

        // Don't allow overwriting a transaction
        uint256 compactValue = compactStorage[paymentDest];
        require(compactValue == 0);

        // Commit the transaction
        compactValue |= (paymentSrc << 128);
        compactValue |= amount;
        compactStorage[paymentDest] = compactValue;

        // Log for others to view
        emit LogTransaction(paymentSrc, paymentDest, amount);
    }

    event LogTransaction(uint256 src, uint256 dest, uint256 amount);

    function mint(uint256 v, uint256[MIXIN] destinations) public payable {
        require(uint128(v) == v && v != 0);
        uint256 val = v;

        uint256 destinationID = 0;
        for (uint256 pow = 0; pow < 128; pow += 4) {
            uint256 digit = (val >> pow) & 0xf;
            if (digit > 0) {
                uint256 dest = destinations[destinationID];
                uint256 amount = digit << pow;
                require(destinationID < MIXIN);

                require(compactStorage[dest] == 0);
                compactStorage[dest] |= amount;
                destinationID++;
            }
        }
    }

    function getTransaction(uint256 destination) public view returns (uint256, uint256, uint256) {
        uint256 transactionData = compactStorage[destination];
        uint256 amount = transactionData & lowerMask;
        require(amount != 0);
        return (transactionData >> 128, destination, amount);
    }

    function isImageUsed(uint256 keyImage) public view returns (bool) {
        return usedImage[keyImage];
    }
}
