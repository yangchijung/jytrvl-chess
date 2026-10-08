/* Classic worker hosting Fairy-Stockfish (GPL-3.0) for xiangqi. Requires cross-origin isolation (SharedArrayBuffer). */
/* eslint-disable */
var base = self.location.href.replace(/[^/]*$/, '') + 'fsf/';
var pending = [];
var engine = null;
self.onmessage = function (e) {
  if (engine) engine.postMessage(e.data);
  else pending.push(e.data);
};
try {
  if (!self.crossOriginIsolated) throw new Error('not cross-origin isolated');
  importScripts(base + 'stockfish.js');
  Stockfish({
    locateFile: function (f) { return base + f; },
    mainScriptUrlOrBlob: base + 'stockfish.js',
  }).then(function (sf) {
    engine = sf;
    sf.addMessageListener(function (line) { self.postMessage(line); });
    sf.postMessage('setoption name UCI_Variant value xiangqi');
    pending.forEach(function (c) { sf.postMessage(c); });
    pending = [];
  }).catch(function (err) { self.postMessage('jy:error ' + err); });
} catch (err) {
  self.postMessage('jy:error ' + err);
}
