const pt = require('./ecc-point')
const bigInt = require('./bigint')
const hash = require('./hash')

/*
tx:
{
  src,
  dest,
  commitment,
  commitmentAmount,
  senderData: {
    privKey, // Secret (for signing)
    pubKey, // Of receiver
    amount // Sent to receiver
  }
}
*/

class Wallet {
  getRandom() {
    this.seed = hash(this.seed.xor(this.masterSeed))
    return this.seed
  }

  generateKey() {
    this.privSeed = hash(this.privSeed.xor(this.masterSeed))

    const spend = this.privSeed.mod(pt.q)
    const spendPub =  pt.g.times(spend).affine()
    const generator = hash(spendPub).and(bigInt[1].shiftLeft(64).minus(1))
    const view = this.masterView
    const key = {
      spendPub: spendPub,
      viewPub: pt.g.times(generator).hashInP().times(view).affine(),
      generator: generator,
      spendKey: spend,
      viewKey: view
    }
    this.keys.push(key)
    this.spendPubs[spendPub] = key
    return key;
  }

  createTransaction(pubKey, amount, noBlindingKey) {
    this.sentSeed = hash(this.sentSeed.xor(this.masterSeed));

    const rand = this.sentSeed.mod(pt.q);
		amount = bigInt(amount)
    const tx = {}
    const generator = hash(pubKey.spendPub).and(bigInt[1].shiftLeft(64).minus(1))
    tx.src = pt.g.times(generator).hashInP().times(rand).affine()
    const secret = hash(pubKey.viewPub.times(rand).affine())
    tx.dest = pt.g.times(secret).plus(pubKey.spendPub).affine()
    const blindingKey = noBlindingKey ? 0 : hash(secret)
    tx.senderData = {
      srcKey: rand,
      recipient: pubKey,
      secret,
      blindingKey,
      amount,
    }
    tx.commitment = pt.g.times(blindingKey).plus(pt.h.times(amount)).affine()
    tx.commitmentAmount = noBlindingKey ? amount : hash(blindingKey).plus(amount).mod(pt.q)
    return tx
  }

  getReceipt(tx) {
    return hash(tx.senderData.secret.plus(1));
  }

  wasCreatedBy(tx, rand) {
    return tx.src.eq(pt.g.times(rand))
  }

  tryDecryptTransaction(tx) {
    if (tx.receiverData) {
      console.error("Already decrypted")
      return tx;
    }
    let secret = hash(tx.src.times(this.masterView).affine());
    const mostMoney = bigInt[1].shiftLeft(64);

    let blindingKey = hash(secret)
    let amount = tx.commitmentAmount.minus(hash(blindingKey)).mod(pt.q).plus(pt.q).mod(pt.q)

    // Quickly skip if the commitmentAmount isn't possible
    if (tx.commitmentAmount.gt(mostMoney)) {
      if (amount.gt(mostMoney)) {
        return null
      }
    }

    // sG + B = D, so B = D - sG
    // We can search for B in a hashmap
    let privKey = null;
    const spendPub = tx.dest.minus(pt.g.times(secret)).affine()
    const key = this.spendPubs[spendPub]
    if (!key) {
      return null
    }
    if (key.spendKey) {
      privKey = secret.plus(key.spendKey).mod(pt.q)
    }
    if (tx.commitment.eq(pt.h.times(tx.commitmentAmount))) {
      blindingKey = 0
      amount = tx.commitmentAmount
    } else {
      if (tx.commitment.neq(pt.g.times(blindingKey).plus(pt.h.times(amount)))) {
        console.error("Bad TX: ", tx, key);
        return null;
      }
    }
    tx.receiverData = {
      amount,
      secret,
      blindingKey,
      privKey,
    };
    return tx;
  }

  isValidReceipt(tx, receipt) {
    if (!tx.receiverData) {
      throw "Can't check receipt for unowned Tx"
    }
    return hash(tx.receiverData.secret.plus(1)).eq(receipt);
  }

