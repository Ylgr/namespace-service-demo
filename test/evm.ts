import {ethers} from 'hardhat';

export const advanceTime = async (delay: any) => {
    await ethers.provider.send(
        "evm_increaseTime",
        [delay]
    )
};

export const mine = async () => {
    await ethers.provider.send("evm_mine", [])
};
