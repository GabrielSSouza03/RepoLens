import { Global, Module } from "@nestjs/common";
import { createDb, DB, type Database } from "./client";

@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: (): Database => createDb(),
    },
  ],
  exports: [DB],
})
export class DbModule {}
