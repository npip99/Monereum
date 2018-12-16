const abi = require('./abi')
const constants = require('./constants')
const TXHandler = require('./txhandler')
const Parser = require('./parser')
const bigInt = require('big-integer')

const hash = abi.hash

class Disputer {
  constructor(wallet, web3, goodAddresses) {
    this.wallet = wallet
    this.web3 = web3
    this.handler = new TXHandler(wallet, web3, true)
    this.doneSyncing = true
    this.goodAddresses = goodAddresses

    this.ringGroupDisputed = {}
    this.ringGroupDisputeResolved = {}

    this.submittedLateRingGroup = {}
    this.disputedLateRangeProof = {}
    this.disputedRingProof = {}
    this.disputedRangeProof = {}
    this.resolvedRingProof = {}
    this.resolvedRangeProof = {}
  }

  getBlockNumber() {
    return this.handler.position
  }

  sync(block, callback) {
    if (!this.doneSyncing) {
      throw "Not done syncing!"
    }
    // Race condition on doneSyncing here
    this.doneSyncing = false

    if (block <= this.getBlockNumber()) {
      this.doneSyncing = true
      if (callback) {
        setTimeout(callback, 0);
      }
      return
    }

    const fromBlock = this.handler.position + 1

    const createTopicFilter = (topic) => this.web3.eth.filter({
      fromBlock: fromBlock,
      toBlock: block,
      address: constants.blockchain,
      topics: [topic],
    })

    const ringGroupDisputedListener = createTopicFilter(constants.ringGroupDisputedTopic)
    const ringGroupDisputeResolvedListener = createTopicFilter(constants.ringGroupDisputeResolvedTopic)

    let ringGroupDisputedResults
    let ringGroupDisputeResolvedResults

    ringGroupDisputedListener.get((error, result) => {
      ringGroupDisputedResults = result
    })

    ringGroupDisputeResolvedListener.get((error, result) => {
      ringGroupDisputeResolvedResults = result
    })

    this.handler.sync(block, () => {
      const tryHandleInterval = setInterval(() => {
        if (!ringGroupDisputeResolvedResults || !ringGroupDisputedResults) {
          return
        }
        clearInterval(tryHandleInterval)
        for (const ringGroupDisputedResult of ringGroupDisputedResults) {
          this.handleRingGroupDisputedResult(ringGroupDisputedResult)
        }
        for (const ringGroupDisputeResolvedResult of ringGroupDisputeResolvedResults) {
          this.handleRingGroupDisputeResolvedResult(ringGroupDisputeResolvedResult)
        }

        this.doneSyncing = true
        if (callback) {
          callback()
        }
      }, 75)
    })
  }

  handleRingGroupDisputedResult(result) {
    const parser = Parser.initParser(result.data)
    const ringGroupHash = Parser.parseNum(parser)
    const topicHash = Parser.parseNum(parser)

    const ringGroupHashHex = ringGroupHash.toString(16)
    const topicHashHex = topicHash.toString(16)

    console.log("Ring Group Disputed: ", ringGroupHashHex, " | ", topicHashHex, "(" + result.transactionHash + ")")

    if (!this.ringGroupDisputed[ringGroupHashHex]) {
      this.ringGroupDisputed[ringGroupHashHex] = {}
    }
    this.ringGroupDisputed[ringGroupHashHex][topicHashHex] = {
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber,
    }
  }

  handleRingGroupDisputeResolvedResult(result) {
    const parser = Parser.initParser(result.data)
    const ringGroupHash = Parser.parseNum(parser)
    const topicHash = Parser.parseNum(parser)

    const ringGroupHashHex = ringGroupHash.toString(16)
    const topicHashHex = topicHash.toString(16)

    console.log("Ring Group Dispute Resolved: ", ringGroupHashHex, " | ", topicHashHex, "(" + result.transactionHash + ")")

    if (!this.ringGroupDisputeResolved[ringGroupHashHex]) {
      this.ringGroupDisputeResolved[ringGroupHashHex] = {}
    }
    this.ringGroupDisputeResolved[ringGroupHashHex][topicHashHex] = true
  }

