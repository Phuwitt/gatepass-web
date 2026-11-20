import QRCode from 'qrcode';import fs from 'node:fs';
fs.writeFileSync(new URL('../public/download-qr.svg',import.meta.url),await QRCode.toString('https://gatepass-lab-phuwitt.vercel.app/download.html',{type:'svg',margin:4,width:256}));