  createRingProof(from, mixers, outputHash, newBlindingKey) {
    const getRandom = this.getRandom.bind(this)
    const index = getRandom().mod(mixers.length + 1).toJSNumber()
    const ringFunds = mixers
    ringFunds.splice(index, 0, from)
    const keyImage = from.dest.hashInP().times(from.receiverData.privKey).affine()
    const commitment = pt.g.times(newBlindingKey).plus(pt.h.times(from.receiverData.amount)).affine()
    const a = getRandom().mod(pt.q)
    const b = getRandom().mod(pt.q)
    let fundCheck = pt.g.times(a).affine()
    let imageCheck = from.dest.hashInP().times(a).affine()
    let commitmentCheck = pt.g.times(b).affine()
    let prevHash = hash(fundCheck, imageCheck, commitmentCheck, outputHash)
    const imageFundProofs = Array(ringFunds.length)
    const commitmentProofs = Array(ringFunds.length)
    let borromean = prevHash
    for (let i = 1; i < ringFunds.length; i++) {
      const j = (i + index) % ringFunds.length;
      const fundDest = ringFunds[j].dest
      const fundCommitment = ringFunds[j].commitment
      const commitmentChallenge = commitment.minus(fundCommitment)
      imageFundProofs[j] = getRandom().mod(pt.q)
      commitmentProofs[j] = getRandom().mod(pt.q)

      fundCheck = fundDest.times(prevHash).plus(pt.g.times(imageFundProofs[j])).affine()
      imageCheck = keyImage.times(prevHash).plus(fundDest.hashInP().times(imageFundProofs[j])).affine()
      commitmentCheck = commitmentChallenge.times(prevHash).plus(pt.g.times(commitmentProofs[j])).affine()

      prevHash = hash(fundCheck, imageCheck, commitmentCheck, outputHash)
      if (j === ringFunds.length - 1) {
        borromean = prevHash
      }
    }
    imageFundProofs[index] = a.minus(prevHash.times(from.receiverData.privKey)).mod(pt.q).plus(pt.q).mod(pt.q)
    commitmentProofs[index] = b.minus(prevHash.times(newBlindingKey.minus(from.receiverData.blindingKey))).mod(pt.q).plus(pt.q).mod(pt.q)
    // Hash as static length array
    ringFunds.static = true
    imageFundProofs.static = true
    commitmentProofs.static = true
    return {
      funds: ringFunds,
      keyImage,
      commitment,
      borromean,
      imageFundProofs,
      commitmentProofs,
      outputHash
    }
  }

  verifyRingProof(ringProof) {
    let prevHash = ringProof.borromean
    for (let i = 0; i < ringProof.funds.length; i++) {
      const fundDest = ringProof.funds[i].dest
      const fundCommitment = ringProof.funds[i].commitment

      const imageFundProof = ringProof.imageFundProofs[i]
      const commitmentProof = ringProof.commitmentProofs[i]

      const commitmentChallenge = ringProof.commitment.minus(fundCommitment)

      const fundCheck = fundDest.times(prevHash).plus(pt.g.times(imageFundProof)).affine()
      const imageCheck = ringProof.keyImage.times(prevHash).plus(fundDest.hashInP().times(imageFundProof)).affine()
      const commitmentCheck = commitmentChallenge.times(prevHash).plus(pt.g.times(commitmentProof)).affine()

      prevHash = hash(fundCheck, imageCheck, commitmentCheck, ringProof.outputHash)
    }
    return ringProof.borromean.eq(prevHash)
  }