  tryDispute() {
    if (!this.doneSyncing) {
      throw "Handler not done syncing"
    }
    for (const ringGroupHashHex in this.handler.ringGroups) {
      const ringGroupData = this.handler.ringGroups[ringGroupHashHex]
      if (ringGroupData.isRejected || ringGroupData.confirmed) {
        continue
      }
      if (this.ringGroupDisputed[ringGroupHashHex]) {
        let isDisputed = false
        for (const topicHashHex in this.ringGroupDisputed[ringGroupHashHex]) {
          if (this.ringGroupDisputeResolved[ringGroupHashHex] && this.ringGroupDisputeResolved[ringGroupHashHex][topicHashHex]) {
            continue
          }
          isDisputed = true
          if (
            (
              this.disputedRingProof[ringGroupHashHex]
              && this.ringGroupDisputed[ringGroupHashHex][topicHashHex].transactionHash == this.disputedRingProof[ringGroupHashHex][topicHashHex]
            ) || (
              this.disputedRangeProof[ringGroupHashHex]
              && this.ringGroupDisputed[ringGroupHashHex][topicHashHex].transactionHash == this.disputedRangeProof[ringGroupHashHex][topicHashHex]
            ) || (
              this.getBlockNumber() > this.ringGroupDisputed[ringGroupHashHex][topicHashHex].blockNumber + 2 * constants.disputeTime
            )
          ) {
            const ringGroupHash = bigInt(ringGroupHashHex, 16)
            const topicHash = bigInt(topicHashHex, 16)

            const isRangeProof = this.resolveRangeProof(ringGroupHash, topicHash)
            if (!isRangeProof) {
              this.resolveRingProof(ringGroupHash, topicHash)
            }

            break
          }
        }
        if (isDisputed) {
          continue
        }
      }
      if (
        ringGroupData.rangeProofs.length < ringGroupData.ringGroup.outputIDs.length - 1
        && this.handler.position >= ringGroupData.timerBlock + 2 * constants.disputeTime
      ) {
        this.disputeLateRangeProof(ringGroupData)
        continue
      }
      if (
        this.handler.position >= ringGroupData.timerBlock + 2 * constants.disputeTime
      ) {
        this.submitLateRingGroup(ringGroupData)
        continue
      }
      if (ringGroupData.isValid != null && !ringGroupData.isValid) {
        let disputableRingProof
        for (const ringProof of ringGroupData.ringProofs) {
          if (!ringProof.isValid) {
            disputableRingProof = ringProof
            break
          }
        }
        if (disputableRingProof) {
          this.disputeRingProof(ringGroupData, disputableRingProof)
          continue
        }
        let disputableRangeProof
        for (const rangeProof of ringGroupData.rangeProofs) {
          if (!rangeProof.isValid) {
            disputableRangeProof = rangeProof
            break
          }
        }
        if (disputableRangeProof) {
          this.disputeRangeProof(ringGroupData, disputableRangeProof)
        }
      }
    }
  }

  submitLateRingGroup(ringGroupData) {
    const ringGroupHashHex = ringGroupData.ringGroup.ringGroupHash.toString(16)
    if (this.submittedLateRingGroup[ringGroupHashHex]) {
      return
    }
    this.submittedLateRingGroup[ringGroupHashHex] = true
    console.log("Late Ring Group Found: " + ringGroupHashHex)
    const outputIDs = ringGroupData.ringGroup.outputIDs
    const ringHashes = ringGroupData.ringGroup.ringHashes
    const rangeHashes = ringGroupData.ringGroup.rangeHashes
    const funcHash = constants.commitRingGroupFuncHash
    const data = funcHash.slice(0, 4*2) + abi.format(outputIDs, ringHashes, rangeHashes)
    this.web3.eth.sendTransaction({
      to: constants.blockchain,
      data: data,
      gasPrice: 5e9,
    }, (error, transactionHash) => {
      if (error) {
        console.error("Ring Group Commit Failed: ", error)
      } else {
        console.log("Ring Group Commit Sent: ", transactionHash)
      }
    })
  }

  disputeLateRangeProof(ringGroupData) {
    const ringGroupHashHex = ringGroupData.ringGroup.ringGroupHash.toString(16)
    if (this.disputedLateRangeProof[ringGroupHashHex]) {
      return
    }
    this.disputedLateRangeProof[ringGroupHashHex] = true
    console.log("Late Ring Proof Found: " + ringGroupHashHex)
    const outputIDs = ringGroupData.ringGroup.outputIDs
    const ringHashes = ringGroupData.ringGroup.ringHashes
    const rangeHashes = ringGroupData.ringGroup.rangeHashes
    const keyImageHashes = ringGroupData.ringProofs.map(rp => hash(rp.keyImage))
    const funcHash = constants.disputeLateRangeProofFuncHash
    const data = func.slice(0, 4*2) + abi.format(outputIDs, ringHashes, rangeHashes, keyImageHashes)
    this.web3.eth.sendTransaction({
        to: constants.blockchain,
        data: data,
        gasPrice: 5e9,
    }, (error, transactionHash) => {
      if (error) {
        console.error("Late Range Proof Dispute Failed: ", error)
      } else {
        console.log("Late Range Proof Dispute Sent: ", transactionHash)
      }
    })
  }

