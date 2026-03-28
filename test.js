const assert = require('assert');

function toLeBytes(num) {
  const arr = new Uint8Array(8);
  new DataView(arr.buffer).setBigUint64(0, BigInt(num), true);
  return Array.from(arr);
}

const tx = {
  sender: "0x123",
  recipient: "0x456",
  amount: 1000,
  fee: 10,
  nonce: 1,
  timestamp: 1600000000,
  lock_time: 0,
};
const pkBytes = [1, 2, 3];
const encoder = new TextEncoder();
const payloadBytes = [
  ...Array.from(encoder.encode(tx.sender)),
  ...Array.from(encoder.encode(tx.recipient)),
  ...toLeBytes(tx.amount),
  ...toLeBytes(tx.timestamp),
  ...toLeBytes(tx.fee),
  ...toLeBytes(tx.nonce),
  ...toLeBytes(tx.lock_time),
  ...pkBytes,
  0,
  0
];
const hexPayload = payloadBytes.map(b => b.toString(16).padStart(2, '0')).join('');
console.log(hexPayload);
