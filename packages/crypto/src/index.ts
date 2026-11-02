export { CryptoError, type CryptoErrorCode } from './errors.ts';
export { ready } from './sodium.ts';
export { DEFAULT_KDF, deriveKek, newSalt, type KdfParams } from './kdf.ts';
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
