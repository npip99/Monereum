const bigInt = require('big-integer')
const wallet = require('./wallet')
const hash = require('./hash')
const pt = require('./ecc-point')
const parser = require('./parser')
const constants = require('./constants')
const aes = require('aes-js')

const strToHex = s => aes.utils.hex.fromBytes(aes.utils.utf8.toBytes(s))

class TXHandler {
  constructor(wallet, web3, disputing) {
    this.wallet = wallet
    this.web3 = web3

    // block number
    this.position = 0
    this.doneSyncing = true

    // bigInt[]; Received txIds with a confirmed ringGroup
    this.funds = []

    // keyImage: string(bigInt)
    // =>
    // txId: null | bigInt; Id of the associated transaction (If decrypted)
    // ringGroupUses: bigInt[]; ringGroups that have spent the keyImage, if any (rejected ringGroups will be removed)
    this.keyImages = {}

    // txId (hash(tx.dest)): string(bigInt)
    // =>
    // tx: object
    // ringGroupHash: bigInt
    // isValid: bool; whether or not all ring proofs and range proofs are valid
    // confirmed: null | int; The blockNumber from when the associated ring group was submitted (If any)
    // spent: bool; Whether or not the tx has been spent (Associated keyImage has nonempty ringGroupUses)
    this.transactions = {}

    // ringGroupHash: string(bigInt)
    // =>
    // ringGroup: object
    // ringProofs: [object]
    // rangeProofs: [object]
    // isValid: null | bool; whether or not all ring proofs and range proofs are valid, if it has been checked
    // isRejected: bool; whether or not the ring group has been rejected
    // confirmed: null | int; The blockNumber of the ring group submission
    this.ringGroups = {}

    // ringHash: string(bigInt)
    // =>
    // ringGroupHash: bigInt
    this.ringToRingGroup = {}

    this.disputing = disputing
  }

  clone() {

  }

  addReceiveHandler(h) {
    this.receiveHandler = h
  }

