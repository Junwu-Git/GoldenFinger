<<<<<<< HEAD
import { z } from 'zod';

=======
>>>>>>> e5e18449f3beb7ed6d2edf9e174ac313403dba10
export function validateInplace<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = parsePrettified(schema, data);
  return _.assign(data, result) as T;
}

export function parsePrettified<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw Error(z.prettifyError(result.error));
  }
  return result.data;
}
