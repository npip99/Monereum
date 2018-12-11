const hash = require('./hash')
const txhandler = require('./txhandler')

class Disputer {
  constructor(wallet, web3) {
    this.wallet = wallet
    this.web3 = web3
    this.handler = new txhandler(wallet, web3, true)
  }

  sync(block) {
    this.handler.sync(block)
  }

  tryDispute() {
    for (const ringGroupData in this.handler.ringGroups) {
      if (!ringGroupData.isValid && !ringGroupData.isRejected) {
        for (const ringProof of ringGroupData.ringProofs) {
          if (!ringProof.isValid) {
            disputeRingPRoof(ringGroupData, ringProof)
          }
        }
        for (const rangeProof of ringGroupData.rangeProofs) {
          if (!rangeProof.isValid) {
            disputeRangeProof(ringGroupData, rangeProof)
          }
        }
      }
    }
  }

  disputeRingProof(ringGroupData, ringProof) {
    console.log(ringGroupData, ringProof)
  }

  disputeRangeProof(ringGroupData, rangeProof) {
    console.log(ringGroupData, rangeProof)
    const outputIDs = ringGroupData.ringGroup.outputIDs
    const ringHashes = ringGroupData.ringGroup.ringHashes
    const rangeHashes = ringGroupData.ringGroup.rangeHashes
    const func = hash.funcHash("disputeRangeProof(uint256[],uint256[],uint256[],uint256)")
    const data = func.slice(0, 4*2) + hash.format(outputIDs, ringHashes, rangeHashes)
    this.web3.eth.sendTransaction({
        to: constants.blockchain,
        data: data,
        gasPrice: 5e9,
    }, (error, hash) => {
      if (error) {
        console.error("Range Proof Dispute Failed: ", error)
      } else {
        console.log("Range Proof Dispute Succeeded: ", hash)
      }
    })

  }
}

module.exports = Disputer
