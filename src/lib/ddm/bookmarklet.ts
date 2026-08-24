/**
 * Builds the "DDM Catch" bookmarklet source for the given app origin.
 *
 * When clicked on any web page it:
 *  - scans the page for <video>/<audio>/<source> elements and links that end
 *    in a downloadable extension, then pops up a panel listing them with a
 *    "Download with DDM" button per item (the "download this video" popup);
 *  - can arm click interception, so pressing a download link on the page is
 *    grabbed before the browser's own download manager and handed to DDM.
 *
 * Hand-off happens through `${origin}/?add=<url>`, which the app opens in the
 * New Download dialog (see GlobalCatcher).
 *
 * The generated code intentionally avoids // comments, double quotes and
 * backticks so it survives whitespace collapsing into a one-line bookmarklet.
 */
export function buildBookmarklet(origin: string): string {
  const code = `
(function () {
  var OLD = document.getElementById('ddm-catcher');
  if (OLD) { OLD.remove(); return; }
  var ORIGIN = ${JSON.stringify(origin)};
  var EXT = /\\.(mp4|webm|mkv|mov|avi|ts|m3u8|mpd|mp3|m4a|aac|wav|flac|ogg|zip|rar|7z|tar|gz|iso|apk|exe|pdf|docx?|xlsx|pptx)([?#].*)?$/i;
  var seen = {};
  var items = [];
  function push(url, kind, label) {
    try { url = new URL(url, location.href).href; } catch (e) { return; }
    if (!/^https?:/i.test(url) || seen[url]) return;
    seen[url] = 1;
    items.push({ url: url, kind: kind, label: label });
  }
  function scan() {
    Array.prototype.forEach.call(
      document.querySelectorAll('video[src], video source[src]'),
      function (el) {
        var v = el.closest('video');
        push(el.src, 'video', (v && (v.getAttribute('title') || v.getAttribute('aria-label'))) || document.title || 'Video');
      }
    );
    Array.prototype.forEach.call(
      document.querySelectorAll('audio[src], audio source[src]'),
      function (el) { push(el.src, 'audio', document.title || 'Audio'); }
    );
    Array.prototype.forEach.call(
      document.querySelectorAll('a[href]'),
      function (a) {
        var href = a.getAttribute('href') || '';
        var m = href.match(EXT);
        if (m || a.hasAttribute('download')) {
          var ext = m ? m[1].toLowerCase() : 'file';
          var kind = /^(mp4|webm|mkv|mov|avi|ts|m3u8|mpd)$/.test(ext) ? 'video'
            : /^(mp3|m4a|aac|wav|flac|ogg)$/.test(ext) ? 'audio' : 'file';
          push(a.href, kind, (a.textContent || '').trim().slice(0, 60) || ext.toUpperCase() + ' file');
        }
      }
    );
  }
  scan();
  function send(url) { window.open(ORIGIN + '/?add=' + encodeURIComponent(url), '_blank'); }
  var intercepting = false;
  function onClick(e) {
    if (!intercepting) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!EXT.test(href) && !a.hasAttribute('download')) return;
    e.preventDefault();
    e.stopPropagation();
    send(a.href);
  }
  document.addEventListener('click', onClick, true);
  var panel = document.createElement('div');
  panel.id = 'ddm-catcher';
  panel.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;width:320px;max-height:70vh;overflow:auto;background:#15110b;color:#f5efe4;border:1px solid #4a3b22;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.5);font:13px/1.45 system-ui,sans-serif;padding:12px;';
  var head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';
  head.innerHTML = '<b style=\\'flex:1;font-size:14px;\\'>DDM Catch</b>';
  var count = document.createElement('span');
  count.textContent = items.length + ' found';
  count.style.cssText = 'opacity:.7;font-size:12px;';
  head.appendChild(count);
  var close = document.createElement('button');
  close.textContent = '\\u00d7';
  close.style.cssText = 'background:none;border:0;color:inherit;font-size:18px;cursor:pointer;';
  close.onclick = function () { document.removeEventListener('click', onClick, true); panel.remove(); };
  head.appendChild(close);
  panel.appendChild(head);
  if (!items.length) {
    var empty = document.createElement('p');
    empty.textContent = 'No downloadable media or files detected on this page yet. Play a video, then press the bookmarklet again.';
    empty.style.cssText = 'opacity:.75;margin:4px 0 8px;';
    panel.appendChild(empty);
  }
  items.slice(0, 40).forEach(function (it) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;background:rgba(255,255,255,.05);margin-bottom:6px;';
    var tag = document.createElement('span');
    tag.textContent = it.kind.toUpperCase();
    tag.style.cssText = 'font-size:10px;letter-spacing:.06em;padding:2px 6px;border-radius:6px;background:#d9a13b;color:#15110b;font-weight:700;';
    row.appendChild(tag);
    var name = document.createElement('span');
    name.textContent = it.label;
    name.title = it.url;
    name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    row.appendChild(name);
    var btn = document.createElement('button');
    btn.textContent = 'Download';
    btn.style.cssText = 'border:0;border-radius:7px;background:#d9a13b;color:#15110b;font-weight:700;padding:5px 10px;cursor:pointer;';
    btn.onclick = function () { send(it.url); };
    row.appendChild(btn);
    panel.appendChild(row);
  });
  var arm = document.createElement('button');
  arm.style.cssText = 'width:100%;margin-top:4px;border:1px dashed #4a3b22;border-radius:8px;background:none;color:inherit;padding:8px;cursor:pointer;font-size:12px;';
  function paintArm() {
    arm.textContent = intercepting
      ? 'Click interception ON — download links on this page now open in DDM'
      : 'Arm click interception (grab downloads before the browser does)';
  }
  arm.onclick = function () { intercepting = !intercepting; paintArm(); };
  paintArm();
  panel.appendChild(arm);
  document.documentElement.appendChild(panel);
})();
`;
  return "javascript:" + code.replace(/\s+/g, " ").trim();
}
