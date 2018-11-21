const pt = require('./ecc-point')
const bigInt = require('big-integer')
const hash = require('./hash')

/*
tx:
{
  src,
  dest,
  commitment,
  commitmentAmount,
  senderData: {
    privKey, // Secret key for signing
    pubKey, // Of receiver
    amount // Sent to receiver
  }
}
*/

class Wallet {
  getRandom() {
    return hash(this.seed)
  }

  getNewPrivateKey() {
    const spend = this.privSeed.mod(pt.q)
    this.privSeed = hash(this.privSeed)
    const view = this.privSeed.mod(pt.q)
    this.privSeed = hash(this.privSeed)
    const key = {
      spendKey: spend,
      viewKey: view,
      pubKey: getNewPublicKey()
    }
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
    tx = {}
    const rand = this.sentSeed.mod(pt.q);
    this.sentSeed = hash(this.sentSeed);
    tx.senderData = {
      privKey: rand,
      pubKey,
      amount,
    }
    tx.src = pt.g.times(rand)
    secret = hash(pubKey.viewPub.times(rand))
    tx.dest = pt.g.times(secret).add(pubKey.spendPub)
    blindingKey = hash(secret)
    tx.commitment = pt.g.times(blindingKey).plus(pt.h.times(amount))
    tx.commitmentAmount = hash(blindingKey).plus(amount).mod(pt.q)
    return tx
  }

  addTransaction(tx) {
    sent.push(tx)
  }

  decryptTransaction(tx, key) {
    pubKey = key.pubKey
    const secret = hash(tx.src.times(key.viewKey)).mod(pt.q)
    if (tx.dest.eq(pt.g.times(secret).plus(pubKey.spendPub))) {
      let privKey = null;
      if (key.spendKey) {
        privKey = secret.plus(key.spendKey).mod(pt.q)
      }
      const blindingKey = hash(secret).mod(pt.q)
      const amount = tx.commitmentAmount.minus(hash(blindingKey)).mod(pt.q).plus(pt.q).mod(pt.q)
      if (tx.commitment.neq(pt.g.times(blindingKey).plus(pt.h.times(amount)))) {
        console.error("Bad TX: ", tx, pubKey, key);
      }
      return {
        amount,
        privKey,
      };
    } else {
      return null;
    }
  }

  tryDecryptTransaction(tx) {
    for (key of this.keys) {
      const triedTX = decryptTransaction(tx, key)
      if (triedTX) {
        funds.push(triedTX)
        return triedTX;
      }
    }
    return null;
  }

  constructor(mnemonic) {
    this.mnemonic = mnemonic
    this.seed = hash(mnemonic)
    // Generates private keys deterministically
    this.privSeed = hash(hash(seed) + 1)
    // Generates sending keys deterministically
    this.sentSeed = hash(hash(seed) + 2)
    this.keys = []
    this.getPrivateKey()
    this.funds = []
    this.sent = []
  }
}

module.exports = Wallet
