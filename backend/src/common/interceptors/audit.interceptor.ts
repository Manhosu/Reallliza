import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

/**
 * Interceptor that attaches the client's IP address and User-Agent
 * to the request object, making them available for audit logging
 * in any controller or service.
 *
 * The values are stored in `req.auditMetadata` to avoid conflicts
 * with existing request properties.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    // Attach audit metadata to the request
    (request as RequestWithAuditMetadata).auditMetadata = {
      ipAddress: this.extractIp(request),
      userAgent: request.headers['user-agent'] || null,
    };

    return next.handle();
  }

  /**
   * Extracts the client IP address from the request,
   * handling common proxy headers (X-Forwarded-For, X-Real-IP).
   */
  private extractIp(request: Request): string | null {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ip?.trim() || null;
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.ip || null;
  }
}

/**
 * Extended request type that includes audit metadata.
 */
export interface AuditMetadata {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface RequestWithAuditMetadata extends Request {
  auditMetadata: AuditMetadata;
}
