import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../types/database.types';

export const ROLES_KEY = 'roles';

/**
 * Decorator that sets the allowed roles for a route handler.
 * Used in conjunction with RolesGuard to restrict access based on user role.
 *
 * @example
 * @Roles(UserRole.ADMIN, UserRole.TECHNICIAN)
 * @Get('protected-route')
 * getProtectedData() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
