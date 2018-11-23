# Monereum

## Description

This repository implements Monero with RingCT on top of the Ethereum blockchain.

Monereum, like Monero, utilizes Borromean Ring Signatures as a method of authentication, Key Images to prevent double-spend attacks, and Pedersen Commitments to hide the amounts being spent (While still being able to check that they sum to zero). Range Proofs also utilize a borromean ring signature on each bit of the commitment to ensure that the commitment falls within a range that cannot overflow. All of these techniques are discussed in-depth within the Monero whitepaper, so they will not be discussed here.

Using your own Ethereum address for Monereum transactions would reveal who you are. Thus, transactions include a miner fee that is expected to be approximately equal to the gas cost of the transaction. A signed transaction is broadcasted publically behind a Tor connection, or a trusted web service that does not save IPs (Preferably the former for indisputable trustlessness). Then, a miner claims the fee by submitting the transaction for you.

While the range and ring proofs can be made within the block limit, they remain expensive. Therefore, transactions require the miner to post a 1 ETH bounty, along with an MNR bounty that's guaranteed to be at least 1/16th of the MNR being transferred (Deduced from highest bit of the range proofs). Open disputes are taken over the next 2 minutes, where disputing also requires posting a 1 ETH bounty. The winner of the dispute is awarded 0.5 ETH (And if the disputer wins he is awarded the MNR bounty as well). The ETH bounty is much higher than the gas price of the proof, and the MNR bounty guarantees that that a reporter will still report, even if someone tries attacking the network with very high gas prices. Overall, this system creates a situation where no one's legitimate transactions will be delayed by a false accusation, but all attempts to profitably create illegitimate transactions will be disputed.

Additionally, anyone may hold a standard ERC20 Token of Monereum, including contracts. An encrypted version of a Monereum coin can be converted into an ERC20 Token easily, and vice-versa. This allows the entire realm of Turing-Complete opportunities to be applied in a way where those interacting with the contract remain private. Allowances can also be made to Monereum public addresses, so that transactions to/from the ERC20 version remain anonymous.

A public address consists of 256-bit coordinates (X, Y), which can be written as 04XY, 03X if Y is odd, or 02X if Y is even. The format 01X is used if X is an ERC20 address.

## Development Environment

In order to develop on this repository, please install `npm`:
```
sudo apt install npm
```
Then, install the following CLI tools:
```
sudo npm i -g truffle ganache-cli browserify watchify uglify-js babelify babel-preset-es2015
```

## How Monereum Works

I believe whitepapers to be rather opaque, so I'm providing an explanation of the protocol in a way that should be easier to digest.

### Keys

Each public key consists of a view key and a spend key. You may give the view key to someone to allow them to see incoming transactions and verify transaction receipts. A wallet can have many public keys, and a given view key only works for a single public key. The spend key is require to spend the coin. Keys are generated such that the view key can be deduced from the spend key. Someone with a view key cannot see outgoing transactions.

### Transaction Rings

A single transaction ring consists of `5` input coins, and `1` output Commitment. A Commitment is a number that represents a hidden value, and can be added or subtracted. They can be designed so that an addition of `k` rings gives 0, only when sum of the amounts is also equal to zero. However, commitments do not necessarily sum to zero even when their amounts sum to zero, so information is revealed only when it is desired. A Ring Proof also contains a Key Image. The rest of the Ring Proof data exists as a ZK proof that the Key Image uniquely but anonymously represents a single input coin with index `i`, and that the Commitment represents a value equal to the value of the `i`th coin. An important property of the Key Image is that there are no two key images that represent the same input coin.

### Transactions

A single transaction consists of `N` transaction rings, `M` range proofs, `M` output coins, and a miner fee `f`. The hash of the output coins and the miner fee is included as a seed to the Ring Proofs, so that we can verify that both were signed by the input coin holder. The sum of the `N` output Commitments from the `N` transaction rings must equal the sum of the `M` output commitments plus a commitment to the miner fee. This is verified upon submission. The `M` range proofs must prove that each coin in `M` is smaller than `2^64`. We can generally assume that `M = 2`, as sending MNR to a single person is most optimally done by paying that person the precise amount needed, and paying yourself the remaining "spare change". Both `N` and `M` are limited to 5.

The algorithm for verifying ring proofs and range proofs, along with correctness proofs of signer ambiguity, unforgeability, and linkability of key images, is already provided in Monero's whitepaper.

When an owner of Monereum coins wishes to make a transaction, (s)he can broadcast the transaction data behind a Tor network.

We note that the miner's public key was not signed in the ring proofs, only the fee value itself, so anyone may claim the miner fee. If the transaction proofs are legitimate, and the miner fee `f` is greater than the estimated gas fees of committing the transaction (Even by a negligible amount), then it would be economically beneficial for anyone to submit the transaction. Thus, the transaction will indeed get submitted by someone (the "miner"). This is important, as having to submit a transaction yourself will reveal your Ethereum address.

