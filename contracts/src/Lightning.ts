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
  MerkleMapWitness,
  Poseidon,
} from 'snarkyjs';
import { ExampleToken } from './Token';

const Recursive = Experimental.ZkProgram({
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

const RecursiveProof = Experimental.ZkProgram.Proof(Recursive);

export class Lightning extends SmartContract {
  /**
   * We need a hash map that tells us user|token -> the amount of time left until time lock expires.
   * every time sendTokens is called we first check the time lock is not expired
   */
  @state(Field) timeLockMerkleMapRoot = State<Field>();
  @state(Field) balanceMerkleMapRoot = State<Field>();

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

  @method initState(timeLockRoot: Field, balanceRoot: Field) {
    this.timeLockMerkleMapRoot.set(timeLockRoot);
    this.balanceMerkleMapRoot.set(balanceRoot);
  }

  /**
   * Deposits a particular token balance and locks it for x blocks
   */
  @method deposit(
    userAddress: PublicKey,
    tokenAddress: PublicKey,
    tokenAmount: UInt64,
    timeLockBefore: Field,
    balanceBefore: Field,
    timeLockPath: MerkleMapWitness,
    balancePath: MerkleMapWitness
  ) {
    const token = new ExampleToken(tokenAddress);
    const blockHeight = this.network.blockchainLength.get();
    this.network.blockchainLength.assertEquals(
      this.network.blockchainLength.get()
    );
    const lockUntilBlock = blockHeight.add(1000);

    // deposit tokens from the user to this contract
    token.sendTokens(userAddress, this.address, tokenAmount);

    // check if there are time locked
    const timeLockRoot = this.timeLockMerkleMapRoot.get();
    this.timeLockMerkleMapRoot.assertEquals(timeLockRoot);

    const balanceRoot = this.timeLockMerkleMapRoot.get();
    this.balanceMerkleMapRoot.assertEquals(balanceRoot);

    const [timeLockRootBefore, timeLockKey] =
      timeLockPath.computeRootAndKey(timeLockBefore);
    timeLockRootBefore.assertEquals(timeLockRoot);
    timeLockKey.assertEquals(
      this.serializeTimeLockKey(userAddress, tokenAddress)
    );

    const [balanceRootBefore, balanceKey] =
      balancePath.computeRootAndKey(balanceBefore);
    balanceRootBefore.assertEquals(balanceRoot);
    balanceKey.assertEquals(
      this.serializeBalancekKey(userAddress, tokenAddress)
    );

    // compute the new timeLock root after adding more time lock to the user's deposit
    const [newTimeLockRoot] = timeLockPath.computeRootAndKey(
      Field.fromFields(lockUntilBlock.toFields())
    );
    // compute the new root after incrementing the balance for the user for that token
    const [newBalanceRoot] = balancePath.computeRootAndKey(
      balanceBefore.add(Field.fromFields(tokenAmount.toFields()))
    );

    // set new roots
    this.timeLockMerkleMapRoot.set(newTimeLockRoot);
    this.balanceMerkleMapRoot.set(newBalanceRoot);
  }

  @method sendTokens(
    tokenAddress: PublicKey,
    senderAddress: PublicKey,
    receiverAddress: PublicKey,
    amount: UInt64
  ) {
    // TODO: verify proof
    const token = new ExampleToken(tokenAddress);
    token.sendTokens(senderAddress, receiverAddress, amount);
  }

  @method serializeTimeLockKey(
    userAddress: PublicKey,
    tokenAddress: PublicKey
  ): Field {
    return Poseidon.hash([
      ...userAddress.toFields(),
      ...tokenAddress.toFields(),
      Field(0),
    ]);
  }

  @method serializeBalancekKey(
    userAddress: PublicKey,
    tokenAddress: PublicKey
  ): Field {
    return Poseidon.hash([
      ...userAddress.toFields(),
      ...tokenAddress.toFields(),
      Field(1),
    ]);
  }
}
