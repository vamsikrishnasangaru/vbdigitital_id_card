import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IdCardsGenerateJobsService } from '../id-cards-generate-jobs.service';

@Injectable()
export class GenerateJobAccessGuard implements CanActivate {
  constructor(
    private readonly jobsService: IdCardsGenerateJobsService,
    private readonly jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      params?: { jobId?: string };
      headers?: Record<string, string | string[] | undefined>;
      query?: Record<string, string | undefined>;
      user?: { role?: string };
    }>();

    const jobId = request.params?.jobId;
    if (!jobId) throw new UnauthorizedException();

    const pollHeader = request.headers?.['x-generate-job-token'];
    const pollToken =
      (typeof pollHeader === 'string' ? pollHeader : pollHeader?.[0]) ||
      request.query?.pollToken;

    if (pollToken && this.jobsService.validatePollToken(jobId, pollToken)) {
      return true;
    }

    const authHeader = request.headers?.authorization;
    const bearer =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    if (!bearer) {
      throw new UnauthorizedException('Missing job token or login session');
    }

    try {
      const payload = this.jwtService.verify(bearer) as { role?: string };
      if (payload.role !== 'SUPER_ADMIN') {
        throw new UnauthorizedException();
      }
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Session expired — please sign in and try again');
    }
  }
}
