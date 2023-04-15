import { Lightning } from './Lightning';
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
    senderAccount: PublicKey,
    senderKey: PrivateKey,
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
    ({ privateKey: senderKey, publicKey: senderAccount } =
      Local.testAccounts[1]);
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
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deploy();
      zkApp.initState(timeLockMerkleMap.getRoot(), balanceMerkeleMap.getRoot());
      AccountUpdate.fundNewAccount(deployerAccount);
      tokenApp.deploy();
    });
    await txn.prove();
    await txn.sign([deployerKey, zkAppPrivateKey, tokenPrivateKey]).send();
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

    const userAddressPrivate = PrivateKey.random();
    const userAddress = userAddressPrivate.toPublicKey();

    expect(tokenApp.totalAmountInCirculation.get()).toEqual(UInt64.from(0));

    // mint
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      tokenApp.mint(
        userAddress,
        amount100,
        Signature.create(tokenPrivateKey, [
          ...amount100.toFields(),
          ...userAddress.toFields(),
        ])
      );
    });
    await txn.prove();
    await txn.sign([deployerKey]).send();
    expect(Mina.getBalance(userAddress, tokenApp.token.id)).toEqual(amount100);
    //

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
  });
});
