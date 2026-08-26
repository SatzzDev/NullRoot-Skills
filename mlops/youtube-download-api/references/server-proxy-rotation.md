# Proxy-Rotation yt-dlp handler (working reference)

This is the rotation logic built for api.saturia.codes (server.js). It tries
each proxy in turn, then an optional cookies-only fallback, and replies with
the working URL. Dropped into the Express handler.

## Env (loaded via systemd EnvironmentFile=/home/saturia/api-saturia-codes/.proxy.env, chmod 600)
```
PROXIES=http://user:pass@gw.dataimpulse.com:823
# or rotate several: PROXIES=socks5://u:p@h1:1080,http://u:p@h2:8080,socks5://u:p@h3:1080
COOKIES_FALLBACK=0   # set 1 to also try cookies.txt when all proxies fail
```

## Snippet
```js
// env
const PROXY_LIST = (process.env.PROXIES || process.env.PROXY || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const COOKIES_FALLBACK = process.env.COOKIES_FALLBACK === '1';

function baseArgs(format, url, outTemplate) {
  const args = ['--no-playlist', '--js-runtimes', 'node',
    '--extractor-args', 'youtube:player_client=web', '-o', outTemplate, url];
  if (COOKIES_FALLBACK) args.splice(3, 0, '--cookies', path.join(__dirname, 'cookies.txt'));
  if (format === 'mp3') args.push('-f','bestaudio[ext=m4a]/bestaudio/best','-x','--audio-format','mp3','--postprocessor-args','-b:a 192k');
  else args.push('-f','bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best','--merge-output-format','mp4','--postprocessor-args','-b:a 192k');
  return args;
}

function runYtDlp(args, finalPath) {
  return new Promise((resolve) => {
    const child = spawn('yt-dlp', args);
    let stderr = '';
    child.stderr.on('data', d => { stderr += d; });
    const t = setTimeout(() => { child.kill('SIGKILL'); if (fs.existsSync(finalPath)) fs.unlink(finalPath, () => {}); resolve({ ok:false, code:-1, stderr:'timeout' }); }, 5*60*1000);
    child.on('close', (code) => {
      clearTimeout(t);
      const exists = fs.existsSync(finalPath);
      if (code === 0 && exists) resolve({ ok:true, code, stderr });
      else { if (exists) fs.unlink(finalPath, () => {}); resolve({ ok:false, code, stderr }); }
    });
  });
}
// In handleConvert: build `attempts` = each proxy (--proxy p) + optional cookies; loop tryNext(i) until ok.
```

## Restart after editing
```
systemctl --user daemon-reload
systemctl --user restart api-saturia-codes
# validate:
curl "https://api.saturia.codes/ytmp3?url=https://youtu.be/<id>"   # expect 200 + success
```
