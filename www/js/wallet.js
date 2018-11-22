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
    const tx = {}
    const rand = this.sentSeed.mod(pt.q);
    this.sentSeed = hash(this.sentSeed);
    tx.src = pt.g.times(rand).affine()
    const secret = hash(pubKey.viewPub.times(rand).affine())
    tx.senderData = {
      privKey: rand,
      secret: secret,
      recipient: pubKey,
      amount: amount,
    }
    tx.dest = pt.g.times(secret).plus(pubKey.spendPub).affine()
    const blindingKey = hash(secret)
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

  addSentTransaction(tx) {
    sent.push(tx)
  }

  addReceivedTransaction(tx) {
    funds.push(tx);
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

  createRingProof(tx, mixers) {
    const getRandom = this.getRandom.bind(this)
    const index = getRandom().mod(mixers.length + 1).toJSNumber()
    mixers.splice(index, 0, tx)
    const ringFunds = mixers
    console.log("ringFunds", ringFunds)
    const keyImage = tx.dest.hashInP().times(tx.receiverData.privKey)
    const commitment = pt.h.times(tx.receiverData.amount)
    const outputHash = hash(pt.g)
    const a = getRandom().mod(pt.q)
    const b = getRandom().mod(pt.q)
    let fundCheck = pt.g.times(a).affine()
    let imageCheck = tx.dest.hashInP().times(a).affine()
    let commitmentCheck = pt.g.times(b).affine()
    let prevHash = hash(fundCheck, imageCheck, commitmentCheck, outputHash)
    const imageFundProofs = Array(ringFunds.length)
    const commitmentProofs = Array(ringFunds.length)
    let borromean = prevHash
    for (let i = 1; i < ringFunds.length; i++) {
      const j = (i + index) % ringFunds.length;
      const fundDest = ringFunds[j].dest
      imageFundProofs[j] = getRandom().mod(pt.q)
      commitmentProofs[j] = getRandom().mod(pt.q)

      fundCheck = fundDest.times(prevHash).plus(pt.g.times(imageFundProofs[j])).affine()
      imageCheck = keyImage.times(prevHash).plus(fundDest.hashInP().times(imageFundProofs[j])).affine()
      commitmentCheck = pt.g.times(commitmentProofs[j]).affine()

      prevHash = hash(fundCheck, imageCheck, commitmentCheck, outputHash)
      if (j === ringFunds.length - 1) {
        borromean = prevHash
      }
    }
    imageFundProofs[index] = a.minus(prevHash.times(tx.receiverData.privKey)).mod(pt.q).plus(pt.q).mod(pt.q)
    commitmentProofs[index] = b
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

  static formatItem(item) {
    if (item.length) {
      return "[" + item.map(Wallet.formatItem).join(",") + "]"
    } else if (item.x) {
      return '[' + item.x.toString() + "," + item.y.toString() + ']'
    } else {
      return '"' + item.toString() + '"'
    }
  }

  static formatRingProof(ringProof) {
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
