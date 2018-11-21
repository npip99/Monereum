var Initializer = artifacts.require("./MonereumInitializer.sol");
var Verifier = artifacts.require("./MonereumVerifier.sol");
var Blockchain = artifacts.require("./MonereumBlockchain.sol");

var ConvertLib = artifacts.require("./ConvertLib.sol");
var MetaCoin = artifacts.require("./MetaCoin.sol");


module.exports = function(deployer) {
  deployer.deploy(Initializer).then(function(){
    return deployer.deploy(Verifier, Initializer.address).then(function(){
      return deployer.deploy(Blockchain, Initializer.address, Verifier.address);
    });
  });
/*  deployer.deploy(Initializer)
    .then(() => Initializer.deployed())
    .then(() => {
      deployer.deploy(Verifier, Initializer.address)
        .then(() => Verifier.deployed())
        .then(() =>
          deployer.deploy(Blockchain, Initializer.address, Verifier.address)
          /*  .then(() => Blockchain.deployed())
            .then(blk => {
              blk.initializeH();
              const h = blk.H();
              console.log(h);
            })
        );
    });*/
  /*init = instances[0];

  deployer.deploy(Verifier, init.address);
  await Verifier.deployed();
  ver = instances[1];

  deployer.deploy(Blockchain, init.address, ver.address);
  await Blockchain.deployed();
  blk = instances[2];

  await ver.initializeH.call();
  for (i = 0; i < 120; i++) {
    max = 10 * i + 10
    if (max > 128) {
      max = 128;
    }
    await ver.initializeHashVals.call(10 * i, max);
  }
  await blk.initializeH.call();

  const h = await blk.H.call();*/


  deployer.deploy(ConvertLib);
  deployer.link(ConvertLib, MetaCoin);
  deployer.deploy(MetaCoin);

  //console.log(h, blk.address);
};
