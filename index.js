
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
        
        let contract;
        let transactionHash;
        if(options.from.length > 42) {
            const deployData = Contract.deploy({data:'0x' + ContractInfo.evm.bytecode.object, arguments: args}).encodeABI();
            const txOptions = {
                from: options.from,
                data: deployData,
                gas: options.gas,
                gasPrice: options.gasPrice,
                value: options.value,
                nonce: options.nonce
            };
            const receipt = await tx(txOptions);
            contract = new web3.eth.Contract(ContractInfo.abi, receipt.contractAddress);
            transactionHash = receipt.transactionHash;
        } else {
            const promiEvent = Contract.deploy({data:'0x' + ContractInfo.evm.bytecode.object, arguments: args}).send(options);
            promiEvent.once('transactionHash', (txHash) => {
                transactionHash = txHash;
            });
            contract = await promiEvent;
        }

        
        rocketh.registerDeployment(name, { 
            contractInfo: ContractInfo, 
            address: contract.options.address,
            transactionHash,
            args
        });
        const receipt = await fetchReceipt(transactionHash);
        return {contract, transactionHash, receipt};
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

    async function tx(options, contract, methodName, ...args) {
        if(options.from.length > 42) {
            const privateKey = options.from;
            const from = web3.eth.accounts.privateKeyToAccount(privateKey).address;
            const nonce = web3.utils.toHex(options.nonce || await web3.eth.getTransactionCount(from));
            const gas = web3.utils.toHex(options.gas);
            const value = options.value || "0x0";
            const gasPrice = options.gasPrice || await web3.eth.getGasPrice();
            let data = options.data;
            let to = options.to;
            if(contract) {
                to = contract.options.address;
                data = contract.methods[methodName](...args).encodeABI();
            }
            const txOptions = {
                from,
                nonce,
                gas,
                value,
                gasPrice,
                data,
                to
            };
            const signedTx = await web3.eth.accounts.signTransaction(txOptions, privateKey);
            return web3.eth.sendSignedTransaction(signedTx.rawTransaction);                    
        } else {
            if(contract) {
                return contract.methods[methodName](...args).send(options);
            } else {
                return web3.eth.sendTransaction(options);
            }
        }
    }

    function call(options, contract, methodName, ...args) {
        if(typeof args == "undefined") {
            args = [];
        }
        if(typeof contract == "string") {
            args = args.concat([]);
            if(typeof methodName != "undefined") {
                args.unshift(methodName);
            }
            methodName = contract;
            contract = options;
            options = {};
        }
        return contract.methods[methodName](...args).call(options);
    }

    function fetchReceipt(txHash) {
        return web3.eth.getTransactionReceipt(txHash);
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
        tx,
        fetchReceipt,
        call,
        getTransactionCount: (from) => web3.eth.getTransactionCount(from),
        getBalance: (from) => web3.eth.getBalance(from),
    };
}

module.exports = setup;
