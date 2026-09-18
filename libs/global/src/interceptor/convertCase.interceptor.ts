import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { objectToCamel, objectToSnake } from 'ts-case-convert';

@Injectable()
export class ConvertCaseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Observable<any> | Promise<Observable<any>> {
    context.switchToHttp().getRequest().body = objectToCamel(
      context.switchToHttp().getRequest().body,
    );
    return next.handle().pipe(map((data) => objectToSnake(data)));
  }
}
