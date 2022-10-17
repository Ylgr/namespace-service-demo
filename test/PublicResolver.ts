// import {ethers} from "hardhat";
// import namehash from "eth-ens-namehash";
// import {expect} from "chai";
//
// describe("Resolver", function () {
//     const EMPTY_ADDRESS = '0x0000000000000000000000000000000000000000'
//
//     const deployContract = async () => {
//         const ENS = await ethers.getContractFactory('ENSRegistry');
//         const ens = await ENS.deploy();
//         const signers = await ethers.getSigners();
//
//         const NameWrapper = await ethers.getContractFactory('NameWrapper');
//         const nameWrapper = await NameWrapper.deploy();
//
//         const PublicResolver = await ethers.getContractFactory('PublicResolver');
//         const publicResolver = await PublicResolver.deploy(
//             ens.address,
//             nameWrapper.address,
//             accounts[9], // trusted contract
//             EMPTY_ADDRESS
//         );
//
//         return {ens, accounts: signers, publicResolver}
//
//     }
//
//     describe('supportsInterface function', async () => {
//         it('supports known interfaces', async () => {
//             const { publicResolver } = await deployContract()
//             expect(await publicResolver.supportsInterface('0x3b3b57de')).to.be.true // IAddrResolver
//             expect(await publicResolver.supportsInterface('0xf1cb7e06')).to.be.true // IAddressResolver
//             expect(await publicResolver.supportsInterface('0x691f3431')).to.be.true // INameResolver
//             expect(await publicResolver.supportsInterface('0x2203ab56')).to.be.true // IABIResolver
//             expect(await publicResolver.supportsInterface('0xc8690233')).to.be.true // IPubkeyResolver
//             expect(await publicResolver.supportsInterface('0x59d1d43c')).to.be.true // ITextResolver
//             expect(await publicResolver.supportsInterface('0xbc1c58d1')).to.be.true // IContentHashResolver
//             expect(await publicResolver.supportsInterface('0x01ffc9a7')).to.be.true // IInterfaceResolver
//         })
//     })
// })
