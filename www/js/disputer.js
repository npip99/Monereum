const abi = require('./abi')
const constants = require('./constants')
const TXHandler = require('./txhandler')
const Parser = require('./parser')
const bigInt = require('big-integer')

const hash = abi.hash

class Disputer {
  constructor(wallet, web3) {
    this.wallet = wallet
    this.web3 = web3
    this.handler = new TXHandler(wallet, web3, true)
    this.doneSyncing = true

    this.ringGroupDisputed = {}
    this.ringGroupDisputeResolved = {}

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

  handleRingGroupDisputeResolvedResult(result) {
    const parser = Parser.initParser(result.data)
    const ringGroupHash = Parser.parseNum(parser)
    const topicHash = Parser.parseNum(parser)

    const ringGroupHashHex = ringGroupHash.toString(16)
    if (!this.ringGroupDisputeResolved[ringGroupHashHex]) {
      this.ringGroupDisputeResolved[ringGroupHashHex] = {}
    }
    this.ringGroupDisputeResolved[ringGroupHashHex][topicHash.toString(16)] = true
  }

  handleRingGroupDisputedResult(result) {
    const parser = Parser.initParser(result.data)
    const ringGroupHash = Parser.parseNum(parser)
    const topicHash = Parser.parseNum(parser)

    const ringGroupHashHex = ringGroupHash.toString(16)
    const topicHashHex = topicHash.toString(16)
    if (!this.ringGroupDisputed[ringGroupHashHex]) {
      this.ringGroupDisputed[ringGroupHashHex] = {}
    }
    this.ringGroupDisputed[ringGroupHashHex][topicHashHex] = {
      transactionHash: result.transactionHash,
      blockNumber: result.blockNumber,
    }
  }

  tryDispute() {
    if (!this.doneSyncing) {
      throw "Handler not done syncing"
    }
    for (const ringGroupHash in this.handler.ringGroups) {
      const ringGroupData = this.handler.ringGroups[ringGroupHash]
      if (ringGroupData.isRejected || ringGroupData.confirmed) {
        continue
      }
      const ringGroupHashHex = ringGroupHash.toString(16)
      if (this.ringGroupDisputed[ringGroupHashHex]) {
        for (const topicHashHex in this.ringGroupDisputed[ringGroupHashHex]) {
          if (this.ringGroupDisputeResolved[ringGroupHashHex] && this.ringGroupDisputeResolved[ringGroupHashHex][topicHashHex]) {
            return
          }
          if (
            (
              this.disputedRingProof[ringGroupHashHex]
              && this.ringGroupDisputed[ringGroupHashHex][topicHashHex].transactionHash == this.disputedRingProof[ringGroupHashHex][topicHashHex]
            ) || (
              this.getBlockNumber() > this.ringGroupDisputed[ringGroupHashHex][topicHashHex].blockNumber + 2 * constants.disputeTime
            )
          ) {
            console.log("Successful Ring Group Dispute. Resolving...")
            const status = this.resolveRangeProof(ringGroupHash, bigInt(topicHashHex, 16))
            console.log("Resolution Status: ", status)
          }
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
        ringGroupData.isValid
        && this.handler.position >= ringGroupData.timerBlock + 2 * constants.disputeTime
      ) {
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
    const ringGroupHashHex = ringGroupData.ringGroup.ringGroupHash.toString(16)

    let rangeHash
    const rangeHashes = ringGroupData.ringGroup.rangeHashes
    for (const [i, rp] of ringGroupData.rangeProofs.entries()) {
      if (rp == rangeProof) {
        rangeHash = rangeHashes[i]
        break
      }
    }
    const rangeHashHex = rangeHash.toString(16)
    console.log(ringGroupHashHex, rangeHashHex)
    console.log(this.ringGroupDisputed)
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

  resolveRangeProof(ringGroupHash, rangeHash) {
    const ringGroupData = this.handler.ringGroups[ringGroupHash.toString(16)]
    if (!ringGroupData) {
      throw "No ring group found"
    }

    let rangeProof
    const rangeHashes = ringGroupData.ringGroup.rangeHashes
    for (const [i, rp] of ringGroupData.rangeProofs.entries()) {
      if (rangeHash.eq(rangeHashes[i])) {
        rangeProof = rp
        break
      }
    }
    if (!rangeProof) {
      return null
    }

    const funds = rangeProof.commitment
    const outputIDs = ringGroupData.ringGroup.outputIDs
    const ringHashes = ringGroupData.ringGroup.ringHashes
    const keyImageHashes = ringGroupData.ringProofs.map(rp => hash(rp.keyImage))
    keyImageHashes.sort((a, b) => a.lt(b) ? -1 : 1)
    const funcHash = constants.resolveAndClaimRangeProofBountyFuncHash
    const data = funcHash.slice(0, 4*2) + abi.format(
      ringGroupData.ringGroup.ringGroupHash,
      rangeProof.commitment,
      rangeProof.rangeCommitments,
      rangeProof.rangeBorromeans,
      rangeProof.rangeProofs.map(pf => Object.assign(pf, {'static': true})),
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
