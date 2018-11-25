const bigInt = require('big-integer')
const wallet = require('./wallet')
const hash = require('./hash')
const pt = require('./ecc-point')
const parser = require('./parser')
const constants = require('./constants')

class TXHandler {
  constructor(wallet, web3) {
    this.wallet = wallet
    this.web3 = web3
    this.txs = {}
    this.pendingRingGroups = {}
    this.ringProofs = {}
    this.ringGroups = {}
    this.watched = {}
  }
  
  sync() {
    console.log(this)
    const ringProofs = this.web3.eth.filter({
        from: 0,
        toBlock: 'latest',
        address: constants.blockchain,
        topics: [constants.ringProofTopic]
    })
    
    ringProofs.watch((error, result) => {
      if (this.watched[result.transactionHash]) {
        return
      }
      this.watched[result.transactionHash] = true
      console.log(result)
      const rp = parser.parseRingProof(parser.initParser(result.data))
      const funds = []
      for (let fund of rp.funds) {
        const id = hash(fund)
        if (!this.txs[id]) {
          console.log("ringProof with unknown TX")
        }
        funds.push(this.txs[id])
      }
      rp.funds = funds
      console.log("RingProof: ", rp, this.wallet.verifyRingProof(rp))
      this.ringProofs[rp.ringHash] = rp
    })    
    
    const ringGroups = this.web3.eth.filter({
        from: 0,
        toBlock: 'latest',
        address: constants.blockchain,
        topics: [constants.ringGroupTopic]
    })
    
    ringGroups.watch((error, result) => {
      if (this.watched[result.transactionHash]) {
        return
      }
      this.watched[result.transactionHash] = true
      console.log(result)
      const ringGroup = parser.parseRingGroup(parser.initParser(result.data))
      console.log("RingGroup: ", ringGroup)
      this.ringGroups[ringGroup.ringGroupHash] = ringGroup
    })
    
    const transactions = this.web3.eth.filter({
        from: 0,
        toBlock: 'latest',
        address: constants.blockchain,
        topics: [constants.transactionTopic]
    })
    
    transactions.watch((error, result) => {
      if (this.watched[result.transactionHash]) {
        return
      }
      this.watched[result.transactionHash] = true
      const tx = parser.parseTransaction(parser.initParser(result.data))
      console.log("Transaction: ", tx.src.toString(), tx.dest.toString(), tx.commitment.toString(), tx.commitmentAmount.toString())
      this.addtx(tx)
    })
    
    const rangeProofs = this.web3.eth.filter({
        from: 0,
        toBlock: 'latest',
        address: constants.blockchain,
        topics: [constants.rangeProofTopic]
    })
    
    rangeProofs.watch((error, result) => {
      if (this.watched[result.transactionHash]) {
        return
      }
      this.watched[result.transactionHash] = true
      console.log(result)
      const rangeProof = parser.parseRangeProof(parser.initParser(result.data))
      console.log("RangeProof: ", rangeProof)
    })
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
    if (this.hastx(tx)) {
      return
    }
    if (this.wallet.tryDecryptTransaction(tx)) {
      this.wallet.addReceivedTransaction(tx)
      console.log("TX Decrypted: ", tx)
    }
    tx.id = tx.id || hash(tx.dest)
    this.txs[tx.id] = tx
  }
  
  hastx(tx) {
    return this.txs[tx.id || (tx.id = hash(tx.dest))]
  }
  
  getMixers(num) {
    const txs = []
    for (const i in this.txs) {
      txs.push(this.txs[i])
    }
    const mixers = []
    const max = txs.length
    for(let i = 0; i < num; i++) {
      mixers.push(txs[Math.floor(Math.random()*max)])
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
      const mixers = this.getMixers(constants.mixin - 1)
      let blindingKey;
      if (i === funds.length - 1) {
        blindingKey = blindingSum.mod(pt.q).plus(pt.q).mod(pt.q)
      } else {  
        blindingKey = bigInt.randBetween(0, bigInt[2].pow(256)).mod(pt.q)
        blindingSum = blindingSum.minus(blindingKey)
      }
      console.log(fund, mixers, outputHash, blindingKey)
      ringProofs.push(this.wallet.createRingProof(fund, mixers, outputHash, blindingKey))
    }
    return {
      rangeProofs: outs.map(out => this.wallet.createRangeProof(out)),
      ringProofs,
      outputs: outs,
      minerFee
    }
  }
}

module.exports = TXHandler
