const bigInt = require('./bigint')
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
    this.doneSyncing = true

    // received tx IDs that are confirmed
    this.funds = []

    // keyImage: string(Point)
    // =>
    // bool, whether or not the keyImage was used
    this.keyImages = {}

    // destHash (ID): string(bigInt)
    // =>
    // tx: object
    // ringGroupHash: bigInt
    // isValid: bool, whether or not all ring proofs and range proofs are valid
    // confirmed: int, The blockNumber of the ring group submission
    this.transactions = {}

    // ringGroupHash: string(bigInt)
    // =>
    // ringGroup: object
    // ringProofs: [object]
    // rangeProofs: [object]
    // isValid: bool, whether or not all ring proofs and range proofs are valid
    // confirmed: int, The blockNumber of the ring group submission
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
    if (block <= this.position) {
      return
    }
    if (!this.doneSyncing) {
      throw "Not done syncing!"
    }
    // Race condition
    this.doneSyncing = false
    const createTopicFilter = (topic) => this.web3.eth.filter({
      fromBlock: this.position + 1,
      toBlock: block,
      address: constants.blockchain,
      topics: [topic],
    })

    const transactionListener = createTopicFilter(constants.transactionTopic)
    const mintTransactionListener = createTopicFilter(constants.mintTransactionTopic)
    const ringGroupListener = createTopicFilter(constants.ringGroupTopic)
    const ringProofListener = createTopicFilter(constants.ringProofTopic)
    const rangeProofListener = createTopicFilter(constants.rangeProofTopic)
    const committedRingGroupListener = createTopicFilter(constants.committedRingGroupTopic)

    let transactionResults
    let ringGroupResults
    let ringProofResults
    let rangeProofResults
    let committedRingGroupResults
    let mintTransactionResults

    transactionListener.get((error, result) => {
      transactionResults = result
    })

    mintTransactionListener.get((error, result) => {
      mintTransactionResults = result
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

    this.interval = setInterval(() => {
      if (!transactionResults || !ringGroupResults || !ringProofResults || !rangeProofResults || !committedRingGroupResults) {
        return
      }
      clearInterval(this.interval)
      for (const transactionResult of transactionResults) {
        this.handleTransactionResult(transactionResult)
      }
      for (const mintTransactionResult of mintTransactionResults) {
        this.handleMintTransactionResult(mintTransactionResult)
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
      this.doneSyncing = true
    }, 2000)

    this.position = block
  }

  getTx(id) {
    id = id.toString(16)
    return this.transactions[id]
  }

  initTx(id) {
    id = id.toString(16)
    if (!this.transactions[id]) {
      this.transactions[id] = {}
    }
  }

  initRingGroup(ringGroupHash) {
    ringGroupHash = ringGroupHash.toString(16)
    if (!this.ringGroups[ringGroupHash]) {
      this.ringGroups[ringGroupHash] = {}
      this.ringGroups[ringGroupHash].ringProofs = []
      this.ringGroups[ringGroupHash].rangeProofs = []
    }
  }

  getRingGroup(ringGroupHash) {
    ringGroupHash = ringGroupHash.toString(16)
    return this.ringGroups[ringGroupHash]
  }

  handleTransactionResult(result) {
    const tx = parser.parseTransaction(parser.initParser(result.data))
    this.initTx(tx.id)
    const txData = this.getTx(tx.id)
    if (txData.tx) {
      return
    }
    console.log("Transaciton Received: ", tx.id.toString(16), "(" + result.transactionHash + ")")
    txData.tx = tx
    this.wallet.tryDecryptTransaction(tx)
    if (tx.receiverData) {
      console.log("Transaction Decrypted")
      this.keyImages[hash(tx.dest.hashInP().times(tx.receiverData.privKey).affine()).toString(16)] = tx.id
    }
  }

  handleMintTransactionResult(result) {
    const txId = parser.parseMintTransaction(parser.initParser(result.data))
    console.log("Transaction Minted: ", txId.toString(16))
    const txData = this.getTx(txId)
    this.tryAddToFunds(txData.tx)
    txData.confirmed = result.blockNumber
    txData.isValid = true
  }

  handleRingGroupResult(result) {
    const ringGroup = parser.parseRingGroup(parser.initParser(result.data))
    if (this.getRingGroup(ringGroup.ringGroupHash)) {
      return
    }
    console.log("Ring Group Received: ", ringGroup.ringGroupHash.toString(16), "(" + result.transactionHash + ")")
    console.log("Message received: ", ringGroup.msgHex)
    // console.log("Ring Group Received: ", JSON.stringify(ringGroup, null, '\t'))
    this.initRingGroup(ringGroup.ringGroupHash)
    const ringGroupData = this.getRingGroup(ringGroup.ringGroupHash)
    for (const outputID of ringGroup.outputIDs) {
      const txData = this.getTx(outputID)
      if (!txData) {
        console.error("Ring Group without Tx! ", ringGroup.ringGroupHash.toString(16), outputID.toString(16), result)
        return
      }
      txData.ringGroupHash = ringGroup.ringGroupHash
      if (txData.receiverData) {
        ringGroup.received = true
      }
    }
    ringGroupData.ringGroup = ringGroup
    ringGroupData.pendingResult = true
    for (const ringHash of ringGroup.ringHashes) {
      this.ringToRingGroup[ringHash.toString(16)] = ringGroup.ringGroupHash
    }
  }

  handleRingProofResult(result) {
    const rp = parser.parseRingProof(parser.initParser(result.data))
    const ringGroupHash = this.ringToRingGroup[rp.ringHash.toString(16)]
    if (!ringGroupHash) {
      console.error("Ring Group not filled yet")
      return
    }
    console.log("Ring Proof Received: ", rp.ringHash.toString(16), "(" + result.transactionHash + ")")
    console.log("Ring Proof is for Ring Group: ", ringGroupHash.toString(16))
    // console.log("Ring Proof Received: ", JSON.stringify(rp, null, '\t'))
    const ringGroupData = this.getRingGroup(ringGroupHash)
    for (const ringProof of ringGroupData.ringProofs) {
      if (ringProof.ringHash.eq(rp.ringHash)) {
        return
      }
    }
    const usedKeyImageID = this.keyImages[hash(rp.keyImage).toString(16)]
    if (usedKeyImageID) {
      const spentFund = this.getTx(usedKeyImageID)
      if (spentFund.spent) {
        console.error("Double spent!", result)
      }
      spentFund.spent = true
    }
    const funds = []
    for (const fund of rp.funds) {
      const id = hash(fund)
      const txData = this.getTx(id)
      if (!txData || !txData.tx) {
        console.log(this.transactions)
        console.error("Ring Proof with unknown TX: ", result, id)
      }
      funds.push(txData.tx)
    }
    rp.funds = funds
    ringGroupData.ringProofs.push(rp)
    if (ringGroupData.received) {
      const verificationResult = this.wallet.verifyRingProof(rp)
      if (!verificationResult) {
        console.log("Ring Proof Failed: ", rp)
      }
      ringGroupData.pendingResult &= verificationResult
    }
  }

  handleRangeProofResult(result) {
    const rp = parser.parseRangeProof(parser.initParser(result.data))
    const ringGroupData = this.getRingGroup(rp.ringGroupHash)
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
    if (ringGroupData.received) {
      const verificationResult = this.wallet.verifyRangeProof(rp)
      if (!verificationResult) {
        console.log("Range Proof Failed: ", rp)
      }
      ringGroupData.pendingResult &= verificationResult
    }
    console.log("Range Proof Received (" + result.transactionHash + ")")
    console.log("Range Proof is for Ring Group: ", ringGroupData.ringGroup.ringGroupHash.toString(16))
    console.log("Range Proofs Remaining: ", ringGroupData.ringGroup.outputIDs.length - 1 - ringGroupData.rangeProofs.length)
    // console.log("Range Proof Received: ", JSON.stringify(rp, null, '\t'))
    if (ringGroupData.rangeProofs.length === ringGroupData.ringGroup.outputIDs.length - 1) {
      console.log("Ring Group Complete!");
      ringGroupData.isValid = ringGroupData.pendingResult
      ringGroupData.pendingResult = undefined
      if (ringGroupData.isValid) {
        for (const outputID of ringGroupData.ringGroup.outputIDs) {
          const txData = this.getTx(outputID);
          if (!txData || !txData.tx) {
            console.error("Ring Group (in Range Proof) without Tx!")
            return
          }
          txData.isValid = true
          this.tryAddToFunds(txData.tx)
        }
      }
    }
  }

  handleCommittedRingGroupResult(result) {
    const c = parser.parseCommittedRingGroup(parser.initParser(result.data))
    const ringGroupData = this.getRingGroup(c.ringGroupHash)
    if (!ringGroupData) {
      console.error("Ring Group Committed without Ring Group! ", c.ringGroupHash.toString(16))
      console.log(result)
      return
    }
    if (ringGroupData.rangeProofs.length !== ringGroupData.ringGroup.outputIDs.length - 1) {
      console.error("Ring Group is waiting on Range Proofs")
      return
    }
    if (!ringGroupData.isValid) {
      console.error("Ring Group Validity Discrepancy")
      return
    }
    console.log("Ring Group Confirmed: ", c.ringGroupHash.toString(16), " @ ", result.blockNumber)
    ringGroupData.confirmed = result.blockNumber
    for (const outputID of ringGroupData.ringGroup.outputIDs) {
      this.getTx(outputID).confirmed = result.blockNumber
    }
  }

  tryAddToFunds(tx) {
    if (tx.receiverData) {
      this.funds.push(tx.id)
      if (this.decryptHandler) {
        this.decryptHandler(tx)
      }
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
    const goalFunds = []
    const funds = this.funds
    for(const fundId of funds) {
      const fund = this.getTx(fundId)
      if (!fund.confirmed || fund.spent) {
        continue
      }
      goalFunds.push(fund.tx)
      amount = amount.plus(fund.tx.receiverData.amount)

      if (amount.geq(goalAmount)) {
        break
      }
    }
    if (amount.lt(goalAmount)) {
      return null
    }
    return {
      funds: goalFunds,
      amount
    }
  }

  getMixers(num) {
    const txs = []
    for (const i in this.transactions) {
      const txData = this.getTx(i)
      if (!txData.confirmed) {
        continue
      }
      txs.push(txData.tx)
    }
    const mixers = []
    const max = txs.length
    for(let i = 0; i < num; i++) {
      mixers.push(txs[Math.floor(Math.random()*max)])
    }
    return mixers
  }

  createMint(amount) {
    return TXHandler.cleanTx(this.wallet.createTransaction(this.wallet.masterKey, amount, "", true))
    /*const rand = bigInt.randBetween(0, bigInt[2].pow(256)).mod(pt.q)
    const pubKey =

		amount = bigInt(amount)
    const tx = {}
    tx.src = pt.g.times(rand).affine()
    const secret = hash(pubKey.viewPub.times(rand).affine())
    tx.dest = pt.g.times(secret).plus(pubKey.spendPub).affine()
    tx.commitment = pt.h.times(amount).affine()
    tx.commitmentAmount = amount
    return tx;*/
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
    const tx = this.wallet.createTransaction(pubKey, amount, "")
    const change = this.wallet.createTransaction(this.wallet.masterKey, fundsAmount - amount - minerFee, "")
    const outs = Math.random() > 0.5 ? [tx, change] : [change, tx]
    const outputInfo = [
      outs.map(a => a.dest),
      outs.map(a => a.src),
      outs.map(a => a.commitment),
      outs.map(a => a.commitmentAmount),
    ]
    const msg = (outs[0] == tx ? "00" : "01") + tx.encryptedMsg

    const formatMsg = [msg]
    formatMsg.bytes = true

    const outputHash = hash(...outputInfo, formatMsg)
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
      msg,
    }
    fullTX.toJSON = function() {
      return {
        rangeProofs: this.rangeProofs,
        ringProofs: this.ringProofs.map(rp => {
          rp.funds = rp.funds.map(TXHandler.cleanTx)
          return rp
        }),
        outputs: this.outputs.map(TXHandler.cleanTx),
        minerFee: this.minerFee,
        msg: msg,
      }
    }
    return fullTX
  }

  static cleanTx(tx) {
    return {
      src: tx.src,
      dest: tx.dest,
      commitment: tx.commitment,
      commitmentAmount: tx.commitmentAmount,
    }
  }
}

module.exports = TXHandler
