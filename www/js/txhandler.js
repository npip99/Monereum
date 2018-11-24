const bigInt = require('big-integer')
const wallet = require('./wallet')
const hash = require('./hash')
const pt = require('./ecc-point')

class TXHandler {
  constructor(wallet) {
    this.wallet = wallet
    this.blockchain = []
  }
  
  getPublicKey() {
    const {spendPub, viewPub} = this.wallet.generateKey()
    return {
      spendPub,
      viewPub
    }
  }
  
  addtxs(txs) {
    for(const tx of txs) {
      this.addtx(tx)
    }
  }
  
  addtx(tx) {
    this.blockchain.push(tx)
    if (this.wallet.tryDecryptTransaction(tx)) {
      this.wallet.addReceivedTransaction(tx)
      console.log("TX decrypted: ", tx)
    }
  }
  
  getMixers(num) {
    const mixers = []
    const max = this.blockchain.length
    for(let i = 0; i < num; i++) {
      mixers.push(this.blockchain[Math.floor(Math.random()*max)])
    }
    return mixers
  }
  
  sendMoney(pubKey, amount) {
    const minerFee = 3
    const collection = this.wallet.collectAmount(amount + minerFee)
    if (!collection) {
      return null
    }
    const funds = collection.funds
    const fundsAmount = collection.amount
    const tx = this.wallet.createTransaction(pubKey, amount)
    const change = this.wallet.createTransaction(this.wallet.changeKey, fundsAmount - amount - minerFee)
    const outs = Math.random() > 0.5 ? [tx, change] : [change, tx]
    const outputInfo = [
      outs.map(a => a.dest),
      outs.map(a => a.src),
      outs.map(a => a.commitment),
      outs.map(a => a.commitmentAmount),
      minerFee
    ]
    const outputHash = hash(...outputInfo)
    console.log("Formatted outputs: ", wallet.formatArguments(...outputInfo))
    let blindingSum = outs.reduce((a, b) => a.plus(b.senderData.blindingKey), bigInt[0])
    const ringProofs = []
    for (const [i, fund] of funds.entries()) {
      const mixers = this.getMixers(2)
      let blindingKey;
      if (i === funds.length - 1) {
        blindingKey = blindingSum.mod(pt.q).plus(pt.q).mod(pt.q)
      } else {  
        blindingKey = bigInt.randBetween(0, bigInt[2].pow(256)).mod(pt.q)
        blindingSum = blindingSum.minus(blindingKey)
      }
      ringProofs.push(this.wallet.createRingProof(fund, mixers, outputHash, blindingKey))
    }
    return {
      rangeProofs: outs.map(out => this.wallet.createRangeProof(out)),
      ringProofs,
      outputs: outs,
      /*funds: ringProofs.map(a => a.funds),
      keyImages: ringProofs.map(a => a.keyImage),
      commitment: ringProofs.map(a => a.commitment),
      borromean: ringProofs.map(a => a.borromean),
      imageFundProofs: ringProofs.map(a => a.imageFundProofs),
      commitmentProofs: ringProofs.map(a => a.commitmentProofs),
      outputDests: outs.map(a => a.dest),
      outputSrcs: outs.map(a => a.src),
      outputCommitments: outs.map(a => a.commitment),
      commitmentAmounts: outs.map(a => a.commitmentAmount),*/
      minerFee
    }
  }
}

module.exports = TXHandler
