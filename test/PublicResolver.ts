import {ethers} from "hardhat";
import {expect} from "chai";
import {namehash} from "ethers/lib/utils";
import {sha3} from "web3-utils";
const ROOT_NODE = '0x0000000000000000000000000000000000000000000000000000000000000000'

describe("Resolver", function () {
    const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'

    const deployContract = async () => {
        const ENS = await ethers.getContractFactory('ENSRegistry');
        const ens = await ENS.deploy();
        const accounts = await ethers.getSigners();

        const PublicResolver = await ethers.getContractFactory('PublicResolver');
        const resolver = await PublicResolver.deploy(
            ens.address,
            accounts[9].address, // trusted contract
            EMPTY_ADDRESS
        );
        await ens.setSubnodeOwner(ROOT_NODE, sha3('bic'), accounts[0].address)
        return {ens, accounts, resolver}

    }

    describe('supportsInterface function', async () => {
        it('supports known interfaces', async () => {
            const {resolver} = await deployContract()
            expect(await resolver.supportsInterface('0x3b3b57de')).to.be.true // IAddrResolver
            expect(await resolver.supportsInterface('0xf1cb7e06')).to.be.true // IAddressResolver
            expect(await resolver.supportsInterface('0x691f3431')).to.be.true // INameResolver
            expect(await resolver.supportsInterface('0x2203ab56')).to.be.true // IABIResolver
            expect(await resolver.supportsInterface('0xc8690233')).to.be.true // IPubkeyResolver
            expect(await resolver.supportsInterface('0x59d1d43c')).to.be.true // ITextResolver
            expect(await resolver.supportsInterface('0xbc1c58d1')).to.be.true // IContentHashResolver
            expect(await resolver.supportsInterface('0x01ffc9a7')).to.be.true // IInterfaceResolver
        })
    })
    const node = namehash('bic')
    describe('addr', async () => {
        it('permits setting address by owner', async () => {
            const {resolver, accounts} = await deployContract()
            const tx = await resolver['setAddr(bytes32,address)'](
                node,
                accounts[1].address
            )

            expect(await resolver['addr(bytes32)'](node)).to.be.equal(accounts[1].address)
        })

        it('permits setting and retrieving addresses for other coin types', async () => {
            const {resolver, accounts} = await deployContract()

            await resolver['setAddr(bytes32,uint256,bytes)'](
                node,
                123,
                accounts[1].address
            )
            expect(
                await resolver['addr(bytes32,uint256)'](node, 123)
            ).to.be.equal(accounts[1].address.toLowerCase())
        })
    })

    describe('name', async () => {
        it('permits setting name by owner', async () => {
            const {resolver, accounts} = await deployContract()

            await resolver.setName(node, 'name1')
            expect(await resolver.name(node)).to.be.equal('name1')
        })
    })

    describe('pubkey', async () => {
        it('can overwrite previously set value', async () => {
            const {resolver, accounts} = await deployContract()

            await resolver.setPubkey(
                node,
                '0x1000000000000000000000000000000000000000000000000000000000000000',
                '0x2000000000000000000000000000000000000000000000000000000000000000'
            )

            let x =
                '0x3000000000000000000000000000000000000000000000000000000000000000'
            let y =
                '0x4000000000000000000000000000000000000000000000000000000000000000'
            await resolver.setPubkey(node, x, y)

            let result = await resolver.pubkey(node)
            expect(result[0]).to.be.equal(x)
            expect(result[1]).to.be.equal(y)
        })
    })

    describe('ABI', async () => {
        it('returns a contentType of 0 when nothing is available', async () => {
            const {resolver, accounts} = await deployContract()

            let result = await resolver.ABI(node, 0xffffffff)
            expect(result[0]).to.be.equal(0)
        })

        it('returns an ABI after it has been set', async () => {
            const {resolver, accounts} = await deployContract()
            await resolver.setABI(node, 0x1, '0x666f6f')
            let result = await resolver.ABI(node, 0xffffffff)
            expect([result[0].toNumber(), result[1]]).to.be.deep.equal([1, '0x666f6f'])
        })
    })

    describe('text', async () => {
        const url = 'https://ethereum.org'
        const url2 = 'https://github.com/ethereum'
        it('permits setting text by owner', async () => {
            const {resolver, accounts} = await deployContract()

            await resolver.setText(node, 'url', url)
            expect(await resolver.text(node, 'url')).to.be.equal(url)
        })
    })

    describe('contenthash', async () => {
        it('permits setting contenthash by owner', async () => {
            const {resolver, accounts} = await deployContract()

            await resolver.setContenthash(
                node,
                '0x0000000000000000000000000000000000000000000000000000000000000001'
            )
            expect(
                await resolver.contenthash(node)
            ).to.be.equal(
                '0x0000000000000000000000000000000000000000000000000000000000000001'
            )
        })
    })
    describe('implementsInterface', async () => {
        it('permits setting interface by owner', async () => {
            const {resolver, accounts} = await deployContract()


            await resolver.setInterface(node, '0x12345678', accounts[0].address)
            expect(
                await resolver.interfaceImplementer(node, '0x12345678')
            ).to.be.equal(
                accounts[0].address
            )
        })
    })
    describe('authorisations', async () => {
        it('permits authorisations to be set', async () => {
            const {resolver, accounts} = await deployContract()

            await resolver.setApprovalForAll(accounts[1].address, true)
            expect(
                await resolver.isApprovedForAll(accounts[0].address, accounts[1].address),
            ).to.be.equal(
                true
            )
        })
    })

    describe('multicall', async () => {
        it('allows setting multiple fields', async () => {
            const {resolver, accounts} = await deployContract()

            const addrSet = resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [node, accounts[1].address])
            const textSet = resolver.interface.encodeFunctionData('setText', [node, 'url', 'https://ethereum.org/'])
            const tx = await resolver.multicall([addrSet, textSet])

            expect(await resolver['addr(bytes32)'](node)).to.be.equal(accounts[1].address)
            expect(await resolver.text(node, 'url')).to.be.equal('https://ethereum.org/')
        })
    })
})
