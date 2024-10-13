const {
    Hbar,
    Client,
    ContractCreateFlow,
    ContractExecuteTransaction,
    ContractFunctionParameters,
    PrivateKey,
    AccountCreateTransaction,
    AccountId,
} = require("@hashgraph/sdk");

const bytecode = require("./bytecode.cjs");

require("dotenv").config();

async function environmentSetup() {
    //Grab your Hedera testnet account ID and private key from your .env file
    const myAccountId = process.env.MY_ACCOUNT_ID;
    const myPrivateKey = process.env.MY_PRIVATE_KEY;

    // If we weren't able to grab it, we should throw a new error
    if (!myAccountId || !myPrivateKey) {
        throw new Error(
            "Environment variables MY_ACCOUNT_ID and MY_PRIVATE_KEY must be present"
        );
    }

    //Create your Hedera Testnet client
    const client = Client.forTestnet();

    //Set your account as the client's operator
    client.setOperator(myAccountId, myPrivateKey);

    //Set the default maximum transaction fee (in Hbar)
    client.setDefaultMaxTransactionFee(new Hbar(100));

    //Set the maximum payment for queries (in Hbar)
    client.setDefaultMaxQueryPayment(new Hbar(50));

    // Account creation function
    async function accountCreator(pvKey, iBal) {
        const response = await new AccountCreateTransaction()
            .setInitialBalance(new Hbar(iBal))
            .setKey(pvKey.publicKey)
            .setMaxAutomaticTokenAssociations(10)
            .execute(client);
        const receipt = await response.getReceipt(client);
        return receipt.accountId;
    }

    //initialize account
    const aliceKey = PrivateKey.generateED25519();
    const aliceId = await accountCreator(aliceKey, 100);

    // Create contract
    const createContract = new ContractCreateFlow()
        .setGas(4000000) // Increase if revert
        .setBytecode(bytecode); // Contract bytecode
    const createContractTx = await createContract.execute(client);
    const createContractRx = await createContractTx.getReceipt(client);
    const contractId = createContractRx.contractId;

    console.log(`Contract created with ID: ${contractId} \n`);

    // Create NFT from precompile
    const createToken = new ContractExecuteTransaction()
        .setContractId(contractId)
        .setGas(4000000) // Increase if revert
        .setPayableAmount(50) // Increase if revert
        .setFunction("createNft",
            new ContractFunctionParameters()
                .addString("Fall Collection") // NFT name
                .addString("LEAF") // NFT symbol
                .addString("Just a memo") // NFT memo
                .addInt64(250) // NFT max supply
                .addInt64(7000000) // Expiration: Needs to be between 6999999 and 8000001
        );
    const createTokenTx = await createToken.execute(client);
    const createTokenRx = await createTokenTx.getRecord(client);
    const tokenIdSolidityAddr = createTokenRx.contractFunctionResult.getAddress(0);
    const tokenId = AccountId.fromSolidityAddress(tokenIdSolidityAddr);

    console.log(`Token created with ID: ${tokenId} \n`);

    // IPFS URI
    metadata = "ipfs://bafyreie3ichmqul4xa7e6xcy34tylbuq2vf3gnjf7c55trg3b6xyjr4bku/metadata.json";

    // Mint NFT
    const mintToken = new ContractExecuteTransaction()
        .setContractId(contractId)
        .setGas(4000000)
        .setMaxTransactionFee(new Hbar(20)) //Use when HBAR is under 10 cents
        .setFunction("mintNft",
            new ContractFunctionParameters()
                .addAddress(tokenIdSolidityAddr) // Token address
                .addBytesArray([Buffer.from(metadata)]) // Metadata
        );

    const mintTokenTx = await mintToken.execute(client);
    const mintTokenRx = await mintTokenTx.getRecord(client);
    const serial = mintTokenRx.contractFunctionResult.getInt64(0);

    console.log(`Minted NFT with serial: ${serial} \n`);

    // Transfer NFT to Alice
    const transferToken = await new ContractExecuteTransaction()
        .setContractId(contractId)
        .setGas(4000000)
        .setFunction("transferNft",
            new ContractFunctionParameters()
                .addAddress(tokenIdSolidityAddr) // Token address
                .addAddress(aliceId.toSolidityAddress()) // Token receiver (Alice)
                .addInt64(serial)) // NFT serial number
        .freezeWith(client) // freezing using client
        .sign(aliceKey); // Sign transaction with Alice

    const transferTokenTx = await transferToken.execute(client);
    const transferTokenRx = await transferTokenTx.getReceipt(client);

    console.log(`Transfer status: ${transferTokenRx.status} \n`);
}
environmentSetup();