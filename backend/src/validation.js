const { z } = require('zod');

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string()
  .min(8)
  .max(16)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');
const nameSchema = z.string().trim().min(20).max(60);
const addressSchema = z.string().trim().max(400);

const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  address: addressSchema,
  password: passwordSchema
});

const createUserSchema = signupSchema.extend({
  role: z.enum(['admin', 'user', 'owner'])
});

const createStoreSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  address: addressSchema,
  ownerId: z.string().uuid().nullable().optional()
});

const ratingSchema = z.object({
  value: z.coerce.number().int().min(1).max(5)
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema
});
const uuidSchema = z.string().uuid();

function parseOrThrow(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const error = new Error(parsed.error.issues.map((issue) => issue.message).join('. '));
    error.status = 400;
    throw error;
  }
  return parsed.data;
}

module.exports = {
  addressSchema,
  createStoreSchema,
  createUserSchema,
  emailSchema,
  nameSchema,
  parseOrThrow,
  passwordChangeSchema,
  passwordSchema,
  ratingSchema,
  signupSchema,
  uuidSchema
};