  disputeRingProof(ringGroupData, ringProof) {
    const ringGroupHashHex = ringGroupData.ringGroup.ringGroupHash.toString(16)

    let ringHash
    for (const [i, rp] of ringGroupData.ringProofs.entries()) {
      if (rp == ringProof) {
        ringHash = ringGroupData.ringGroup.ringHashes[i]
        break
      }
    }
    const ringHashHex = ringHash.toString(16)
    if (
      this.ringGroupDisputed[ringGroupHashHex]
      && this.ringGroupDisputed[ringGroupHashHex][ringHashHex]
    ) {
      return
    }
    if (!this.disputedRingProof[ringGroupHashHex]) {
      this.disputedRingProof[ringGroupHashHex] = {}
    }
    if (this.disputedRingProof[ringGroupHashHex][ringHashHex]) {
      return
    }
    this.disputedRingProof[ringGroupHashHex][ringHashHex] = true

    const outputIDs = ringGroupData.ringGroup.outputIDs
    const ringHashes = ringGroupData.ringGroup.ringHashes
    const rangeHashes = ringGroupData.ringGroup.rangeHashes

    const funcHash = constants.disputeTopicFuncHash
    const data = funcHash.slice(0, 4*2) + abi.format(
      outputIDs,
      ringHashes,
      rangeHashes,
      ringHash
    )
    this.web3.eth.sendTransaction({
        to: constants.blockchain,
        data: data,
        gasPrice: 5e9,
    }, (error, transactionHash) => {
      if (error) {
        console.error("Range Proof Dispute Failed: ", error)
      } else {
        console.log("Range Proof Dispute Sent: ", transactionHash)
        this.disputedRingProof[ringGroupHashHex][ringHashHex] = transactionHash
      }
    })
  }

  disputeRangeProof(ringGroupData, rangeProof) {
    const ringGroupHashHex = ringGroupData.ringGroup.ringGroupHash.toString(16)
    const rangeHash = hash(
      rangeProof.commitment,
      rangeProof.rangeCommitments,
      rangeProof.rangeBorromeans,
      rangeProof.rangeProofs,
      rangeProof.indices,
    )
    const rangeHashHex = rangeHash.toString(16)
    if (
      this.ringGroupDisputed[ringGroupHashHex]
      && this.ringGroupDisputed[ringGroupHashHex][rangeHashHex]
    ) {
      return
    }
    if (!this.disputedRangeProof[ringGroupHashHex]) {
      this.disputedRangeProof[ringGroupHashHex] = {}
    }
    if (this.disputedRangeProof[ringGroupHashHex][rangeHashHex]) {
      return
    }
    this.disputedRangeProof[ringGroupHashHex][rangeHashHex] = true

    const outputIDs = ringGroupData.ringGroup.outputIDs
    const ringHashes = ringGroupData.ringGroup.ringHashes
    const rangeHashes = ringGroupData.ringGroup.rangeHashes

    const funcHash = constants.disputeTopicFuncHash
    const data = funcHash.slice(0, 4*2) + abi.format(
      outputIDs,
      ringHashes,
      rangeHashes,
      rangeHash
    )
    this.web3.eth.sendTransaction({
        to: constants.blockchain,
        data: data,
        gasPrice: 5e9,
    }, (error, transactionHash) => {
      if (error) {
        console.error("Range Proof Dispute Failed: ", error)
      } else {
        console.log("Range Proof Dispute Sent: ", transactionHash)
        this.disputedRangeProof[ringGroupHashHex][rangeHashHex] = transactionHash
      }
    })
  }

