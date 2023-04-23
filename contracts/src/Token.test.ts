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
} from 'snarkyjs';

/*
 * This file specifies how to test the `Add` example smart contract. It is safe to delete this file and replace
 * with your own tests.
 *
 * See https://docs.minaprotocol.com/zkapps for more info.
 */

let proofsEnabled = false;

describe('ExampleToken', () => {
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    senderAccount: PublicKey,
    senderKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: ExampleToken,
    amount100: UInt64;

  beforeAll(async () => {
    await isReady;
    if (proofsEnabled) ExampleToken.compile();
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
    zkApp = new ExampleToken(zkAppAddress);
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

  it('correctly mints `ExampleToken`', async () => {
    await localDeploy();

    const mintToAddressPrivate = PrivateKey.random();
    const mintToAddress = mintToAddressPrivate.toPublicKey();

    const mintSignature = Signature.create(zkAppPrivateKey, [
      ...amount100.toFields(),
      ...mintToAddress.toFields(),
      ...zkApp.account.nonce.get().toFields(),
    ]);

    expect(zkApp.totalAmountInCirculation.get()).toEqual(UInt64.from(0));

    // mint
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.mint(mintToAddress, amount100, mintSignature);
    });
    await txn.prove();
    await txn.sign([deployerKey]).send();
    const txn2 = await Mina.transaction(deployerAccount, () => {
      zkApp.mint(mintToAddress, amount100, mintSignature);
    });
    await txn2.prove();
    await txn2.sign([deployerKey]).send();

    expect(zkApp.totalAmountInCirculation.get()).toEqual(amount100.mul(2));

    expect(Mina.getBalance(mintToAddress, zkApp.token.id)).toEqual(amount100.mul(2));
  });

  it('fails to send tokens when no balance', async () => {
    await localDeploy();

    const sendToAddressPrivate = PrivateKey.random();
    const sendToAddress = sendToAddressPrivate.toPublicKey();

    // failed send because account doesn't have tokens
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.sendTokens(deployerAccount, sendToAddress, amount100);
    });
    await txn.prove();
    await expect(txn.sign([deployerKey]).send()).rejects.toThrow();
  });

  it('correctly sends tokens', async () => {
    await localDeploy();

    const sendToAddressPrivate = PrivateKey.random();
    const sendToAddress = sendToAddressPrivate.toPublicKey();
    const mintSignature = Signature.create(zkAppPrivateKey, [
      ...amount100.toFields(),
      ...deployerAccount.toFields(),
      ...zkApp.account.nonce.get().toFields(),
    ]);

    // successful send
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.mint(deployerAccount, amount100, mintSignature);
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.sendTokens(deployerAccount, sendToAddress, amount100);
    });
    await txn.prove();
    await txn.sign([deployerKey]).send();

    expect(Mina.getBalance(sendToAddress, zkApp.token.id)).toEqual(amount100);
  });
});
