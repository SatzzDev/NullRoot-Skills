# Scraping a kworb Spotify country chart

kworb country weekly pages (e.g. https://kworb.net/spotify/country/id_weekly.html)
list tracks in `<td class="text mp">` cells. Grep alone misses them (nested tags /
empty matches). Parse with Python:

```python
import re, html, json
data = open('/tmp/id_weekly.html', encoding='utf-8').read()
cells = re.findall(r'class="text mp"[^>]*>(.*?)</td>', data, re.S)
songs = []
for c in cells:
    txt = re.sub(r'<[^>]+>', '', c)
    txt = html.unescape(txt).strip()
    if txt:
        songs.append(txt)
# songs are "Artist - Title" strings, ready to feed to spotify_search
json.dump(songs[:30], open('/tmp/top30.json', 'w'))
```

Then hand the list to `hermes chat` to build a shuffled playlist. NOTE: building a
playlist + searching 30 tracks + adding + shuffle + play EXCEEDS the 180s foreground
timeout — run that chat command with background=true + notify_on_complete=true.
