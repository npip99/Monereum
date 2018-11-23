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
    this.seed = hash(this.seed)
    return this.seed
  }

  addSentTransaction(tx) {
    sent.push(tx)
  }

  addReceivedTransaction(tx) {
    funds.push(tx);
  }

  generatePrivateKey() {
    const spend = this.privSeed.mod(pt.q)
    this.privSeed = hash(this.privSeed)
    const view = this.privSeed.mod(pt.q)
    this.privSeed = hash(this.privSeed)
    const key = {
      spendKey: spend,
      viewKey: view
    }
    key.pubKey = this.getPublicKey(key)
    this.keys.push(key)
    return key;
  }

  getPublicKey(privKey) {
    return {
      spendPub: pt.g.times(privKey.spendKey),
      viewPub: pt.g.times(privKey.viewKey)
    }
  }

  createTransaction(pubKey, amount) {
		amount = bigInt(amount)
    const tx = {}
    const rand = this.sentSeed.mod(pt.q);
    this.sentSeed = hash(this.sentSeed);
    tx.src = pt.g.times(rand).affine()
    const secret = hash(pubKey.viewPub.times(rand).affine())
    tx.dest = pt.g.times(secret).plus(pubKey.spendPub).affine()
    const blindingKey = hash(secret)
    tx.senderData = {
      privKey: rand,
      recipient: pubKey,
      secret,
      blindingKey,
      amount,
    }
    tx.commitment = pt.g.times(blindingKey).plus(pt.h.times(amount)).affine()
    tx.commitmentAmount = hash(blindingKey).plus(amount).mod(pt.q)
    return tx
  }

  getReceipt(tx) {
    return hash(tx.senderData.secret.plus(1));
  }

  wasCreatedBy(tx, rand) {
    return tx.src.eq(pt.g.times(rand))
  }

  decryptTransaction(tx, key) {
    if (tx.receiverData) {
      return tx;
    }
    const pubKey = key.pubKey;
    const secret = hash(tx.src.times(key.viewKey).affine());
    if (tx.dest.eq(pt.g.times(secret).plus(pubKey.spendPub))) {
      let privKey = null;
      if (key.spendKey) {
        privKey = secret.plus(key.spendKey).mod(pt.q)
      }
      const blindingKey = hash(secret)
      const amount = tx.commitmentAmount.minus(hash(blindingKey)).mod(pt.q).plus(pt.q).mod(pt.q)
      if (tx.commitment.neq(pt.g.times(blindingKey).plus(pt.h.times(amount)))) {
        console.error("Bad TX: ", tx, pubKey, key);
        return null;
      }
      tx.receiverData = {
        amount,
        secret,
        blindingKey,
        privKey,
      };
      return tx;
    } else {
      return null;
    }
  }

  isValidReceipt(tx, receipt) {
    if (!tx.receiverData) {
      return null;
    }
    return hash(tx.receiverData.secret.plus(1)).eq(receipt);
  }

  tryDecryptTransaction(tx) {
    for (key of this.keys) {
      const triedTX = decryptTransaction(tx, key)
      if (triedTX) {
        return triedTX;
      }
    }
    return null;
  }

  createRingProof(from, mixers, to) {
    if (from.receiverData.amount.neq(to.senderData.amount)) {
      throw "from and to amounts don't line up"
    }
    const getRandom = this.getRandom.bind(this)
    const index = getRandom().mod(mixers.length + 1).toJSNumber()
    mixers.splice(index, 0, from)
    const ringFunds = mixers
    const keyImage = from.dest.hashInP().times(from.receiverData.privKey).affine()
    const commitment = pt.g.times(to.senderData.blindingKey).plus(pt.h.times(to.senderData.amount)).affine()
    const outputHash = hash(pt.g)
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
    commitmentProofs[index] = b.minus(prevHash.times(to.senderData.blindingKey.minus(from.receiverData.blindingKey))).mod(pt.q).plus(pt.q).mod(pt.q)
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
        console.log("NZ: ", i, check.toString(), prevHash.toString())
				borromean = prevHash
				// Solving prevHash*blindingKey*G + proof*G = a*G
				proof[0] = a.minus(prevHash.times(blindingKey)).mod(pt.q).plus(pt.q).mod(pt.q)
			} else {
				const a = this.getRandom().mod(pt.q)
				proof.push(0)
				let prevHash = hash(pt.g.times(a).affine())
        console.log("NZ: ", i, pt.g.times(a).affine().toString(), prevHash.toString())
				borromean = prevHash
				proof.splice(0, 0, this.getRandom().mod(pt.q))
				const check = commitment.times(prevHash).plus(pt.g.times(proof[0])).affine()
				prevHash = hash(check)
				// Solving prevHash*(blindingKey*G+amount*H - amount*H) + proof*G = a*G
				proof[1] = a.minus(prevHash.times(blindingKey)).mod(pt.q).plus(pt.q).mod(pt.q)
			}
			rangeCommitments.push(commitment)
			rangeBorromeans.push(borromean)
			rangeProofs.push(proof)
			indices.push(i)
		}
    return {
				commitment: tx.commitment,
				rangeCommitments,
				rangeBorromeans,
				rangeProofs,
				indices
		}
  }
  
  verifyRangeProof(rangeProof) {
    const {commitment, rangeCommitments, rangeBorromeans, rangeProofs, indices} = rangeProof;
    let sum = pt.zero
    for (let i = 0; i < rangeCommitments.length; i++) {
      const borromean = rangeBorromeans[i]
      let check = rangeCommitments[i].times(borromean).plus(pt.g.times(rangeProofs[i][0])).affine()
      let prevHash = hash(check)
      let index = indices[i]
      if (index >= 64) {
        return false
      }
      if (i > 0 && indices[i - 1] >= index) {
        return false
      }
      check = rangeCommitments[i].minus(pt.h.times(1 << index)).times(prevHash).plus(pt.g.times(rangeProofs[i][1])).affine()
      prevHash = hash(check)
      console.log("NZ: ", check.toString(), prevHash.toString())
      if (prevHash.neq(borromean)) {
        return false
      }
      sum = sum.plus(rangeCommitments[i])
    }
    return sum.eq(commitment)
  }
  
  formatRangeProof(rangeProof) {
    return [
      rangeProof.commitment,
      rangeProof.rangeCommitments,
      rangeProof.rangeBorromeans,
      rangeProof.rangeProofs,
      rangeProof.indices
    ].map(Wallet.formatItem).join(",")
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

  formatRingProof(ringProof) {
    return [
      ringProof.funds.map(a => a.dest),
      ringProof.funds.map(a => a.commitment),
      ringProof.keyImage,
      ringProof.commitment,
      ringProof.borromean,
      ringProof.imageFundProofs,
      ringProof.commitmentProofs,
      ringProof.outputHash
    ].map(Wallet.formatItem).join(",")
  }

  constructor(mnemonic) {
    this.mnemonic = mnemonic
    this.seed = hash(mnemonic)
    // Generates private keys deterministically
    this.privSeed = hash(this.seed.plus(1))
    // Generates sending keys deterministically
    this.sentSeed = hash(this.seed.plus(2))
    this.keys = []
    this.funds = []
    this.sent = []
  }
}

module.exports = Wallet
