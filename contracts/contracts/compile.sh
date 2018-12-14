#!/bin/sh
solcjs --optimize --bin MonereumBlockchain.sol MonereumConstants.sol MonereumDisputeHelper.sol MonereumInitializer.sol MonereumMath.sol MonereumMemory.sol MonereumVerifier.sol -o build

