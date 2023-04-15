import { Lightning } from './Lightning';
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
    zkApp: Lightning,
    amount100: UInt64;

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
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  // TODO: deserialization currently not working
  it.skip('correctly serializes timeLockMerkleRoot key', async () => {
    await localDeploy();

    const userAddress = PrivateKey.random().toPublicKey();
    const tokenAddress = PrivateKey.random().toPublicKey();

    const serializedKey = zkApp.serializeTimeLockKey(userAddress, tokenAddress);
    expect(serializedKey).toEqual(
      `${userAddress.toBase58()}@${tokenAddress.toBase58()}`
    );

    const desirializedKey = zkApp.desirealizeTimeLockKey(Field(serializedKey));
    expect(desirializedKey).toMatchObject({
      userAddress,
      tokenAddress,
    });
  });
});
