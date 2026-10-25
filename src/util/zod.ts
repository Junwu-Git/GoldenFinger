<<<<<<< HEAD
import { z } from 'zod';

=======
>>>>>>> 2af7a7a77b2fe69fd9a6e41d758b5a3437f4a64e
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
