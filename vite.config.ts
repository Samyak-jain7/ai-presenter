import { defineConfig } from 'vite';
export default defineConfig({server:{host:'127.0.0.1',port:5173,strictPort:true,watch:{ignored:['**/.genesis/**']},proxy:{'/session':{target:'ws://127.0.0.1:3001',ws:true}}}});
