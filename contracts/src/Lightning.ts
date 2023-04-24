import {
  SmartContract,
  state,
  State,
  method,
  Permissions,
  Field,
  UInt64,
  UInt32,
  PublicKey,
  Experimental,
  MerkleMapWitness,
  Poseidon,
  SelfProof,
  Struct,
  Circuit,
  Signature,
  AccountUpdate
} from 'snarkyjs';
import { ExampleToken } from './Token.js';

export class RecursivePublicInput extends Struct({
  user1: PublicKey,
  user2: PublicKey,
  balance1Witness: MerkleMapWitness,
  balance2Witness: MerkleMapWitness,
  balanceRoot: Field,
  user1Balance: Field,
  user2Balance: Field,
  transferFrom1to2: Field
}) {}

export const RecursiveProgram = Experimental.ZkProgram({
  publicInput: RecursivePublicInput,

  methods: {
    /**
     * baseCase only verifies witnesses. No transfer of funds should be made in this step.
     */
    baseCase: {
      privateInputs: [],

      method(publicInput: RecursivePublicInput) {
        const {user1Balance, user2Balance, balance1Witness, balance2Witness, balanceRoot, transferFrom1to2} = publicInput
        let [balanceRootBefore] =
          balance1Witness.computeRootAndKey(user1Balance);
        balanceRootBefore.assertEquals(balanceRoot, "balance1Witness does not match root");
        [balanceRootBefore] =
          balance2Witness.computeRootAndKey(user2Balance);
        balanceRootBefore.assertEquals(balanceRoot, "balance2Witness does not match root");
        transferFrom1to2.assertEquals(Field(0), 'In the baseCase transfer amount should be 0')
      },
    },

    step: {
      privateInputs: [SelfProof, Signature],

      /**
       * this method only cares about publicInput.transferFrom1To2
       * notice that transferFrom1To2 can be negative depending on who is transferring to who
       */
      method(publicInput: RecursivePublicInput, earlierProof: SelfProof<RecursivePublicInput>, senderSignature: Signature) {
        // verify earlier proof
        earlierProof.verify();
        // assert balances are >= 0 for both parties
        publicInput.user1Balance.assertGreaterThanOrEqual(0, "user1 balance cannot be < 0 due to this transfer")
        publicInput.user2Balance.assertGreaterThanOrEqual(0, "user2 balance cannot be < 0 due to this transfer")

        // require the public input to be signed by the asset sender
        Circuit.if(
          publicInput.transferFrom1to2.greaterThan(0),
          senderSignature.verify(publicInput.user1, RecursivePublicInput.toFields(publicInput)),
          senderSignature.verify(publicInput.user2, RecursivePublicInput.toFields(publicInput))
        )

        earlierProof.publicInput.user1Balance.sub(publicInput.transferFrom1to2).assertEquals(publicInput.user1Balance, "user1 balance is not correct")
        earlierProof.publicInput.user2Balance.add(publicInput.transferFrom1to2).assertEquals(publicInput.user2Balance, "user2 balance is not correct")
      },
    },
  },
});

