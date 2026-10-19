import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['docs/testes/issue333/application90/application-pg.test.ts'],fileParallelism:false,testTimeout:30000,hookTimeout:60000}});
