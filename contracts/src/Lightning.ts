import {
  SmartContract,
  state,
  State,
  method,
  Permissions,
  Field,
  UInt64,
  PublicKey,
  Experimental,
} from 'snarkyjs';
import { ExampleToken } from './Token';

export class Lightning extends SmartContract {
  /**
   * We need a hash map that tells us user-token -> the amount of time left until time lock expires.
   * every time sendTokens is called we first check the time lock is not expired
   */
  @state(Field) timeLockMerkleRoot = State<Field>();

  deploy() {
    super.deploy();

    const permissionToEdit = Permissions.proof();

    this.account.permissions.set({
      ...Permissions.default(),
      editState: permissionToEdit,
      setTokenSymbol: permissionToEdit,
      send: permissionToEdit,
      receive: permissionToEdit,
    });
  }

  @method init() {
    super.init();
  }

  @method deposit() {
    // TODO: time lock the funds
  }

  @method sendTokens(
    tokenAddress: PublicKey,
    senderAddress: PublicKey,
    receiverAddress: PublicKey,
    amount: UInt64
  ) {
    // TODO: Check timelock
    const token = new ExampleToken(tokenAddress);
    token.sendTokens(senderAddress, receiverAddress, amount);
  }

  @method serializeTimeLockKey(
    userAddress: PublicKey,
    tokenAddress: PublicKey
  ): Field {
    return Field(`${userAddress.toBase58()}@${tokenAddress.toBase58()}`);
  }

  @method desirealizeTimeLockKey(timeLockKey: Field): {
    userAddress: PublicKey;
    tokenAddress: PublicKey;
  } {
    const [userAddressStr, tokenAddressStr] = timeLockKey.toString().split('@');
    return {
      userAddress: PublicKey.fromBase58(userAddressStr),
      tokenAddress: PublicKey.fromBase58(tokenAddressStr),
    };
  }
}

const RecursiveProof = Experimental.ZkProgram({
  publicInput: Field,

  methods: {
    run: {
      privateInputs: [],

      method(publicInput: Field) {
        publicInput.assertEquals(Field(0));
      },
    },
  },
});
