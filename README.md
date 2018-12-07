# Monereum

## What is Monereum

### Overview

Monereum is an implementation of Monero with RingCT, on top of the Ethereum blockchain. This allows a holder of Monereum coins to send Monereum between each other, without evesdroppers being able to decrypt these transactions. This is the goal of Monero, but does not allow interaction with dApps. Monereum exists to combine Ethereum's versatility with Monero's privacy, by implementing this functionality in Ethereum itself.

### Transactions

A transaction sends Monereum from someone who knows the private key of a Monereum coin, to a public address. The owner of the public address will now have the private key of the new Monereum coin, and no one else will have this private key. This is done in a way where no evesdropper can see the sender and the receiver, but any evesdropper can verify that the amount of coins spent equals the amount of coins generated. In fact, the receiver cannot see the sender either. Any evesdropper can also verify that the sender's coin was not spent twice.

The sender may generate a transaction receipt, to prove that he/she sent the transaction. If the transaction must be associated with a real-life result such as "Send a Laptop to 1234 Main St", then this message can be signed so that it can be proven that the sender approves of that message. Signatures are sent encrypted so that no one may read "Send a Laptop to 1234 Main St", or know for what transaction a receipt is for.

### Keys

Each public Monereum address consists of a public view address and a public spend address. The wallet owner has the view key and spend key for these addresses. You may give the view key to someone, and they will be able see incoming transactions, amounts, and verify transaction receipts for incoming transactions. The spend key, however, is required to spend the received coin. Any amount of public Monereum addresses can be created, so that they can given to Smart Contracts to receive funds.

### Smart Contracts

Transactions signatures allow Smart Contracts to easily accept anonymous funds, and then execute precisely what the user intended in response. Additionally, Smart Contracts will be able to easily send funds to Monereum public addresses. In this way, dApps can maintain anonymity in each transaction. The MNR-ETH market implemented in this repository is an example of this.

### Backwards Compatibility

Any existing Ethereum contract can even be interacted with, while still mainting privacy. This is done by paying gas fees in Monereum, as opposed to in Ethereum. If the same address is needed for long-term interactions, then you can trade Monereum in exchange for Ethereum sent to new anonymous Ethereum address. In this way, you can use your anonymous address normally. When you're done, you can swap back to Monereum and throw the old Ethereum address away. Both sides of these interactions are much easier, and much safer, than alternatives such as CoinJoin.

### ERC20 Support

Anyone may hold a standard ERC20 Token of Monereum - including contracts. An encrypted version of a Monereum coin can be converted into an ERC20 Token easily, and vice-versa. This allows the entire realm of Turing-Complete opportunities to be applied in a way where those interacting with the contract remain private. It also allows Monereum to maintain compatibility with ERC20 services. Monereum addresses can be used just like Ethereum addresses, while sending and receiving ERC20 tokens of Monereum.

## Development Environment

In order to develop on this repository, please install `npm`:
```
sudo apt install npm
```
You'll also have to execute `npm i` in the `./contracts` and `./www/js` directories. You can open the web server by running `. run.sh` in the `./www` directory.

## How Monereum Works

I believe whitepapers to be rather opaque, so I'm providing an explanation of the protocol in a way that should be easier to digest.

### Description

Monereum, like Monero, has Ring Proofs that utilize Borromean Ring Signatures as a method of authentication, Key Images to prevent double-spend attacks, and Pedersen Commitments to hide the amounts being spent (While still being able to check that they sum to zero). Range Proofs also utilize a borromean ring signature on each bit of the commitment to ensure that the commitment falls within a range that cannot overflow around the modulus. All of these techniques are discussed in-depth within the CryptoNote and RingCT whitepapers.

Using your own Ethereum address for Monereum transactions would reveal who you are. Thus, transactions include a Monereum miner fee that is expected to be about equal to the gas cost of the transaction. A signed transaction is broadcasted publically behind a Tor connection, or a trusted web service that does not save IPs (Preferably the former for indisputable trustlessness). Then, a Monereum miner claims the fee by submitting the transaction for you onto the Ethereum network.

