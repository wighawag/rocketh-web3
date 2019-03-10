
function setup(rocketh, Web3Provided) {
    let web3;
    if(Web3Provided) {
        web3 = new Web3Provided(rocketh.ethereum);
    } else {
        const Web3 = require('web3');
        web3 = new Web3(rocketh.ethereum);
    }

    const deploy = async(name, contractName, options, ...args) => {
        const ContractInfo = rocketh.contractInfo(contractName);
        const Contract = new web3.eth.Contract(ContractInfo.abi);
        const promiEvent = Contract.deploy({data:'0x' + ContractInfo.evm.bytecode.object, arguments: args}).send(options);
        let transactionHash;
        promiEvent.once('transactionHash', (txHash) => {
            transactionHash = txHash;
        });
        const contract = await promiEvent;
        registerDeployment(name, { 
            contractInfo: ContractInfo, 
            address: contract.options.address,
            transactionHash,
            args
        });
        return contract;
    }

    const deployIfDifferent = async (fieldsToCompare, name, contractName, options, ...args) => {
        const deployment = rocketh.deployment(name);
        if(deployment) {
            const transaction = await web3.eth.getTransaction(deployment.transactionHash);
        
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

            let differences = false;
            transaction.data = transaction.input;
            for(let i = 0; i < fieldsToCompare.length; i++) {
                const field = fieldsToCompare[i];
                if(typeof newTransaction[field] == 'undefined') {
                    console.error('field ' + field + ' not specified in new transaction, cant compare');
                    return new web3.eth.Contract(deployment.contractInfo.abi, deployment.address);
                }
                if(transaction[field] != newTransaction[field]) {
                    differences = true;
                    break;
                }
            }
            if(!differences) {
                return new web3.eth.Contract(deployment.contractInfo.abi, deployment.address);    
            }
        }
        return deploy(name, contractName, options, ...args);
    };

    function getDeployedContract(name) {
        const deployment = rocketh.deployment(name);
        return new web3.eth.Contract(deployment.contractInfo.abi, deployment.address);
    }

    return {
        deployIfDifferent,
        getDeployedContract,
        web3
    };
}

module.exports = setup;
