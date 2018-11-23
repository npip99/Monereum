module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      network_id: "*", // Match any network id
      gas: 30000000
    }
  },
	compilers: {
		solc: {
			version: "0.4.25"
		}
	}
};
