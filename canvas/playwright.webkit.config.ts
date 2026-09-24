import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,use:{...base.use,browserName:'webkit',channel:undefined,isMobile:true,hasTouch:true}});
