import {sha3} from "web3-utils";
import {expect} from "chai";
import {ethers} from "hardhat";
import namehash from "eth-ens-namehash";

describe("ENS", function () {
    const deployContract = async () => {
        const ENS = await ethers.getContractFactory('ENSRegistry');
        const ens = await ENS.deploy();
        const signers = await ethers.getSigners();
        return {ens, accounts: signers}
    }

  it('should allow ownership transfers', async () => {
    const {ens} = await deployContract()
    let addr = '0x0000000000000000000000000000000000001234';

    let result = await ens.setOwner('0x0000000000000000000000000000000000000000000000000000000000000000', addr);

    expect(await ens.owner('0x0000000000000000000000000000000000000000000000000000000000000000')).to.be.equal(addr)

  });

    it('should prohibit transfers by non-owners', async () => {
        const {ens, accounts} = await deployContract()

        await expect(
            ens.connect(accounts[1]).setOwner('0x1000000000000000000000000000000000000000000000000000000000000000', '0x0000000000000000000000000000000000001234')
        ).to.be.revertedWithoutReason();
    });

    it('should allow the creation of subnodes', async () => {
        const {ens, accounts} = await deployContract()

        let result = await ens.setSubnodeOwner('0x0000000000000000000000000000000000000000000000000000000000000000', sha3('eth'), accounts[1].address);

        expect(await ens.owner(namehash.hash('eth'))).to.be.equal(accounts[1].address);

        let result2 = await ens.connect(accounts[1]).setSubnodeOwner(namehash.hash('eth'), sha3('bein'), accounts[1].address);
        let result3 = await ens.connect(accounts[1]).setSubnodeOwner(namehash.hash('eth'), sha3('bein2'), accounts[1].address);

        expect(await ens.owner(namehash.hash('bein.eth'))).to.be.equal(accounts[1].address);
        expect(await ens.owner(namehash.hash('bein2.eth'))).to.be.equal(accounts[1].address);
    });

    it('should prohibit subnode creation by non-owners', async () => {
        const {ens, accounts} = await deployContract()

        await expect(ens.connect(accounts[1]).setSubnodeOwner('0x0', sha3('eth'), accounts[1].address));
    });
});