While the range and ring proofs can be made within the block limit, they remain expensive. Therefore, transactions require the miner to post a 1 ETH bounty, along with an MNR bounty that's guaranteed to be at least 1/16th of the MNR being transferred (Deduced from highest bit of the range proofs). Open disputes are taken over the next 2 minutes, where disputing also requires posting a 1 ETH bounty. The winner of the dispute is awarded 0.5 ETH (And if the disputer wins he is awarded the MNR bounty as well). The ETH bounty is much higher than the gas price of the proof, so someone will eventually dispute bad transactions. The MNR bounty guarantees that it is unprofitable for an attacker to pay higher gas prices and bid out disputers, since the more MNR they try to fabricate, the more disputers are willing to pay in gas prices to claim the bounty. Overall, this system creates a situation where no one's legitimate transactions will be delayed by a false accusation, but all attempts to profitably create illegitimate transactions will be disputed.

A public address consists of 256-bit coordinates (X, Y), which can be written as 04XY, 03X if Y is odd, or 02X if Y is even. The format 01Z is used if Z is an ERC20 address (Either Monereum or Ethereum).

### Commitments

A Commitment is a number that represents a hidden value, and can be added or subtracted. They can be designed so that an addition of `k` commitments is zero, but this can only be done when sum of the amounts is also equal to zero. However, commitments do not necessarily have to sum to zero, even when their amounts sum to zero. This way, information about sums of commitments is revealed only when it is desired.

### Transaction Rings

A single transaction ring consists of `5` input coins, and `1` output Commitment. A Transaction Ring's Proof contains a Key Image, and proof data. The Ring Proof data exists as a ZK proof that the Key Image uniquely but anonymously represents a single input coin with index `i`, and that the output Commitment represents a value equal to the value of the `i`th coin. An important property of the Key Image is that there are no two key images that represent the same input coin, so that once a coin is spent, it cannot be spent again.

### Transactions

A single transaction consists of `N` transaction rings, `M` range proofs, `M` output coins, and a miner fee `f`. The hash of the output coins and the miner fee is included as a seed to the Ring Proofs, so that we can verify that both were signed by the input coin holder. The sum of the `N` output Commitments from the `N` transaction rings must equal the sum of the `M` output commitments plus a commitment to the miner fee (Which can be done as discussed in the Commitments section). This is verified upon submission. The `M` range proofs must prove that each coin in `M` is smaller than `2^64`, to prevent wrapping around the modulus. We can generally assume that `M = 2`, as sending MNR to a single person is most optimally done by paying that person the precise amount needed, and paying yourself the remaining "spare change". Both `N` and `M` are limited to 5.

The algorithms for creating and verifying ring proofs and range proofs, along with correctness proofs of signer ambiguity, unforgeability, and linkability of key images and commitments, is already provided in Monero's whitepaper.

### Sending transactions

When an owner of Monereum coins wishes to make a transaction, (s)he can broadcast the transaction data behind a Tor network.

We note that the miner's public key was not signed in the ring proofs, only the fee value itself, so anyone may claim the miner fee. If the transaction proofs are legitimate, and the miner fee `f` is greater than the estimated gas fees of committing the transaction (Even by a negligible amount), then it would be economically beneficial for someone to submit the transaction. Thus, the transaction will indeed get submitted by someone (the "miner"). This is important, as having to submit a transaction yourself will reveal your Ethereum address.

### Bounties

Upon submission, a miner posts a bounty equal to 1 ETH plus 1/16th the maximum value of the transaction in MNR (Based on the highest bit in the range proof). A timestamp for the transaction is then saved (The "timer"). A submission will broadcast all of the transaction data as an EVM event, along with internally saving a hash of each ring proof and range proof. At this point, all the output coins are "pending".

Now, anyone may claim the bounty of an incorrect pending transaction by posting their own 1 ETH bounty, and disputing a ring proof or range proof. Disputing a proof will freeze the timer, and hold the output coins in a disputed state. Only the hash is provided when a proof is being disputed (The hash that was previously saved).

At this point anyone may call a verification function with all of the proof data, which will then set the truth value of the proof's hash to true or false, based on the legitimacy of the proof. The one who believes he is correct will presumably call this function. If the proof is legitimate, then the one who called the verification function will be awarded 0.5 ETH. If the proof is illegitimate, the original disputer is awarded 0.5 ETH, and his 1 ETH bounty is returned. Then, the output coins are either marked Rejected or Pending based on the result of the dispute. The timer resets if the coins are set to Pending. The remaining 0.5 ETH disappears. An important aspect is that anyone may claim a false dispute's bounty, so that disputes on legitimate proofs will be reported quickly. However, only the disputer can claim a correct dispute. This way he feels safe spending gas to freeze the timer during times of high gas prices (Or an intentional attack on gas prices).

