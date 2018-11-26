const bigInt = require('big-integer')
const pt = require('./ecc-point')
const constants = require('./constants')

class Parser {
  static parseJSONKey(key) {
    return {
      spendPub: Parser.parseJSONPt(key.spendPub),
      viewPub: Parser.parseJSONPt(key.viewPub),
    };
  }

  static parseJSONPt(p) {
    return new pt(p.x, p.y)
  }

  static parseJSONTx(tx) {
    const parsePt = Parser.parseJSONPt
    return {
      id: tx.id && bigInt(tx.id),
      src: parsePt(tx.src),
      dest: parsePt(tx.dest),
      commitment: parsePt(tx.commitment),
      commitmentAmount: bigInt(tx.commitmentAmount),
    }
  }

  static parseJSONFullTx(tx) {
    const parsePt = Parser.parseJSONPt
    const parseTx = Parser.parseJSONTx
    const parseBigInt = b => bigInt(b)
    tx.rangeProofs = tx.rangeProofs.map(rp => {
      return {
        commitment: parsePt(rp.commitment),
        rangeCommitments: rp.rangeCommitments.map(parsePt),
        rangeBorromeans: rp.rangeBorromeans.map(parseBigInt),
        rangeProofs: rp.rangeProofs.map(a => [bigInt(a[0]), bigInt(a[1])]),
        indices: rp.indices,
      }
    })
    tx.ringProofs = tx.ringProofs.map(rp => {
      return {
        funds: rp.funds.map(parseTx),
        keyImage: parsePt(rp.keyImage),
        commitment: parsePt(rp.commitment),
        borromean: bigInt(rp.borromean),
        imageFundProofs: rp.imageFundProofs.map(parseBigInt),
        commitmentProofs: rp.commitmentProofs.map(parseBigInt),
        outputHash: bigInt(rp.outputHash),
      }
    })
    tx.outputs = tx.outputs.map(parseTx)
    tx.minerFee = bigInt(tx.minerFee)
    return tx
  }

  static parsePt(parser) {
    const x = Parser.parseNum(parser)
    const y = Parser.parseNum(parser)
    return new pt(x, y)
  }
  
  static parseNum(parser) {
    const hex = parser[0].slice(parser[1], parser[1] += 32*2)
    return bigInt(hex, 16)
  }
  
  static parseTransaction(parser) {
    const outputID = Parser.parseNum(parser)
    const outputSrc = Parser.parsePt(parser)
    const outputDest = Parser.parsePt(parser)
    const outputCommitment = Parser.parsePt(parser)
    const outputCommitmentAmount = Parser.parseNum(parser)
    const tx = {
      id: outputID,
      src: outputSrc,
      dest: outputDest,
      commitment: outputCommitment,
      commitmentAmount: outputCommitmentAmount
    }
    return tx
  }
  
  static parseRingProof(parser) {
    let ptr = 0
    const ringHash = Parser.parseNum(parser)
    const funds = []
    for (let i = 0; i < constants.mixin; i++) {
      funds.push(Parser.parsePt(parser))
    }
    const keyImage = Parser.parsePt(parser)
    const commitment = Parser.parsePt(parser)
    const borromean = Parser.parseNum(parser)
    const imageFundProofs = []
    for (let i = 0; i < constants.mixin; i++) {
      imageFundProofs.push(Parser.parseNum(parser))
    }
    const commitmentProofs = []
    for (let i = 0; i < constants.mixin; i++) {
      commitmentProofs.push(Parser.parseNum(parser))
    }
    const outputHash = Parser.parseNum(parser)
    const rp = {
      ringHash,
      funds,
      keyImage,
      commitment,
      borromean,
      imageFundProofs,
      commitmentProofs,
      outputHash
    }
    return rp
  }
  
  static parseRingGroup(parser) {
    const ringGroupHash = Parser.parseNum(parser)
    // Ignore dynamic argument locations
    Parser.parseNum(parser)
    Parser.parseNum(parser)
    
    const numOutputs = Parser.parseNum(parser)
    const outputIDs = []
    for (let i = 0; i < numOutputs; i++) {
      outputIDs.push(Parser.parseNum(parser))
    }
    const numRings = Parser.parseNum(parser)
    const ringHashes = []
    for (let i = 0; i < numRings; i++) {
      ringHashes.push(Parser.parseNum(parser))
    }
    const rg = {
      ringGroupHash,
      outputIDs,
      ringHashes
    }
    return rg
  }
  
  static parseRangeProof(parser) {
    const ringGroupHash = Parser.parseNum(parser)
    const commitment = Parser.parsePt(parser)
    // Skip over dynamic memory location
    Parser.parseNum(parser)
    Parser.parseNum(parser)
    Parser.parseNum(parser)
    Parser.parseNum(parser)
    const numBits = Parser.parseNum(parser)
    const rangeCommitments = []
    for (let i = 0; i < numBits; i++) {
      rangeCommitments.push(Parser.parsePt(parser))
    }
    Parser.parseNum(parser)
    const rangeBorromeans = []
    for (let i = 0; i < numBits; i++) {
      rangeBorromeans.push(Parser.parseNum(parser))
    }
    Parser.parseNum(parser)
    const rangeProofs = []
    for (let i = 0; i < numBits; i++) {
      const rangeProof = []
      rangeProof.push(Parser.parseNum(parser))
      rangeProof.push(Parser.parseNum(parser))
      rangeProof.static = true
      rangeProofs.push(rangeProof)
    }
    const indices = []
    for (let i = 0; i < numBits; i++) {
      indices.push(Parser.parseNum(parser))
    }
    return {
      ringGroupHash,
			commitment,
			rangeCommitments,
			rangeBorromeans,
			rangeProofs,
			indices
		}
  }
  
  static initParser(data) {
    const parser = [data.slice(2), 0]
    return parser
  }
}

module.exports = Parser
