import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    viaIR: true
    },
  },
  gasReporter: {
    enabled: false,
    coinmarketcap: process.env.COINMARKETCAP_KEY,
    currency: 'USD',
    token: 'ETH'
  }
};

export default config;
