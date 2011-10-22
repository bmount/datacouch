/**  Creates databases for users
  *  Setup environment variables (see datacouch readme for more info):
  *    export DATACOUCH_ROOT="http://admin:pass@localhost:5984"
  *    export DATACOUCH_VHOST="couchdb.dev:5984"
  *  then "node provision_databases.js"
  *  Author: Max Ogden (@maxogden)
 **/

if(!process.env['DATACOUCH_ROOT'] || !process.env['DATACOUCH_VHOST']) throw ("OMGZ YOU HAVE TO SET $DATACOUCH_ROOT and $DATACOUCH_VHOST");

var follow = require('follow')
  , request = require('request')
  , couchapp = require('couchapp')
  , deferred = require('deferred')
  , http = require('http')
  , path = require('path')
  , url = require('url')
  , _ = require('underscore')
  ;

var configURL = url.parse(process.env['DATACOUCH_ROOT'] + "/datacouch")
  , vhostDomain = process.env['DATACOUCH_VHOST']
  , couch = configURL.protocol + "//" + configURL.host
  , db = couch + configURL.pathname
  , h = {"Content-type": "application/json", "Accept": "application/json"}
  ;

follow({db: db, include_docs: true, filter: "datacouch/by_value", query_params: {k: "type", v: "database"}}, function(error, change) {
  if (error || change.deleted || !("doc" in change)) return;
  
  var doc = change.doc
    , dbName = doc._id
    , dbPath = couch + "/" + dbName
    ;
  
  checkExistenceOf(dbPath).then(function(status) {
    if(status === 404) {
      console.log('creating ' + dbName);
      var start_time = new Date();
      createDB(dbPath).then(function(response) {
        function done() { console.log("created " + dbName + " in " + (new Date() - start_time) + "ms") }
        if (doc.forkedFrom) {
          // TODO prevent user from forking the same dataset twice
          replicate(doc.forkedFrom, dbName).then(done);
        } else {
          pushCouchapp("recline", dbPath).then(done);
        }
        setAdmin(dbName, doc.user); 
      })
    }
  })
})

follow({db: db, include_docs: true, filter: "datacouch/by_value", query_params: {k: "type", v: "app"}}, function(error, change) {
  if (error || change.deleted || !("doc" in change)) return;
  var start_time = new Date()
    , dbPath = couch + '/' + change.doc.dataset
    ;
  checkExistenceOf(dbPath + "/_design/" + change.doc.ddoc).then(function(status) {
    if(status === 404) {
      var appURL = change.doc._id + "." + vhostDomain;
      replicate("apps", dbPath, "_design/" + change.doc.ddoc).then(function(resp) {
        addVhost(appURL, "/" + change.doc.dataset + "/_design/" + change.doc.ddoc + "/_rewrite").then(function() {
          request.post({url: db, body: _.extend({}, change.doc, {url: appURL}), json: true}, function(e,r,b) {
            console.log("installed " + change.doc.ddoc + " into " + dbPath + " in " + (new Date() - start_time) + "ms");
          })
        });
      });
    };
  })
})

function absolutePath(pathname) {
  if (pathname[0] === '/') return pathname
  return path.join(process.env.PWD, path.normalize(pathname));
}

function pushCouchapp(app, target) {
  var dfd = deferred()
    , source = couch + '/apps/_design/' + app + "?attachments=true"
    , destination = target + '/_design/' + app + "?new_edits=false"
    , headers = {'accept':"multipart/related,application/json"}
    ;
  request.get({url: source, headers: headers, json: true}).pipe(request.put(destination, function(err, resp, body) { 
    dfd.resolve(body);
  }));
  return dfd.promise();
}

function replicate(source, target, ddoc) {
  var dfd = deferred();
  var reqData = {"source": source,"target": target, "create_target": true};
  if (ddoc) reqData["doc_ids"] = [ddoc];
  request({uri: couch + "/_replicate", method: "POST", headers: h, body: JSON.stringify(reqData)}, function (err, resp, body) {
    if (err) throw new Error('ahh!! ' + err);
    var response = JSON.parse(body);
    if (response.doc_write_failures > 0) throw new Error('error creating: ' + body);
    dfd.resolve(response);
  })
  return dfd.promise();
}

function checkExistenceOf(url) {
  var dfd = deferred();
  request({uri: url, method: "HEAD", headers: h}, function(err, resp, body) {
    dfd.resolve(resp.statusCode);
  })
  return dfd.promise();
}

function createDB(url) {
  var dfd = deferred();
  request({uri: url, method: "PUT", headers: h}, function (err, resp, body) {
    if (err) throw new Error('ahh!! ' + err);
    try {
      var response = JSON.parse(body);
    } catch(e) {
      var response = {"ok": true};
    }
    if (!response.ok) throw new Error(url + " - " + body);
    dfd.resolve(resp.statusCode);
  })
  return dfd.promise();
}

function addVhost(url, couchapp) {
  var dfd = deferred();
  request({uri: couch + "/_config/vhosts/" + encodeURIComponent(url), method: "PUT", headers: h, body: JSON.stringify(couchapp)}, function (err, resp, body) {
    if (err) throw new Error('ahh!! ' + err);
    dfd.resolve(body);
  })
  return dfd.promise(); 
}

function setAdmin(dbName, username) {
  var dfd = deferred();
  var data = {"admins":{"names":[username],"roles":[]},"members":{"names":[],"roles":[]}};
  request({uri: couch + "/" + dbName + "/_security", method: "PUT", headers: h, body: JSON.stringify(data)}, function (err, resp, body) {
    if (err) throw new Error('ahh!! ' + err);
    var response = JSON.parse(body);
    if (!response.ok) throw new Error('error setting admin: ' + body);
    dfd.resolve(response);
  })
  return dfd.promise(); 
}