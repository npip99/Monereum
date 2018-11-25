const bigInt = require('big-integer')
const pt = require('./ecc-point')
const constants = require('./constants')

class Parser {
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
/*
"
590d9b679107225b38ab0cd2bc809404c88e4aa57517004e806be4cdb6a93c8f
06ad3a343fa2d46c04a239ddab23af3c6905a01d76452ad4cf8752efbdd7bd0d
27d20254ac42933c24b9bd67af7112ef0a1157d371f1081efea50d5bddfcfa26
2337172d933b8325982edfe891d0d9c9264de5957af35065ffbabae6b590c198
2b86e7d520418ada4d5f5277b175c3d2b610c509cd4294a2ff3c9ed7e0a88e4b
0cb92a992df943f3a325d7adc826440012a4e57928a6e8aa68f130f829d94deb
07e12528fc9967f5e4cf0caa46d89ecf665e2be0e55a00225eb3364b51c421f1
000000000000000000000000000000000000000000000000000000000000001a
"
*/
  
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
