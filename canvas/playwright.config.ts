import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./e2e',timeout:180000,workers:1,use:{baseURL:process.env.CANVAS_URL ?? 'http://127.0.0.1:32000',viewport:{width:1440,height:1000},headless:true,channel:'chrome'},reporter:'list'});
