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
      return tx.receiverData;
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
      return tx.receiverData;
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

  createRing(tx) {

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
