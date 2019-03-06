
function setup(rocketh, Web3Provided) {
    let web3;
    if(Web3Provided) {
        web3 = new Web3Provided(rocketh.ethereum);
    } else {
        const Web3 = require('web3');
        web3 = new Web3(rocketh.ethereum);
    }     

    const deployContractIfNew = async (name, contractName, options, ...args) => {
        const ContractInfo = rocketh.contractInfo(contractName);
        let contract;
        await rocketh.unlessAlreadyDeployed(name, ContractInfo.evm.bytecode.object, args, async (registerDeployment) => {
            const Contract = new web3.eth.Contract(ContractInfo.abi);
            contract = await Contract.deploy({data:'0x' + ContractInfo.evm.bytecode.object, arguments: args}).send(options);
            registerDeployment(name, { 
                contractInfo: ContractInfo, 
                args, 
                address: contract.options.address
            });
        });
        return contract;
    };

    const deployOrGetExistingContract = async (name, contractName, options, ...args) => {
        let contract = await deployContractIfNew(name, contractName, options, ...args);
        if(!contract) {
            const deployment = rocketh.deployment(name);
            contract = new web3.eth.Contract(deployment.contractInfo.abi, deployment.address);
        }
        return contract;
    }

    function getDeployedContract(name) {
        const deployment = rocketh.deployment(name);
        return new web3.eth.Contract(deployment.contractInfo.abi, deployment.address);
    }

    return {
        deployContractIfNew,
        getDeployedContract,
        deployOrGetExistingContract,
        web3
    };
}

module.exports = setup;
