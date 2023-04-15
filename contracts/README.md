# Mina zkApp: Lightning Network

This is the Lightning Zk App. It's composed of two smart contracts: (1) ExampleToken, a simple ERC-20-like token contract and (2) Lightning, which has 
all the core logic for the state channel protocol.

Lightning enables any 2 parties to open a state channel between each other by depositing funds into the contract. They can then transact freely at no cost, using the power
of recursive ZK-Snarks. Only at the end, a single transaction can be submitted on-chain which finalizes their trading activity.

This helps to significantly reduce the cost of fees. Now, a potentially unlimited number of transactions can be compressed into a single one!


## How to use the Lightning Protocol

First deposit tokens into the Lightning Smart Contract by calling the on-chain function `Lightning.deposit()`

Then, pick a person you want to trade with who has already onboarded to the protocol, and generate a 
recursive ZK-Snarks proof off-chain by calling `Lightning.RecursiveProgram.baseCase()` and then `Lightning.RecursiveProgram.step()` to make your first trade. 
You can send that proof directly to the person you send tokens to (like over RPC), and that person can use that proof to send you money back.

So long as none of you reach a balance of 0, you can transact between each other *forever*, at *no cost*!!!

When you are ready to close your position, you can call the on-chain function `Lightning.withdraw()`, and the final token balance will be sent to your on-chain account.

## How to build

```sh
npm run build
```

## How to run tests

```sh
npm run test
npm run testw # watch mode
```

## Author
Yonatan Medina

## License

[Apache-2.0](LICENSE)
