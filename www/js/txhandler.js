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
    
    // block number
    this.position = 0
    
    // .tx's that are confirmed with block <= this.position
    this.funds = []
    
    // objectID: string(bigInt)
    // =>
    // tx: object
    // ringGroupHash: bigInt
    this.transactions = {}
    
    // ringGroupHash: string(bigInt)
    // =>
    // ringGroup: object
    // ringProofs: [object]
    // rangeProofs: [object]
    this.ringGroups = {}
    
    // ringHash: string(bigInt)
    // =>
    // ringGroupHash: bigInt
    this.ringToRingGroup = {}
  }
  
  clone() {
    
  }
  
  addDecryptHandler(h) {
    this.decryptHandler = h
  }
  
  sync(block) {
    const createTopicFilter = (topic) => this.web3.eth.filter({
      fromBlock: this.position + 1,
      toBlock: block,
      address: constants.blockchain,
      topics: [topic],
    })
    
    const transactionListener = createTopicFilter(constants.transactionTopic)    
    const ringGroupListener = createTopicFilter(constants.ringGroupTopic)    
    const ringProofListener = createTopicFilter(constants.ringProofTopic)    
    const rangeProofListener = createTopicFilter(constants.rangeProofTopic)
    const committedRingGroupListener = createTopicFilter(constants.committedRingGroupTopic)
    
    let transactionResults
    let ringGroupResults
    let ringProofResults
    let rangeProofResults
    let committedRingGroupResults
    
    transactionListener.get((error, result) => {
      transactionResults = result
    })
    
    ringGroupListener.get((error, result) => {
      ringGroupResults = result
    })
    
    ringProofListener.get((error, result) => {
      ringProofResults = result
    })
    
    rangeProofListener.get((error, result) => {
      rangeProofResults = result
    })
    
    committedRingGroupListener.get((error, result) => {
      committedRingGroupResults = result
    })
    
    setTimeout(() => {
      for (const transactionResult of transactionResults) {
        this.handleTransactionResult(transactionResult)
      }
      for (const ringGroupResult of ringGroupResults) {
        this.handleRingGroupResult(ringGroupResult)
      }
      for (const ringProofResult of ringProofResults) {
        this.handleRingProofResult(ringProofResult)
      }
      for (const rangeProofResult of rangeProofResults) {
        this.handleRangeProofResult(rangeProofResult)
      }
      for (const committedRingGroupResult of committedRingGroupResults) {
        this.handleCommittedRingGroupResult(committedRingGroupResult)
      }
    }, 1000)
    
    this.position = block
  }
  
  initTx(id) {
    if (!this.transactions[id]) {
      this.transactions[id] = {}
    }
    return this.transactions[id]
  }
  
  initRingGroup(ringGroupHash) {
    if (!this.ringGroups[ringGroupHash]) {
      this.ringGroups[ringGroupHash] = {}
      this.ringGroups[ringGroupHash].ringProofs = []
      this.ringGroups[ringGroupHash].rangeProofs = []
    }
    return this.ringGroups[ringGroupHash]
  }
  
  handleTransactionResult(result) {
    const tx = parser.parseTransaction(parser.initParser(result.data))
    const txData = this.initTx(tx.id)
    if (txData.tx) {
      return
    }
    console.log("Transaciton Received: ", result.transactionHash, tx.id.toString())
    // console.log("Transaction Received: ", JSON.stringify(tx, null, '\t'))
    txData.tx = tx
    this.wallet.tryDecryptTransaction(tx)
    if (this.minting) {
      tx.confirmed = result.blockNumber
      if (tx.receiverData) {
        this.funds.push(tx.id)
        if (this.decryptHandler) {
          this.decryptHandler(tx)
        }
        console.log("Transaction Decrypted: ", tx)
      }
    }
  }
  
  handleRingGroupResult(result) {
    const ringGroup = parser.parseRingGroup(parser.initParser(result.data))
    if (this.ringGroups[ringGroup.ringGroupHash]) {
      return
    }
    console.log("Ring Group Received: ", result.transactionHash)
    // console.log("Ring Group Received: ", JSON.stringify(ringGroup, null, '\t'))
    const ringGroupData = this.initRingGroup(ringGroup.ringGroupHash)
    for (const outputID of ringGroup.outputIDs) {
      const txData = this.transactions[outputID]
      if (!txData) {
        console.error("Ring Group without Tx! ", ringGroup.ringGroupHash.toString(), outputID.toString(), result)
        return
      }
      txData.ringGroupHash = ringGroup.ringGroupHash
    }
    ringGroupData.ringGroup = ringGroup
    ringGroupData.pendingResult = true
    for (const ringHash of ringGroup.ringHashes) {
      this.ringToRingGroup[ringHash] = ringGroup.ringGroupHash
    }
  }
  
  handleRingProofResult(result) {
    const rp = parser.parseRingProof(parser.initParser(result.data))
    const ringGroupHash = this.ringToRingGroup[rp.ringHash]
    if (!ringGroupHash) {
      console.error("Ring Group not filled yet")
      return
    }
    console.log("Ring Proof Received: ", result.transactionHash)
    // console.log("Ring Proof Received: ", JSON.stringify(rp, null, '\t'))
    const ringGroupData = this.ringGroups[ringGroupHash]
    for (const ringProof of ringGroupData.ringProofs) {
      if (ringProof.ringHash.eq(rp.ringHash)) {
        return
      }
    }
    const funds = []
    for (const fund of rp.funds) {
      const id = hash(fund)
      if (!this.transactions[id].tx) {
        console.error("Ring Proof with unknown TX: ", result, id)
      }
      funds.push(this.transactions[id].tx)
    }
    rp.funds = funds
    ringGroupData.ringProofs.push(rp)
    const verificationResult = this.wallet.verifyRingProof(rp)
    if (!verificationResult) {
      console.log("Ring Proof Failed: ", rp)
    }
    ringGroupData.pendingResult &= verificationResult
  }
  
  handleRangeProofResult(result) {
    const rp = parser.parseRangeProof(parser.initParser(result.data))
    const ringGroupData = this.ringGroups[rp.ringGroupHash]
    if (!ringGroupData) {
      console.error("Range Proof without Ring Group!", rp, ringGroupHash)
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
    const verificationResult = this.wallet.verifyRangeProof(rp)
    if (!verificationResult) {
      console.log("Range Proof Failed: ", rp)
    }
    ringGroupData.pendingResult &= verificationResult
    console.log("Range Proof Received: ", result.transactionHash)
    // console.log("Range Proof Received: ", JSON.stringify(rp, null, '\t'))
    if (ringGroupData.rangeProofs.length === ringGroupData.ringGroup.outputIDs.length - 1) {
      console.log("Ring Group complete: ", ringGroupData.ringGroup.ringGroupHash.toString());
      ringGroupData.isValid = ringGroupData.pendingResult
      ringGroupData.pendingResult = undefined
      if (ringGroupData.isValid) {
        for (const outputID of ringGroupData.ringGroup.outputIDs) {
          const txData = this.transactions[outputID];
          if (!txData || !txData.tx) {
            console.error("Ring Group (in Range Proof) without Tx!")
            return
          }
          txData.isValid = true
          const tx = txData.tx
          if (this.wallet.tryDecryptTransaction(tx)) {
            this.funds.push(tx.id)
            if (this.decryptHandler) {
              this.decryptHandler(tx)
            }
            console.log("Transaction Decrypted: ", tx)
          }
        }
      }
    }
  }
  
  handleCommittedRingGroupResult(result) {
    const c = parser.parseCommittedRingGroup(parser.initParser(result.data))
    const ringGroupData = this.ringGroups[c.ringGroupHash]
    if (!ringGroupData) {
      console.error("Ring Group Committed without Ring Group! ", c.ringGroupHash.toString())
      console.log(result)
      return
    }
    if (ringGroupData.pendingResult !== undefined) {
      console.error("Ring Group is waiting on Range Proofs")
      return
    }
    if (!ringGroupData.isValid) {  
      console.error("Ring Group Validity Discrepancy")
      return
    }
    console.log("Ring Group Confirmed: ", c.ringGroupHash.toString(), " @ ", result.blockNumber)
    ringGroupData.confirmed = result.blockNumber
    for (const outputID of ringGroupData.ringGroup.outputIDs) {
      this.transactions[outputID].confirmed = result.blockNumber
    }
  }
  
  getPublicKey() {
    const {spendPub, viewPub} = this.wallet.generateKey()
    return {
      spendPub,
      viewPub
    }
  }
  
  collectAmount(goalAmount) {
    let amount = bigInt[0]
    const funds = []
    for(const fundId of this.funds) {
      const fund = this.transactions[fundId]
      if (!fund.confirmed) {
        continue
      }
      funds.push(fund)
      amount = amount.plus(fund.receiverData.amount)
      
      if (amount.geq(goalAmount)) {
        break
      }
    }
    if (amount.lt(goalAmount)) {
      return null
    }
    return {
      funds,
      amount
    }
  }
  
  getMixers(num) {
    const txs = []
    for (const i in this.transactions) {
      txs.push(this.transactions[i].tx)
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
    const collection = this.collectAmount(amount.plus(minerFee))
    if (!collection) {
      console.error("Not enough funds")
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
