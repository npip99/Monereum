var Initializer = artifacts.require("./MonereumInitializer.sol");
var Verifier = artifacts.require("./MonereumVerifier.sol");
var Blockchain = artifacts.require("./MonereumBlockchain.sol");

module.exports = function(deployer) {
  deployer.deploy(Initializer).then(function() {
    return deployer.deploy(Verifier, Initializer.address).then(function() {
      return deployer.deploy(Blockchain, Initializer.address, Verifier.address);
    });
  });
};