export class RecursiveProof extends Experimental.ZkProgram.Proof(RecursiveProgram) {}

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
   * Deposits a particular token balance and locks it for at least the next 5 blocks
   */
  @method deposit(
    userAddress: PublicKey,
    tokenAddress: PublicKey,
    tokenAmount: UInt64,
    timeLock: UInt32,
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
    
    timeLock.assertGreaterThan(blockHeight.add(5), "timeLock must be at least 5 blocks ahead")

    // deposit tokens from the user to this contract
    token.sendTokens(userAddress, this.address, tokenAmount);

    // get state roots
    const timeLockRoot = this.timeLockMerkleMapRoot.get();
    this.timeLockMerkleMapRoot.assertEquals(timeLockRoot);

    const balanceRoot = this.balanceMerkleMapRoot.get();
    this.balanceMerkleMapRoot.assertEquals(balanceRoot);

    // verify witnesses
    const [timeLockRootBefore, timeLockKey] =
      timeLockPath.computeRootAndKey(timeLockBefore);
    timeLockRootBefore.assertEquals(timeLockRoot, "deposit time lock root not equal");
    timeLockKey.assertEquals(
      this.serializeTimeLockKey(userAddress, tokenAddress), "deposit time lock keys not equal"
    );
    const [balanceRootBefore, balanceKey] =
      balancePath.computeRootAndKey(balanceBefore);
    balanceRootBefore.assertEquals(balanceRoot, "deposit balance root not equal");
    balanceKey.assertEquals(
      this.serializeBalancekKey(userAddress, tokenAddress), "deposit balance keys not equal"
    );

    // compute the new timeLock root after adding more time lock to the user's deposit
    const [newTimeLockRoot] = timeLockPath.computeRootAndKey(
      Field.fromFields(timeLock.toFields())
    );
    // compute the new root after incrementing the balance for the user for that token
    const [newBalanceRoot] = balancePath.computeRootAndKey(
      balanceBefore.add(Field.fromFields(tokenAmount.toFields()))
    );

    // set new roots
    this.timeLockMerkleMapRoot.set(newTimeLockRoot);
    this.balanceMerkleMapRoot.set(newBalanceRoot);
  }

  @method postProof(
    tokenAddress: PublicKey,
    userAddress: PublicKey,
    balanceWitness: MerkleMapWitness,
    balance: Field,
    proof: RecursiveProof
  ) {
    proof.verify()
    const { user1Balance, user2Balance, user1 } = proof.publicInput

    const balanceRoot = this.balanceMerkleMapRoot.get();
    this.balanceMerkleMapRoot.assertEquals(balanceRoot);

    const [balanceRootBefore, balanceKey] = balanceWitness.computeRootAndKey(balance);
    balanceRootBefore.assertEquals(balanceRoot);
    balanceKey.assertEquals(
      this.serializeBalancekKey(userAddress, tokenAddress)
    );

    const newBalance = Circuit.if(userAddress.equals(user1), user1Balance, user2Balance)

    let [newBalanceRoot] = balanceWitness.computeRootAndKey(
      newBalance
    );

    this.balanceMerkleMapRoot.set(newBalanceRoot);
  }

  @method validateWithdrawAndNullify(
    tokenAddress: PublicKey,
    userAddress: PublicKey,
    timeLockWitness: MerkleMapWitness,
    balanceWitness: MerkleMapWitness,
    timeLock: Field,
    balance: Field
  ) {
    // get state roots
    const timeLockRoot = this.timeLockMerkleMapRoot.get();
    this.timeLockMerkleMapRoot.assertEquals(timeLockRoot);

    const balanceRoot = this.balanceMerkleMapRoot.get();
    this.balanceMerkleMapRoot.assertEquals(balanceRoot);

    // verify witnesses
    const [timeLockRootBefore, timeLockKey] =
    timeLockWitness.computeRootAndKey(timeLock);
    timeLockRootBefore.assertEquals(timeLockRoot, "withdraw time lock  is wrong");
    timeLockKey.assertEquals(
      this.serializeTimeLockKey(userAddress, tokenAddress), "wirthdraw time lock keys not equal"
    );
    const [balanceRootBefore, balanceKey] =
      balanceWitness.computeRootAndKey(balance);
    balanceRootBefore.assertEquals(balanceRoot, "deposit balance root not equal");
    balanceKey.assertEquals(
      this.serializeBalancekKey(userAddress, tokenAddress), "deposit balance keys not equal"
    );

    this.network.blockchainLength.assertEquals(this.network.blockchainLength.get())
    timeLock.assertLessThan(Field.fromFields(this.network.blockchainLength.get().toFields()), "cannot withdraw before time lock period ends")

    // reset state for that user
    const [newBalanceRoot] = balanceWitness.computeRootAndKey(
      Field(0)
    );
    const [newTimeLockRoot] = timeLockWitness.computeRootAndKey(
      Field(0)
    );
    this.balanceMerkleMapRoot.set(newBalanceRoot);
    this.timeLockMerkleMapRoot.set(newTimeLockRoot);

    // Require user's private key as it nullifies user's secure
    AccountUpdate.create(userAddress).requireSignature();
  }

  @method withdraw(
    tokenAddress: PublicKey,
    userAddress: PublicKey,
    timeLockWitness: MerkleMapWitness,
    balanceWitness: MerkleMapWitness,
    timeLock: Field,
    balance: Field
  ) {
    const token = new ExampleToken(tokenAddress);
    const holder = new LightningTokenHoder(this.address, token.token.id);
    holder.prepareWithdraw(tokenAddress, userAddress, timeLockWitness, balanceWitness, timeLock, balance);
    // send the tokens to the user
    token.approveUpdateAndSend(holder.self, userAddress, UInt64.from(balance));
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

export class LightningTokenHoder extends SmartContract {
  @method prepareWithdraw(
    tokenAddress: PublicKey,
    userAddress: PublicKey,
    timeLockWitness: MerkleMapWitness,
    balanceWitness: MerkleMapWitness,
    timeLock: Field,
    balance: Field
  ) {
    const lightningChannel = new Lightning(this.address);
    lightningChannel.validateWithdrawAndNullify(tokenAddress, userAddress, timeLockWitness, balanceWitness, timeLock, balance);
    // be approved by the token owner parent
    this.self.body.mayUseToken = AccountUpdate.MayUseToken.ParentsOwnToken;
    this.balance.subInPlace(UInt64.from(balance));
  }
}
