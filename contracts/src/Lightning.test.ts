import { Lightning, LightningTokenHoder, RecursiveProgram, RecursivePublicInput } from './Lightning';
import { saveTxn } from 'mina-transaction-visualizer';
import { ExampleToken } from './Token';
import {
  isReady,
  shutdown,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  UInt64,
  Signature,
  Field,
  Poseidon,
  MerkleMap,
  Encoding,
} from 'snarkyjs';

/*
 * This file specifies how to test the `Add` example smart contract. It is safe to delete this file and replace
 * with your own tests.
 *
 * See https://docs.minaprotocol.com/zkapps for more info.
 */

let proofsEnabled = false;

describe('Lightning', () => {
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    tokenPrivateKey: PrivateKey,
    tokenAddress: PublicKey,
    tokenApp: ExampleToken,
    zkApp: Lightning,
    amount100: UInt64,
    timeLockMerkleMap: MerkleMap,
    balanceMerkeleMap: MerkleMap;

  beforeAll(async () => {
    await isReady;
    if (proofsEnabled) Lightning.compile();
    amount100 = UInt64.from(100);
  });

  beforeEach(() => {
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new Lightning(zkAppAddress);
    timeLockMerkleMap = new MerkleMap();
    balanceMerkeleMap = new MerkleMap();

    // init token contract
    tokenPrivateKey = PrivateKey.random();
    tokenAddress = tokenPrivateKey.toPublicKey();
    tokenApp = new ExampleToken(tokenAddress);
  });

  afterAll(() => {
    // `shutdown()` internally calls `process.exit()` which will exit the running Jest process early.
    // Specifying a timeout of 0 is a workaround to defer `shutdown()` until Jest is done running all tests.
    // This should be fixed with https://github.com/MinaProtocol/mina/issues/10943
    setTimeout(shutdown, 0);
  });

  async function localDeploy() {
    await LightningTokenHoder.compile();
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount, 3);
      zkApp.deploy();
      zkApp.initState(timeLockMerkleMap.getRoot(), balanceMerkeleMap.getRoot());
      tokenApp.deploy();
      tokenApp.deployZkapp(zkAppAddress, LightningTokenHoder._verificationKey!);
    });
    await txn.prove();
    await txn.sign([deployerKey, zkAppPrivateKey, tokenPrivateKey]).send();
  }

  async function mint(userAddress: PublicKey) {
    const mintSignature = Signature.create(tokenPrivateKey, [
      ...amount100.toFields(),
      ...userAddress.toFields(),
      ...tokenApp.mintNonce.get().toFields(),
    ]);
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      tokenApp.mint(
        userAddress,
        amount100,
        mintSignature,
      );
    });
    await txn.prove();
    await txn.sign([deployerKey]).send();
  }

  it('correctly serializes timeLockMerkleRoot key', async () => {
    await localDeploy();

    const userAddress = PrivateKey.random().toPublicKey();
    const tokenAddress = PrivateKey.random().toPublicKey();

    expect(zkApp.serializeTimeLockKey(userAddress, tokenAddress)).toEqual(
      Poseidon.hash([
        ...userAddress.toFields(),
        ...tokenAddress.toFields(),
        Field(0),
      ])
    );
    expect(zkApp.serializeBalancekKey(userAddress, tokenAddress)).toEqual(
      Poseidon.hash([
        ...userAddress.toFields(),
        ...tokenAddress.toFields(),
        Field(1),
      ])
    );
  });

  it('initial deposit', async () => {
    await localDeploy();

    expect(tokenApp.totalAmountInCirculation.get()).toEqual(UInt64.from(0));

    const userAddressPrivate = PrivateKey.random();
    const userAddress = userAddressPrivate.toPublicKey();
    const timeLock = Mina.LocalBlockchain().getNetworkState().blockchainLength.add(1000)

    await mint(userAddress)
    
    // deposit
    const timeLockWitness = timeLockMerkleMap.getWitness(
      zkApp.serializeTimeLockKey(userAddress, tokenAddress)
    );
    const balanceWitness = balanceMerkeleMap.getWitness(
      zkApp.serializeBalancekKey(userAddress, tokenAddress)
    );
    const txn1 = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deposit(
        userAddress,
        tokenAddress,
        amount100,
        timeLock,
        Field(0),
        Field(0),
        timeLockWitness,
        balanceWitness
      );
    });
    await txn1.prove();
    await txn1.sign([deployerKey, userAddressPrivate]).send();

    expect(Mina.getBalance(userAddress, tokenApp.token.id)).toEqual(
      UInt64.from(0)
    );

    expect(Mina.getBalance(zkAppAddress, tokenApp.token.id)).toEqual(
      amount100
    );
  });

  it('state channel', async () => {
    await localDeploy();

    const userAddressPrivate = PrivateKey.random();
    const userAddress = userAddressPrivate.toPublicKey();

    const user2AddressPrivate = PrivateKey.random();
    const user2Address = user2AddressPrivate.toPublicKey();

    const timeLock = Mina.LocalBlockchain().getNetworkState().blockchainLength.add(1000)

    // mint tokens for user1
    await mint(userAddress)
    
    // deposit for user1
    const timeLockWitness = timeLockMerkleMap.getWitness(
      zkApp.serializeTimeLockKey(userAddress, tokenAddress)
    );
    const balanceWitness = balanceMerkeleMap.getWitness(
      zkApp.serializeBalancekKey(userAddress, tokenAddress)
    );
    const txn1 = await Mina.transaction(deployerAccount, () => {
      zkApp.deposit(
        userAddress,
        tokenAddress,
        amount100,
        timeLock,
        Field(0),
        Field(0),
        timeLockWitness,
        balanceWitness
      );
    });
    await txn1.prove();
    await txn1.sign([deployerKey, userAddressPrivate]).send();

    // update balance merkle map to reflect the user deposit
    balanceMerkeleMap.set(zkApp.serializeBalancekKey(userAddress, tokenAddress), Field.fromFields(amount100.toFields()));
    expect(zkApp.balanceMerkleMapRoot.get()).toEqual(balanceMerkeleMap.getRoot());
    // update time lock merkle map to reflect the deposit
    timeLockMerkleMap.set(zkApp.serializeTimeLockKey(userAddress, tokenAddress), Field.fromFields(timeLock.toFields()));
    expect(zkApp.timeLockMerkleMapRoot.get()).toEqual(timeLockMerkleMap.getRoot());


    const balance2Witness = balanceMerkeleMap.getWitness(
      zkApp.serializeBalancekKey(user2Address, tokenAddress)
    );
    const timeLock2Witness = timeLockMerkleMap.getWitness(
      zkApp.serializeTimeLockKey(user2Address, tokenAddress)
    );

    // deposit for user2
    const txnX = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deposit(
        user2Address,
        tokenAddress,
        UInt64.from(0),
        timeLock,
        Field(0),
        Field(0),
        timeLock2Witness,
        balance2Witness
      );
    });
    await txnX.prove();
    await txnX.sign([deployerKey, user2AddressPrivate]).send();

    // update balance merkle map to reflect the user2 deposit
    balanceMerkeleMap.set(zkApp.serializeBalancekKey(user2Address, tokenAddress), Field(0));
    expect(zkApp.balanceMerkleMapRoot.get()).toEqual(balanceMerkeleMap.getRoot());
    // update time lock merkle map to reflect the user2 deposit
    timeLockMerkleMap.set(zkApp.serializeTimeLockKey(user2Address, tokenAddress), Field.fromFields(timeLock.toFields()));
    expect(zkApp.timeLockMerkleMapRoot.get()).toEqual(timeLockMerkleMap.getRoot());


    // run the state channel
    const newBalance1Witness = balanceMerkeleMap.getWitness(
      zkApp.serializeBalancekKey(userAddress, tokenAddress)
    );
    const newBalance2Witness = balanceMerkeleMap.getWitness(
      zkApp.serializeBalancekKey(user2Address, tokenAddress)
    );

    const publicInput = {
      user1: userAddress,
      user2: user2Address,
      balanceRoot: zkApp.balanceMerkleMapRoot.get(),
      balance1Witness: newBalance1Witness,
      balance2Witness: newBalance2Witness,
      user1Balance: Field.fromFields(amount100.toFields()),
      user2Balance: Field(0),
      transferFrom1to2: Field(0)
    }

    await RecursiveProgram.compile()

    let proof0 = await RecursiveProgram.baseCase(publicInput)

    const firstTxInChannel = {
      user1Balance: publicInput.user1Balance.sub(Field(20)),
      user2Balance: publicInput.user2Balance.add(Field(20)),
      transferFrom1to2: Field(20),
      user1: userAddress,
      user2: user2Address,
      balanceRoot: zkApp.balanceMerkleMapRoot.get(),
      balance1Witness: newBalance1Witness,
      balance2Witness: newBalance2Witness,
    };
    const senderSignature = Signature.create(userAddressPrivate, RecursivePublicInput.toFields(firstTxInChannel));
    
    const proof1 = await RecursiveProgram.step(firstTxInChannel, proof0, senderSignature);

    const secondTxInChannel = {
      user1Balance: publicInput.user1Balance.sub(Field(20)).sub(5),
      user2Balance: publicInput.user2Balance.add(Field(20)).add(5),
      transferFrom1to2: Field(5),
      user1: userAddress,
      user2: user2Address,
      balanceRoot: zkApp.balanceMerkleMapRoot.get(),
      balance1Witness: newBalance1Witness,
      balance2Witness: newBalance2Witness,
    };
    const senderSignature2 = Signature.create(userAddressPrivate, RecursivePublicInput.toFields(secondTxInChannel));
    const proof2 = await RecursiveProgram.step(secondTxInChannel, proof1, senderSignature2);


    // post proof for user1
    const txn2 = await Mina.transaction(deployerAccount, () => {
      zkApp.postProof(
        tokenAddress,
        userAddress,
        publicInput.balance1Witness,
        Field(100),
        proof2
      );
    });
    await txn2.prove();
    await txn2.sign([deployerKey]).send();

    // update the merkle map to reflect the deduction in user1's balance
    balanceMerkeleMap.set(zkApp.serializeBalancekKey(userAddress, tokenAddress), Field(100 - 25));
    expect(zkApp.balanceMerkleMapRoot.get()).toEqual(balanceMerkeleMap.getRoot());

    (Mina.activeInstance as ReturnType<typeof Mina.LocalBlockchain>).setBlockchainLength(timeLock.add(1));
    const balanceWitnessFinal = balanceMerkeleMap.getWitness(
      zkApp.serializeBalancekKey(userAddress, tokenAddress)
    );
    const timeLockWitnessFinal = timeLockMerkleMap.getWitness(
      zkApp.serializeTimeLockKey(userAddress, tokenAddress)
    );

    const txn3 = await Mina.transaction(deployerAccount, () => {
      zkApp.withdraw(
        tokenAddress,
        userAddress,
        timeLockWitnessFinal,
        balanceWitnessFinal,
        Field.fromFields(timeLock.toFields()),
        Field(100 - 25)
      );
    });
    await txn3.prove();
    const signed = txn3.sign([deployerKey]);
    const legend = {
      [zkAppAddress.toBase58()]: 'lightningApp',
      [tokenAddress.toBase58()]: 'tokenApp',
      [deployerAccount.toBase58()]: 'deployer',
      [userAddress.toBase58()]: 'user',
      [Encoding.TokenId.toBase58(tokenApp.token.id)]: 'TOKEN'
    }
    saveTxn(signed, 'txn3', legend, './txn3.png');
    await signed.send();
    expect(Mina.getBalance(userAddress, tokenApp.token.id)).toEqual(UInt64.from(100 - 25));
  });
});
