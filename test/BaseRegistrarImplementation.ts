import {ethers} from "hardhat";
// import {namehash} from "ethers/lib/utils";
import namehash from "eth-ens-namehash";

import {sha3} from "web3-utils";
import {expect} from "chai";
import {advanceTime, mine} from "./evm";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("BaseRegistrarImplementation", function () {
    const deployContract = async () => {
        const ENS = await ethers.getContractFactory('ENSRegistry');
        const ens = await ENS.deploy();
        const BaseRegistrarImplementation = await ethers.getContractFactory('BaseRegistrarImplementation');
        const registrar = await BaseRegistrarImplementation.deploy(ens.address, namehash.hash('bic'));
        const accounts = await ethers.getSigners();
        const ownerAccount = accounts[0];
        const controllerAccount = accounts[1];
        const registrantAccount = accounts[2];
        const otherAccount = accounts[3];
        await registrar.addController(controllerAccount.address);
        await ens.setSubnodeOwner('0x0000000000000000000000000000000000000000000000000000000000000000', sha3('bic'), registrar.address);


        return {ens, ownerAccount, controllerAccount, registrar, registrantAccount, otherAccount}
    }

    it('should allow new registrations', async () => {
        const {ens, registrar, registrantAccount, controllerAccount} = await deployContract()

        const tx = await registrar.connect(controllerAccount).register(sha3("newname"), registrantAccount.address, 86400);
        const block = await ethers.provider.getBlock(tx.blockHash);
        expect(await ens.owner(namehash.hash("newname.bic"))).to.be.equal(registrantAccount.address);
        expect(await registrar.ownerOf(sha3("newname"))).to.to.equal(registrantAccount.address);
        expect((await registrar.nameExpires(sha3("newname"))).toNumber()).to.be.equal(block.timestamp + 86400);
    });

    it('should allow renewals', async () => {
        const {ens, registrar, registrantAccount, controllerAccount} = await deployContract()
        await registrar.connect(controllerAccount).register(sha3("newname"), registrantAccount.address, 86400);
        const oldExpires = await registrar.nameExpires(sha3("newname"));
        await registrar.connect(controllerAccount).renew(sha3("newname"), 86400);
        expect((await registrar.nameExpires(sha3("newname"))).toNumber()).to.be.equal(oldExpires.toNumber() + 86400);
    });

    it('should allow registrations without updating the registry', async () => {
        const {ens, registrar, registrantAccount, controllerAccount} = await deployContract()
        const tx = await registrar.connect(controllerAccount).registerOnly(sha3("silentname"), registrantAccount.address, 86400);
        const block = await ethers.provider.getBlock(tx.blockHash);
        expect(await ens.owner(namehash.hash("silentname.bic"))).to.be.equal(ZERO_ADDRESS);
        expect(await registrar.ownerOf(sha3("silentname"))).to.be.equal(registrantAccount.address);
        expect((await registrar.nameExpires(sha3("silentname"))).toNumber()).to.be.equal(block.timestamp + 86400);
    });

    it('should permit the owner to reclaim a name', async () => {
        const {ens, registrar, registrantAccount, controllerAccount, ownerAccount} = await deployContract()
        await registrar.connect(controllerAccount).register(sha3("newname"), registrantAccount.address, 86400);

        await ens.setSubnodeOwner(ZERO_HASH, sha3("bic"), ownerAccount.address);
        await ens.setSubnodeOwner(namehash.hash("bic"), sha3("newname"), ZERO_ADDRESS);
        expect(await ens.owner(namehash.hash("newname.bic"))).to.be.equal(ZERO_ADDRESS);
        await ens.setSubnodeOwner(ZERO_HASH, sha3("bic"), registrar.address);
        await registrar.connect(registrantAccount).reclaim(sha3("newname"), registrantAccount.address);
        expect(await ens.owner(namehash.hash("newname.bic"))).to.be.equal(registrantAccount.address);
    });

    it('should permit the owner to transfer a registration', async () => {
        const {ens, registrar, registrantAccount, controllerAccount, ownerAccount, otherAccount} = await deployContract()
        await registrar.connect(controllerAccount).register(sha3("newname"), registrantAccount.address, 86400);

        await registrar.connect(registrantAccount).transferFrom(registrantAccount.address, otherAccount.address, sha3("newname"));
        expect((await registrar.ownerOf(sha3("newname")))).to.be.equal(otherAccount.address);
        // Transfer does not update ENS without a call to reclaim.
        expect(await ens.owner(namehash.hash("newname.bic"))).to.be.equal(registrantAccount.address);
    });

    it('should not permit transfer or reclaim during the grace period', async () => {
        const {ens, registrar, registrantAccount, controllerAccount, ownerAccount, otherAccount} = await deployContract()
        await registrar.connect(controllerAccount).register(sha3("newname"), registrantAccount.address, 86400);

        // Advance to the grace period
        const ts = (await ethers.provider.getBlock('latest')).timestamp;
        await advanceTime((await registrar.nameExpires(sha3("newname"))).toNumber() - ts + 3600);
        await mine()
        await expect(registrar.connect(registrantAccount).transferFrom(registrantAccount.address, otherAccount.address, sha3("newname"))).to.be.revertedWithoutReason();
        await expect(registrar.connect(registrantAccount).reclaim(sha3("newname"), registrantAccount.address)).to.be.revertedWithoutReason();
    });

    it('should allow registration of an expired domain', async () => {
        const {ens, registrar, registrantAccount, controllerAccount, ownerAccount, otherAccount} = await deployContract()
        await registrar.connect(controllerAccount).register(sha3("newname"), registrantAccount.address, 86400);

        // Advance to the grace period
        const ts = (await ethers.provider.getBlock('latest')).timestamp;

        const expires = await registrar.nameExpires(sha3("newname"));
        const grace = await registrar.GRACE_PERIOD();

        await advanceTime(expires.toNumber() - ts + grace.toNumber() + 3600);
        await mine()

        await expect(registrar.ownerOf(sha3("newname"))).to.be.revertedWithoutReason();

        await registrar.connect(controllerAccount).register(sha3("newname"), otherAccount.address, 86400);
        expect((await registrar.ownerOf(sha3("newname")))).to.be.equal(otherAccount.address);

    });

})