  addSpendHandler(h) {
    this.spendHandler = h
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
    const ringGroupRejectedListener = createTopicFilter(constants.ringGroupRejectedTopic)
    const committedRingGroupListener = createTopicFilter(constants.committedRingGroupTopic)

    let transactionResults
    let mintTransactionResults
    let ringGroupResults
    let ringProofResults
    let rangeProofResults
    let ringGroupRejectedResults
    let committedRingGroupResults

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

    ringGroupRejectedListener.get((error, result) => {
      ringGroupRejectedResults = result
    })

    committedRingGroupListener.get((error, result) => {
      committedRingGroupResults = result
    })

    this.interval = setInterval(() => {
      if (
        !transactionResults ||
        !mintTransactionResults ||
        !ringGroupResults ||
        !ringProofResults ||
        !rangeProofResults ||
        !ringGroupRejectedResults ||
        !committedRingGroupResults
      ) {
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
      for (const ringGroupRejectedResult of ringGroupRejectedResults) {
        this.handleRingGroupRejectedResult(ringGroupRejectedResult)
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
    console.log("Transaciton Received: ", tx.id.toString(16), "(" + result.transactionHash + ")")
    txData.tx = tx
    this.wallet.tryDecryptTransaction(tx)
    if (tx.receiverData) {
      console.log("Transaction Decrypted")
      const keyImageId = hash(tx.dest.hashInP().times(tx.receiverData.privKey).affine()).toString(16)
      this.keyImages[keyImageId] = {
        txId: tx.id,
        ringGroupUses: {},
      }
    }
  }

  handleMintTransactionResult(result) {
    const txId = parser.parseMintTransaction(parser.initParser(result.data))
    console.log("Transaction Minted: ", txId.toString(16))
    const txData = this.getTx(txId)
    txData.confirmed = result.blockNumber
    txData.isValid = true
    this.tryAddToFunds(txData.tx)
  }

  handleRingGroupResult(result) {
    const ringGroup = parser.parseRingGroup(parser.initParser(result.data))
    console.log("Ring Group Received: ", ringGroup.ringGroupHash.toString(16), "(" + result.transactionHash + ")")
    console.log("Message Received: ", ringGroup.msgData)
    this.initRingGroup(ringGroup.ringGroupHash)
    const ringGroupData = this.getRingGroup(ringGroup.ringGroupHash)
    for (const outputID of ringGroup.outputIDs) {
      const txData = this.getTx(outputID)
      if (!txData) {
        console.error("Ring Group without Tx! ", ringGroup.ringGroupHash.toString(16), outputID.toString(16), result)
        return
      }
      txData.ringGroupHash = ringGroup.ringGroupHash
      if (txData.tx.receiverData) {
        ringGroupData.received = true
      }
    }
    ringGroupData.ringGroup = ringGroup
    ringGroupData.pendingResult = true
    for (const ringHash of ringGroup.ringHashes) {
      this.ringToRingGroup[ringHash.toString(16)] = ringGroup.ringGroupHash
    }
  }

  handleRingProofResult(result) {
    const ringProof = parser.parseRingProof(parser.initParser(result.data))
    const ringGroupHash = this.ringToRingGroup[ringProof.ringHash.toString(16)]
    if (!ringGroupHash) {
      console.error("Ring Group not filled yet")
      return
    }
    console.log("Ring Proof Received: ", ringProof.ringHash.toString(16), "(" + result.transactionHash + ")")
    console.log("Ring Proof is for Ring Group: ", ringGroupHash.toString(16))

    // Handle Key Image
    const keyImageId = hash(ringProof.keyImage).toString(16)
    if (!this.keyImages[keyImageId]) {
      this.keyImages[keyImageId] = {
        ringGroupUses: {}
      }
    }
    const keyImageData = this.keyImages[keyImageId]
    keyImageData.ringGroupUses[ringGroupHash.toString(16)] = true
    if (keyImageData.txId) {
      const spentFundData = this.getTx(keyImageData.txId)
      spentFundData.spent = true
    }

    const funds = []
    for (const fund of ringProof.funds) {
      const id = hash(fund)
      const txData = this.getTx(id)
      if (!txData || !txData.tx) {
        console.log(this.transactions)
        console.error("Ring Proof with unknown TX: ", result, id)
      }
      funds.push(txData.tx)
    }
    ringProof.funds = funds

    const ringGroupData = this.getRingGroup(ringGroupHash)
    ringGroupData.ringProofs.push(ringProof)
    if (ringGroupData.received || this.disputing) {
      const verificationResult = this.wallet.verifyRingProof(ringProof)
      if (!verificationResult) {
        console.log("Ring Proof Failed: ", ringProof)
      }
      ringProof.isValid = verificationResult
      ringGroupData.pendingResult = ringGroupData.pendingResult && verificationResult
    }
  }

  handleRangeProofResult(result) {
    const rangeProof = parser.parseRangeProof(parser.initParser(result.data))
    const ringGroupData = this.getRingGroup(rangeProof.ringGroupHash)
    if (!ringGroupData) {
      console.error("Range Proof without Ring Group!", rangeProof, ringGroupHash)
      return
    }
    ringGroupData.rangeProofs.push(rangeProof)
    if (ringGroupData.received || this.disputing) {
      const verificationResult = this.wallet.verifyRangeProof(rangeProof)
      if (!verificationResult) {
        console.log("Range Proof Failed: ", rangeProof)
      }
      rangeProof.isValid = verificationResult
      ringGroupData.pendingResult = ringGroupData.pendingResult && verificationResult
    }
    console.log("Range Proof Received (" + result.transactionHash + ")")
    console.log("Range Proof is for Ring Group: ", ringGroupData.ringGroup.ringGroupHash.toString(16))
    console.log("Range Proofs Remaining: ", ringGroupData.ringGroup.outputIDs.length - 1 - ringGroupData.rangeProofs.length)
    if (ringGroupData.rangeProofs.length === ringGroupData.ringGroup.outputIDs.length - 1) {
      console.log("Ring Group Complete!");
      if (ringGroupData.received || this.disputing) {
        ringGroupData.isValid = ringGroupData.pendingResult
        ringGroupData.pendingResult = undefined
        for (const outputID of ringGroupData.ringGroup.outputIDs) {
          const txData = this.getTx(outputID);
          txData.isValid = ringGroupData.isValid
          if (txData.isValid) {
            this.tryAddToFunds(txData.tx, ringGroupData.ringGroup.msgData)
          }
        }
      }
    }
  }

  handleRingGroupRejectedResult(result) {
    const {ringGroupHash} = parser.parseRingGroupRejected(parser.initParser(result.data))
    const ringGroupData = this.getRingGroup(ringGroupHash)
    console.log("Ring Group Rejected: ", ringGroupHash.toString(16))
    ringGroupData.isRejected = true
    ringGroupData.isValid = false
    for (const outputID of ringGroupData.ringGroup.outputIDs) {
      const txData = this.getTx(outputID)
      txData.isValid = false
    }
    for (const ringProof of ringGroupData.ringProofs) {
      const keyImageId = hash(ringProof.keyImage).toString(16)
      const keyImageData = this.keyImages[keyImageId]
      const ringGroupUses = keyImageData.ringGroupUses
      if (!ringGroupUses[ringGroupHash.toString(16)]) {
        console.error("Key Image was not accounted for")
      }
      delete ringGroupUses[ringGroupHash.toString(16)]
      if (JSON.stringify(ringGroupUses) === "{}") {
        if (keyImageData.txId) {
          const spentFundData = this.getTx(keyImageData.txId)
          spentFundData.spent = false
        }
      }
    }
  }

  handleCommittedRingGroupResult(result) {
    const c = parser.parseCommittedRingGroup(parser.initParser(result.data))
    console.log("Ring Group Confirmed: ", c.ringGroupHash.toString(16), " @ ", result.blockNumber)
    const ringGroupData = this.getRingGroup(c.ringGroupHash)
    if (!ringGroupData) {
      console.error("Ring Group Committed without Ring Group! ", c.ringGroupHash.toString(16))
      return
    }
    if (ringGroupData.rangeProofs.length !== ringGroupData.ringGroup.outputIDs.length - 1) {
      console.error("Ring Group is waiting on Range Proofs")
      return
    }
    if (ringGroupData.isValid != undefined && !ringGroupData.isValid) {
      console.log("Ring Group Validity Discrepancy: ", c.ringGroupHash.toString(16))
      for (const outputID of ringGroupData.ringGroup.outputIDs) {
        const txData = this.getTx(outputID);
        this.tryAddToFunds(txData.tx, ringGroupData.ringGroup.msgData)
      }
    }
    ringGroupData.confirmed = result.blockNumber
    for (const outputID of ringGroupData.ringGroup.outputIDs) {
      this.getTx(outputID).confirmed = result.blockNumber
    }
  }

  tryAddToFunds(tx, msgData) {
    if (tx.receiverData) {
      if (msgData) {
        const msgHex = this.wallet.tryDecryptMsgData(msgData, tx)
        if (typeof msgHex === "string") {
          console.log("Msg Decrypted: ", msgHex)
          tx.receiverData.msg = msgHex
        }
      }
      this.funds.push(tx.id)
      if (this.receiveHandler) {
        this.receiveHandler(tx)
      }
    }
  }

  getPublicKey() {
    const {spendPub, viewPub} = this.wallet.getKey()
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
    return TXHandler.cleanTx(this.wallet.createTransaction(this.wallet.getMasterKey(), amount, strToHex("Minted"), true))
  }

  createFullTx(pubKey, amount, minerFee, msgHex) {
    amount = bigInt(amount)
    minerFee = bigInt(minerFee)
    const collection = this.collectAmount(amount.plus(minerFee))
    if (!collection) {
      console.error("Not enough funds")
      return null
    }
    const funds = collection.funds
    const fundsAmount = collection.amount
    const tx = this.wallet.createTransaction(pubKey, amount, msgHex)
    const change = this.wallet.createTransaction(this.wallet.getMasterKey(), fundsAmount - amount - minerFee, strToHex("Spare Change"))

    const outs = Math.random() > 0.5 ? [tx, change] : [change, tx]

    // Format Msgs
    let msgLocations = ""
    let msgHeap = ""
    let msgPos = outs.length * 8
    for (const output of outs) {
      const indexSecret = hash(output.senderData.secret.minus(1))
      const msgLen = output.senderData.encryptedMsg.length / 2
      msgLocations += hash.padItem(indexSecret.xor(bigInt(msgLen).shiftLeft(32).plus(msgPos))).slice(64 - 2*8)
      msgPos += msgLen
      msgHeap += output.senderData.encryptedMsg
    }
    const msgData = msgLocations + msgHeap

    const formatMsg = [msgData]
    formatMsg.bytes = true

    const outputInfo = [
      outs.map(output => output.dest),
      outs.map(output => output.src),
      outs.map(output => output.commitment),
      outs.map(output => output.commitmentAmount).concat([minerFee]),
    ]

    const outputHash = hash(...outputInfo, formatMsg)

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
      msgData,
    }
    fullTX.toJSON = function() {
      return {
        rangeProofs: this.rangeProofs,
        ringProofs: this.ringProofs.map(ringProof => {
          ringProof.funds = ringProof.funds.map(TXHandler.cleanTx)
          return ringProof
        }),
        outputs: this.outputs.map(TXHandler.cleanTx),
        minerFee: this.minerFee,
        msgData: this.msgData,
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
