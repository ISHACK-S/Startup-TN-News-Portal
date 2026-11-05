import { z } from 'zod';
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULE_IDS
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
const roleKeySchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);

export const permissionModuleParamsSchema = z.object({
  moduleId: moduleIdSchema
}).strict();

export const permissionModuleUpdateSchema = z.object({
  isActive: z.boolean()
}).strict();

export const permissionRoleParamsSchema = z.object({
  roleKey: roleKeySchema
}).strict();

const permissionChangesSchema = z.array(z.object({
    moduleId: moduleIdSchema,
    actions: z.object(
      Object.fromEntries(PERMISSION_ACTIONS.map((action) => [action, z.boolean().optional()]))
    ).strict().refine(
      (actions) => Object.values(actions).some((value) => value !== undefined),
      { message: 'Provide at least one action for each module.' }
    )
  }).strict()).max(PERMISSION_MODULE_IDS.length).refine(
  (permissions) => new Set(permissions.map(({ moduleId }) => moduleId)).size === permissions.length,
  { message: 'A module can appear only once in a permission update.' }
);

export const rolePermissionUpdateSchema = z.object({
  permissions: permissionChangesSchema.min(1)
}).strict();

const customRoleFields = {
  label: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(''),
  isActive: z.boolean().default(true)
};

export const customRoleCreateSchema = z.object({
  roleKey: roleKeySchema,
  ...customRoleFields,
  permissions: permissionChangesSchema.optional().default([])
}).strict();

export const customRoleUpdateSchema = z.object({
  label: customRoleFields.label.optional(),
  description: customRoleFields.description.optional(),
  isActive: customRoleFields.isActive.optional(),
  permissions: permissionChangesSchema.optional()
}).strict().refine(
  (changes) => Object.keys(changes).length > 0,
  { message: 'Provide at least one role change.' }
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
