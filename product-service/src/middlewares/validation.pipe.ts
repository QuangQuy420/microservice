import {
  UnprocessableEntityException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';

/**
 * Global request-validation pipe. A well-formed request that breaks a field rule is a
 * validation failure, not a broken request, so it answers **422** `VALIDATION_ERROR` with
 * one array of messages per field (400 is reserved for unparseable bodies and malformed
 * path UUIDs, which `ParseUUIDPipe`/body-parser raise before this pipe runs).
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors: ValidationError[]) =>
      new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: toFieldDetails(errors),
      }),
  });
}

/**
 * Groups class-validator errors into `{field: [messages]}`. Nested objects are flattened to
 * a dotted path (`variant.color`) so the field key always addresses one input.
 */
function toFieldDetails(
  errors: ValidationError[],
  parentPath = '',
): Record<string, string[]> {
  const details: Record<string, string[]> = {};

  const append = (field: string, messages: string[]): void => {
    if (messages.length === 0) return;
    details[field] = [...(details[field] ?? []), ...messages];
  };

  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    append(path, Object.values(error.constraints ?? {}));
    for (const [childField, childMessages] of Object.entries(
      toFieldDetails(error.children ?? [], path),
    )) {
      append(childField, childMessages);
    }
  }

  return details;
}
