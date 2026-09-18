import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';

import { LOGGABLE } from './decorator/loggable';

/**
 * This class is used for logging before/after the function whose class has "Loggable" decorator
 */
@Injectable()
export class LoggerDecoratorRegister implements OnModuleInit {
  /** To find the the functions whose class has "Loggable" decorator, discoveryService and MetadataScanner */
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
  ) {}

  /**
   * if the decorator, loggable, is founded, it will log before and after the method
   */
  onModuleInit() {
    return this.discoveryService
      .getProviders()
      .filter((wrapper) => wrapper.isDependencyTreeStatic())
      .filter(({ metatype, instance }) => {
        if (!instance || !metatype) {
          return false;
        }
        return Reflect.getMetadata(LOGGABLE, metatype);
      })
      .forEach(({ instance }) => {
        this.metadataScanner
          .getAllMethodNames(instance)
          .forEach((methodName) => {
            const originalMethod = instance[methodName];
            if (typeof originalMethod !== 'function') {
              return;
            }
            const logger = new Logger(instance.constructor.name);
            instance[methodName] = function (...args: any[]) {
              logger.log(`Before ${methodName}`);
              const now = Date.now();
              const result = originalMethod.apply(this, args);
              if (result instanceof Promise) {
                return result.then((resolvedResult) => {
                  logger.log(`After ${methodName} +${Date.now() - now}ms`);
                  return resolvedResult;
                });
              } else {
                logger.log(`After ${methodName} +${Date.now() - now}ms`);
                return result;
              }
            };
          });
      });
  }
}
