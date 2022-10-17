import {ethers} from "hardhat";
import {sha3} from "web3-utils";
import {namehash} from "ethers/lib/utils";
import {expect} from "chai";
const packet = require('dns-packet')

const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'
function encodeName(name: string) {
    return '0x' + packet.name.encode(name).toString('hex')
}
describe('Name Wrapper', () => {

    const deployContract = async () => {
        const ENS = await ethers.getContractFactory('ENSRegistry');
        const ens = await ENS.deploy();
        const BaseRegistrarImplementation = await ethers.getContractFactory('BaseRegistrarImplementation');
        const registrar = await BaseRegistrarImplementation.deploy(ens.address, namehash('bic'));
        const accounts = await ethers.getSigners();
        const account = accounts[0];
        const account2 = accounts[1];
        const hacker = accounts[2];
        await ens.setSubnodeOwner('0x0000000000000000000000000000000000000000000000000000000000000000', sha3('bic'), registrar.address);
        await ens.setSubnodeOwner('0x0000000000000000000000000000000000000000000000000000000000000000', sha3('xyz'), account.address);

        const MetaDataservice = await ethers.getContractFactory('StaticMetadataService');
        const metaDataservice = await MetaDataservice.deploy('https://ens.domains')

        const NameWrapper = await ethers.getContractFactory('NameWrapper');
        const nameWrapper = await NameWrapper.deploy(ens.address, registrar.address, metaDataservice.address);

        return {account, account2, hacker, ens, registrar, nameWrapper, NameWrapper}
    }

    describe("wrap", () => {
        it('Wraps a name if you are the owner', async () => {
            const {nameWrapper, ens, account, registrar} = await deployContract()
            expect(await nameWrapper.ownerOf(namehash('xyz'))).to.equal(EMPTY_ADDRESS)
            await ens.setApprovalForAll(nameWrapper.address, true)
            await nameWrapper.wrap(encodeName('xyz'), account.address, EMPTY_ADDRESS)
            expect(await nameWrapper.ownerOf(namehash('xyz'))).to.equal(account.address)
        })

        it('Allows an account approved by the owner on the ENS registry to wrap a name.', async () => {
            const {nameWrapper, ens, account, account2, registrar} = await deployContract()

            // setup .abc with account2 as owner
            await ens.setSubnodeOwner('0x0000000000000000000000000000000000000000000000000000000000000000', sha3('abc'), account2.address)
            // allow account to deal with all account2's names
            await ens.connect(account2).setApprovalForAll(account.address, true)
            await ens.connect(account2).setApprovalForAll(nameWrapper.address, true)

            //confirm abc is owner by account2 not account 1
            expect(await ens.owner(namehash('abc'))).to.equal(account2.address)
            // wrap using account
            await nameWrapper.wrap(encodeName('abc'), account2.address, EMPTY_ADDRESS)
            const ownerOfWrappedXYZ = await nameWrapper.ownerOf(namehash('abc'))
            expect(ownerOfWrappedXYZ).to.equal(account2.address)
        })

        it('Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
            const {nameWrapper, ens, account, account2, registrar} = await deployContract()

            // setup .abc with account2 as owner
            await ens.setSubnodeOwner('0x0000000000000000000000000000000000000000000000000000000000000000', sha3('abc'), account2.address)

            await ens.connect(account2).setApprovalForAll(nameWrapper.address, true)

            //confirm abc is owner by account2 not account 1
            expect(await ens.owner(namehash('abc'))).to.equal(account2.address)
            // wrap using account
            await expect(
                nameWrapper.wrap(encodeName('abc'), account2.address, EMPTY_ADDRESS),
            ).to.be.revertedWithCustomError(nameWrapper,`Unauthorised`)
        })

    })
})
