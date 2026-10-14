import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@gaming-hub/db";
import { AppError, ALL_PERMISSIONS, clampPagination, type Permission } from "@gaming-hub/shared";
import { authenticate, requireMfa } from "../plugins/authenticate";
import { requirePermission, assertRoleGrant } from "../lib/permissions";
import { routeParams, parseSchema, queryParams, queryString } from "../lib/http";
import { auditFromRequest } from "../services/audit";

const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, "Name can only contain letters, numbers, underscores, and hyphens"),
  displayName: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string()).min(1, "At least one permission is required"),
});

const updateRoleSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string()).optional(),
});

const assignRoleUserSchema = z.object({
  userId: z.string().min(1),
});

export async function adminRolesRoutes(app: FastifyInstance) {
  app.get("/api/admin/roles", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:roles:view", prisma);
    
    const roles = await prisma.customRole.findMany({
      include: {
        _count: { select: { users: true } },
        permissions: { select: { permission: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      isSystem: role.isSystem,
      userCount: role._count.users,
      permissions: role.permissions.map((p) => p.permission),
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    }));
  });
  
  app.get("/api/admin/roles/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:roles:view", prisma);
    const { id } = routeParams(request);
    
    const role = await prisma.customRole.findUnique({
      where: { id },
      include: {
        permissions: { select: { permission: true } },
        users: {
          select: { id: true, username: true, displayName: true, email: true },
          take: 10,
        },
      },
    });
    
    if (!role) {
      throw new AppError("NOT_FOUND", "Role not found", 404);
    }
    
    return {
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map((p) => p.permission),
      users: role.users,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  });
  
  app.get("/api/admin/permissions", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:roles:view", prisma);
    return ALL_PERMISSIONS;
  });
  
  app.post("/api/admin/roles", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:roles:create", prisma);
    const data = parseSchema(createRoleSchema, request.body);
    await assertRoleGrant(admin, data.permissions, prisma);
    
    const invalidPermissions = data.permissions.filter(
      (p) => !ALL_PERMISSIONS.includes(p as Permission)
    );
    
    if (invalidPermissions.length > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Invalid permissions: ${invalidPermissions.join(", ")}`,
        422
      );
    }
    
    const existing = await prisma.customRole.findUnique({
      where: { name: data.name },
    });
    
    if (existing) {
      throw new AppError(
        "VALIDATION_ERROR",
        "A role with this name already exists",
        422
      );
    }
    
    const role = await prisma.customRole.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        permissions: {
          create: data.permissions.map((permission) => ({
            permission,
          })),
        },
      },
      include: {
        permissions: { select: { permission: true } },
      },
    });
    
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.role.created",
      category: "admin",
      targetType: "role",
      targetId: role.id,
      meta: {
        name: role.name,
        displayName: role.displayName,
        permissions: data.permissions,
      },
    });
    
    return {
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      permissions: role.permissions.map((p) => p.permission),
      createdAt: role.createdAt.toISOString(),
    };
  });
  
  app.patch("/api/admin/roles/:id", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:roles:edit", prisma);
    const { id } = routeParams(request);
    const data = parseSchema(updateRoleSchema, request.body);
    
    const role = await prisma.customRole.findUnique({
      where: { id },
      include: { permissions: true },
    });
    
    if (!role) {
      throw new AppError("NOT_FOUND", "Role not found", 404);
    }
    
    if (role.isSystem) {
      throw new AppError("FORBIDDEN", "Cannot modify system roles", 403);
    }
    await assertRoleGrant(admin, role.permissions.map((p) => p.permission), prisma);
    if (data.permissions) await assertRoleGrant(admin, data.permissions, prisma);
    
    if (data.permissions) {
      const invalidPermissions = data.permissions.filter(
        (p) => !ALL_PERMISSIONS.includes(p as Permission)
      );
      
      if (invalidPermissions.length > 0) {
        throw new AppError(
          "VALIDATION_ERROR",
          `Invalid permissions: ${invalidPermissions.join(", ")}`,
          422
        );
      }
    }
    
    const updated = await prisma.customRole.update({
      where: { id },
      data: {
        displayName: data.displayName,
        description: data.description,
        ...(data.permissions ? { permissions: { deleteMany: {}, create: [...new Set(data.permissions)].map((permission) => ({ permission })) } } : {}),
      },
      include: {
        permissions: { select: { permission: true } },
      },
    });
    
    // Prisma's nested write replaces metadata/permissions in one transaction.
    
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.role.updated",
      category: "admin",
      targetType: "role",
      targetId: id,
      meta: {
        displayName: data.displayName,
        description: data.description,
        permissions: data.permissions,
      },
    });
    
    return {
      id: updated.id,
      name: updated.name,
      displayName: updated.displayName,
      description: updated.description,
      permissions: data.permissions ?? updated.permissions.map((p) => p.permission),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
  
  app.delete("/api/admin/roles/:id", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:roles:delete", prisma);
    const { id } = routeParams(request);
    
    const role = await prisma.customRole.findUnique({
      where: { id },
      include: { _count: { select: { users: true } }, permissions: true },
    });
    
    if (!role) {
      throw new AppError("NOT_FOUND", "Role not found", 404);
    }
    
    if (role.isSystem) {
      throw new AppError("FORBIDDEN", "Cannot delete system roles", 403);
    }
    
    if (role._count.users > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Cannot delete role with assigned users. Remove users from this role first.",
        422
      );
    }
    await assertRoleGrant(admin, role.permissions.map((p) => p.permission), prisma);
    
    await prisma.customRole.delete({ where: { id } });
    
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.role.deleted",
      category: "admin",
      targetType: "role",
      targetId: id,
      meta: {
        name: role.name,
        displayName: role.displayName,
      },
    });
    
    return { ok: true };
  });
  
  app.get("/api/admin/roles/:id/users", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:roles:view", prisma);
    const { id } = routeParams(request);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    
    const role = await prisma.customRole.findUnique({
      where: { id },
    });
    
    if (!role) {
      throw new AppError("NOT_FOUND", "Role not found", 404);
    }
    
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { customRoleId: id },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          isOnline: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where: { customRoleId: id } }),
    ]);
    
    return {
      role: {
        id: role.id,
        name: role.name,
        displayName: role.displayName,
      },
      users: users.map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  });

  app.post("/api/admin/roles/:id/users", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:roles:edit", prisma);
    const { id } = routeParams(request);
    const { userId } = parseSchema(assignRoleUserSchema, request.body);

    const role = await prisma.customRole.findUnique({
      where: { id },
      include: { permissions: true },
    });
    if (!role) {
      throw new AppError("NOT_FOUND", "Role not found", 404);
    }

    if (userId === admin.id) {
      throw new AppError("FORBIDDEN", "You cannot change your own role", 403);
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      throw new AppError("NOT_FOUND", "User not found", 404);
    }

    if (target.role === "ADMIN" && admin.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Only administrators can modify an administrator's role", 403);
    }

    await assertRoleGrant(admin, role.permissions.map((p) => p.permission), prisma);

    await prisma.user.update({
      where: { id: userId },
      data: {
        role: "CUSTOM",
        customRoleId: id,
      },
    });

    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.user.role.assigned",
      category: "admin",
      targetType: "user",
      targetId: userId,
      meta: {
        roleId: id,
        roleName: role.name,
      },
    });

    return { ok: true };
  });

  app.delete("/api/admin/roles/:id/users/:userId", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:roles:edit", prisma);
    const { id, userId } = routeParams(request);

    const role = await prisma.customRole.findUnique({ where: { id } });
    if (!role) {
      throw new AppError("NOT_FOUND", "Role not found", 404);
    }

    if (userId === admin.id) {
      throw new AppError("FORBIDDEN", "You cannot change your own role", 403);
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) {
      throw new AppError("NOT_FOUND", "User not found", 404);
    }

    if (target.role === "ADMIN" && admin.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Only administrators can modify an administrator's role", 403);
    }

    if (target.customRoleId === id) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          role: "USER",
          customRoleId: null,
        },
      });

      auditFromRequest(request, {
        actorType: "user",
        actorId: admin.id,
        action: "admin.user.role.unassigned",
        category: "admin",
        targetType: "user",
        targetId: userId,
        meta: {
          roleId: id,
          roleName: role.name,
        },
      });
    }

    return { ok: true };
  });
}
