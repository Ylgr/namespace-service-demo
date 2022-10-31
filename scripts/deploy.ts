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
  console.log('2')

  const baseRegistrar = await deploy(
      'BaseRegistrarImplementation',
      ens.address,
      namehash('bic'),
  )

  const metaDataservice = await deploy('StaticMetadataService','https://ens.domains')
  console.log('3')
    const nameWrapper = await deploy(
        'NameWrapper',
        ens.address,
        baseRegistrar.address,
        metaDataservice.address,
    )
  console.log('3.5')


  const reverseRegistrar = await deploy('ReverseRegistrar', ens.address)
  console.log('4')

  const EMPTY_BYTES = '0x0000000000000000000000000000000000000000000000000000000000000000'
  await ens.setSubnodeOwner(EMPTY_BYTES, sha3('bic'), baseRegistrar.address)

  const bicToken = await deploy('BicToken')
  console.log('5')

  const controller = await deploy(
      'BICRegistrarController',
      baseRegistrar.address,
      bicToken.address,
      600,
      86400,
      reverseRegistrar.address,
      nameWrapper.address,
  )

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
  console.log('7')

  await ens.setSubnodeOwner(EMPTY_BYTES, sha3('reverse'), signers[0].address)
  console.log('8')

  await ens.setSubnodeOwner(
      namehash('reverse'),
      sha3('addr'),
      reverseRegistrar.address
  )
  console.log(`Verifying contract on Etherscan...`);

  await run(`verify:verify`, {
    address: ens.address,
    constructorArguments: [],
  });

  await run(`verify:verify`, {
    address: baseRegistrar.address,
    constructorArguments: [],
  });

  await run(`verify:verify`, {
    address: metaDataservice.address,
    constructorArguments: [],
  });

  await run(`verify:verify`, {
    address: nameWrapper.address,
    constructorArguments: [],
  });

  await run(`verify:verify`, {
    address: reverseRegistrar.address,
    constructorArguments: [],
  });

  await run(`verify:verify`, {
    address: bicToken.address,
    constructorArguments: [],
  });

  await run(`verify:verify`, {
    address: controller.address,
    constructorArguments: [],
  });

  await run(`verify:verify`, {
    address: resolver.address,
    constructorArguments: [],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
