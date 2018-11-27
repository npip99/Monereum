const wallet = require('./wallet')
const hash = require('./hash')
const parser = require('./parser')
const constants = require('./constants')
const pt = require('./ecc-point')
const bigInt = require('big-integer')

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
      const {ringGroupHash, outputIDs, ringHashes} = parser.parseRingGroup(parser.initParser(result.data))
      const ringGroupData = this.pending[ringGroupHash]
      if (ringGroupData) {
        console.log("RingGroup of RangeProof recognized: ", ringGroupHash.toString())
        const rangeProofs = ringGroupData.rangeProofs
        this.rangeProofsRemaining[ringGroupHash] = rangeProofs.length
        const func = hash.padItem(hash.funcHash("logRangeProof(uint256[],uint256[],uint256[2],uint256[2][],uint256[],uint256[2][],uint256[])")).slice(0, 4*2)
        rangeProofs.forEach(rp => {
          const data = func + hash.format(...rp)
          this.web3.eth.sendTransaction({
            to: constants.blockchain,
            data: data,
            gasPrice: 5e9,
          }, (error, hash) => {
            if (error) {
              console.error("RangeProof Failed")
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
      const rangeProof = parser.parseRangeProof(parser.initParser(result.data))
      if (this.rangeProofsRemaining[rangeProof.ringGroupHash]) {
        console.log("RangeProof of ", rangeProof.ringGroupHash.toString(), " has been confirmed: ", this.rangeProofsRemaining[rangeProof.ringGroupHash] - 1, " remaining")
        if((--this.rangeProofsRemaining[rangeProof.ringGroupHash]) == 0) {
          setTimeout(() => {
            const {outputIDs, ringHashes} = this.pending[rangeProof.ringGroupHash]
            const func = hash.padItem(hash.funcHash("commitRingGroup(uint256[],uint256[])")).slice(0, 4*2)
            const data = func + hash.format(outputIDs, ringHashes)
            this.web3.eth.sendTransaction({
              to: constants.blockchain,
              data: data,
              gasPrice: 5e9,
            }, (error, hash) => {
              if (error) {
                console.error("Commit Ring Failed")
              }
            })
          }, constants.disputeTime*1000)
        }
      }
    })
  }
  
  formatRangeProof(rp) {
    return rp
  }
  
  mint(tx) {
    const func = hash.padItem(hash.funcHash("mint(uint256[2],uint256[2],uint256)")).slice(0, 4*2)
    const data = func + hash.format(tx.src, tx.dest, tx.commitmentAmount)
    this.web3.eth.sendTransaction({
        to: constants.blockchain,
        data: data,
        gasPrice: 5e9,
    }, (error, hash) => {
      if (error) {
        console.error("Mint failed: ", error)
      } else {
        console.log("Mint succeeded: ", hash)
      }
    })
  }
  
  submit(tx) {
    if (!tx) {
      console.log("Tried to submit Non-Existant Tx")
      return
    }
    const {ringGroupHash, ringHashes, outputIDs, submit, rangeProofs} = this.formatSubmit(tx)
    const func = hash.padItem(hash.funcHash("submit(uint256[2][MIXIN][],uint256[2][],uint256[2][],uint256[],uint256[MIXIN][],uint256[MIXIN][],uint256[],uint256[2][],uint256[2][],uint256[2][],uint256[],uint256,uint256[2])".replace(/MIXIN/g, constants.mixin)))
    const data = func.slice(0, 4*2) + hash.format(...submit)
    this.web3.eth.sendTransaction({
        to: constants.blockchain,
        data: data,
        gasPrice: 5e9,
    }, (error, hash) => {
      if (error) {
        console.error("Submit Failed")
      } else {
        this.pending[ringGroupHash] = {rangeProofs, ringHashes, outputIDs}
        console.log("Submit Succeeded: ", hash)
      }
    })
  }
  
  formatSubmit(tx) {
    const minerPub = this.wallet.generateKey()
    const minerTx = this.wallet.createTransaction(minerPub, tx.minerFee, true)
    const minerDest = minerTx.dest
    
    const outputDests = tx.outputs.map(a => a.dest)
    const outputSrcs = tx.outputs.map(a => a.src)
    const outputCommitments = tx.outputs.map(a => a.commitment)
    const outputAmounts = tx.outputs.map(a => a.commitmentAmount)
    const outputHash = hash(outputDests, outputSrcs, outputCommitments, outputAmounts, tx.minerFee)
    const ringProofs = []
    const ringHashes = []
    for (let i = 0; i < tx.ringProofs.length; i++) {
      const txRingProof = tx.ringProofs[i]
      const ringProof = [txRingProof.funds.map(f => f.dest), txRingProof.keyImage, txRingProof.commitment, txRingProof.borromean, txRingProof.imageFundProofs, txRingProof.commitmentProofs, outputHash]
      ringProof[0].static = true
      ringProof[4].static = true
      ringProof[5].static = true
      const ringHash = hash(...ringProof)
      ringProofs.push(ringProof)
      ringHashes.push(ringHash)
    }
    const outputIDs = []
    for (let i = 0; i < outputDests.length; i++) {
      outputIDs.push(hash(outputDests[i]))
    }
    outputIDs.push(hash(minerDest))
    const ringGroupHash = hash(outputIDs, ringHashes)
    const rangeProofs = []
    const rangeHashes = []
    for (let i = 0; i < tx.rangeProofs.length; i++) {
      const rxRangeProof = tx.rangeProofs[i]
      let rangeProof = [outputIDs, rxRangeProof.commitment, rxRangeProof.rangeCommitments, rxRangeProof.rangeBorromeans, rxRangeProof.rangeProofs, rxRangeProof.indices]
      rangeProof[4].forEach(a => a.static = true)
      const rangeHash = hash(ringGroupHash, ...rangeProof)
      rangeProof = [ringHashes, ...rangeProof]
      rangeProofs.push(rangeProof)
      rangeHashes.push(rangeHash)
    }
    const zippedRingProofs = zip(...ringProofs.map(ringProof => ringProof.slice(0, ringProof.length - 1)))
    const zippedOutputs = [outputDests, outputSrcs, outputCommitments, outputAmounts]
    const submit = [...zippedRingProofs, rangeHashes, ...zippedOutputs, tx.minerFee, minerDest]
    return {
      ringGroupHash,
      ringHashes,
      outputIDs,
      submit,
      rangeProofs,
    }
  }
}

module.exports = Miner
