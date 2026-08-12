import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skip JwtAuthGuard — route must enforce access another way (e.g. GenerateJobAccessGuard). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
