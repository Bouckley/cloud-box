import type { components } from '@cloudbox/api-client';

export type ClientErrorCode =
  | 'wrong_password'
  | 'wrong_recovery_key'
  | 'recovery_words'
  | 'not_paired'
  | 'revoked'
  | 'box_unreachable'
  | 'kdf_limits';

const MESSAGES: Record<ClientErrorCode, string> = {
  wrong_password: 'That password is not right.',
  wrong_recovery_key: 'Those words are a recovery key, but not the one for this box.',
  recovery_words: 'Those words are not a recovery key.',
  not_paired: 'This device is not connected to a box yet.',
  revoked: 'This device was removed from the box.',
  box_unreachable: 'Cannot reach the box.',
  kdf_limits: 'The box asked for password settings outside the safe range.',
};

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
