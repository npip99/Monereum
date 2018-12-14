const abi = require('./abi')
const constants = require('./constants')
const pt = require('./ecc-point')
const bigInt = require('big-integer')
const Parser = require('./parser')

const hash = abi.hash

// [5, 6, 7], ["a", "b", "c"], [true, false, true] => [5, "a", true], [6, "b", false], [7, "c", true]
const zip = (arr, ...arrs) => {
  return arr.map((val, i) => arrs.reduce((a, arr) => [...a, arr[i]], [val]));
}

class Miner {
  constructor(wallet, web3) {
    this.wallet = wallet
    this.web3 = web3
    this.pending = {}
    this.rangeProofsRemaining = {}
    this.watched = {}

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
      const {ringGroupHash, outputIDs, ringHashes} = Parser.parseRingGroup(Parser.initParser(result.data))
      const ringGroupData = this.pending[ringGroupHash]
      if (ringGroupData) {
        console.log("Ring Group Recognized: ", ringGroupHash.toString(16))
        const rangeProofs = ringGroupData.rangeProofs
        this.rangeProofsRemaining[ringGroupHash] = rangeProofs.length
        rangeProofs.forEach(rp => {
          const data = constants.submitRangeProofFuncHash.slice(0, 4*2) + abi.format(...rp)
          this.web3.eth.sendTransaction({
            to: constants.blockchain,
            data: data,
            gasPrice: 5e9,
          }, (error, transactionHash) => {
            if (error) {
              console.error("Range Proof Submission Failed: ", error)
            } else {
              console.log("Range Proof Submission Sent: ", transactionHash)
            }
          })
        })
      }
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
      const rangeProof = Parser.parseRangeProof(Parser.initParser(result.data))
      if (this.rangeProofsRemaining[rangeProof.ringGroupHash]) {
        console.log("Range Proof of ", rangeProof.ringGroupHash.toString(16), " has been confirmed: ", this.rangeProofsRemaining[rangeProof.ringGroupHash] - 1, " remaining")
        if((--this.rangeProofsRemaining[rangeProof.ringGroupHash]) == 0) {
          const timerBlock = result.blockNumber
          const trySubmitRingGroup = () => {
            web3.eth.getBlockNumber((error, result) => {
              if (result >= timerBlock + constants.disputeTime) {
                const {outputIDs, ringHashes, rangeHashes} = this.pending[rangeProof.ringGroupHash]
                const data = constants.commitRingGroupFuncHash.slice(0, 4*2) + abi.format(outputIDs, ringHashes, rangeHashes)
                this.web3.eth.sendTransaction({
                  to: constants.blockchain,
                  data: data,
                  gasPrice: 5e9,
                }, (error, transactionHash) => {
                  if (error) {
                    console.error("Ring Group Commit Failed", error)
                  } else {
                    console.log("Ring Group Commit Sent: ", transactionHash)
                  }
                })
              } else {
                setTimeout(trySubmitRingGroup, 75)
              }
            })
          }
          setTimeout(trySubmitRingGroup, 75)
        }
      }
    })
  }

  formatRangeProof(rp) {
    return rp
  }

  mint(tx) {
    const data = constants.mintFuncHash.slice(0, 4*2) + abi.format(tx.src, tx.dest, tx.commitmentAmount)
    this.web3.eth.sendTransaction({
        to: constants.blockchain,
        data: data,
        gasPrice: 5e9,
    }, (error, transactionHash) => {
      if (error) {
        console.error("Mint Failed: ", error)
      } else {
        console.log("Mint Sent: ", transactionHash)
      }
    })
  }

  submit(tx) {
    if (!tx) {
      console.log("Tried to submit Non-Existant Tx")
      return null
    }
    for (const ringProof of tx.ringProofs) {
      if (!this.wallet.verifyRingProof(ringProof)) {
        console.log("Invalid Ring Proof")
        return null
      }
    }
    for (const rangeProof of tx.rangeProofs) {
      if (!this.wallet.verifyRangeProof(rangeProof)) {
        console.log("Invalid Range Proof")
        return null
      }
    }
    const {ringGroupHash, ringHashes, rangeHashes, outputIDs, submit, rangeProofs, error} = this.formatSubmit(tx)
    if (error) {
      console.error(error)
      return null
    }
    const data = constants.submitRingGroupFuncHash.slice(0, 4*2) + abi.format(...submit)
    this.web3.eth.sendTransaction({
        to: constants.blockchain,
        data: data,
        gasPrice: 5e9,
    }, (error, transactionHash) => {
      if (error) {
        console.error("Ring Group Submission Failed")
      } else {
        this.pending[ringGroupHash] = {rangeProofs, rangeHashes, ringHashes, outputIDs}
        console.log("Ring Group Submission Sent: ", transactionHash)
      }
    })
  }

  formatSubmit(tx) {
    let error = null

    // Collect miner fee data
    const minerPub = this.wallet.getKey()
    const minerTx = this.wallet.createTransaction(minerPub, tx.minerFee, true)
    const minerDest = minerTx.dest

    // Format outputs and calculate output hash
    const outputDests = tx.outputs.map(a => a.dest)
    const outputSrcs = tx.outputs.map(a => a.src)
    const outputCommitments = tx.outputs.map(a => a.commitment)
    const outputAmounts = tx.outputs.map(a => a.commitmentAmount)
    outputAmounts.push(tx.minerFee)

    const outputMsgs = [tx.msgData]
    outputMsgs.bytes = true

    const outputHash = hash(outputDests, outputSrcs, outputCommitments, outputAmounts, outputMsgs)

    // Format ring proofs and calculate ring hashes
    const ringProofs = []
    const ringHashes = []
    for (let i = 0; i < tx.ringProofs.length; i++) {
      const txRingProof = tx.ringProofs[i]
      if (txRingProof.outputHash.neq(outputHash)) {
        error = "Output hashes do not agree"
      }
      const ringProof = [txRingProof.funds.map(f => f.dest), txRingProof.keyImage, txRingProof.commitment, txRingProof.borromean, txRingProof.imageFundProofs, txRingProof.commitmentProofs, outputHash]
      ringProof[0].static = true
      ringProof[4].static = true
      ringProof[5].static = true
      const ringHash = hash(...ringProof)
      ringProofs.push(ringProof)
      ringHashes.push(ringHash)
    }

    // Format range proofs and calculate range hashes
    const rangeProofs = []
    const rangeHashes = []
    for (let i = 0; i < tx.rangeProofs.length; i++) {
      const rxRangeProof = tx.rangeProofs[i]
      const rangeProof = [
        rxRangeProof.commitment,
        rxRangeProof.rangeCommitments,
        rxRangeProof.rangeBorromeans,
        rxRangeProof.rangeProofs.map(a => {a.static = true; return a}),
        rxRangeProof.indices
      ]
      const rangeHash = hash(...rangeProof)
      rangeHashes.push(rangeHash)
      rangeProofs.push(rangeProof)
    }

    // Init Ring Group
    const outputIDs = []
    for (let i = 0; i < outputDests.length; i++) {
      outputIDs.push(hash(outputDests[i]))
    }
    outputIDs.push(hash(minerDest))
    const ringGroupHash = hash(outputIDs, ringHashes, rangeHashes)

    // Collect Range Proof data
    for (let i = 0; i < tx.rangeProofs.length; i++) {
      rangeProofs[i] = [outputIDs, ringHashes, rangeHashes].concat(rangeProofs[i])
    }

    // Format Data
    const zippedRingProofs = zip(...ringProofs.map(ringProof => ringProof.slice(0, ringProof.length - 1)))
    const zippedOutputs = [outputDests, outputSrcs, outputCommitments, outputAmounts]
    const submit = [...zippedRingProofs, rangeHashes, ...zippedOutputs, outputMsgs, minerDest]

    // Return formatted data
    return {
      ringGroupHash,
      ringHashes,
      rangeHashes,
      outputIDs,
      rangeProofs,
      submit,
      error,
    }
  }
}

module.exports = Miner
