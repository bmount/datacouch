var http = require('http'),
    httpProxy = require('http-proxy');

var proxyServer = httpProxy.createServer(function (req, res, proxy) {
  var p = req.headers["x-couchdb-vhost-path"];
  if (!p) {
    res.writeHead(305, {"Content-Location": "http://datacouch.dev"});
    res.end();
  }
  if (p.indexOf('/login') === 0) {
    proxy.proxyRequest(req, res, {
      host: "127.0.0.1",
      port: 9870
    });
  } else if (p.indexOf('/api/upload') === 0) {
    proxy.proxyRequest(req, res, {
      host: "127.0.0.1",
      port: 9878
    });
  }
  else {
    res.writeHead(404);
    res.end();
  }
});

proxyServer.listen(12345);
