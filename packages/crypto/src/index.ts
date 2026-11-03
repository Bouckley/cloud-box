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
  ciphertextSize,
  createFileDecryptor,
  createFileEncryptor,
  decryptFile,
  encryptFile,
  FILE_CHUNK_BYTES,
  FILE_CHUNK_OVERHEAD,
  FILE_HEADER_BYTES,
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
export { createSha256, sha256, type Sha256 } from './hash.ts';
export { isId, newId } from './ids.ts';
export { ad, type BlobRole } from './ad.ts';
export { authMessage, recoverMessage } from './auth.ts';
export {
  newRecoveryKey,
  parseRecoveryKey,
  recoverySigningKeyPair,
  recoveryWrapKey,
  RecoveryWordsError,
  type RecoveryKey,
  type RecoveryWordsReason,
} from './recovery.ts';
export { createDedupeHasher, dedupeHash } from './dedupe.ts';