### Bounties

Upon submission, a miner posts a bounty equal to 1 ETH plus the maximum value of the transaction in MNR (Based on the highest bit in the range proof). A timestamp for the transaction is then saved (The "timer"). A submission will broadcast all of the transaction data as an EVM event, along with internally saving a hash of each ring proof and range proof. At this point, all the output coins are "pending".

Now, anyone may claim the bounty of an incorrect pending transaction by posting their own 1 ETH bounty, and disputing a ring proof or range proof. Disputing a proof will freeze the timer, and hold the output coins in a disputed state. Only the hash is provided when a proof is being disputed.

At this point anyone may call a verification function with all of the proof data, which will then set the truth value of the proof's hash to true or false, based on the legitimacy of the proof. The one who believes he is correct will presumably call this function. If the proof is legitimate, then the one who called the verification function will be awarded 0.5 ETH. If the proof is illegitimate, the original disputer is awarded 0.5 ETH, and his 1 ETH bounty is returned. Then, the output coins are either marked Rejected or Pending based on the result of the dispute. The timer resets if the coins are set to Pending. The remaining 0.5 ETH disappears. An important aspect is that anyone may claim a false dispute's bounty, so that disputes on legitimate proofs will be reported quickly. However, only the disputer can claim a correct dispute. This way he feels safe spending gas to freeze the timer in times of high gas prices (Or an intentional attack on gas prices).

Though the disputer posts a 1 ETH bounty, this isn't necessary to prove correctness. It is only added for practical reasons of reducing false dispute percentages.

When the timer is complete, anyone can commit the output coins. Upon commiting the output coins, the coins are then "Accepted", and no further disputes are possible. Additionally, the miner's 1 ETH bounty is returned. However, if two times the pending time has elapsed, then the next person who commits the output coins may claim the miner's bounty. This forces a transaction to resolve quickly.

We destroy 0.5 ETH upon a dispute to disincentivize disputing with oneself to delay a transaction. Additionally, the proving is separated from the disputing as proving is expensive. It is important that the initial dispute is cheap so that disputes may still be made during gas price attacks, while still keeping the miner's bounty as low as possible.

### ERC20 Transactions

ERC20 tokens are versatile, but care must be taken when converting to and from Monero coins, since ERC20 transactions are entirely transparent.

Turning an ERC20 token into encrypted Monero simply requires the sender to have the allotted allowance. Note that amount cannot be encrypted as it must be deducted from the balance, but this is not relevant as spending the token will always be hidden in a ring.

Note: It is possible to hide all balances as pedersen commitments, but this would make the `balanceOf` operation impossible. I would like to eventually see an Monereum compatible implementation of a quasi-ERC20 token that hides balances, however.

Turning an encrypted Monereum coin into an ERC20 token requires signing the coin with the key image, which gets verified on the spot. This is of course revealing, so wallet implementations need to ensure that only funds that have been self-mixed are used. The self-mixing should be entirely abstracted away. Please note that using "spare change" is not self-mixing, since if a previous transaction has a spent coin A, and a spare change coin B, then the owner of A will be able to see when you turn B into an ERC20 token, revealing yourself to the owner of A.

### ERC20 Allowances to Monereum Addresses

Allowances may also be made to Monereum public addresses, allowing them to spend your token by signing the transaction with their private key. This uses the miner fee model, so that an ethereum address is not required.

### Transaction Cancelling

Ethereum allows cancelling transactions through nonce fiddling, though not many front-ends implement this behavior. Not knowing when a transaction will clear is quite annoying when a gas price is accidentally set too low, forcing you to wait for hours before a transaction is confirmed. I found it important to verify the ease of transaction cancelling while maintaining anonymity.

If a miner fee was too low, a transaction is cancelled by simply sending coins to yourself using one of the key images, and using a large enough miner fee. Key image uniqueness is verified upon submission to prevent an adversary from forcing a miner to lose his bounty (By submitting the transaction before him). It will be publicly known that a transaction was cancelled, and the canceled and cancelee transactions will be linked. No other information will be revealed, however. Self-mixing will unlink the cancelee. Front-ends should implement this self-sending as part of the cancelling procedure, and should still use `M = 2` output coins to remain hidden.

### Transaction Receipts

Every output coin will come with a receipt that you may send to the receiver. Anyone else who views the receipt will not be able to figure out which transaction the receipt belongs to. However, anyone with the view key of the receiver can verify that only the person who sent the transaction could have generated the receipt.

### Properties of Monereum

From the protocol described above, we see that any publicly disclosed correct transaction will resolve within `(N + 2)(e + T)` seconds, where T is the pending time, N is the number of disputes, and e is the time it takes for someone to call a function that they know will give them free money, including transaction delay. Additionally, this formula shows that any correct transaction that is submitted must eventually resolve. Also, we see that any false transaction is guaranteed to be disputed within time `e`. By having `T > e`, we maintain that all false transactions must be disputed. We make `T` equal to two minutes, under the assumption that `e` is at worst one minute (With bounties high enough to guarantee this during a gas price attack). This still leaves `T + N(e + T)` at a reasonable order of magnitude for a miner to wait for his bounty, though in the vast majority of cases this should simply equal `T`.

