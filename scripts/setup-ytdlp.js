const fs = require('fs');
const path = require('path');
const https = require('https');

const isWindows = process.platform === 'win32';
const filename = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${filename}`;
const filePath = path.join(__dirname, '..', filename);

console.log(`Downloading yt-dlp for ${process.platform}...`);
console.log(`From: ${url}`);
console.log(`To: ${filePath}`);

const file = fs.createWriteStream(filePath);

https.get(url, (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, (redirectResponse) => {
            redirectResponse.pipe(file);
        });
    } else {
        response.pipe(file);
    }

    file.on('finish', () => {
        file.close();
        console.log('Download completed!');

        if (!isWindows) {
            fs.chmodSync(filePath, '755');
            console.log('Set executable permissions.');
        }
        process.exit(0);
    });
}).on('error', (err) => {
    fs.unlink(filePath, () => { });
    console.error(`Error: ${err.message}`);
    process.exit(1);
});
