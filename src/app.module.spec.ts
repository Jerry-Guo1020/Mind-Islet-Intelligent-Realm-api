import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

/**
 * Guards against the class of startup bug that took the API down on 2026-10-12:
 * a plain config object injected as a Nest dependency resolves to Object at
 * runtime. Compiling the whole module graph catches it without a database.
 */
describe('AppModule', () => {
  it('compiles the application module with runtime providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(AppModule)).toBeDefined();
    await moduleRef.close();
  });
});
