const wallet = require('./wallet')
const hash = require('./hash')
const parser = require('./parser')
const constants = require('./constants')

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
      console.log(result)
      const {ringGroupHash, outputIDs, ringHashes} = parser.parseRingGroup(parser.initParser(result.data))
      console.log("RingGroup: ", ringGroupHash)
      const ringGroupData = this.pending[ringGroupHash]
      if (ringGroupData) {
        const rangeProofs = ringGroupData.rangeProofs
        console.log("RANGEPROOFS FOUND: ", rangeProofs)
        this.rangeProofsRemaining[ringGroupHash] = rangeProofs.length
        const func = hash.padItem(hash.funcHash("logRangeProof(uint256[],uint256[],uint256[2],uint256[2][],uint256[],uint256[2][],uint256[])")).slice(0, 4*2)
        rangeProofs.forEach(rp => {
          const data = func + hash.format(...rp)
          console.log(data)
          this.web3.eth.sendTransaction({
            to: constants.blockchain,
            data: data,
            gasPrice: 5e9,
          }, (error, hash) => {
            console.log("RANGEPROOF RESULT: ", error, hash)
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
      console.log(result)
      const rangeProof = parser.parseRangeProof(parser.initParser(result.data))
      console.log("RANGEPROOF: ", rangeProof)
      if (this.rangeProofsRemaining[rangeProof.ringGroupHash]) {
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
              console.log("COMMITRINGGROUP RESULT: ", error, hash)
            })
          }, constants.disputeTime*1000)
        }
      }
      console.log("RangeProof: ", rangeProof)
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
      console.log("MINT RESULT: ", error, hash)
    })
  }
  
  submit(tx) {
    if (!tx) {
      console.log("Tried to submit NonExistant tx")
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
      if (!error) {
        this.pending[ringGroupHash] = {rangeProofs, ringHashes, outputIDs}
      }
      console.log("SUBMIT RESULT: ", error, hash)
    })
    console.log(func, hash.format(...submit))
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
