declare module '@noble/post-quantum/ml-kem' {
  export const ml_kem5: {
    kyber768: { generateKeyPair: any; encapsulate: any; decapsulate: any; };
    keygen: (seed: Uint8Array) => { publicKey: Uint8Array; secretKey: Uint8Array };
    encap: (publicKey: Uint8Array, data: string) => { ciphertext: Uint8Array };
    decap: (secretKey: Uint8Array, ciphertext: Uint8Array) => string;
  };
}

declare module '@noble/post-quantum/utils' {
  export function randomBytes(length: number): Uint8Array;
}