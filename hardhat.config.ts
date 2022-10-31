import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require("dotenv").config();

const config: HardhatUserConfig = {
  solidity: "0.8.17",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true
    },
    testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: [process.env.PRIVATE_KEY as string],
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337
    },
  },
  etherscan: {
    apiKey: process.env.API_KEY,
  },
};

export default config;
