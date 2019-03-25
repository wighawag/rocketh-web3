
function setup(rocketh, Web3) {
    if(!rocketh) {
        throw new Error("rocketh-web3 expect to be passed rocketh module as first argument");
    }
    if(!Web3) {
        throw new Error("rocketh-web3 expect to be passed Web3 module as second argument");
    }
    const web3 = new Web3(rocketh.ethereum);

    const deploy = async(name, options, contractName, ...args) => {
        const ContractInfo = rocketh.contractInfo(contractName);
        const Contract = new web3.eth.Contract(ContractInfo.abi);
        const promiEvent = Contract.deploy({data:'0x' + ContractInfo.evm.bytecode.object, arguments: args}).send(options);
        let transactionHash;
        promiEvent.once('transactionHash', (txHash) => {
            transactionHash = txHash;
        });
        const contract = await promiEvent;
        rocketh.registerDeployment(name, { 
            contractInfo: ContractInfo, 
            address: contract.options.address,
            transactionHash,
            args
        });
        return {contract, transactionHash};
    }

    const deployIfNeverDeployed = async (name, options, contractName, ...args) => {
        const deployment = rocketh.deployment(name);
        if(!deployment) {
            return deploy(name, options, contractName, ...args);
        } else {
            return getDeployedContractWithTransactionHash(name);
        }
    }

    const fetchIfDifferent = async (fieldsToCompare, name, options, contractName, ...args) => {
        const deployment = rocketh.deployment(name);
        if(deployment) {
            const transaction = await web3.eth.getTransaction(deployment.transactionHash);
            if(transaction) {
                const ContractInfo = rocketh.contractInfo(contractName);
                const Contract = new web3.eth.Contract(ContractInfo.abi);

                const compareOnData = fieldsToCompare.indexOf('data') != -1;
                const compareOnInput = fieldsToCompare.indexOf('input') != -1;

                let data;
                if(compareOnData || compareOnInput) {
                    data = Contract.deploy({data:'0x' + ContractInfo.evm.bytecode.object, arguments: args}).encodeABI()
                }
                const newTransaction = {
                    data: compareOnData ? data : undefined,
                    input: compareOnInput ? data : undefined,
                    gas: options.gas,
                    gasPrice: options.gasPrice,
                    value: options.value,
                    from: options.from
                };

                transaction.data = transaction.input;
                for(let i = 0; i < fieldsToCompare.length; i++) {
                    const field = fieldsToCompare[i];
                    if(typeof newTransaction[field] == 'undefined') {
                        throw new Error('field ' + field + ' not specified in new transaction, cant compare');
                    }
                    if(transaction[field] != newTransaction[field]) {
                        return true;
                    }
                }
                return false; 
            }
        }
        return true;
    }

    const deployIfDifferent = async (fieldsToCompare, name, options, contractName, ...args) => {
        const differences = await fetchIfDifferent(fieldsToCompare, name, options, contractName, ...args);
        if(differences) {
            return deploy(name, options, contractName, ...args);
        } else {
            return getDeployedContractWithTransactionHash(name);
        }
        
    };

    function getDeployedContractWithTransactionHash(name) {
        const deployment = rocketh.deployment(name);
        if(!deployment) {
            return null;
        }
        return {contract: instantiateContract(deployment.contractInfo.abi, deployment.address), transactionHash: deployment.transactionHash };
    }

    function getDeployedContract(name) {
        const deployment = rocketh.deployment(name);
        if(!deployment) {
            return null;
        }
        return instantiateContract(deployment.contractInfo.abi, deployment.address);
    }

    function instantiateContract(abi, address) {
        return new web3.eth.Contract(abi, address);
    }

    function instantiateAndRegisterContract(name, address, txHash, contractName, ...args) {
        const ContractInfo = rocketh.contractInfo(contractName);
        rocketh.registerDeployment(name, { 
            contractInfo: ContractInfo, 
            address,
            transactionHash: txHash,
            args
        });
        return instantiateContract(ContractInfo.abi, address)
    }

    function tx(options, contract, methodName, ...args) {
        if(contract) {
            return contract.methods[methodName](...args).send(options);
        } else {
            return web3.eth.sendTransaction(options);
        }
    }

    return {
        fetchIfDifferent,
        deployIfDifferent,
        getDeployedContract,
        deployIfNeverDeployed,
        instantiateContract,
        instantiateAndRegisterContract,
        deploy,
        web3,
        tx
    };
}

module.exports = setup;
