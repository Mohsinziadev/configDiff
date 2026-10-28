export type ErrorCode =
  | "PARSE_ERROR"
  | "INVALID_OPTIONS"
  | "INVALID_POLICY"
  | "INPUT_TOO_LARGE"
  | "FILE_ERROR"
  | "UNSUPPORTED_FORMAT"
  | "SCHEMA_ERROR"
  | "ASYNC_VALIDATOR";

export interface SourceLocation {
  line: number;
  column?: number;
}

/**
 * All errors thrown by ConfigDiff. Messages never include configuration values;
 * parse errors carry a location instead of a source excerpt.
 */
export class ConfigDiffError extends Error {
  readonly code: ErrorCode;
  readonly location: SourceLocation | undefined;

  constructor(code: ErrorCode, message: string, location?: SourceLocation) {
    super(message);
    this.name = "ConfigDiffError";
    this.code = code;
    this.location = location;
  }

  toJSON(): { name: string; code: ErrorCode; message: string; location?: SourceLocation } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.location ? { location: this.location } : {}),
    };
  }
}