We must also note that the bounty system is secure against adversaries looking to profit by preventing disputers. Disputers have `T - e` seconds to report an illegitimate transaction, which is 4 blocks, or 3 blocks to be safe. With worst case of 50% centralization in the Ethereum network, we see that there is a 12.5% chance that three blocks could come from a colluding individual. If an adversary tries to falsely create `M` MNR, then the adversary would have to try to inject at most `M` MNR in ETH to artificially raise gas prices. In 87.5% of cases, there is an opportunity for reporters to report. The cost of reporting would be `p + g / L * I`, where g is the gas cost of reporting, L is the gas limit, p is the gas cost without artificial injection, and M is the ETH being injected to increase gas prices. This is evaluated to be at worst `0.15 ETH + 1 / 32 * M`. Clearly, the `0.5 ETH + M / 16` bounty is much larger than this, so reporters are guaranteed to report in this case. The adversary thus loses `M + I` MNR 87.5% of the time, and gains `M - I` MNR 12.5% of the time, which is again clearly disadvantageous. If someone chooses to generate MNR with gas price injection, even though it would lose money in the long run, we accept the newly created MNR as legitimate MNR since disputes are not accepted after a transaction is accepted. This allows for an extremely inefficient minting procedure, so MNR is technically a variable supply token in this regard.

Notice for developers: If a contract is using MNR and has a scheme that punishes users for taking too long (In say, a game of mental poker), then it is important that they keep the `(N + 2)(e + T)` limit in mind. The front-end should organize the transaction amounts beforehand, so that they can easily be transferred without any proofs and would thus take at worst `e` seconds. Alternatively, such contracts could allow `(N + 2)(e + T)` time to pass penalty free, but this may be too limiting for certain contract objectives. Ethereum itself can be DDOSed by a sufficiently wealthy individual paying high enough gas prices, so this shouldn't be an issue specific to MNR.

## Interacting with the MNR contract

### Encrypting a coin

If you wish to create a coin sending an amount `b` to a public key `(A, B)`, then you must first choose a random scalar `r`. Then, you calculate the following:

```
Src = rG = R
Dest = hash(rA)G + B
Commitment = hash^2(s)G + bH
CommitmentAmount = (hash^3(s) + b) mod q
return (Src, Dest, Commitment, CommitmentAmount)
```

In this case, `hash^n(x)` means hash called iteratively on itself `n` times.

Note: If `r` is not very random or is publicly revealed, then anyone may view the coin's owner and generate the receipt. However, it remains that no one can spend it (Of course, as otherwise the sender could spend it). The receiver does not have to worry about this, since spending the coin will cause it to be anonymized with other coins in a ring signature.

### Decrypting a coin

Say you own the private key `(a, b)` for the public `(A, B)`, and have a coin `(Src, Dest, Commitment, CommitmentAmount)` that was sent to you. Then you can retrieve the private key, coin amount, and pedersen blinding factor for that coin by executing the following:

```
s = hash(aR)
require(sG + B == Dest, "Incorrect private key")
privateKey = s + b
pedersenBlinding = hash(s)
amount = (commitmentAmount - hash^2(s)) mod q
require(Commitment == pedersenBlinding * G + amount * H, "Incorrect amount")
return (privateKey, pedersenBlinding, amount)
```

You may note that if `b` is not available, then `(pedersenBlinding, amount)` can still be calculated. The value `a` is the view key, while the value `b` is the spend key.

### Transaction Receipts

The Diffie-Hellman exchange that occurs when transferring `rA = aR` allows for easy receipt generation. Simply send the receipt `hash(hash(rA) + 1) = hash(s + 1)` to prove that you sent the message. Only someone with the view key will be able to link this receipt to a transaction by knowing the secret `s`, which allows the receipt to be transmitted over an insecure channel. `hash^3(s)` is not a secure receipt as knowing or brute-forcing the amount `b` can reveal `hash^2(s)`, which generates `hash^3(s)`.

### Transaction Signatures

A transaction is signed with the random number `r` that was generated as the Src. A transaction is signed by generating `(h, I)` such that `H(hR + I) = h`. Note that this is trivial if you know `r`, as you can pick a desired `H(aG) = h`, and solve `h * r + b = a` to derive `I = bG`. It is easy to extend this to general signatures of a message `m` by requesting `(h, I)` such that `H(hR + I, m) = h`.

### Generating transaction proofs

A transaction will take `N` input rings of `5` coins each, and `M` output coins. Our goal is to create a valid

```
Coin[N] funds
RingProof[N] ringProofs
RangeProof[M] rangeProofs
Coin[M] outputs
int minerFee
```

### Verifying transaction proofs
