import type { components } from '@cloudbox/api-client';

export type ClientErrorCode =
  | 'wrong_password'
  | 'weak_password'
  | 'wrong_recovery_key'
  | 'recovery_words'
  | 'not_paired'
  | 'revoked'
  | 'box_unreachable'
  | 'kdf_limits'
  | 'locked'
  | 'not_found'
  | 'unreadable'
  | 'file_changed';

const MESSAGES: Record<ClientErrorCode, string> = {
  wrong_password: 'That password is not right.',
  weak_password: 'Use at least 10 characters.',
  wrong_recovery_key: 'Those words are a recovery key, but not the one for this box.',
  recovery_words: 'Those words are not a recovery key.',
  not_paired: 'This device is not connected to a box yet.',
  revoked: 'This device was removed from the box.',
  box_unreachable: 'Cannot reach the box.',
  kdf_limits: 'The box asked for password settings outside the safe range.',
  locked: 'This account is locked. Unlock it again.',
  not_found: 'That item or collection is not in this library.',
  unreadable: 'That album or folder cannot be read on this device.',
  file_changed: 'The file changed while it was being uploaded. Try again.',
};

/** The fewest characters (as people count them) a password may have. */
export const MIN_PASSWORD = 10;

/**
 * The box can't check a password (it never sees one), so this is the only
 * place the rule lives: every way of setting a password goes through it.
 */
export function checkPassword(password: string): void {
  if ([...password].length < MIN_PASSWORD) throw new ClientError('weak_password');
}

/**
 * A problem the client found itself (not an error the box returned). Messages
 * never contain passwords, words or keys; `detail` carries only safe facts,
 * such as which recovery word is unknown.
 */
export class ClientError extends Error {
  readonly code: ClientErrorCode;
  readonly detail: unknown;

  constructor(code: ClientErrorCode, detail?: unknown) {
    super(MESSAGES[code]);
    this.name = 'ClientError';
    this.code = code;
    this.detail = detail;
  }
}

type ApiError = components['schemas']['Error'];

/** An error the box returned, with its stable code and the action to show. */
export class BoxError extends Error {
  readonly status: number;
  readonly code: string;
  readonly action: string;

  constructor(status: number, body: unknown) {
    const e = isApiError(body)
      ? body
      : {
          code: 'unexpected_response',
          message: 'The box sent an unexpected reply.',
          action: 'Try again.',
        };
    super(e.message);
    this.name = 'BoxError';
    this.status = status;
    this.code = e.code;
    this.action = e.action;
  }
}

function isApiError(v: unknown): v is ApiError {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ApiError).code === 'string' &&
    typeof (v as ApiError).message === 'string' &&
    typeof (v as ApiError).action === 'string'
  );
}
