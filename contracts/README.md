# Mina zkApp: Lightning Network

This is the Lightning Zk App. It's composed of two smart contracts: (1) ExampleToken, a simple ERC-20-like token contract and (2) Lightning, which has 
all the core logic for the state channel protocol.

Lightning enables any 2 parties to open a state channel between each other by depositing funds into the contract. They can then transact freely at no cost, using the power
of recursive ZK-Snarks. Only at the end, a single transaction can be submitted on-chain which finalizes their trading activity.

This helps to significantly reduce the cost of fees. Now, a potentially unlimited number of transactions can be compressed into a single one!

## How to build

```sh
npm run build
```

## How to run tests

```sh
npm run test
npm run testw # watch mode
```

## How to run coverage

```sh
npm run coverage
```

## License

[Apache-2.0](LICENSE)
