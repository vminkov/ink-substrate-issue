import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { readFile } from "fs/promises";
import { CodePromise, Abi, ContractPromise } from '@polkadot/api-contract';


const testingContractWasmPath = '../target/ink/testing.contract';
const testingContractAbiPath = '../target/ink/metadata.json';
const testingContractWasm = await readFile(testingContractWasmPath).then(json => JSON.parse(json)).catch(() => null);
const testingContractAbi = await readFile(testingContractAbiPath).then(json => JSON.parse(json)).catch(() => null);

const subContractWasmPath = '../target/ink/sub/sub.contract';
const subContractAbiPath = '../target/ink/sub/metadata.json';
const subContractWasm = await readFile(subContractWasmPath).then(json => JSON.parse(json)).catch(() => null);
const subContractAbi = await readFile(subContractAbiPath).then(json => JSON.parse(json)).catch(() => null);

const wsProvider = new WsProvider('ws://127.0.0.1:9944');
const api = await ApiPromise.create({provider: wsProvider,});

let testingContract, subContract;

const keyring = new Keyring({type: 'sr25519', ss58Format: 42});
const bob = keyring.addFromUri('//Bob', {name: 'Bob default'});
const alice = keyring.addFromUri('//Alice', {name: 'Alice default'});

describe('testing', function() {
    it('should be able to instantiate by calling the subcontract constructor from another constructor', async () => {
        let offset = 0;
        const subContractInitValue = 5;

        let {subContract, testingContract} = await initializeContractsBase(offset, subContractInitValue);

        await new Promise((resolve => {
            testingContract.query.getFromConstructor(bob.address, {gasLimit: -1, value: 0})
                .then(({result, output}) => {
                    console.log('constructor instantiated instance subcontract value ', JSON.stringify(output));
                    resolve();
                })
        }))
    }).timeout(18600);

    async function initializeContractsBase(offset, subContractInitValue) {
        console.log("deploying the sub contract...");

        subContract = await instantiateContract(subContractWasm.source.wasm, subContractAbi, bob, subContractInitValue);
        console.log("deploying the testing contract...");
        let version = offset + Math.round(Math.random() * 100);
        testingContract = await instantiateContract(testingContractWasm.source.wasm, testingContractAbi, alice, version, subContractAbi.source.hash);

        await new Promise((resolve => {
            subContract.query.get(bob.address, {gasLimit: -1, value: 0})
                .then(({result, output}) => {
                    console.log('first instance subcontract value ', JSON.stringify(output));
                    resolve();
                })
        }))
        return {subContract, testingContract};
    }

    it('should be able to instantiate by calling the subcontract constructor from a method', async () => {
        const offset = 100;
        const subContractInitValue = 6;

        let {subContract, testingContract} = await initializeContractsBase(offset, subContractInitValue);

        let unsub;
        let params = await prepareInstantiateCallParams();
        let version = (offset * 2) + Math.round(Math.random() * 100);
        let {codeHash, contractAddress} = await new Promise((resolve, reject) => {
            testingContract.tx.deploy(params, version, subContractAbi.source.hash)
                .signAndSend(alice, instantiateCallback(testingContractAbi, resolve, reject))
                .then(unsubscribe => unsub = unsubscribe);
        });
        unsub && unsub();

        await new Promise((resolve => {
            testingContract.query.getFromMethod(bob.address, {gasLimit: -1, value: 0})
                .then(({result, output}) => {
                    console.log('method instantiated instance subcontract value ', JSON.stringify(output));
                    resolve();
                })
        }))
    }).timeout(18600);
})

async function prepareInstantiateCallParams() {
    const tombstoneDeposit = await api.consts.contracts.tombstoneDeposit;
    let constructorExecutionGas = 29597086370000;
    let value = parseInt(tombstoneDeposit) * 10;
    const salt = Array.from({length: 5}, () => Math.floor(Math.random() * 32));
    let params = {gasLimit: constructorExecutionGas, salt: salt, value: value};
    return params;
}

async function instantiateContract(jsonWasm, jsonAbi, deployerKeys, ...constructorParams) {
    const code = new CodePromise(api, jsonAbi, jsonWasm);

    console.log(`deploying ${jsonAbi.contract.name} with params ${constructorParams}`)

    let unsub;
    let params = await prepareInstantiateCallParams();
    let {codeHash, contractAddress} = await new Promise((resolve, reject) => {
        let codeHash, contractAddress;
        code.tx.new(params, ...constructorParams)
            .signAndSend(deployerKeys, instantiateCallback(jsonAbi, resolve, reject))
            .then((unsubscribe) => {
                unsub = unsubscribe;
            })
    });
    unsub && unsub();

    const abi = new Abi(jsonAbi, api.registry);
    return new ContractPromise(api, abi, contractAddress);
}

function instantiateCallback(jsonAbi, resolve, reject) {
    let codeHash, contractAddress;
    return ({status, events}) => {
        if (status.isInBlock) {
            events.forEach(({event}) => {
                if (api.events.system.ExtrinsicFailed.is(event)) {
                    let {data: [error, info]} = event;
                    if (error.isModule) {
                        const decoded = api.registry.findMetaError(error.asModule);
                        const {documentation, method, section} = decoded;

                        console.log(`${section}.${method}: ${documentation.join(' ')}`);
                        if (api.errors.contracts.DuplicateContract.is(error.asModule)) {
                            console.log("salt didnt work")
                        }
                        if (api.errors.contracts.ContractTrapped.is(error.asModule)) {
                            console.log("trapped");
                            reject();
                        }
                    } else {
                        console.log(error.toString());
                    }
                } else if (api.events.contracts.CodeStored.is(event)) {
                    let {data: [code_hash]} = event;
                    codeHash = code_hash;
                } else if (api.events.contracts.Instantiated.is(event)) {
                    let {data: [deployer, contract]} = event;
                    contractAddress = contract;
                }
            })
            if (contractAddress) {
                console.log(`${jsonAbi.contract.name} ch ${codeHash} ca ${contractAddress}`)
                resolve({codeHash, contractAddress});
            }
        }
    };
}