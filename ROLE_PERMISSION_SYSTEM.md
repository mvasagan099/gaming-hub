# Role and Permission Management System - Implementation Summary

## Overview
Added a comprehensive role and permission management system that allows admins to create custom roles with specific permissions.

## Changes Made

### 1. Database Schema Updates (`packages/db/prisma/schema.prisma`)

#### Added Custom UserRole Enum Value
- Added `CUSTOM` to the `UserRole` enum
- Added `customRoleId` field to the `User` model to link users to custom roles

#### New Models
- `CustomRole`: Stores custom role definitions
  - `id`: Unique identifier (cuid)
  - `name`: Unique role name (e.g., "content_moderator")
  - `displayName`: Human-readable name (e.g., "Content Moderator")
  - `description`: Role description
  - `isSystem`: Flag to prevent deletion of system roles
  - Relations: users, permissions

- `RolePermission`: Junction table for role-permission mapping
  - `id`: Unique identifier
  - `roleId`: Reference to CustomRole
  - `permission`: Permission string
  - Unique constraint on (roleId, permission)

### 2. Permission System Updates (`packages/shared/src/permissions.ts`)

#### New Permissions Added
- `admin:roles:view`: View roles and permissions
- `admin:roles:create`: Create new roles
- `admin:roles:edit`: Edit existing roles
- `admin:roles:delete`: Delete roles

#### Exported Constants
- `ALL_PERMISSIONS`: Array of all available permissions for UI validation

#### Updated Functions
- `hasPermission()`: Now supports custom roles with an optional `customPermissions` parameter
- `ROLE_PERMISSIONS`: Added `CUSTOM: []` entry

### 3. Permission Checking (`apps/api/src/lib/permissions.ts`)

#### Updated `requirePermission` Function
- Made the `prisma` parameter optional for backwards compatibility
- Added logic to fetch custom role permissions when user has CUSTOM role
- Validates permissions against custom role's permission list

### 4. Admin API Endpoints (`apps/api/src/routes/adminRoles.ts`)

New REST endpoints for role management:

#### GET `/api/admin/roles`
- List all custom roles with user counts and permissions
- Requires: `admin:roles:view`

#### GET `/api/admin/roles/:id`
- Get detailed role information including assigned users
- Requires: `admin:roles:view`

#### GET `/api/admin/permissions`
- List all available permissions
- Requires: `admin:roles:view`

#### POST `/api/admin/roles`
- Create a new custom role
- Body: `{ name, displayName, description?, permissions[] }`
- Validates permissions against `ALL_PERMISSIONS`
- Requires: `admin:roles:create`

#### PATCH `/api/admin/roles/:id`
- Update role properties and permissions
- Cannot modify system roles
- Body: `{ displayName?, description?, permissions[] }`
- Requires: `admin:roles:edit`

#### DELETE `/api/admin/roles/:id`
- Delete a custom role
- Cannot delete system roles
- Cannot delete roles with assigned users
- Requires: `admin:roles:delete`

#### GET `/api/admin/roles/:id/users`
- List users assigned to a specific role (paginated)
- Requires: `admin:roles:view`

### 5. User Role Assignment Updates (`apps/api/src/routes/admin.ts`)

#### Updated User Role Change Endpoint
- Patch `/api/admin/users/:id/role` now supports:
  - `role`: Updated to include "CUSTOM" option
  - `customRoleId`: Optional field to specify custom role when role is "CUSTOM"
- Validates custom role exists before assignment
- Prevents demotion of last admin
- Logs both standard and custom role changes in audit trail

## Security Considerations

1. **Permission Validation**: All permissions are validated against a whitelist (`ALL_PERMISSIONS`)
2. **System Role Protection**: System roles cannot be modified or deleted
3. **User Safety**: Cannot delete roles with assigned users
4. **Admin Protection**: Cannot demote the last admin
5. **Audit Logging**: All role operations are logged in the audit trail
6. **Backwards Compatibility**: Existing permission checks work without modification

## Usage Examples

### Create a Custom Role
```typescript
POST /api/admin/roles
{
  "name": "support_agent",
  "displayName": "Support Agent",
  "description": "Customer support representatives",
  "permissions": [
    "admin:users:view",
    "admin:crm:view",
    "admin:crm:manage"
  ]
}
```

### Assign Custom Role to User
```typescript
PATCH /api/admin/users/:userId/role
{
  "role": "CUSTOM",
  "customRoleId": "clx123..."
}
```

## Next Steps

1. **Frontend Integration**: Create admin UI pages for role management
2. **Role Templates**: Add pre-defined role templates (optional)
3. **Bulk User Assignment**: Add endpoint to assign role to multiple users
4. **Permission Inheritance**: Consider role hierarchy (optional)

## Files Changed
- `packages/db/prisma/schema.prisma`
- `packages/shared/src/permissions.ts`
- `apps/api/src/lib/permissions.ts`
- `apps/api/src/routes/admin.ts`
- `apps/api/src/routes/adminRoles.ts` (new)
- `apps/api/src/app.ts`