After four times the pending time, anyone may claim an illegitimate proof's bounty. This way the Key Images that were marked for that transaction will then be freed, for the actual owner to spend them properly.

Though the disputer posts a 1 ETH bounty, this isn't necessary. It is only added for practical reasons of reducing false dispute percentages.

When the timer is complete, anyone can commit the output coins. Upon commiting the output coins, the coins are then "Accepted", and no further disputes are possible. Additionally, the miner's 1 ETH bounty is returned. However, if two times the pending time has elapsed, then the next person who commits the output coins may claim the miner's bounty. This forces a transaction to resolve quickly.

We destroy 0.5 ETH upon a dispute to disincentivize disputing with oneself to delay a transaction. Additionally, the proving is separated from the disputing as proving is expensive. It is important that the initial dispute is cheap so that disputes may still be made during gas price attacks, while still trying to keep the miner's bounty as low as possible.

### Transaction Cancelling

Ethereum allows cancelling transactions through nonce fiddling, though not many front-ends implement this behavior. Not knowing when a transaction will clear is quite bothersome when a gas price is accidentally set too low, forcing you to wait for hours before a transaction is confirmed. I found it important to verify the ease of transaction cancelling while maintaining anonymity.

If a miner fee was too low, a transaction is cancelled by simply sending coins to yourself using one of the key images, and using a large enough miner fee. Key image uniqueness is verified upon submission to prevent an adversary from forcing a miner to lose his bounty (By submitting the transaction before him). It will be publicly known that a transaction was cancelled, and the canceled and cancelee transactions will be linked. No other information will be revealed, however. Self-mixing will unlink the cancelee. Front-ends should implement this self-sending as part of the cancelling procedure, and should still use `M = 2` output coins to remain hidden.

### Transaction Receipts

Every output coin will come with a receipt that you may send to the receiver. Anyone else who views the receipt will not be able to figure out which transaction the receipt belongs to. However, anyone with the view key of the receiver can verify that only the person who sent the transaction could have generated the receipt.

### Smart Contract Transactions

Smart Contracts are versatile, but wallets must be careful when converting to and from Monereum coins, since Ethereum transactions are entirely transparent.

Sending an encrypted Monereum coin to a smart contract requires signing the coin with the key image, which gets verified on the spot. This is of course revealing, so wallet implementations need to ensure that only funds that have been self-mixed are used. The self-mixing should be entirely abstracted away. Note that using "spare change" is not self-mixing, since if a previous transaction involving sending coin A to someone, with a spare change coin B, then the owner of A will be able to see when you try using B. This would reveal yourself to the owner of A.

In order to prevent other smart contracts from stealing coins, sending Monereum to smart contracts also requires signing the coin with the address of the contract, and any data that the contract wants signed (Data that would encode what you want the smart contract to do). It's the smart contract's responsibility to honor the data that was signed, and such smart contracts should be open source so that all can verify that it will do what is desired. In order to allow the smart contract to respond to such submissions, this transaction data is actually sent to the smart contract itself. The smart contract then submits the signature to the Monereum contract, which will then increase the smart contract's balance along with verifying the signature against the key image, provided data, and `msg.sender`. The smart contract provides the data based on what function was called and with what parameters.

Receiving a Monereum coin involves the smart contract minting new Monereum coins. This is done at the discretion of the smart contract.

Additionally, the Pedersen Blinding Key must be revealed when smart contracts are minting or receiving Monereum coins. This way the commitment amount may be verified (And will of course be publically visible). This will not allow others to generate receipts or see the receiver, however.

The Monereum contract itself keeps track of all Monereum coins sent to and minted by a smart contract, so that a smart contract does not mint more than it consumes.

### ERC20 Monereum Addresses

Backwards compatibility involves allowing Monereum Addresses to look like Ethereum addresses. This is done by providing a hash of the desired destination address, and allowing that to be an ERC20 "Ethereum" address (Ethereum also uses hashes of ECC Points, so we prepend the word "Monereum" before hashing to prevent collisions). They can then be transferred back into Monereum by signing the transaction with the private key of that address.

