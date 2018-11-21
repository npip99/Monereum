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
        uint256 minerFee = 1;

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
        payment.amount = 5 - minerFee;

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
            abi.encode(minerFee, payment.src, payment.dest, payment.amount, LR
        ))) % order;
        hash |= 1;

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
            1234,
            minerFee,
            fundsIndices,
            sigProof,
            sig.image,
            payment.src,
            payment.dest,
            payment.amount
        );
    }

    event TrySend(
        uint256 minerPub,
        uint256 minerFee,
        uint256[MIXIN] fundsIndices,
        uint256[MIXIN] sigProof,
        uint256 sigImage,
        uint256 paymentSrc,
        uint256 paymentDest,
        uint256 amount
    );
}

contract MonereumBlockchain is MonereumHelper {
    // dest => First half is src, Second half is the amount
    struct Contract {
        mapping(uint256 => uint256) transactions;
        uint256 balance;
    }

    mapping(uint256 => uint256) compactStorage;
    mapping(uint256 => Contract) contractStorage;
    mapping(uint256 => bool) contracts;
    mapping(uint256 => bool) usedImage;

    // For smart contracts
    // First half is claimed
    // Second half is amount

    uint256 constant lowerMask = ~uint256(0) >> 128;

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
        return (exp(b1, e1) * exp(b2, e2)) % p;
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
        uint256 minerPub,
        // Nash equilibrium as minerFee -> Gas Price
        uint256 minerFee,
        uint256[MIXIN] fundsPublicKeys,
        uint256[MIXIN] sigProof,
        uint256 sigImage,
        uint256 paymentSrc,
        uint256 paymentDest,
        uint256 paymentAmount
    ) public {
        // Verify payment
        require(isInP(paymentSrc), "paymentSrc must be in 1..P-1");
        require(isInP(paymentDest) || contracts[paymentDest], "paymentDest must be a constract, or be in 1..P-1");
        require(isInP(minerPub), "minerPub must be in 1..P-1");
        require(paymentAmount != 0, "paymentAmount must be non-zero");
        require(uint128(paymentAmount) == paymentAmount, "paymentAmount must be 128-bit");
        require(uint128(minerFee) == minerFee, "minerFee must be 128-bit");

        // Verify signature
        require(isInP(sigImage), "sigImage must be in 1..P-1");
        require(!usedImage[sigImage], "sigImage has already been used!");

        // Calculate checks and verification
        uint256[MIXIN] memory fundsImageCheck;
        uint256 verification = 0;
        for( uint256 i = 0; i < MIXIN; i++ ) {
            uint256 fundDest = fundsPublicKeys[i];
            require(isInP(fundDest), "funds must be in 1..P-1");
            require((compactStorage[fundDest] & lowerMask) == paymentAmount + minerFee, "funds must sum to paymentAmount + minerFee");
            fundsImageCheck[i] = getCheck(fundsPublicKeys[i], sigProof[i], sigImage);
            verification += sigProof[i] & lowerMask;
        }
        verification = verification % order;

        // Salt the hash with fundsCheck and imageCheck to prove
        //   that he could calculate funds and payments proofs
        //   after commiting to a specific fundsCheck and imageCheck
        //   (fundsCheck and imageCheck are then recursively uncontrollable and random)
        // Include payment to show that he signed it
        uint256 hash = uint256(keccak256(abi.encode(
            minerFee, paymentSrc, paymentDest, paymentAmount, fundsImageCheck
        ))) % order;
        hash |= 1;

        emit Log(hash);
        require(hash == verification, "Hash did not match");

        // Save used image
        usedImage[sigImage] = true;

        // Commit the transaction
        sendToDest(paymentSrc, paymentDest, paymentAmount);

        // Pay the miner
        sendToDest(0, minerPub, minerFee);
    }

    function isContract(uint256 dest) public view returns (bool) {
        return contracts[dest];
    }

    function verifySignature(uint256 src, uint256 message, uint256 signature) public view returns (bool) {
        uint256 rand = signature >> 128;
        if (!isInOrder(rand) || !isInP(src)) {
            return false;
        }
        uint256 proof = signature & lowerMask;
        uint256 challenge = uint256(keccak256(message, exp(g, rand))) % (p-1);
        return (exp(src, challenge) * exp(g, proof)) % p == exp(g, rand);
    }

    function sendToDest(uint256 src, uint256 dest, uint256 amount) private {
        bool isContract = contracts[dest];
        if (isContract) {
            contractStorage[dest].balance += amount;
            require(contractStorage[dest].transactions[src] == 0);
            contractStorage[dest].transactions[src] = amount;
        } else {
            require(isInP(dest));
            uint256 compactValue = compactStorage[dest];
            require(compactValue == 0, "destination has already been used");

            compactValue |= (src << 128);
            compactValue |= amount;
            compactStorage[dest] = compactValue;
        }
        emit LogTransaction(src, dest, amount);
    }

    function getCheck(uint256 fundDest, uint256 sigProof, uint256 sigImage) private view returns (uint256) {
        uint256 fundsProof = sigProof >> 128;
        uint256 paymentsProof = sigProof & lowerMask;

        require(isInOrder(fundsProof), "fundsProof must be in 1..P-2");
        require(isInOrder(paymentsProof), "paymentsProof must be in 1..P-2");

        // Note that phi = 2 * q
        // sig.image + q would also work if paymentsProof is even (50% odds)
        // sig.image + 2 cannot work as hashing prevents q | sig.image
        require((paymentsProof & 1) == 1, "paymentsProof must be odd");

        uint256 check = combine(
            g, fundsProof,
            fundDest, paymentsProof
        ) << 128;
        check |= combine(
            // He must know permuteInP(fund.dest) ** x
            // In order to figure out sigImage after sigFundsProof is frozen
            permuteInP(fundDest), fundsProof,
            sigImage, paymentsProof
        );

        return check;
    }

    event LogTransaction(uint256 src, uint256 dest, uint256 amount);

    function mint(uint256 v, uint256[MIXIN] destinations) public payable {
        require(uint128(v) == v && v != 0, "Value cannot be zero");
        uint256 val = v;

        uint256 destinationID = 0;
        for (uint256 pow = 0; pow < 128; pow += 4) {
            uint256 digit = (val >> pow) & 0xf;
            if (digit > 0) {
                uint256 dest = destinations[destinationID];
                uint256 amount = digit << pow;
                require(destinationID < MIXIN, "Too many significant digits");

                require(compactStorage[dest] == 0, "Destination is already used");
                compactStorage[dest] |= amount;
                destinationID++;
            }
        }
    }

    function sendFromContract(uint256 dest, uint256 amount) {
        uint256 src = uint256(msg.sender);
        require(contracts[src], "Contract address has not been claimed");

        uint256 balance = contractStorage[src].balance;
        require(balance >= amount, "Not enough funds");
        contractStorage[src].balance = balance - amount;

        sendToDest(src, dest, amount);
    }

    function claimContract() public {
        uint256 sender = uint256(msg.sender);
        require(contracts[sender] == false, "Contract address has already been claimed");
        // Can only shadow when dest is irretrievable anyway (Discrete Log)
        contracts[sender] = true;
    }

    event Log(uint256 hash);

    function getTransaction(uint256 destination) public view returns (uint256 src, uint256 dest, uint256 amount) {
        uint256 transactionData = compactStorage[destination];
        require(transactionData != 0, "Transaction does not exist");
        return (transactionData >> 128, destination, transactionData & lowerMask);
    }

    function transactionExists(uint256 destination) public view returns (bool) {
        uint256 transactionData = compactStorage[destination];
        return transactionData != 0;
    }

    function isImageUsed(uint256 keyImage) public view returns (bool) {
        return usedImage[keyImage];
    }
}
