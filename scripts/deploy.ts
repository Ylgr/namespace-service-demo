import { ethers, run } from "hardhat";
import {namehash} from "ethers/lib/utils";
import {sha3} from "web3-utils";

const deploy = async (contractName: string, ...args: any[]) => {
  const artifact = await ethers.getContractFactory(contractName)
  return artifact.deploy(...args)
}

async function main() {
  console.log('1')
  const signers = await ethers.getSigners()

  const ens = await deploy('ENSRegistry')
  await ens.deployed();
  console.log('2')
  try {
    await run(`verify:verify`, {
      address: ens.address,
      constructorArguments: [],
    });
  } catch (e) {
    // @ts-ignore
    console.error(e.message)
  }

  const baseRegistrar = await deploy(
      'BaseRegistrarImplementation',
      ens.address,
      namehash('bic'),
  )
  await baseRegistrar.deployed()
  try {
    await run(`verify:verify`, {
      address: baseRegistrar.address,
      constructorArguments: [
        ens.address,
        namehash('bic'),
      ],
    });
  } catch (e) {
    // @ts-ignore
    console.error(e.message)
  }
  const metaDataservice = await deploy('StaticMetadataService','https://ens.domains')
  await metaDataservice.deployed()
  try {
    await run(`verify:verify`, {
      address: metaDataservice.address,
      constructorArguments: [
        'https://ens.domains'
      ],
    });
  } catch (e) {
    // @ts-ignore
    console.error(e.message)
  }
  console.log('3')
    const nameWrapper = await deploy(
        'NameWrapper',
        ens.address,
        baseRegistrar.address,
        metaDataservice.address,
    )
  await nameWrapper.deployed()
  try {
    await run(`verify:verify`, {
      address: nameWrapper.address,
      constructorArguments: [
        ens.address,
        baseRegistrar.address,
        metaDataservice.address,
      ],
    });
    console.log('3.5')

  } catch (e) {
    // @ts-ignore
    console.error(e.message)
  }

  const reverseRegistrar = await deploy('ReverseRegistrar', ens.address)
  await reverseRegistrar.deployed()
  try {
    await run(`verify:verify`, {
      address: reverseRegistrar.address,
      constructorArguments: [ens.address],
    });
    console.log('4')

  } catch (e) {
    // @ts-ignore
    console.error(e.message)
  }
  const EMPTY_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000'
  await ens.setSubnodeOwner(EMPTY_BYTES, sha3('bic'), baseRegistrar.address)

  const bicToken = await deploy('BicToken')
  await bicToken.deployed()
  console.log('5')
  try {
    await run(`verify:verify`, {
      address: bicToken.address,
      constructorArguments: [],
    });

  } catch (e) {
    // @ts-ignore
    console.error(e.message)
  }
  const controller = await deploy(
      'BICRegistrarController',
      baseRegistrar.address,
      bicToken.address,
      600,
      86400,
      reverseRegistrar.address,
      nameWrapper.address,
  )
  await controller.deployed()
  try {
    await run(`verify:verify`, {
      address: controller.address,
      constructorArguments: [
        baseRegistrar.address,
        bicToken.address,
        600,
        86400,
        reverseRegistrar.address,
        nameWrapper.address,
      ],
    });

  } catch (e) {
    // @ts-ignore
    console.error(e.message)
  }
  await baseRegistrar.addController(controller.address)
  await nameWrapper.setController(controller.address, true)
  await baseRegistrar.addController(nameWrapper.address)
  await reverseRegistrar.setController(controller.address, true)
  console.log('6')

  const resolver = await deploy(
      'PublicResolver',
      ens.address,
      nameWrapper.address,
      controller.address,
      reverseRegistrar.address,
  )
  await resolver.deployed()
  try {
    await run(`verify:verify`, {
      address: resolver.address,
      constructorArguments: [
        ens.address,
        nameWrapper.address,
        controller.address,
        reverseRegistrar.address,
      ],
    });
    console.log('7')

  } catch (e) {
    // @ts-ignore
    console.error(e.message)
  }
  await ens.setSubnodeOwner(EMPTY_BYTES, sha3('reverse'), signers[0].address)
  console.log('8')

  await ens.setSubnodeOwner(
      namehash('reverse'),
      sha3('addr'),
      reverseRegistrar.address
  )
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
