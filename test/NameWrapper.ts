import {ethers} from "hardhat";
import {sha3} from "web3-utils";
import {namehash} from "ethers/lib/utils";
import {expect} from "chai";
import {advanceTime, mine} from "./evm";
const packet = require('dns-packet')

const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'
function encodeName(name: string) {
    return '0x' + packet.name.encode(name).toString('hex')
}
const FUSES = {
    CANNOT_UNWRAP: 1,
    CANNOT_BURN_FUSES: 2,
    CANNOT_TRANSFER: 4,
    CANNOT_SET_RESOLVER: 8,
    CANNOT_SET_TTL: 16,
    CANNOT_CREATE_SUBDOMAIN: 32,
    PARENT_CANNOT_CONTROL: 64,
    CAN_DO_EVERYTHING: 0
}
const DAY = 84600
const MAX_EXPIRY = 2n ** 64n - 1n
const ROOT_NODE = '0x0000000000000000000000000000000000000000000000000000000000000000'
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
        await registrar.addController(account.address);
        await registrar.addController(account2.address);

        return {account, account2, hacker, ens, registrar, nameWrapper, NameWrapper}
    }

    async function registerSetupAndWrapName(registrar, nameWrapper, label, account, fuses, expiry = 0) {
        const tokenId = sha3(label)
        await registrar.register(tokenId, account, DAY)

        await registrar.setApprovalForAll(nameWrapper.address, true)

        await nameWrapper.wrapBIC2LD(label, account, fuses, expiry, EMPTY_ADDRESS)
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
            ).to.be.revertedWithCustomError(nameWrapper, `Unauthorised`)
        })

        it('Can re-wrap a name that was reassigned by an unwrapped parent', async () => {
            const {nameWrapper, ens, account, account2, registrar} = await deployContract()

            expect(await nameWrapper.ownerOf(namehash('xyz'))).to.equal(EMPTY_ADDRESS)

            await ens.setApprovalForAll(nameWrapper.address, true)
            await ens.setSubnodeOwner(
                namehash('xyz'),
                sha3('sub'),
                account.address,
            )
            await nameWrapper.wrap(encodeName('sub.xyz'), account.address, EMPTY_ADDRESS)

            await ens.setSubnodeOwner(
                namehash('xyz'),
                sha3('sub'),
                account2.address,
            )

            expect(await ens.owner(namehash('sub.xyz'))).to.equal(account2.address)
            expect(await nameWrapper.ownerOf(namehash('sub.xyz'))).to.equal(account.address)

            await ens.connect(account2).setApprovalForAll(nameWrapper.address, true)
            const tx = await nameWrapper.connect(account2).wrap(
                encodeName('sub.xyz'),
                account2.address,
                EMPTY_ADDRESS,
            )

            const nameHash = namehash('sub.xyz')

            await expect(tx)
                .to.emit(nameWrapper, 'NameUnwrapped')
                .withArgs(nameHash, EMPTY_ADDRESS)
            await expect(tx)
                .to.emit(nameWrapper, 'TransferSingle')
                .withArgs(account2.address, account.address, EMPTY_ADDRESS, nameHash, 1)
            await expect(tx)
                .to.emit(nameWrapper, 'NameWrapped')
                .withArgs(
                    nameHash,
                    encodeName('sub.xyz'),
                    account2.address,
                    FUSES.CAN_DO_EVERYTHING,
                    0,
                )
            await expect(tx)
                .to.emit(nameWrapper, 'TransferSingle')
                .withArgs(account2.address, EMPTY_ADDRESS, account2.address, nameHash, 1)

            expect(await nameWrapper.connect(account2).ownerOf(nameHash)).to.equal(account2.address)
            expect(await ens.owner(nameHash)).to.equal(nameWrapper.address)
        })


        it('Rewrapping a previously wrapped unexpired name retains PCC', async () => {
            const {nameWrapper, ens, account, account2, registrar} = await deployContract()

            const label = 'test'
            const labelHash = sha3(label)
            const wrappedTokenId = namehash(label + '.bic')
            const subLabel = 'sub'
            const subLabelHash = sha3(subLabel)
            const subWrappedTokenId = namehash(`${subLabel}.${label}.bic`)
            await registerSetupAndWrapName(registrar, nameWrapper, label, account.address, FUSES.CANNOT_UNWRAP, MAX_EXPIRY)
            // Confirm that the name is wrapped
            const parentExpiry = await registrar.nameExpires(labelHash)
            expect(await nameWrapper.ownerOf(wrappedTokenId)).to.equal(account.address)
            // NameWrapper.setSubnodeOwner to account2
            await nameWrapper.setSubnodeOwner(
                wrappedTokenId,
                subLabel,
                account2.address,
                FUSES.PARENT_CANNOT_CONTROL,
                MAX_EXPIRY,
            )
            // COnfirm fuses are set
            const [, fusesBefore] = await nameWrapper.getData(subWrappedTokenId)
            expect(fusesBefore).to.equal(FUSES.PARENT_CANNOT_CONTROL)
            await nameWrapper.connect(account2).unwrap(wrappedTokenId, subLabelHash, account2.address)
            await ens.connect(account2).setApprovalForAll(nameWrapper.address, true)
            await nameWrapper.connect(account2).wrap(
                encodeName(`${subLabel}.${label}.bic`),
                account2.address,
                EMPTY_ADDRESS,
            )
            const [, fuses, expiry] = await nameWrapper.getData(subWrappedTokenId)
            expect(fuses).to.equal(FUSES.PARENT_CANNOT_CONTROL)
            expect(expiry).to.equal(parentExpiry)
        })
    })

    describe('unwrap()', () => {
        it('Allows owner to unwrap name', async () => {
            const {nameWrapper, ens, account, account2, registrar} = await deployContract()

            await ens.setApprovalForAll(nameWrapper.address, true)
            await nameWrapper.wrap(encodeName('xyz'), account.address, EMPTY_ADDRESS)
            await nameWrapper.setSubnodeOwner(
                namehash('xyz'),
                'unwrapped',
                account.address,
                0,
                0,
            )

            const ownerOfWrappedXYZ = await nameWrapper.ownerOf(
                namehash('unwrapped.xyz'),
            )
            expect(ownerOfWrappedXYZ).to.equal(account.address)
            await nameWrapper.unwrap(namehash('xyz'), sha3('unwrapped'), account.address)

            //Transfers ownership in the ENS registry to the target address.
            expect(await ens.owner(namehash('unwrapped.xyz'))).to.equal(
                account.address,
            )
        })

        it('Allows an account authorised by the owner on the NFT Wrapper to unwrap a name', async () => {
            const {nameWrapper, ens, account, account2, registrar} = await deployContract()

            const labelHash = sha3('abc')

            // setup .abc with account2 as owner
            await ens.setSubnodeOwner(ROOT_NODE, labelHash, account.address)

            await ens.setApprovalForAll(nameWrapper.address, true)

            // wrap using account
            await nameWrapper.wrap(encodeName('abc'), account.address, EMPTY_ADDRESS)
            await nameWrapper.setApprovalForAll(account2.address, true)
            const ownerOfWrapperAbc = await nameWrapper.ownerOf(namehash('abc'))
            expect(ownerOfWrapperAbc).to.equal(account.address)

            //unwrap using account
            await nameWrapper.unwrap(ROOT_NODE, sha3('abc'), account2.address)
            expect(await ens.owner(namehash('abc'))).to.equal(account2.address)
            expect(await nameWrapper.ownerOf(namehash('abc'))).to.equal(EMPTY_ADDRESS)
        })

        it('Will not unwrap .bic 2LDs.', async () => {
            const {nameWrapper, ens, account, account2, registrar} = await deployContract()

            const label = 'unwrapped'
            const labelHash = sha3(label)

            await registrar.register(labelHash, account.address, 84600)

            //allow the restricted name wrappper to transfer the name to itself and reclaim it
            await registrar.setApprovalForAll(nameWrapper.address, true)

            await nameWrapper.wrapBIC2LD(label, account.address, 0, 0, EMPTY_ADDRESS)
            const ownerOfWrappedBIC = await nameWrapper.ownerOf(
                namehash('unwrapped.bic'),
            )
            expect(ownerOfWrappedBIC).to.equal(account.address)
            await expect(
                nameWrapper.unwrap(namehash('bic'), sha3('unwrapped'), account.address),
            ).to.be.revertedWithCustomError(nameWrapper, 'IncompatibleParent')
        })


        it('Will allow to unwrap a name with the CANNOT_UNWRAP fuse burned if expired', async () => {
            const {nameWrapper, ens, account, account2, registrar} = await deployContract()

            const label = 'awesome'
            const labelHash = sha3(label)
            await registrar.register(labelHash, account.address, 84600)
            await ens.setSubnodeOwner(
                namehash('awesome.bic'),
                sha3('sub'),
                account.address,
            )
            await registrar.setApprovalForAll(nameWrapper.address, true)

            await nameWrapper.wrapBIC2LD(
                'awesome',
                account.address,
                FUSES.PARENT_CANNOT_CONTROL | FUSES.CANNOT_UNWRAP,
                MAX_EXPIRY,
                EMPTY_ADDRESS,
            )

            await ens.setApprovalForAll(nameWrapper.address, true)

            nameWrapper.setSubnodeOwner(
                namehash('awesome.bic'),
                'sub',
                account.address,
                FUSES.PARENT_CANNOT_CONTROL | FUSES.CANNOT_UNWRAP,
                0,
            )

            expect(await ens.owner(namehash('sub.awesome.bic'))).to.equal(
                nameWrapper.address,
            )

            await nameWrapper.unwrap(
                namehash('awesome.bic'),
                sha3('sub'),
                account.address,
            )

            expect(await ens.owner(namehash('sub.awesome.bic'))).to.equal(
                account.address,
            )
        })
    })

    describe('wrapBIC2LD()', () => {
        const label = 'wrapped2'
        const labelHash = sha3(label)
        const nameHash = namehash(label + '.bic')
        it('wraps a name if sender is owner', async () => {
            const {nameWrapper, ens, account, account2, registrar} = await deployContract()

            await registrar.register(labelHash, account.address, 84600)

            //allow the restricted name wrappper to transfer the name to itself and reclaim it
            await registrar.setApprovalForAll(nameWrapper.address, true)

            expect(await nameWrapper.ownerOf(nameHash)).to.equal(EMPTY_ADDRESS)

            await nameWrapper.wrapBIC2LD(
                label,
                account.address,
                FUSES.CAN_DO_EVERYTHING,
                0,
                EMPTY_ADDRESS,
            )

            //make sure reclaim claimed ownership for the wrapper in registry

            expect(await ens.owner(nameHash)).to.equal(nameWrapper.address)

            //make sure owner in the wrapper is the user

            expect(await nameWrapper.ownerOf(nameHash)).to.equal(account.address)

            // make sure registrar ERC721 is owned by Wrapper

            expect(await registrar.ownerOf(labelHash)).to.equal(
                nameWrapper.address,
            )
        })


        it('Can re-wrap a name that was wrapped has already expired even if CANNOT_TRANSFER was burned', async () => {
            const {nameWrapper, ens, account, account2, registrar} = await deployContract()

            const DAY = 60 * 60 * 24
            const GRACE_PERIOD = 90
            await registrar.register(labelHash, account.address, DAY)
            await registrar.setApprovalForAll(nameWrapper.address, true)
            await nameWrapper.wrapBIC2LD(
                label,
                account.address,
                FUSES.CANNOT_UNWRAP | FUSES.CANNOT_TRANSFER,
                0,
                EMPTY_ADDRESS,
            )
            await advanceTime(DAY * GRACE_PERIOD + DAY + 1)
            await mine()

            expect(await registrar.available(labelHash)).to.equal(true)

            await registrar.connect(account2).register(labelHash, account2.address, DAY)
            expect(await registrar.ownerOf(labelHash)).to.equal(account2.address)
            await registrar.connect(account2).setApprovalForAll(nameWrapper.address, true)
            const tx = await nameWrapper.connect(account2).wrapBIC2LD(
                label,
                account2.address,
                FUSES.CAN_DO_EVERYTHING,
                0,
                EMPTY_ADDRESS,
            )

            await expect(tx)
                .to.emit(nameWrapper, 'NameUnwrapped')
                .withArgs(namehash('wrapped2.bic'), EMPTY_ADDRESS)
            await expect(tx)
                .to.emit(nameWrapper, 'TransferSingle')
                .withArgs(account2.address, account.address, EMPTY_ADDRESS, nameHash, 1)
            await expect(tx)
                .to.emit(nameWrapper, 'NameWrapped')
                .withArgs(
                    namehash('wrapped2.bic'),
                    encodeName('wrapped2.bic'),
                    account2.address,
                    FUSES.PARENT_CANNOT_CONTROL,
                    0,
                )
            await expect(tx)
                .to.emit(nameWrapper, 'TransferSingle')
                .withArgs(account2.address, EMPTY_ADDRESS, account2.address, nameHash, 1)

            expect(await nameWrapper.connect(account2).ownerOf(nameHash)).to.equal(account2.address)
            expect(await registrar.ownerOf(labelHash)).to.equal(
                nameWrapper.address,
            )
        })
    })
})
