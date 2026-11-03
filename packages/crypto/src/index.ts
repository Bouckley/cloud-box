export { CryptoError, type CryptoErrorCode } from './errors.ts';
export { ready } from './sodium.ts';
export { DEFAULT_KDF, deriveKek, KDF_LIMITS, newSalt, type KdfParams } from './kdf.ts';
export {
  aeadDecrypt,
  aeadEncrypt,
  decryptMetadata,
  encryptMetadata,
  randomKey,
  unwrapKey,
  wrapKey,
} from './aead.ts';
export {
  createFileDecryptor,
  createFileEncryptor,
  decryptFile,
  encryptFile,
  FILE_CHUNK_BYTES,
  type FileDecryptor,
  type FileEncryptor,
} from './stream.ts';
export {
  boxKeyPairFromSeed,
  generateBoxKeyPair,
  openSealed,
  sealTo,
  type KeyPair,
} from './sealed.ts';
export { generateSigningKeyPair, sign, signingKeyPairFromSeed, verify } from './sign.ts';
export { sha256 } from './hash.ts';
export { isId, newId } from './ids.ts';
export { ad, type BlobRole } from './ad.ts';
export { authMessage } from './auth.ts';
export { createDedupeHasher, dedupeHash } from './dedupe.ts';