### Properties of Monereum

From the protocol described above, we see that any publicly disclosed correct transaction will resolve within `(N + 2)(e + T)` seconds, where T is the pending time, N is the number of disputes, and e is the time it takes for someone to call a function that they know will give them free money, including transaction delay. Additionally, this formula shows that any correct transaction that is submitted must eventually resolve. Also, we see that any false transaction is guaranteed to be disputed within time `e`. By having `T > e`, we maintain that all false transactions must be disputed. We make `T` equal to two minutes, under the assumption that `e` is at worst one minute (With bounties high enough to guarantee this during a gas price attack). This still leaves `T + N(e + T)` at a reasonable order of magnitude for a miner to wait for his bounty, though in the vast majority of cases this should simply equal `T`.

We must also note that the bounty system is secure against adversaries looking to profit by preventing disputers. Disputers have `T - e` seconds to report an illegitimate transaction, which is 4 blocks, or 3 blocks to be safe. With worst case of 50% centralization in the Ethereum network, we see that there is a 12.5% chance that three blocks could come from a colluding individual. If an adversary tries to falsely create `M` MNR, then the adversary would have to try to inject at most `M` MNR in ETH to artificially raise gas prices. In 87.5% of cases, there is an opportunity for reporters to report. The cost of reporting would be `p + g / L * I`, where g is the gas cost of reporting, L is the gas limit, p is the gas cost without artificial injection, and I is the ETH being injected to increase gas prices. This is evaluated to be at worst `0.15 ETH + 1 / 32 * M`. Clearly, the `0.5 ETH + M / 16` bounty is much larger than this, so reporters are guaranteed to report in this case. The adversary thus loses `M + I` MNR 87.5% of the time, and gains `M - I` MNR 12.5% of the time, which is again clearly disadvantageous. If someone chooses to generate MNR with gas price injection and using mining power to prevent reporting, even though it would lose money in the long run, we still accept the newly created MNR as legitimate MNR since disputes are not accepted after a transaction is accepted. This allows for an extremely inefficient minting procedure, so MNR is technically a variable supply token in this regard.

Notice for developers: If a contract is using MNR and has a scheme that punishes users for taking too long (In say, a game of mental poker), then it is important that they keep the `(N + 2)(e + T)` limit in mind. The front-end should organize the transaction amounts beforehand, so that they can easily be transferred without any proofs and would thus take at worst `e` seconds. Alternatively, such contracts could allow `(N + 2)(e + T)` time to pass penalty free, but this may be too limiting for certain contract objectives. Ethereum itself can be DDOSed by a sufficiently wealthy individual paying high enough gas prices, so this shouldn't be an issue specific to MNR.

## Interacting with the MNR contract

### Creating a coin

If you wish to create a coin sending an amount `k` to a public key `(A, B)`, then you must first choose a random scalar `r`. Then, you calculate the following:

```
Src = r*hashP(B) = R
Secret = hash(rA)
Dest = Secret*G + B
Commitment = hash(Secret)*G + k*H
CommitmentAmount = (hash(hash(Secret)) + k) mod q
return (Src, Dest, Commitment, CommitmentAmount)
```

In this case, `hashP` is a hash function that maps to ECC Points rather than integers. This is done so that the same view key can be used for all of a wallet's public addresses (Which have unique `B`s). Additionally, you see that Commitment and CommitmentAmount can be deduced from the shared secret, using something akin to a block cipher (But rather a shared PRNG).

Note: If `r` is not very random or is publicly revealed, then anyone may view the coin's owner and generate the receipt (Since at that point everyone knows just as much as the sender). However, it remains that no one can spend it (Of course, as otherwise the sender could spend it). The receiver does not have to worry about this, since spending the coin will cause it to be anonymized with other coins in a transaction ring. This also obscures the sender from knowing when a sent coin is spent, which is important for maintaining anonymity.

### Decrypting a coin

Say you own the private key `(a, b)` for the public `(A, B)`, and have a coin `(Src, Dest, Commitment, CommitmentAmount)` that was potentially sent to you. Then you can retrieve the private key, coin amount, and pedersen blinding factor for that coin by executing the following:

```
s = hash(aR)
require(sG + B == Dest, "Incorrect private key")
privateKey = s + b
pedersenBlinding = hash(s)
amount = (commitmentAmount - hash(hash(s))) mod q
require(Commitment == pedersenBlinding * G + amount * H, "Incorrect amount")
return (privateKey, pedersenBlinding, amount)
```

