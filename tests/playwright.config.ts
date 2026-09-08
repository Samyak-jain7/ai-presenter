import {defineConfig} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
// Silence prevents the fake device's default test tone from triggering local VAD.
mkdirSync('dist',{recursive:true});const wave=Buffer.alloc(48044);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(24000,24);wave.writeUInt32LE(48000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(48000,40);writeFileSync('dist/silence.wav',wave);
export default defineConfig({testDir:'.',testMatch:'browser.spec.ts',fullyParallel:false,workers:1,timeout:30000,reporter:'list',outputDir:'../dist/test-results',use:{baseURL:'http://127.0.0.1:5173',channel:'chrome',headless:true,viewport:{width:1440,height:1000},launchOptions:{args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${resolve('dist/silence.wav')}`]}},webServer:{command:'npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:15000}});
