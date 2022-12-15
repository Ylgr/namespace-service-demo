import {Button, InputGroup} from "react-bootstrap";
import Form from "react-bootstrap/Form";
import React, {useState} from "react";
import { ethers } from "ethers";
import ENS from './abi/ENS.json';
import NameWrapper from './abi/NameWrapper.json';
import PublicResolver from './abi/PublicResolver.json';
import ReverseRegistrar from './abi/ReverseRegistrar.json';
import StaticMetadataService from './abi/StaticMetadataService.json';
import BaseRegistrarImplementation from './abi/BaseRegistrarImplementation.json';
import BIC from './abi/BIC.json';
import BICRegistrarController from './abi/BICRegistrarController.json';
import { useAccount } from 'wagmi';

function NameSpace() {

    const DAYS = 24 * 60 * 60
    const REGISTRATION_TIME = 28 * DAYS
// const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME + 3 * DAYS
    const BUFFERED_REGISTRATION_COST = REGISTRATION_TIME
    const secret =
        '0x0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF'
    // @ts-ignore
    const MAX_EXPIRY = 2n ** 64n - 1n

    // @ts-ignore
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const ens = new ethers.Contract('0xb6853Db982BeB4eDbDd7f8406f8482E6d0604cdA', ENS, signer)
    const baseRegistrarImplementation = new ethers.Contract('0x537b587a058c5c962c12719AdB541a0E95a1a452', BaseRegistrarImplementation, signer)
    const staticMetadataService = new ethers.Contract('0x5786e2C4182D788fa8BA329DcaFc9bFCB9B33F3C', StaticMetadataService, signer)
    const nameWrapper = new ethers.Contract('0xee87BA582519C11b2541Cc0aaE7a02E37B647784', NameWrapper, signer)
    const reverseRegistrar = new ethers.Contract('0x052D39f80067dD366674ab55bfEC43a237A47257', ReverseRegistrar, signer)
    const bic = new ethers.Contract('0x9582b8f29EeAB3658f286530f0d76484C3D9FEd5', BIC, signer)
    const bicRegistrarController = new ethers.Contract('0xD9Aff191BbAF00F3f8F8564D8A8f8F7D56BFDAd9', BICRegistrarController, signer)
    const publicResolver = new ethers.Contract('0x87cb9e58b90490aB27f2dd60360058ccF0cCF734', PublicResolver, signer)

    const { address, isConnected } = useAccount()
    const [bicOwner, setBicOwner] = useState('')
    const [rootOwner, setRootOwner] = useState('')
    const [name, setName] = useState('')
    const [price, setPrice] = useState('0')

    async function registerName(
        name: string,
        txOptions = { value: BUFFERED_REGISTRATION_COST },
    ) {
        const commitment = await bicRegistrarController.makeCommitment(
            name,
            address,
            REGISTRATION_TIME,
            secret,
            ethers.constants.AddressZero,
            [],
            false,
            0,
            MAX_EXPIRY,
        )
        const tx = await bicRegistrarController.commit(commitment)

        const fee = txOptions.value;
        // await bic.approve(bicRegistrarController.address, ethers.constants.MaxUint256)
        const tx2 = await bicRegistrarController.register(
            name,
            address,
            REGISTRATION_TIME,
            secret,
            ethers.constants.AddressZero,
            [],
            false,
            0,
            MAX_EXPIRY,
            fee,
        )
        console.log('tx2: ', tx2)
        // return tx2
    }

    async function getPriceAndSetName(newString: string) {
        console.log('newString: ', newString)
        if(newString.length !== name.length) {
            bicRegistrarController.rentPrice(newString, REGISTRATION_TIME).then(
                (price: any) =>
                    setPrice(ethers.utils.formatEther(price.base.toString()))
            )
        }
        setName(newString)
    }

    if(isConnected) {
        const bicNode = ethers.utils.namehash('bic')
        ens.owner(bicNode).then((addr: string) => setBicOwner(addr))
        ens.owner(ethers.constants.HashZero).then((addr: string) => setRootOwner(addr))
    }
    return (
        <>
            <h1>Namespace Admin:</h1>
            <h2>Root owner <a href={`https://testnet.bscscan.com/address/${rootOwner}`}>{rootOwner}</a></h2>
            <h2>Bic owner <a href={`https://testnet.bscscan.com/address/${bicOwner}`}>{bicOwner}</a></h2>
            <InputGroup className="mb-3">
                <InputGroup.Text id="basic-addon3">
                    Namespace ({price} BIC):
                </InputGroup.Text>
                <Form.Control id="basic-url" aria-describedby="basic-addon3" value={name} onChange={(event) => getPriceAndSetName(event.target.value)}/>
                <Button onClick={() => registerName(name)}>Create</Button>
            </InputGroup>
        </>
    )
}
export default NameSpace;
