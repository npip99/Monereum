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
    
    // tx
    // ringGroupHash
    this.transactions = {}
    
    // ringGroup
    // ringProofs
    // rangeProofs
    this.ringGroups = {}
    
    this.rings = {}
  }
  
  addDecryptHandler(h) {
    this.decryptHandler = h
  }
  
  sync() {
    const initTx = function(id) {
      if (!this.transactions[id]) {
        this.transactions[id] = {}
      }
      return this.transactions[id]
    }.bind(this)
    
    const initRingGroup = function(ringGroupHash) {
      if (!this.ringGroups[ringGroupHash]) {
        this.ringGroups[ringGroupHash] = {}
        this.ringGroups[ringGroupHash].ringProofs = []
        this.ringGroups[ringGroupHash].rangeProofs = []
      }
      return this.ringGroups[ringGroupHash]
    }.bind(this)
    
    const initRing = function(ringHash) {
      if (!this.rings[ringHash]) {
        this.rings[ringHash] = {}
      }
      return this.rings[ringHash]
    }.bind(this)
    
    const transactions = this.web3.eth.filter({
        from: 0,
        toBlock: 'latest',
        address: constants.blockchain,
        topics: [constants.transactionTopic]
    })
    
    const ringGroups = this.web3.eth.filter({
        from: 0,
        toBlock: 'latest',
        address: constants.blockchain,
        topics: [constants.ringGroupTopic]
    })
    
    const ringProofs = this.web3.eth.filter({
        from: 0,
        toBlock: 'latest',
        address: constants.blockchain,
        topics: [constants.ringProofTopic]
    })
    
    const rangeProofs = this.web3.eth.filter({
        from: 0,
        toBlock: 'latest',
        address: constants.blockchain,
        topics: [constants.rangeProofTopic]
    })
    
    transactions.watch((error, result) => {
      const tx = parser.parseTransaction(parser.initParser(result.data))
      const txData = initTx(tx.id)
      if (txData.tx) {
        return
      }
      console.log("Transaction Received: ", JSON.stringify(tx, null, '\t'))
      txData.tx = tx
      this.addTx(tx)
    })
    
    ringGroups.watch((error, result) => {
      const ringGroup = parser.parseRingGroup(parser.initParser(result.data))
      if (this.ringGroups[ringGroup.ringGroupHash]) {
        return
      }
      console.log("RingGroup Received: ", JSON.stringify(ringGroup, null, '\t'))
      const ringGroupData = initRingGroup(ringGroup.ringGroupHash)
      for (const outputID of ringGroup.outputIDs) {
        const txData = initTx(outputID)
        txData.ringGroupHash = ringGroup.ringGroupHash
      }
      for (const ringHash of ringGroup.ringHashes) {
        const ringData = initRing(ringHash)
        if (ringData.ringProof) {
          ringGroupData.ringProofs.push(ringData.ringProof)
        }
        ringData.ringGroupHash = ringGroup.ringGroupHash
      }
      ringGroupData.ringGroup = ringGroup
    })
    
    ringProofs.watch((error, result) => {
      const rp = parser.parseRingProof(parser.initParser(result.data))
      const ringData = initRing(rp.ringHash)
      if (ringData.ringProof) {
        return
      }
      ringData.ringProof = rp
      if (ringData.ringGroupHash) {
        this.ringGroups[ringData.ringGroupHash].ringProofs.push(rp)
      }
      const funds = []
      for (const fund of rp.funds) {
        const id = hash(fund)
        if (!this.transactions[id].tx) {
          console.error("ringProof with unknown TX", result, id)
        }
        funds.push(this.transactions[id].tx)
      }
      rp.funds = funds
      console.log("RingProof Received: ", JSON.stringify(rp, null, '\t'))
      console.log("RingProof Verified: ", this.wallet.verifyRingProof(rp))
    })
    
    rangeProofs.watch((error, result) => {
      const rp = parser.parseRangeProof(parser.initParser(result.data))
      const ringGroupData = this.ringGroups[rp.ringGroupHash]
      if (!ringGroupData) {
        console.error("Ring Proof without Ring Group!", rp, ringGroupHash)
        return
      }
      rp.rangeProofHash = hash(
        rp.ringGroupHash,
        ringGroupData.ringGroup.outputIDs,
        rp.commitment,
        rp.rangeCommitments,
        rp.rangeBorromeans,
        rp.rangeProofs,
        rp.indices
      );
      for (const otherRp of ringGroupData.rangeProofs) {
        if (otherRp.rangeProofHash.eq(rp.rangeProofHash)) {
          return
        }
      }
      ringGroupData.rangeProofs.push(rp)
      console.log("RangeProof Received: ", JSON.stringify(rp, null, '\t'))
      console.log("RangeProof Verified: ", this.wallet.verifyRangeProof(rp))
    })
  }
  
  getPublicKey() {
    const {spendPub, viewPub} = this.wallet.generateKey()
    return {
      spendPub,
      viewPub
    }
  }
  
  addTxs(txs) {
    for(const tx of txs) {
      this.addtx(tx)
    }
  }
  
  addTx(tx) {
    if (this.hasTx(tx)) {
      console.error("Transaction already added: ", tx)
      return
    }
    if (this.wallet.tryDecryptTransaction(tx)) {
      this.wallet.addReceivedTransaction(tx)
      if (this.decryptHandler) {
        this.decryptHandler(tx)
      }
      console.log("Transaction Decrypted: ", tx)
    }
    tx.id = tx.id || hash(tx.dest)
    this.txs[tx.id] = tx
  }
  
  hasTx(tx) {
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
  
  static createMint(pubKey, amount) {
    const rand = bigInt.randBetween(0, bigInt[2].pow(256)).mod(pt.q)
    
		amount = bigInt(amount)
    const tx = {}
    tx.src = pt.g.times(rand).affine()
    const secret = hash(pubKey.viewPub.times(rand).affine())
    tx.dest = pt.g.times(secret).plus(pubKey.spendPub).affine()
    tx.commitment = pt.h.times(amount).affine()
    tx.commitmentAmount = amount
    return tx;
  }
  
  createFullTx(pubKey, amount, minerFee) {
    amount = bigInt(amount)
    minerFee = bigInt(minerFee)
    const collection = this.wallet.collectAmount(amount.plus(minerFee))
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
    // Formatted FullTx: wallet.formatArguments(...outputInfo)
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
      ringProofs.push(this.wallet.createRingProof(fund, mixers, outputHash, blindingKey))
    }
    const fullTX = {
      rangeProofs: outs.map(out => this.wallet.createRangeProof(out)),
      ringProofs,
      outputs: outs,
      minerFee,
    }
    const cleanTX = tx => {
      return {
        id: tx.id,
        src: tx.src,
        dest: tx.dest,
        commitment: tx.commitment,
        commitmentAmount: tx.commitmentAmount,
      }
    }
    fullTX.toJSON = function() {
      return {
        rangeProofs: this.rangeProofs,
        ringProofs: this.ringProofs.map(rp => {
          rp.funds = rp.funds.map(cleanTX)
          return rp
        }),
        outputs: this.outputs.map(cleanTX),
        minerFee: this.minerFee,
      }
    }
    return fullTX
  }
}

module.exports = TXHandler
