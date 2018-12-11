const {format, funcHash} = require('./abi')
const txhandler = require('./txhandler')

class Disputer {
  constructor(wallet, web3) {
    this.wallet = wallet
    this.web3 = web3
    this.handler = new txhandler(wallet, web3, true)
  }

  sync() {
    
  }

  tryDispute() {
    for (const ringGroupHash in this.handler.ringGroups) {
      const ringGroupData = this.handler.ringGroups[ringGroupHash]
      console.log(ringGroupData)
      if (!ringGroupData.isValid && !ringGroupData.isRejected && !ringGroupData.confirmed) {
      console.log(ringGroupData)
        for (const ringProof of ringGroupData.ringProofs) {
          if (!ringProof.isValid) {
            this.disputeRingProof(ringGroupData, ringProof)
          }
        }
        for (const rangeProof of ringGroupData.rangeProofs) {
          if (!rangeProof.isValid) {
            this.disputeRangeProof(ringGroupData, rangeProof)
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
    let rangeHash
    for (const [i, rp] of ringGroupData.rangeProofs.entries()) {
      if (rp == rangeProof) {
        rangeHash = rangeHashes[i]
        break
      }
    }
    console.log(outputIDs, ringHashes, rangeHashes, rangeHash)
    const func = funcHash("disputeRangeProof(uint256[],uint256[],uint256[],uint256)")
    const data = func.slice(0, 4*2) + format(outputIDs, ringHashes, rangeHashes, rangeHash)
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
