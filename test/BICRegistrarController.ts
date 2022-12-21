import {ethers} from "hardhat";
import {namehash} from "ethers/lib/utils";
import {sha3, toBN} from "web3-utils";
import {BN} from "bn.js";
import {expect} from "chai";
import {advanceTime} from "./evm";

const deploy = async (contractName, ...args) => {
    const artifact = await ethers.getContractFactory(contractName)
    return artifact.deploy(...args)
}

const DAYS = 24 * 60 * 60
const REGISTRATION_TIME = 28 * DAYS
// const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3 * DAYS
const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
const EMPTY_BYTES =
    '0x0000000000000000000000000000000000000000000000000000000000000000'
const MAX_EXPIRY = 2n ** 64n - 1n
const provider = ethers.provider

describe("BICRegistrarController", function () {
    let ens
    let resolver
    let resolver2 // resolver signed by accounts[1]
    let baseRegistrar
    let controller
    let controller2 // controller signed by accounts[1]
    let controller3 // controller signed by accounts[3]
    let priceOracle
    let reverseRegistrar
    let nameWrapper
    let callData
    let bicToken
    let bicToken2
    let bicToken3
    let signers
    let result
    const secret =
        '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'
    const secret2 =
        '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDE0'
    let ownerAccount // Account that owns the registrar
    let registrantAccount // Account that owns test names
    let registrantAccount3 // Account that owns test names
    let accounts = []

    before(async () => {
        signers = await ethers.getSigners()
        ownerAccount = await signers[0].getAddress()
        registrantAccount = await signers[1].getAddress()
        registrantAccount3 = await signers[3].getAddress()
        accounts = [ownerAccount, registrantAccount, signers[2].getAddress(), registrantAccount3]

        ens = await deploy('ENSRegistry')

        baseRegistrar = await deploy(
            'BaseRegistrarImplementation',
            ens.address,
            namehash('bic'),
        )
        const metaDataservice = await deploy('StaticMetadataService','https://ens.domains')

        nameWrapper = await deploy(
            'NameWrapper',
            ens.address,
            baseRegistrar.address,
            // ownerAccount,
            metaDataservice.address,
        )

        reverseRegistrar = await deploy('ReverseRegistrar', ens.address)

        await ens.setSubnodeOwner(EMPTY_BYTES, sha3('bic'), baseRegistrar.address)

        bicToken = await deploy('BicToken')
        bicToken2 = bicToken.connect(signers[1])
        bicToken3 = bicToken.connect(signers[3])
        controller = await deploy(
            'BICRegistrarController',
            baseRegistrar.address,
            bicToken.address,
            600,
            86400,
            reverseRegistrar.address,
            nameWrapper.address,
        )
        controller2 = controller.connect(signers[1])
        controller3 = controller.connect(signers[3])
        await baseRegistrar.addController(controller.address)
        await nameWrapper.setController(controller.address, true)
        await baseRegistrar.addController(nameWrapper.address)
        await reverseRegistrar.setController(controller.address, true)

        resolver = await deploy(
            'PublicResolver',
            ens.address,
            nameWrapper.address,
            controller.address,
            reverseRegistrar.address,
        )

        callData = [
            resolver.interface.encodeFunctionData('setAddr(bytes32,address)', [
                namehash('newconfigname.bic'),
                registrantAccount,
            ]),
            resolver.interface.encodeFunctionData('setText', [
                namehash('newconfigname.bic'),
                'url',
                'ethereum.com',
            ]),
        ]

        resolver2 = await resolver.connect(signers[1])

        await ens.setSubnodeOwner(EMPTY_BYTES, sha3('reverse'), accounts[0], {
            from: accounts[0],
        })
        await ens.setSubnodeOwner(
            namehash('reverse'),
            sha3('addr'),
            reverseRegistrar.address,
            { from: accounts[0] },
        )
    })

    beforeEach(async () => {
        result = await ethers.provider.send('evm_snapshot')
    })
    afterEach(async () => {
        await ethers.provider.send('evm_revert', [result])
    })


    async function registerName(
        name,
        txOptions = { value: BUFFERED_REGISTRATION_COST },
    ) {
        const commitment = await controller.makeCommitment(
            name,
            registrantAccount,
            REGISTRATION_TIME,
            secret,
            NULL_ADDRESS,
            [],
            false,
            0,
            MAX_EXPIRY,
        )
        const tx = await controller.commit(commitment)
        expect(await controller.commitments(commitment)).to.equal(
            (await provider.getBlock(tx.blockNumber)).timestamp,
        )

        await advanceTime((await controller.minCommitmentAge()).toNumber())
        const fee = txOptions.value;
        await bicToken.approve(controller.address, txOptions.value)
        const tx2 = await controller.register(
            name,
            registrantAccount,
            REGISTRATION_TIME,
            secret,
            NULL_ADDRESS,
            [],
            false,
            0,
            MAX_EXPIRY,
            fee,
        )

        return tx2
    }

    const checkLabels = {
        testing: true,
        longname12345678: true,
        sixsix: true,
        five5: true,
        four: true,
        iii: true,
        ii: false,
        i: false,
        '': false,

        // { ni } { hao } { ma } (chinese; simplified)
        你好吗: true,

        // { ta } { ko } (japanese; hiragana)
        たこ: false,

        // { poop } { poop } { poop } (emoji)
        '\ud83d\udca9\ud83d\udca9\ud83d\udca9': true,

        // { poop } { poop } (emoji)
        '\ud83d\udca9\ud83d\udca9': false,
    }

    it('should report label validity', async () => {
        for (const label in checkLabels) {
            expect(await controller.valid(label)).to.equal(checkLabels[label], label)
        }
    })


    it('should permit new registrations', async () => {
        const name = 'newname'
        const balanceBefore = await bicToken.balanceOf(controller.address)
        const nftBefore = await baseRegistrar.balanceOf(registrantAccount)
        console.log('nftBefore: ', nftBefore)
        const tx = await registerName(name)
        const block = await provider.getBlock(tx.blockNumber)
        await expect(tx)
            .to.emit(controller, 'NameRegistered')
            .withArgs(
                name,
                sha3(name),
                registrantAccount,
                REGISTRATION_TIME,
                0,
                block.timestamp + REGISTRATION_TIME,
            )
        // nameWrapper.
        const nftAfter = await baseRegistrar.balanceOf(registrantAccount)
        console.log('registrantAccount: ', registrantAccount)
        console.log('nftAfter: ', nftAfter)
        expect(
            (await bicToken.balanceOf(controller.address)) - balanceBefore,
        ).to.equal(REGISTRATION_TIME)
    })

    it('should permit new registrations with resolver and records', async () => {
        var commitment = await controller2.makeCommitment(
            'newconfigname',
            registrantAccount,
            REGISTRATION_TIME,
            secret,
            resolver.address,
            callData,
            false,
            0,
            0,
        )
        var tx = await controller2.commit(commitment)
        expect(await controller2.commitments(commitment)).to.equal(
            (await ethers.provider.getBlock(tx.blockNumber)).timestamp,
        )

        await advanceTime((await controller2.minCommitmentAge()).toNumber())
        var balanceBefore = await bicToken.balanceOf(controller.address)
        await bicToken.transfer(accounts[1], BUFFERED_REGISTRATION_COST)
        await bicToken2.approve(controller.address, BUFFERED_REGISTRATION_COST)
        var tx2 = await controller2.register(
            'newconfigname',
            registrantAccount,
            REGISTRATION_TIME,
            secret,
            resolver.address,
            callData,
            false,
            0,
            0,
            BUFFERED_REGISTRATION_COST,
        )

        const block = await provider.getBlock(tx2.blockNumber)

        await expect(tx2)
            .to.emit(controller, 'NameRegistered')
            .withArgs(
                'newconfigname',
                sha3('newconfigname'),
                registrantAccount,
                REGISTRATION_TIME,
                0,
                block.timestamp + REGISTRATION_TIME,
            )

        expect(
            (await bicToken.balanceOf(controller.address)) - balanceBefore,
        ).to.equal(REGISTRATION_TIME)

        var nodehash = namehash('newconfigname.bic')
        expect(await ens.resolver(nodehash)).to.equal(resolver.address)
        expect(await ens.owner(nodehash)).to.equal(nameWrapper.address)
        expect(await baseRegistrar.ownerOf(sha3('newconfigname'))).to.equal(
            nameWrapper.address,
        )
        expect(await resolver['addr(bytes32)'](nodehash)).to.equal(
            registrantAccount,
        )
        expect(await resolver['text'](nodehash, 'url')).to.equal('ethereum.com')
        expect(await nameWrapper.ownerOf(nodehash)).to.equal(registrantAccount)

        const nftOwner = await baseRegistrar.ownerOf(sha3('newconfigname')); //12907018822474687872475583629413466407613283555302029277224239900530719130114
        console.log('nftOwner: ', nftOwner)
        const erc1155Owner = await nameWrapper.ownerOf(namehash('newconfigname.bic')); //21112947957856758576096972903056240599071127168927632653066871130307181825571
        console.log('erc1155Owner: ', erc1155Owner)
        const nameAvailable = await controller.available('newconfigname')
        console.log('nameAvailable: ', nameAvailable)

        await advanceTime(REGISTRATION_TIME + 1000);
        const nameAvailable2 = await controller.available('newconfigname')
        console.log('nameAvailable2: ', nameAvailable2)
        // var commitment2 = await controller2.makeCommitment(
        //     'newconfigname',
        //     registrantAccount,
        //     REGISTRATION_TIME,
        //     secret2,
        //     resolver.address,
        //     callData,
        //     false,
        //     0,
        //     0,
        // )
        // var tx3 = await controller2.commit(commitment2)

        const nftOwner2 = await baseRegistrar.ownerOf(sha3('newconfigname')); //12907018822474687872475583629413466407613283555302029277224239900530719130114
        console.log('nftOwner: ', nftOwner)
        const erc1155Owner2 = await nameWrapper.ownerOf(namehash('newconfigname.bic')); //21112947957856758576096972903056240599071127168927632653066871130307181825571
        console.log('erc1155Owner: ', erc1155Owner)

        expect(await ens.owner(nodehash)).to.equal(nameWrapper.address)


    })

})
