const {hashFunc} = require('./abi')

const mixin = 3

module.exports = {
  // "0x643d1ff3baf8732a0d247d5c0df6e0e5c091e1f4", "0x70dbb8Eb47ffcf898060c6658f189575d18392B7"
  // "0x9e4e57f61362961c7de02d78a274b694112fd1e6", 100000000000000000000
  // Rinkeby
  // initializer: '0x643d1ff3baf8732a0d247d5c0df6e0e5c091e1f4'
  // verifier: '0x70dbb8Eb47ffcf898060c6658f189575d18392B7',
  blockchain: '0xaed9fcf985f78ac1ae82fe2c6b4277c0531587b6',
  disputeHelper: '0x331eebadb3ef3af9e15aca39bfb5945ca02b879f',
  ringGroupTopic: '0x' + hashFunc("LogRingGroup(uint256,uint256[],uint256[],uint256[],bytes)"),
  ringProofTopic: '0x' + hashFunc("LogRingProof(uint256,uint256[2][MIXIN],uint256[2],uint256[2],uint256,uint256[MIXIN],uint256[MIXIN],uint256)".replace(/MIXIN/g, "" + mixin)),
  rangeProofTopic: '0x' + hashFunc("LogRangeProof(uint256,uint256[2],uint256[2][],uint256[],uint256[2][],uint256[])"),
  transactionTopic: '0x' + hashFunc("LogTransaction(uint256,uint256[2],uint256[2],uint256[2],uint256)"),
  committedRingGroupTopic: '0x' + hashFunc("LogRingGroupCommitted(uint256)"),
  mintTransactionTopic: '0x' + hashFunc("LogMintTransaction(uint256)"),
  ringGroupRejectedTopic: '0x' + hashFunc("LogRingGroupRejected(uint256)"),
  ringGroupDisputedTopic: '0x' + hashFunc("LogRingGroupDisputed(uint256,uint256)"),
  ringGroupDisputeResolvedTopic: '0x' + hashFunc("LogRingGroupDisputeResolved(uint256,uint256)"),
  submitRingGroupFuncHash: hashFunc("submitRingGroup(uint256[2][MIXIN][],uint256[2][],uint256[2][],uint256[],uint256[MIXIN][],uint256[MIXIN][],uint256[],uint256[2][],uint256[2][],uint256[2][],uint256[],bytes,uint256[2])".replace(/MIXIN/g, mixin)),
  submitRangeProofFuncHash: hashFunc("submitRangeProof(uint256[],uint256[],uint256[],uint256[2],uint256[2][],uint256[],uint256[2][],uint256[])"),
  commitRingGroupFuncHash: hashFunc("commitRingGroup(uint256[],uint256[],uint256[])"),
  mintFuncHash: hashFunc("mint(uint256[2],uint256[2],uint256)"),
  disputeLateRangeProofFuncHash: hashFunc("disputeLateRangeProof(uint256[],uint256[],uint256[],uint256[])"),
  disputeTopicFuncHash: hashFunc("disputeTopic(uint256[],uint256[],uint256[],uint256)"),
  resolveAndClaimRingProofBountyFuncHash: hashFunc("resolveAndClaimRingProofBounty(uint256,uint256[2][MIXIN],uint256[2][MIXIN],uint256[2],uint256[2],uint256,uint256[MIXIN],uint256[MIXIN],uint256,uint256[],uint256[],uint256[],uint256[],uint256)".replace(/MIXIN/g, mixin)),
  resolveAndClaimRangeProofBountyFuncHash: hashFunc("resolveAndClaimRangeProofBounty(uint256,uint256[2],uint256[2][],uint256[],uint256[2][],uint256[],uint256[],uint256[],uint256[],uint256[],uint256)"),
  mixin: mixin,
  disputeTime: 8,
}
