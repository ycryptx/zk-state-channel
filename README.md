# State Channels using Recursive ZK-Snark proofs

This is a demo project (my submission for Eth-Tokyo) demonstrating creating a state channel between 2 people using recursive ZK Proofs.
This project is built with SnarkyJS and is deployed to Mina's Berkeley testnet. 

This POC demonstrates that it is possible to do lightning fast payments for almost no fee using the power of recursive ZK-Snarks!
## How Does it work?

A user deposits funds to the Lightning Protocol's smart contract (any token can may be deposited). This locks the funds for a speficic period of time.
As long as the funds are locked, the user may transact with other users of the Lightning Protocol, off-chain, by simply passing a recursive ZK-snark proof
between each other. 

Only when the user finishes their bilateral trade, they can post the proof off-chain and settle their balances.

The ZK-Snark proof is smart enough to fail when balances reach 0 or when there's a double spend, so users can be confident that they can always post the proof 
to finalize their trades.

## Why is this project cool?

This project brings near-free micropayments to Mina, and to other blockchains that can support recursive ZK-Snark proofs.
Much like Bitcoin's Lightning Network, this can help scale transaction processing, and significaly reduce trading fees.

## What did I leave out?

Currently the protocol does not support multi-hop. This was too much to implement for the hackathon, but could be a great thing to do in the future. This 
would enable trading between more people as liquidity would be less fragmented.

Also, the protocol does not gracefully handle when users are trading simultenously with different users. A better MerkleMap and locking logic can be implemented 
to enable this safely.

## Important files to check out

Lightning Smart Contract [here](./contracts/src/Lightning.ts)
Lightning Smart Contract tests [here](./contracts/src/Lightning.test.ts)

## Thanks to...

Agnus, Trivio, and the rest of the Mina team for their help!

## Author

Yonatan Medina
https://www.linkedin.com/in/yonatan-medina-32a25921a/

## License

[Apache-2.0](LICENSE)
