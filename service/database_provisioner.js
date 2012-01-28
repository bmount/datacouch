var follow = require('follow')
  , txn = require("txn")
  , request = require('request').defaults({json: true})
  , couchapp = require('couchapp')
  , http = require('http')
  , path = require('path')
  , url = require('url')
  , _ = require('underscore')
  ;

module.exports = function (t) {

  var configURL = url.parse(t.couchurl + "datacouch")
    , vhostDomain = t.vhosturl
    , couch = configURL.protocol + "//" + configURL.host
    , db = couch + configURL.pathname
    ;

  follow({db: db, filter: "datacouch/by_value", query_params: {k: "type", v: "newDatabase"}}, function(error, change) {
    if (error) return console.error(error)
    provision(db + '/' + change.id, function(err, newData) { })
  })
    
  function provision(docURL, cb) {
    txn({"uri":docURL}, processDatabase, function(error, newData) {
      if (error) return cb(error)
      return cb(false, newData)
      throw error; // Unknown error
    })
  }
  
  function processDatabase(doc, txncb) {
    var dbName = doc._id
     , dbPath = couch + "/" + dbName
     , startTime = new Date()
     ;
     
     function done(err) { 
       if (err) return txncb(err)
       console.log("provisioned " + dbName + " in " + (new Date() - startTime) + "ms")
       doc.type = "database"
       return txncb()
     }
     
     checkExistenceOf(dbPath, function(err, status) {
       if (status !== 404) return done()
       console.log('creating ' + dbName)
       createDB(dbPath, function(err, response) {
         // TODO prevent user from forking the same dataset twice
         if (doc.forkedFrom) replicate(doc.forkedFrom, dbName, done)
         else pushCouchapp("recline", dbPath, done)
         // setAdmin(dbName, doc.user)
       })
     
     })
  }
  
  function registerApp(appURL, doc, db, callback) {
    // addVhost(appURL, "/" + doc.dataset + "/_design/" + doc.ddoc + "/_rewrite").then(function() {
      request.post({url: db, body: _.extend({}, doc, {url: appURL})}, function(e,r,b) {
        if (callback) callback(b)
      })
    // });
  }

  function absolutePath(pathname) {
    if (pathname[0] === '/') return pathname
    return path.join(process.env.PWD, path.normalize(pathname));
  }

  function pushCouchapp(app, target, cb) {
    var source = couch + '/apps/_design/' + app + "?attachments=true"
      , destination = target + '/_design/' + app + "?new_edits=false"
      , headers = {'accept':"multipart/related,application/json"}
      , down = request.get({url: source, headers: headers})
      , up = request.put(destination, function(err, resp, body) { 
          if(err) cb(err)
          cb(false, body)
        })
    down.pipe(up)
  }

  function replicate(source, target, ddoc, cb) {
    var reqData = {"source": source,"target": target, "create_target": true};
    if (ddoc) reqData["doc_ids"] = [ddoc];
    request({uri: couch + "/_replicate", method: "POST", body: reqData}, function (err, resp, body) {
      if (err) cb(new Error('ahh!! ' + err))
      if (body.doc_write_failures > 0) cb(new Error('error creating: ' + body))
      cb(false, body)
    })
  }

  function checkExistenceOf(url, cb) {
    request({uri: url, method: "HEAD", json: false}, function(err, resp, body) {
      if(err) cb(err)
      cb(false, resp.statusCode);
    })
  }

  function createDB(url, cb) {
    request({uri: url, method: "PUT"}, function (err, resp, body) {
      if (err) cb(new Error('ahh!! ' + err))
      var response = body
      if (!response) response = {"ok": true}
      if (!response.ok) cb(new Error(url + " - " + body))
      cb(false, resp.statusCode)
    })
  }

  function addVhost(url, couchapp, cb) {
    request({uri: couch + "/_config/vhosts/" + encodeURIComponent(url), method: "PUT", body: JSON.stringify(couchapp), json: false}, function (err, resp, body) {
      if (err) cb(new Error('ahh!! ' + err))
      cb(false, body)
    })
  }

  function setAdmin(dbName, username, cb) {
    var data = {"admins":{"names":[username],"roles":[]},"members":{"names":[],"roles":[]}};
    request({uri: couch + "/" + dbName + "/_security", method: "PUT", body: data}, function (err, resp, body) {
      if (err) cb(new Error('ahh!! ' + err))
      if (!body.ok) cb(new Error('error setting admin: ' + body))
      cb(false, body);
    })
  }
  
}