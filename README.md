# Monereum

## Description

This repository implements Monero on top of the Ethereum blockchain. It utilizes Borromean Ring Signatures as a method of authentication, Key Images to prevent double-spend attacks, along with Pedersen Commitments to hide the amounts being spent (While still being able to check that they sum to zero). Range Proofs also utilize a borromean ring signature on each bit of the commitment to ensure that the commitment falls within a range that cannot overflow.

## Development

In order to develop on this repository, please install `npm`:
```
sudo apt install npm
```
Then, install the following CLI tools:
```
sudo npm i -g truffle ganache-cli browserify watchify uglify-js babelify babel-preset-es2015
```

## How Monereum Works

I believe whitepapers to be rather opaque, so I'm providing an explanation of the protocol in a way that should be easy to digest.

A single transaction ring consists of `5` input coins, and `1` output Commitment. A Commitment is a number that represents a hidden value, and can be added or subtracted. They can be designed so that an addition of `k` rings gives 0, only when sum of the amounts is also equal to zero. However, commitments do not necessarily sum to zero even when their amounts sum to zero, so information is revealed only when it is desired. A Ring Proof also contains a Key Image. The rest of the Ring Proof data exists as a ZK proof that the Key Image uniquely but anonymously represents a single input coin with index `i`, and that the Commitment represents a value equal to the value of the `i`th coin. An important property of the Key Image is that there are no two key images that represent the same input coin.

A single transaction consists of `N` transaction rings, `M` range proofs, `M` output coins, and a miner fee `f`. The hash of the output coins and the miner fee is included as a seed to the Ring Proofs, so that we can verify that both were signed by the input coin holder. The sum of the `N` output Commitments from the `N` transaction rings must equal the sum of the `M` output commitments plus a commitment to the miner fee. This is verified upon submission. The `M` range proofs must prove that each coin in `M` is smaller than `2^64`. We can generally assume that `M = 2`, as sending MNR to a single person is most optimally done by paying that person the precise amount needed, and paying yourself the remaining "spare change". Both `N` and `M` are limited to 5.

The algorithm for verifing ring proofs and range proofs, along with correctness proofs of signer ambiguity, unforgeability, and linkability of key images, is already provided in Monero's whitepaper.

When an owner of Monereum coins wishes to make a transaction, (s)he can broadcast the transaction data behind a Tor network.

We note that the miner's public key was not signed in the ring proofs, only the fee value itself, so anyone may claim the miner fee. If the transaction proofs are legitimate, and the miner fee `f` is greater than the estimated gas fees of commiting the transaction (Even by a negligible amount), it would be economically beneficial for anyone to submit the transaction. Thus, the transaction will get submitted by someone (the "miner").

Upon submission, a miner posts a bounty equal to 1 ETH, and a timestamp for the transaction is saved (The "timer"). A submission consists of broadcasting as an event the entire transaction, along with saving a hash of each ring proof and range proof. At this point, all the output coins are "pending".

Now, anyone may claim the bounty of an incorrect pending transaction by posting their own 1 ETH bounty, and disputing a ring proof or range proof. Disputing a proof will freeze the timer, and hold the output coins in a disputed state. Only the hash is provided when a proof is being disputed.

At this point anyone may call a verification function that will set the truth value of the proof hash to true or false, based on the legitimacy of the proof. The one who believes he is correct will presumably call this function. If the proof is legitimate, the one who called the verification function will be awarded 0.5 ETH (And is given 0.5 ETH). If the proof is illegitimate, the disputer is awarded 0.5 ETH (And is given 1.5 ETH). Then, the output coins are either marked Rejected or Pending based on the result of the dispute. The timer resets if the coins are set to Pending. The remaining 0.5 ETH disappears.

When the timer is complete, anyone can commit the output coins. Upon commiting the output coins, the coins are then "Accepted", and no further disputes are possible. Additionally, the miner's 1 ETH bounty is returned. However, if two times the pending time has elapsed, then the next person who commits the output coins may claim the miner's bounty. This forces a transaction to resolve quickly.

We destroy 0.5 ETH upon a dispute to disincentivize disputing with oneself to delay a transaction. Additionally, the proving is separated from the disputing as proving is expensive. It is important that the initial dispute is cheap so that disputes may still be made in periods of high network activity (During an ICO, for example). If a miner fee was too low, a transaction may still be cancelled at any time before a miner submits it. This is done by simply sending coins to yourself using one of the key images, and using a large enough miner fee. Key image uniqueness is verified upon submission to prevent an adversary from forcing a miner to lose his bounty (By submitting the transaction before him). It will be publically known that a transaction was cancelled, and the canceled and cancelee transactions will be linked. No other information will be revealed, however, and sending transactions to oneself will unlink the cancelee.

Because of these properties, we see that any publically disclosed correct transaction will resolve within `(N + 2)(e + T)` seconds, where T is the pending time, N is the number of disputes, and e is the time it takes for someone to call a function that gives them money (Assuming the parameters for this function is publically known). Additionally, we know that any correct transaction that is submitted must eventually resolve.

## Encryping a coin

If you wish to create a coin sending an amount `b` to a public key `(A, B)`, then you must first choose a random scalar `r`. Then, you must calculate the following:

```
Src = rG = R
Dest = hash(rA)G + B
Commitment = hash^2(s)G + bH
CommitmentAmount = (hash^3(s) + b) mod q
return (Src, Dest, Commitment, CommitmentAmount)
```

In this case, `hash^n(x)` means hash iteratively on itself `n` times.

## Decrypting a coin

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

You may note that if `b` is not available, then `(pedersenBlinding, amount)` can still be calculated. The value `a` is the view key, while the value `b` is the spend key

## Signing a transaction

A transaction will take several input coins and several output coins. Our goal is to create

```
Coin[N] funds
RingProof[N] ringProofs
RangeProof[M] rangeProofs
Coin[M] outputs
int minerFee
```