  resolveRingProof(ringGroupHash, ringHash) {
    const ringGroupData = this.handler.ringGroups[ringGroupHash.toString(16)]
    if (!ringGroupData) {
      throw "No ring group found"
    }

    let ringProof
    for (const [i, rp] of ringGroupData.ringProofs.entries()) {
      if (ringHash.eq(ringGroupData.ringGroup.ringHashes[i])) {
        ringProof = rp
        break
      }
    }
    if (!ringProof) {
      return false
    }

    const ringGroupHashHex = ringGroupHash.toString(16)
    const ringHashHex = ringHash.toString(16)
    if (!this.resolvedRingProof[ringGroupHashHex]) {
      this.resolvedRingProof[ringGroupHashHex] = {}
    }
    if (this.resolvedRingProof[ringGroupHashHex][ringHashHex]) {
      return true
    }
    this.resolvedRingProof[ringGroupHashHex][ringHashHex] = true

    console.log("Ring Group Resolvable Dispute Found: " + ringGroupHashHex + " | " + rangeHashHex)

    const outputIDs = ringGroupData.ringGroup.outputIDs
    const ringHashes = ringGroupData.ringGroup.ringHashes
    const rangeHashes = ringGroupData.ringGroup.rangeHashes
    const keyImageHashes = ringGroupData.ringProofs.map(rp => hash(rp.keyImage))
    keyImageHashes.sort((a, b) => a.lt(b) ? -1 : 1)
    const funcHash = constants.resolveAndClaimRingProofBountyFuncHash
    const data = funcHash.slice(0, 4*2) + abi.format(
      ringGroupHash,
      Object.assign(ringProof.funds.map(fund => fund.dest), {'static': true}),
      Object.assign(ringProof.funds.map(fund => fund.commitment), {'static': true}),
      ringProof.keyImage,
      ringProof.commitment,
      ringProof.borromean,
      ringProof.imageFundProofs,
      ringProof.commitmentProofs,
      ringProof.outputHash,
      outputIDs,
      ringHashes,
      rangeHashes,
      keyImageHashes,
      ringHash
    )
    this.web3.eth.sendTransaction({
        to: constants.disputeHelper,
        data: data,
        gasPrice: 5e9,
    }, (error, transactionHash) => {
      if (error) {
        console.error("Ring Proof Dispute Resolution Failed: ", error)
      } else {
        console.log("Ring Proof Dispute Resolution Sent: ", transactionHash)
      }
    })
    return true
  }

  resolveRangeProof(ringGroupHash, rangeHash) {
    const ringGroupData = this.handler.ringGroups[ringGroupHash.toString(16)]
    if (!ringGroupData) {
      throw "No ring group found"
    }

    let rangeProof
    for (const [i, rp] of ringGroupData.rangeProofs.entries()) {
      const possibleRangeHash = hash(
        rp.commitment,
        rp.rangeCommitments,
        rp.rangeBorromeans,
        rp.rangeProofs,
        rp.indices
      )
      if (rangeHash.eq(possibleRangeHash)) {
        rangeProof = rp
        break
      }
    }
    if (!rangeProof) {
      return false
    }

    const ringGroupHashHex = ringGroupHash.toString(16)
    const rangeHashHex = rangeHash.toString(16)
    if (!this.resolvedRangeProof[ringGroupHashHex]) {
      this.resolvedRangeProof[ringGroupHashHex] = {}
    }
    if (this.resolvedRangeProof[ringGroupHashHex][rangeHashHex]) {
      return true
    }
    this.resolvedRangeProof[ringGroupHashHex][rangeHashHex] = true

    console.log("Ring Group Resolvable Dispute Found: " + ringGroupHashHex + " | " + rangeHashHex)

    const outputIDs = ringGroupData.ringGroup.outputIDs
    const ringHashes = ringGroupData.ringGroup.ringHashes
    const rangeHashes = ringGroupData.ringGroup.rangeHashes
    const keyImageHashes = ringGroupData.ringProofs.map(rp => hash(rp.keyImage))
    keyImageHashes.sort((a, b) => a.lt(b) ? -1 : 1)
    const funcHash = constants.resolveAndClaimRangeProofBountyFuncHash
    const data = funcHash.slice(0, 4*2) + abi.format(
      ringGroupHash,
      rangeProof.commitment,
      rangeProof.rangeCommitments,
      rangeProof.rangeBorromeans,
      rangeProof.rangeProofs,
      rangeProof.indices,
      outputIDs,
      ringHashes,
      rangeHashes,
      keyImageHashes,
      rangeHash
    )
    this.web3.eth.sendTransaction({
        to: constants.disputeHelper,
        data: data,
        gasPrice: 5e9,
    }, (error, transactionHash) => {
      if (error) {
        console.error("Range Proof Dispute Resolution Failed: ", error)
      } else {
        console.log("Range Proof Dispute Resolution Sent: ", transactionHash)
      }
    })
    return true
  }
}

module.exports = Disputer
