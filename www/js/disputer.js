const abi = require('./abi')
const constants = require('./constants')
const TXHandler = require('./txhandler')

const hash = abi.hash

class Disputer {
  constructor(wallet, web3) {
    this.wallet = wallet
    this.web3 = web3
    this.handler = new TXHandler(wallet, web3, true)
    this.doneSyncing = true

    this.ringGroupDisputed = {}
    this.ringGroupDisputeResolved = {}

    this.disputed = {}
    this.submittedLateRingGroup = {}
    this.disputedLateRangeProof = {}
    this.disputedRingProof = {}
    this.disputedRangeProof = {}
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

    this.handler.sync(block, () => {
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

      const tryHandleInterval = setInterval(() => {
        if (!ringGroupDisputedResults || !ringGroupDisputeResolvedResults) {
          return
        }
        clearInterval(tryHandleInterval)
        for (const ringGroupDisputedResult of ringGroupDisputedResults) {
          this.handleRingGroupDisputedResult(ringGroupDisputedResult)
        }
        for (const ringGroupDisputeResolvedResult of ringGroupDisputeResolvedResults) {
          this.handleRingGroupDisputeResolvedResult(ringGroupDisputeResolvedResult)
        }
      }, 75)

      this.doneSyncing = true
      if (callback) {
        callback()
      }
    })
  }

  handleRingGroupDisputedResult(result) {
    const parser = Parser.initParser(result.data)
    const ringGroupHash = Parser.parseNum(parser)
    const topicHash = Parser.parseNum(parser)

    console.log(result)
  }

  handleRingGroupDisputeResolvedResult(result) {
    const parser = Parser.initParser(result.data)
    const ringGroupHash = Parser.parseNum(parser)
    const topicHash = Parser.parseNum(parser)
  }

  tryDispute() {
    if (!this.handler.doneSyncing) {
      throw "Handler not done syncing"
    }
    for (const ringGroupHash in this.handler.ringGroups) {
      const ringGroupData = this.handler.ringGroups[ringGroupHash]
      if (ringGroupData.isRejected || ringGroupData.confirmed) {
        continue
      }
      if (
        ringGroupData.rangeProofs.length < ringGroupData.ringGroup.outputIDs.length - 1
        && this.handler.position >= ringGroupData.timerBlock + 2 * constants.disputeTime
      ) {
        this.disputeLateRangeProof(ringGroupData)
        continue
      }
      if (ringGroupData.isValid
      && this.handler.position >= ringGroupData.timerBlock + 2 * constants.disputeTime) {
        this.submitLateRingGroup(ringGroupData)
        continue
      }
      if (ringGroupData.isValid != null && !ringGroupData.isValid) {
        console.log(ringGroupData)
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
    console.log("Late Ring Group Found", "(" + ringGroupHashHex + ")")
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
    console.log("Late Ring Proof Found", "(" + ringGroupHashHex + ")")
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
    console.log(ringGroupData, ringProof)
  }

  disputeRangeProof(ringGroupData, rangeProof) {
    console.log(ringGroupData, rangeProof)
    const ringGroupHashHex = ringGroupData.ringGroup.rinGroupHash.toString(16)
    let rangeHash
    for (const [i, rp] of ringGroupData.rangeProofs.entries()) {
      if (rp == rangeProof) {
        rangeHash = rangeHashes[i]
        break
      }
    }
    const rangeHashHex = rangeHash.toString(16)
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
    console.log(outputIDs, ringHashes, rangeHashes, rangeHash)
    const funcHash = constants.disputeRangeProofFuncHash
    const data = funcHash.slice(0, 4*2) + abi.format(outputIDs, ringHashes, rangeHashes, rangeHash)
    this.web3.eth.sendTransaction({
        to: constants.blockchain,
        data: data,
        gasPrice: 5e9,
    }, (error, transactionHash) => {
      this.disputedRangeProof[ringGroupHashHex][rangeHashHex] = transactionHash
      if (error) {
        console.error("Range Proof Dispute Failed: ", error)
      } else {
        console.log("Range Proof Dispute Succeeded: ", transactionHash)
      }
    })
  }
}

module.exports = Disputer
