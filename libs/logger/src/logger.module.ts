import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { LoggerDecoratorRegister } from './logger.decorator.register';

@Module({
  imports: [DiscoveryModule],
  providers: [LoggerDecoratorRegister],
  exports: [LoggerDecoratorRegister],
})
export class LoggerModule {}
