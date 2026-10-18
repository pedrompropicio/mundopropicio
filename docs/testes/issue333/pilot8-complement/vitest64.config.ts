import {defineConfig} from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['docs/testes/issue333/pg/activation64.test.ts'],testTimeout:180000,hookTimeout:60000,fileParallelism:false}});
