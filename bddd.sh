#!/bin/sh

DC_BUILD_PORT=5914

curl -X PUT http://localhost:$DC_BUILD_PORT/datacouch
curl -X PUT http://localhost:$DC_BUILD_PORT/datacouch-users
curl -X PUT http://localhost:$DC_BUILD_PORT/datacouch-analytics
curl -X PUT http://localhost:$DC_BUILD_PORT/apps

curl -X POST http://localhost:$DC_BUILD_PORT/_replicate --data-binary '{"target":"http://localhost:$DC_BUILD_PORT/apps","source":"http://max.ic.ht/apps", "create_target": true}' -H "Content-type: application/json"

cd $DC_SETUP_DIR/datacouch

node node_modules/couchapp/bin.js push app.js http://localhost:$DC_BUILD_PORT/datacouch
node node_modules/couchapp/bin.js push db.js http://localhost:$DC_BUILD_PORT/datacouch
node node_modules/couchapp/bin.js push users.js http://localhost:$DC_BUILD_PORT/datacouch-users
node node_modules/couchapp/bin.js push analytics.js http://localhost:$DC_BUILD_PORT/datacouch-analytics

curl -X PUT http://localhost:$DC_BUILD_PORT/_config/admins/$DATACOUCH_ADMIN_NAME -d $DATACOUCH_ADMIN_PASSWORD

echo "restarting (Data)CouchDB..."
$DC_SETUP_DIR/rel/datacouch/bin/datacouch restart

echo "  
    dont forget to set up /etc/hosts to point to:
 
    datacouch.dev -> 127.0.0.1
    couchdb.dev -> 127.0.0.1

    if you are on Unix, you can achieve this by 
    copy-pasting the following into a terminal:

    sudo echo "127.0.0.1  datacouch.dev" >> /etc/hosts
    sudo echo "127.0.0.1  couchdb.dev" >> /etc/hosts
    
    "