You may note that if `b` is not available, then `(pedersenBlinding, amount)` can still be calculated. The value `a` is the view key, while the value `b` is the spend key.

### Malformed coins

It is useful that all Monereum coins are in precisely the format that the algorithm described above will be able to decrypt, even though this is not necessary. It is possible to send coins in a way that is "valid", meaning they can be retrieved through the "Layer 1" Monereum smart contract protocol, but still do not fit the "Layer 2" format. This is possible by having `pedersenBlinding = hash(s + 2)`, for example. While another entity could build their own platform with a differing "Layer 2" format, it would require unnecessary to work to create interfaces that are inter-compatible. There is no inherent security risk from an adversary creating coins that do not adhere to the "Layer 2" format, unless Clients are not built to recognize malformed coins. This is done with the `require`s seen in _Decrypting a coin_. The Layer 1 protocol implements all required checks for internal consistency. Malformed coins will most likely not be recognized by clients following the protocol, and may require more advanced knowledge to retrieve manually.

### Wallet handling

A wallet has a seed mnemonic that deterministically generates wallet parameters. This should be done with accordance to BIP 39. The wallet generates a single master view key `a`, and generates many spend keys `b_i`, such that the mnemonic is both required and the only thing necessary to generate any of these parameters. This way, if a wallet is lost, the funds can be regenerated from the mnemonic. Additionally, the wallet is as safe as the mnemonic. Regenerated wallet funds requires recognizing incoming transactions. However, a transaction can easily be recognized by calculating `hash(aR)`, and checking the `pedersenBlinding` and `amount` values for consistency. This way holders of the view key can still see transactions to any of the public spend keys, without even knowing the public spend key.

Decrypting is also efficient for many spend keys, since a given transaction's `Dest` is equal to some `hash(aR)*G + B_i`. Simply store the first hundred or even thousand `B_i` in a hashmap, and then calculate `Dest - hash(aR)*G` for each recognized transaction. The resulting point can be looked up in the hashmap to see if any `B_i` matches. A match will be found for some `i` if the coin conforms to the described Layer 2 (Assuming enough `B_i`s have been generated, which is easily able to be done beyond what a wallet holder is realistically able to use).

It is also possible to allow deterministic generation of `r_i`, but outgoing transactions cannot be easily retrieved. It would require iterating over each public key that funds might have been sent to, and for each public key then iterating over the blockchain. Even worse, these iterations must then be repeated for each possible `r_i`. This is not computationally feasible unless notable resources are dedicated to this task. It's possible to have only a single `r_1`, and then only generate `r_2` when sending to the same public address twice. However, the computation is still not very feasible. What is possible, is regenerating outgoing transactions when the public address `(A, B)` is known. In this case, `R_i = r_i * hashP(B)` can be calculated for the first hundred or thousand `r_i` and stored in a hashmap. Then, the blockchain may be scanned to see if `Src` is in the hashmap. If a match is found to `R_i`, `r_i * A` may be used to see the amount sent, and `r_i` may be used for receipt generation.

### Transaction Signatures

A transaction is signed with the random number `r` that was generated as the `Src`. A transaction is signed by generating `(h, I)` such that `H(hR + I) = h`. Note that this is trivial if you know `r` such that `R = rG`, as you can pick a desired `H(aG) = h`, and solve `h * r + b = a` for `b` to derive `I = bG`. It is easy to extend this to signatures of a message `m` by creating `(h, I)` such that `H(hR + I, m) = h`. Having the view key will not allow receipt generation; only having the mnemonic will allow receipt generation. Note that in this case, `G = hashP(B)`, as opposed to the common base.

### Transaction Receipts

A transaction receipt is simply an encrypted transaction signature with no message, so that only the wallet holder may generate receipts for outgoing transactions. The Diffie-Hellman exchange that occurs when agreeing upon `rA = aR` allows for easy encryption where the receiver my decrypt it. The transaction signature is XOR'ed with `hash(hash(aR) + 1) = hash(s + 1)` to create a transaction receipt, so that the receipt can be sent over an insecure channel without revealing the transaction. The holder of a view key may also verify receipts of received transactions, since they have access to the shared secret `s`.

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

