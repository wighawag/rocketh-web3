const assert = require('assert');

function setup(rocketh, Web3) {
    if(!rocketh) {
        throw new Error("rocketh-web3 expect to be passed rocketh module as first argument");
    }
    if(!Web3) {
        throw new Error("rocketh-web3 expect to be passed Web3 module as second argument");
    }
    const web3 = new Web3(rocketh.ethereum);

    const deploy = async(name, options, contractName, ...args) => {
        let register = true;
        if(typeof name != 'string') {
            register = false;
            args.unshift(contractName);
            contractName = options;
            options = name;
        }
        const ContractInfo = rocketh.contractInfo(contractName);
        const Contract = new web3.eth.Contract(ContractInfo.abi);
        
        let contract;
        let transactionHash;
        let receipt;
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
            const promiEvent = tx(txOptions);
            promiEvent.once('transactionHash', (txHash) => {
                transactionHash = txHash;
                if(register) {
                    rocketh.registerDeployment(name, { 
                        contractInfo: ContractInfo, 
                        transactionHash,
                        args
                    });
                }
            });
            receipt = await promiEvent;
            contract = new web3.eth.Contract(ContractInfo.abi, receipt.contractAddress);
        } else {
            const promiEvent = Contract.deploy({data:'0x' + ContractInfo.evm.bytecode.object, arguments: args}).send(options);
            promiEvent.once('transactionHash', (txHash) => {
                transactionHash = txHash;
                if(register) {
                    rocketh.registerDeployment(name, { 
                        contractInfo: ContractInfo, 
                        transactionHash,
                        args
                    });
                }
            });
            contract = await promiEvent;
            receipt = await fetchReceipt(transactionHash);
        }

        if(register) {
            rocketh.registerDeployment(name, { 
                contractInfo: ContractInfo, 
                address: contract.options.address,
                transactionHash,
                args
            });
        }

        return {contract, transactionHash, receipt, newlyDeployed: true}; // TODO address
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

    async function getDeployedContractWithTransactionHash(name) {
        const deployment = rocketh.deployment(name);
        if(!deployment) {
            return null;
        }
        const receipt = await fetchReceipt(deployment.transactionHash);
        return {contract: instantiateContract(deployment.contractInfo ? deployment.contractInfo.abi : [], deployment.address), transactionHash: deployment.transactionHash, receipt};
    }

    function getDeployedContract(name) {
        const deployment = rocketh.deployment(name);
        if(!deployment) {
            return null;
        }
        return instantiateContract(deployment.contractInfo ? deployment.contractInfo.abi : [], deployment.address);
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

    async function txOnlyFrom(from, options, contract, methodName, ...args) {
        if (from.toLowerCase() !== options.from.toLowerCase()) {
            const data = contract.methods[methodName](...args).encodeABI();
            const to = contract.options.address;
            console.log(options.from + ' has no right to ' + methodName);

            console.log('Please execute the following as ' + from);
            console.log(JSON.stringify({
                to,
                data,
            }, null, '  '));
            console.log('if you have an interface use the following');
            console.log(JSON.stringify({
                to,
                method: methodName,
                args,
            }, null, '  '));
            throw new Error('ABORT, ACTION REQUIRED, see above');
        }
    }

    async function tx(options, contract, methodName, ...args) {
        let receipt;
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
            receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);                    
        } else {
            if(contract) {
                receipt = await contract.methods[methodName](...args).send(options);
            } else {
                receipt = await web3.eth.sendTransaction(options);
            }
        }
        if(receipt && receipt.status == '0x0') { // TODO fix that requirement
            throw new Error(JSON.stringify(receipt, null, '  '));
        }
        return receipt;
    }

    function estimateGas(options, contract, methodName, ...args) {
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
        return contract.methods[methodName](...args).estimateGas(options);
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

    // from https://github.com/OpenZeppelin/zeppelin-solidity/blob/master/test/helpers/expectThrow.js
    // Changing to use the invalid opcode error instead works
    async function expectThrow (promise) {
        let receipt;
        try {
        receipt = await promise;
        } catch (error) {
        // TODO: Check jump destination to destinguish between a throw
        //       and an actual invalid jump.
        const invalidOpcode = error.message.search('invalid opcode') >= 0;
        // TODO: When we contract A calls contract B, and B throws, instead
        //       of an 'invalid jump', we get an 'out of gas' error. How do
        //       we distinguish this from an actual out of gas event? (The
        //       ganache log actually show an 'invalid jump' event.)
        const outOfGas = error.message.search('out of gas') >= 0;
        const revert = error.message.search('revert') >= 0;
        const status0x0 = error.message.search('status": "0x0"') >= 0 ||  error.message.search('status":"0x0"') >= 0; // TODO better
        assert(
            invalidOpcode || outOfGas || revert || status0x0,
            'Expected throw, got \'' + error + '\' instead',
        );
        return;
        }
        if(receipt.status == "0x0") {
        return;
        }
        assert.fail('Expected throw not received');
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
        txOnlyFrom,
        fetchReceipt,
        call,
        expectThrow,
        estimateGas,
        getTransactionCount: (from) => web3.eth.getTransactionCount(from),
        getBalance: (from) => web3.eth.getBalance(from),
    };
}

module.exports = setup;
