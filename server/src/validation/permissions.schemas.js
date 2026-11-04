import { z } from 'zod';
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULE_IDS,
  PERMISSION_ROLE_KEYS
} from '../permissions/registry.js';

const adminIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,19}$/)
  .refine(
    (value) => /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n,
    'Invalid administrator ID.'
  );

const moduleIdSchema = z.enum(PERMISSION_MODULE_IDS);
const actionIdSchema = z.enum(PERMISSION_ACTIONS);

export const permissionModuleParamsSchema = z.object({
  moduleId: moduleIdSchema
}).strict();

export const permissionModuleUpdateSchema = z.object({
  isActive: z.boolean()
}).strict();

export const permissionRoleParamsSchema = z.object({
  roleKey: z.enum(PERMISSION_ROLE_KEYS)
}).strict();

export const rolePermissionUpdateSchema = z.object({
  permissions: z.array(z.object({
    moduleId: moduleIdSchema,
    actions: z.object(
      Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, z.boolean().optional()]))
    ).strict().refine(
      (actions) => Object.values(actions).some((value) => value !== undefined),
      { message: 'Provide at least one action for each module.' }
    )
  }).strict()).min(1).max(PERMISSION_MODULE_IDS.length)
}).strict().refine(
  ({ permissions }) => new Set(permissions.map(({ moduleId }) => moduleId)).size === permissions.length,
  { message: 'A module can appear only once in a permission update.' }
);

export const permissionAccountParamsSchema = z.object({
  adminId: adminIdSchema
}).strict();

export const accountPermissionOverridesSchema = z.object({
  overrides: z.array(z.object({
    moduleId: moduleIdSchema,
    actionId: actionIdSchema,
    isAllowed: z.boolean().nullable()
  }).strict()).min(1).max(PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length)
}).strict().refine(
  ({ overrides }) => {
    const keys = overrides.map(({ moduleId, actionId }) => `${moduleId}:${actionId}`);
    return new Set(keys).size === keys.length;
  },
  { message: 'Each module action can appear only once in an override update.' }
);

export const permissionOverrideParamsSchema = z.object({
  adminId: adminIdSchema,
  moduleId: moduleIdSchema,
  actionId: actionIdSchema
}).strict();