  createRangeProof(tx) {
    if (tx.commitment.neq(pt.g.times(tx.senderData.blindingKey).plus(pt.h.times(tx.senderData.amount)))) {
      throw "Transaction commitment discrepancy"
    }
    const rangeCommitments = []
    const rangeBorromeans = []
    const rangeProofs = []
    const indices = []
    const bin = tx.senderData.amount.toArray(2).value.reverse()
    let blindingKeySum = bigInt[0]
		for (let i = 0; i < bin.length; i++) {
			let blindingKey;
      if (i === bin.length - 1) {
        blindingKey = tx.senderData.blindingKey.minus(blindingKeySum).mod(pt.q).plus(pt.q).mod(pt.q)
      } else {
        blindingKey = this.getRandom().mod(pt.q)
        blindingKeySum = blindingKeySum.plus(blindingKey)
      }
			const amount = (bin[i] === 1) ? (1 << i) : 0;
			const commitment = pt.g.times(blindingKey).plus(pt.h.times(amount)).affine()
			const proof = []
			let borromean;
			if (amount === 0) {
				const a = this.getRandom().mod(pt.q)
				proof.push(0)
				let prevHash = hash(pt.g.times(a).affine())
				proof.push(this.getRandom().mod(pt.q))
				const check = commitment.minus(pt.h.times(1 << i)).times(prevHash).plus(pt.g.times(proof[1])).affine()
				prevHash = hash(check)
				borromean = prevHash
				// Solving prevHash*blindingKey*G + proof*G = a*G
				proof[0] = a.minus(prevHash.times(blindingKey)).mod(pt.q).plus(pt.q).mod(pt.q)
			} else {
				const a = this.getRandom().mod(pt.q)
				proof.push(0)
				let prevHash = hash(pt.g.times(a).affine())
				borromean = prevHash
				proof.splice(0, 0, this.getRandom().mod(pt.q))
				const check = commitment.times(prevHash).plus(pt.g.times(proof[0])).affine()
				prevHash = hash(check)
				// Solving prevHash*(blindingKey*G+amount*H - amount*H) + proof*G = a*G
				proof[1] = a.minus(prevHash.times(blindingKey)).mod(pt.q).plus(pt.q).mod(pt.q)
			}
      proof.static = true
			rangeCommitments.push(commitment)
			rangeBorromeans.push(borromean)
			rangeProofs.push(proof)
			indices.push(bigInt[i])
		}
    const ret = {
				commitment: tx.commitment,
				rangeCommitments,
				rangeBorromeans,
				rangeProofs,
				indices
		}
    return ret
  }

  verifyRangeProof(rangeProof) {
    const {commitment, rangeCommitments, rangeBorromeans, rangeProofs, indices} = rangeProof;
    let sum = pt.zero
    for (let i = 0; i < rangeCommitments.length; i++) {
      const borromean = rangeBorromeans[i]
      let check = rangeCommitments[i].times(borromean).plus(pt.g.times(rangeProofs[i][0])).affine()
      let prevHash = hash(check)
      let index = indices[i]
      if (index.geq(64)) {
        return false
      }
      index = index.toJSNumber()
      if (i > 0 && indices[i - 1] >= index) {
        return false
      }
      check = rangeCommitments[i].minus(pt.h.times(1 << index)).times(prevHash).plus(pt.g.times(rangeProofs[i][1])).affine()
      prevHash = hash(check)
      if (prevHash.neq(borromean)) {
        return false
      }
      sum = sum.plus(rangeCommitments[i])
    }
    return sum.eq(commitment)
  }

  static formatItem(item) {
    if (item.length) {
      return "[" + item.map(Wallet.formatItem).join(",") + "]"
    } else if (item.x) {
      return '["' + item.x.toString() + '","' + item.y.toString() + '"]'
    } else {
      return '"' + item.toString() + '"'
    }
  }

  static formatArguments(...args) {
    return args.map(Wallet.formatItem).join(",")
  }

  formatRangeProof(rangeProof) {
    return Wallet.formatArguments(
      rangeProof.commitment,
      rangeProof.rangeCommitments,
      rangeProof.rangeBorromeans,
      rangeProof.rangeProofs,
      rangeProof.indices
    )
  }

  formatRingProof(ringProof) {
    return Wallet.formatArguments(
      ringProof.funds.map(a => a.dest),
      ringProof.funds.map(a => a.commitment),
      ringProof.keyImage,
      ringProof.commitment,
      ringProof.borromean,
      ringProof.imageFundProofs,
      ringProof.commitmentProofs,
      ringProof.outputHash
    )
  }

  constructor(mnemonic) {
    this.mnemonic = mnemonic
    this.masterSeed = hash(mnemonic)
    this.seed = hash(bigInt[0].plus(this.masterSeed))
    // Generates private keys deterministically
    this.privSeed = hash(bigInt[1].plus(this.masterSeed))
    // Generates sending keys deterministically
    this.sentSeed = hash(bigInt[2].plus(this.masterSeed))
    this.keys = []
    this.funds = []
    this.sent = []
    this.masterView = hash(this.masterSeed.plus(3)).mod(pt.q)
    this.spendPubs = {}
    this.masterKey = this.generateKey()
  }

  saveWallet() {

  }
}

module.exports = Wallet
